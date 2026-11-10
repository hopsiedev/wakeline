"""Build the portable ZIP from an explicit allowlist, never from a workspace glob."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile


def build(root, binaries, output, version, commit):
    files = {name: binaries / name for name in ('wakeline-app.exe', 'wakeline.exe')}
    files.update({name: root / name for name in (
        'LICENSE-MIT', 'LICENSE-APACHE', 'THIRD_PARTY_LICENSES.md',
    )})
    files['README.md'] = root / 'RELEASE.md'
    for source in files.values():
        if not source.is_file():
            raise FileNotFoundError(source)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'Wakeline_{version}_windows-x64.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for name, source in files.items():
            package.write(source, name)
        package.writestr('wakeline-portable.json', json.dumps({
            'version': version, 'commit': commit, 'updateMode': 'manual',
        }, indent=2))
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    (output / 'build-info-windows-x64.json').write_text(json.dumps({
        'version': version, 'commit': commit, 'platform': 'windows-x64',
    }, indent=2), encoding='utf-8')
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binaries', type=Path, default=Path('target/release'))
    parser.add_argument('--output', type=Path, default=Path('packages'))
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / 'apps/desktop/src-tauri/tauri.conf.json').read_text())['version']
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    print(build(root, options.binaries, options.output, version, commit))
