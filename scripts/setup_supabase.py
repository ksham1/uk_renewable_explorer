"""Create, import and verify Supabase using an ignored local database credential.

python scripts/setup_supabase.py
python scripts/setup_supabase.py --check-only  # public API verification; no writes
"""
import argparse
import json
import os
import sys
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from import_repd import ROOT, SOURCE, process, upload


def read_env(path):
    """Read simple KEY=value files without executing shell code or logging values."""
    values = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                raise ValueError(f'{path.name} must contain one KEY=value per line.')
            key, value = line.split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            values[key.strip()] = value
    return values


def database_uri(public_url):
    config = read_env(ROOT / '.env.database.local')
    uri = os.environ.get('DATABASE_URL') or config.get('DATABASE_URL', '')
    if not uri:
        raise ValueError('Save DATABASE_URL in .env.database.local using Supabase > Connect > Session pooler.')
    parsed = urlparse(uri)
    ref = urlparse(public_url).hostname.split('.')[0]
    if parsed.scheme not in {'postgres', 'postgresql'} or not parsed.hostname or not parsed.password:
        raise ValueError('DATABASE_URL must be a PostgreSQL URI including the database password.')
    if '[YOUR-PASSWORD]' in uri or 'YOUR_PASSWORD' in uri:
        raise ValueError('Replace the password placeholder locally with your URI-encoded database password.')
    if parsed.port != 5432:
        raise ValueError('Use the Session pooler URI on port 5432, not the transaction pooler on 6543.')
    if not (parsed.hostname == f'db.{ref}.supabase.co' or
            (parsed.hostname.endswith('.pooler.supabase.com') and parsed.username == f'postgres.{ref}')):
        raise ValueError('Database connection does not match the configured Supabase project. Copy its Session pooler URI.')
    return uri


def verify_database(conn, expected):
    with conn.cursor() as cur:
        cur.execute("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.projects'::regclass")
        if not cur.fetchone()[0]:
            raise ValueError('Database verification failed: row-level security is disabled.')
        for role in ('anon', 'authenticated'):
            for privilege in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'):
                cur.execute('SELECT has_table_privilege(%s, %s, %s)', (role, 'public.projects', privilege))
                if cur.fetchone()[0]:
                    raise ValueError(f'Database verification failed: {role} has {privilege} access.')
            # SELECT must actually return all projects under RLS, not just hold a grant.
            cur.execute(f'SET LOCAL ROLE {role}')
            cur.execute('SELECT count(*) FROM public.projects')
            if cur.fetchone()[0] != expected:
                raise ValueError(f'Database verification failed: {role} cannot read the complete snapshot.')
            cur.execute('RESET ROLE')


def verify_api(url, key, expected_projects):
    result = []
    expected = len(expected_projects)
    while len(result) < expected:
        start = len(result)
        request = Request(url.rstrip('/') + f'/rest/v1/projects?select=*&order=id.asc&offset={start}&limit=1000',
                          headers={'apikey': key, 'Prefer': 'count=exact'})
        with urlopen(request, timeout=25) as response:
            total = response.headers.get('Content-Range', '').rsplit('/', 1)[-1]
            if total != str(expected):
                raise ValueError(f'Public API count differs from the local extract: expected {expected}.')
            batch = json.load(response)
        if not batch:
            raise ValueError('Public API returned an incomplete snapshot.')
        result.extend(batch)
    by_id = {p['id']: p for p in result}
    if len(by_id) != expected or len(result) != expected:
        raise ValueError('Public API returned duplicate or unexpected projects.')
    # Check every field, not only row count: frontend totals and dates must match.
    for project in expected_projects:
        actual = by_id.get(project['id'])
        if not actual or any(actual.get(field) != value for field, value in project.items()):
            raise ValueError(f'Public API project {project["id"]} differs from the cleaned extract.')
    pipeline = sum(p['capacity_mw'] or 0 for p in result if p['status'] != 'Operational') / 1000
    print(f'Public API verified: {expected:,} projects; pipeline {pipeline:.3f} GW; all fields match.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    public = read_env(ROOT / '.env.local')
    url = public.get('VITE_SUPABASE_URL', '')
    key = public.get('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    if not url.startswith('https://') or not key:
        raise ValueError('Set the public Supabase URL and publishable key in .env.local first.')
    summary = json.loads((ROOT / 'public/data/summary.json').read_text(encoding='utf-8'))
    projects = json.loads((ROOT / 'public/data/projects.json').read_text(encoding='utf-8'))
    # Reconcile the files against the original CSV before writing any database data.
    cleaned, checked, audit = process(ROOT / 'data/raw/REPD_Publication_Q2_2026.csv', summary['publication_date'], summary['dataset'])
    if projects != cleaned or summary != checked:
        raise ValueError('Local dataset differs from the original CSV. Rerun scripts/import_repd.py first.')
    if audit['duplicate_ids'] or any(r['reason'] in {'missing project ID', 'unrecognised development status'} for r in audit['excluded']):
        raise ValueError('Resolve duplicate/missing IDs or unknown statuses in the importer audit first.')
    if not args.check_only:
        import psycopg
        uri = database_uri(url)
        print('Connecting to the configured Supabase project (credential is not logged)...', flush=True)
        with psycopg.connect(uri, sslmode='require', connect_timeout=15, prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout = '120s'")
                cur.execute("SET LOCAL lock_timeout = '15s'")
                cur.execute((ROOT / 'supabase/schema.sql').read_text(encoding='utf-8'))
                cur.execute('LOCK TABLE public.projects IN EXCLUSIVE MODE')
                cur.execute('SELECT count(*) FROM public.projects WHERE source_url IS DISTINCT FROM %s', (SOURCE,))
                if cur.fetchone()[0]:
                    raise ValueError('Stopped: public.projects contains data from another source. Nothing has been replaced.')
            upload(projects, connection=conn)
            verify_database(conn, len(projects))
            with conn.cursor() as cur:
                cur.execute("NOTIFY pgrst, 'reload schema'")
        print('Committed schema and full import. RLS and read-only browser grants verified.', flush=True)
    # Schema cache updates are asynchronous. Retry only the cache-miss response.
    for attempt in range(6):
        try:
            verify_api(url, key, projects)
            break
        except HTTPError as error:
            body = error.read().decode('utf-8', errors='replace')
            if error.code == 404 and 'PGRST205' in body and attempt < 5:
                time.sleep(2)
                continue
            raise ValueError(f'Public API verification failed with HTTP {error.code}. Check Data API and public schema settings.') from None
    print('Supabase is ready. Reload the dashboard; the data-source badge should say Supabase.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing a traceback/connection URI, including when drivers return errors.
        message = str(error)
        try:
            config = read_env(ROOT / '.env.database.local')
            uri = os.environ.get('DATABASE_URL') or config.get('DATABASE_URL', '')
            if uri:
                message = message.replace(uri, '[database connection]')
                password = urlparse(uri).password
                for secret in (password, unquote(password or '')):
                    if secret:
                        message = message.replace(secret, '[redacted]')
        except Exception:
            message = type(error).__name__
        print(f'Setup stopped: {message[:600]}', file=sys.stderr)
        sys.exit(1)
