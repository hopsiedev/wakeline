import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from package_windows import build


class PortablePackageTests(unittest.TestCase):
    def test_archive_contains_only_distributable_files_and_manual_update_marker(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            binaries = root / 'bin'
            binaries.mkdir()
            for name in ('wakeline-app.exe', 'wakeline.exe'):
                (binaries / name).write_bytes(b'binary fixture')
            (binaries / '.env').write_text('EXCLUDED_FIXTURE=1')
            for name in ('LICENSE-MIT', 'THIRD_PARTY_LICENSES.md', 'RELEASE.md'):
                (root / name).write_text('license or documentation fixture')
            archive = build(root, binaries, root / 'out', '0.1.0', 'test-commit')
            with zipfile.ZipFile(archive) as contents:
                self.assertEqual(set(contents.namelist()), {
                    'wakeline-app.exe', 'wakeline.exe', 'LICENSE-MIT',
                    'THIRD_PARTY_LICENSES.md', 'README.md', 'wakeline-portable.json',
                })
                marker = json.loads(contents.read('wakeline-portable.json'))
                self.assertEqual(marker['updateMode'], 'manual')
                self.assertEqual(marker['commit'], 'test-commit')

    def test_missing_cli_does_not_produce_a_partial_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises(FileNotFoundError):
                build(root, root, root / 'out', '0.1.0', 'test-commit')
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
