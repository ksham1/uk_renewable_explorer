"""Inspect, clean and optionally atomically replace the single Supabase projects table.

Local: python scripts/import_repd.py data/raw/REPD_Publication_Q2_2026.csv
Upload: set DATABASE_URL in the environment, then add --upload (run schema.sql first).
All decisions are recorded in data/processed/audit.json; no rows silently disappear.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
from urllib.request import urlopen

from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract'
CSV_URL = 'https://assets.publishing.service.gov.uk/media/6a6cbdc00c36759b5ccaa305/REPD_Publication_Q2_2026.csv'
ACTIVE = {'Operational': 'Operational', 'Under Construction': 'Under construction',
          'Planning Permission Granted': 'Consented', 'Appeal Granted': 'Consented',
          'Secretary of State - Granted': 'Consented', 'No Application Required': 'Consented',
          'Planning Application Submitted': 'Planning', 'Appeal Lodged': 'Planning'}
EXCLUDED = {'Decommissioned', 'Planning Application Withdrawn', 'Planning Permission Refused',
            'Abandoned', 'Appeal Refused', 'Revised', 'Appeal Withdrawn',
            'Planning Permission Expired', 'Secretary of State - Refusal'}
DATES = {'application_submitted': 'Planning Application Submitted',
         'permission_granted': 'Planning Permission  Granted', 'appeal_granted': 'Appeal Granted',
         'secretary_granted': 'Secretary of State - Granted',
         'construction_started': 'Under Construction', 'operational_date': 'Operational',
         'record_updated': 'Record Last Updated (dd/mm/yyyy)'}

def clean(value):
    return re.sub(r'\s+', ' ', value or '').strip() or None

def developer(value):
    value = clean(value)
    if value:
        value = re.sub(r'\bscottish\s*power\b', 'ScottishPower', value, flags=re.I)
        value = re.sub(r'\bscottish\s*&\s*southern\s*energy\b', 'SSE', value, flags=re.I)
    return value

def number(value):
    try:
        result = float((value or '').replace(',', '').strip())
        return result if math.isfinite(result) else None
    except ValueError:
        return None

def process(path, publication_date, dataset):
    raw = path.read_bytes()
    # Government extract is Windows-1252, with some versions using UTF-8.
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    reader = csv.DictReader(io.StringIO(text))
    columns = reader.fieldnames
    required = {'Ref ID', 'Site Name', 'Technology Type', 'Development Status',
                'Installed Capacity (MWelec)', 'X-coordinate', 'Y-coordinate', 'Country'}
    if not required.issubset(columns or []):
        raise ValueError(f'Missing required columns: {required - set(columns or [])}')
    rows = list(reader)
    ids = Counter(clean(r['Ref ID']) for r in rows)
    duplicates = {k: v for k, v in ids.items() if v > 1}
    audit = {'columns': columns, 'raw_status_values': dict(Counter(r['Development Status'] for r in rows)),
             'duplicate_ids': duplicates, 'excluded': [], 'issues': [], 'source_sha256': hashlib.sha256(raw).hexdigest()}
    gb = Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True)
    projects = []
    for index, row in enumerate(rows, start=2):
        pid, status = clean(row['Ref ID']), clean(row['Development Status'])
        status = {s.casefold(): s for s in [*ACTIVE, *EXCLUDED]}.get((status or '').casefold(), status)
        reason = ('missing project ID' if not pid else 'duplicate project ID' if pid in duplicates else
                  status if status in EXCLUDED else 'unrecognised development status' if status not in ACTIVE else None)
        if reason:
            audit['excluded'].append({'row': index, 'id': pid, 'reason': reason, 'status': status})
            continue
        issues = []
        capacity = number(row['Installed Capacity (MWelec)'])
        if capacity is None or capacity < 0:
            issues.append('Missing or invalid capacity'); capacity = None
        x, y = number(row['X-coordinate']), number(row['Y-coordinate'])
        country = clean(row['Country'])
        lat = lon = None
        if x is not None and y is not None and x > 0 and y > 0:
            # This REPD extract uses the British grid for ALL supplied X/Y values,
            # including NI (e.g. Newry 117392, 488885 -> 54.18N, 6.33W).
            lon, lat = gb.transform(x, y)
            # Includes offshore waters. This is a sanity envelope, not a land boundary.
            if not (48 <= lat <= 62 and -12 <= lon <= 5):
                issues.append('Coordinates outside UK/offshore envelope'); lat = lon = None
        else:
            issues.append('Missing or invalid grid coordinates')
        dates = {}
        for key, column in DATES.items():
            value = clean(row.get(column))
            dates[key] = None
            if value:
                try:
                    dates[key] = datetime.strptime(value, '%d/%m/%Y').date().isoformat()
                except ValueError:
                    issues.append(f'Invalid {key}: {value}')
        project = {'id': pid, 'name': clean(row['Site Name']),
                   'developer': developer(row.get('Operator (or Applicant)')),
                   'developer_original': clean(row.get('Operator (or Applicant)')),
                   'technology': clean(row['Technology Type']), 'capacity_mw': capacity,
                   'status': ACTIVE[status], 'source_status': status,
                   'region': clean(row.get('Region')), 'country': country,
                   'county': clean(row.get('County')), 'address': clean(row.get('Address')),
                   'postcode': clean(row.get('Post Code')), 'latitude': round(lat, 6) if lat is not None else None,
                   'longitude': round(lon, 6) if lon is not None else None,
                   'planning_authority': clean(row.get('Planning Authority')),
                   'planning_reference': clean(row.get('Planning Application Reference')),
                   **dates, 'quality_issues': issues, 'source_url': SOURCE,
                   'dataset': dataset, 'publication_date': publication_date}
        for field in ['name', 'developer', 'technology', 'region', 'country']:
            if project[field] is None:
                issues.append(f'Missing {field}')
        if issues:
            audit['issues'].append({'id': pid, 'issues': issues})
        projects.append(project)
    summary = {'source_url': SOURCE, 'csv_url': CSV_URL, 'dataset': dataset,
               'publication_date': publication_date, 'total_records': len(rows), 'included': len(projects),
               'excluded': len(audit['excluded']),
               'exclusion_reasons': dict(Counter(r['reason'] for r in audit['excluded'])),
               'status_counts': dict(Counter(p['status'] for p in projects)),
               'unmapped': sum(p['latitude'] is None for p in projects),
               'missing_capacity': sum(p['capacity_mw'] is None for p in projects),
               'flagged_records': len(audit['issues']), 'sha256': audit['source_sha256']}
    assert summary['included'] + summary['excluded'] == len(rows)
    return projects, summary, audit

def upload(projects, connection=None):
    import psycopg
    from psycopg.types.json import Jsonb
    columns = list(projects[0])
    # One transaction: failed imports roll back, and old snapshots cannot remain in totals.
    def write(conn):
        with conn.cursor() as cur:
            cur.execute('LOCK TABLE public.projects IN EXCLUSIVE MODE')
            cur.execute('DELETE FROM public.projects')
            cur.executemany('INSERT INTO public.projects (' + ','.join(columns) + ') VALUES (' +
                            ','.join(['%s'] * len(columns)) + ')',
                            [tuple(Jsonb(p[c]) if c == 'quality_issues' else p[c] for c in columns) for p in projects])
    if connection is not None:
        write(connection)
    else:
        uri = os.environ.get('DATABASE_URL')
        if not uri:
            raise ValueError('Set DATABASE_URL to your Supabase PostgreSQL connection URI (never a VITE_ variable).')
        with psycopg.connect(uri, sslmode='require', connect_timeout=15, prepare_threshold=None) as conn:
            write(conn)
        print(f'Uploaded {len(projects):,} projects in one transaction.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', nargs='?', default=str(ROOT / 'data/raw/REPD_Publication_Q2_2026.csv'))
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--publication-date', default='2026-08-03')
    parser.add_argument('--dataset', default='July 2026 · Q2 extract')
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    path = Path(args.csv)
    if args.download:
        path.parent.mkdir(parents=True, exist_ok=True)
        with urlopen(CSV_URL, timeout=60) as response:
            path.write_bytes(response.read())
    projects, summary, audit = process(path, args.publication_date, args.dataset)
    for folder in [ROOT / 'data/processed', ROOT / 'public/data']:
        folder.mkdir(parents=True, exist_ok=True)
    (ROOT / 'data/processed/audit.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')
    with (ROOT / 'data/processed/projects.csv').open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=projects[0].keys())
        writer.writeheader()
        for project in projects:
            writer.writerow({**project, 'quality_issues': json.dumps(project['quality_issues'])})
    (ROOT / 'public/data/projects.json').write_text(json.dumps(projects, separators=(',', ':')), encoding='utf-8')
    (ROOT / 'public/data/summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))
    if args.upload:
        if not projects or audit['duplicate_ids'] or any(r['reason'] in {'missing project ID', 'unrecognised development status'} for r in audit['excluded']):
            raise ValueError('Upload stopped: resolve duplicate/missing IDs or unknown statuses in audit.json first.')
        upload(projects)

if __name__ == '__main__':
    main()
