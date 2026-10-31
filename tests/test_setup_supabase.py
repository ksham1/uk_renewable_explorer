import io
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from setup_supabase import database_uri, read_env, verify_api


class Response(io.BytesIO):
    def __init__(self, rows, count):
        super().__init__(json.dumps(rows).encode())
        self.headers = {'Content-Range': f'0-0/{count}'}


class SetupTests(unittest.TestCase):
    def test_private_env_preserves_uri_without_shell_evaluation(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / '.env.database.local'
            path.write_text('# comment\nDATABASE_URL="postgresql://user:p%40ss@host:5432/postgres?sslmode=require"\n', encoding='utf-8')
            self.assertEqual(read_env(path)['DATABASE_URL'], 'postgresql://user:p%40ss@host:5432/postgres?sslmode=require')

    def test_connection_must_target_the_configured_project(self):
        with patch('setup_supabase.os.environ', {}), patch('setup_supabase.read_env', return_value={
                'DATABASE_URL':'postgresql://postgres.other:password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres'}):
            with self.assertRaisesRegex(ValueError, 'does not match'):
                database_uri('https://myproject.supabase.co')

    def test_api_paginates_using_actual_returned_page_size(self):
        rows = [{'id':str(i), 'capacity_mw':10, 'status':'Planning'} for i in range(5)]
        with patch('setup_supabase.urlopen', side_effect=[Response(rows[:2],5),Response(rows[2:4],5),Response(rows[4:],5)]) as api:
            verify_api('https://myproject.supabase.co', 'public-key', rows)
        urls = [call.args[0].full_url for call in api.call_args_list]
        self.assertTrue('offset=0' in urls[0] and 'offset=2' in urls[1] and 'offset=4' in urls[2])

    def test_api_rejects_matching_count_but_changed_capacity(self):
        with patch('setup_supabase.urlopen', return_value=Response([{'id':'1','capacity_mw':200,'status':'Planning'}],1)):
            with self.assertRaisesRegex(ValueError, 'differs'):
                verify_api('https://myproject.supabase.co', 'public-key', [{'id':'1','capacity_mw':100,'status':'Planning'}])


if __name__ == '__main__':
    unittest.main()
