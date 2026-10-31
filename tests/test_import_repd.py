import csv
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_repd import process


class ImportTests(unittest.TestCase):
    def test_inclusion_quality_duplicates_and_coordinate_systems(self):
        base = {'Ref ID': '1', 'Site Name': '  A   wind farm  ', 'Technology Type': 'Wind Onshore',
                'Development Status': 'Planning permission Granted ', 'Installed Capacity (MWelec)': '25',
                'X-coordinate': '530000', 'Y-coordinate': '180000', 'Country': 'England',
                'Region': 'London', 'Operator (or Applicant)': 'Scottish Power',
                'Planning Application Submitted': '31/02/2020'}
        rows = [base, {**base, 'Ref ID':'2', 'Country':'Northern Ireland', 'X-coordinate':'117392', 'Y-coordinate':'488885'},
                {**base, 'Ref ID':'3', 'X-coordinate':'0', 'Installed Capacity (MWelec)':''},
                {**base, 'Ref ID':'4', 'Development Status':'Revised'},
                {**base, 'Ref ID':'5'}, {**base, 'Ref ID':'5'},
                {**base, 'Ref ID':'6', 'Development Status':'Unknown status'}]
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'test.csv'
            with path.open('w', newline='', encoding='utf-8') as handle:
                writer = csv.DictWriter(handle, fieldnames=base.keys()); writer.writeheader(); writer.writerows(rows)
            projects, summary, audit = process(path, '2026-08-03', 'test')
        self.assertEqual(len(projects), 3)
        self.assertEqual(summary['included'] + summary['excluded'], 7)
        self.assertEqual(projects[0]['name'], 'A wind farm')
        self.assertEqual(projects[0]['developer'], 'ScottishPower')
        self.assertEqual(projects[0]['status'], 'Consented')
        self.assertAlmostEqual(projects[0]['latitude'], 51.504, places=2)
        self.assertAlmostEqual(projects[1]['latitude'], 54.18, places=1)
        self.assertAlmostEqual(projects[1]['longitude'], -6.33, places=1)
        self.assertIsNone(projects[2]['latitude'])
        self.assertIsNone(projects[2]['capacity_mw'])
        self.assertEqual(audit['duplicate_ids'], {'5':2})
        self.assertIn('Invalid application_submitted: 31/02/2020', projects[0]['quality_issues'])


if __name__ == '__main__':
    unittest.main()
