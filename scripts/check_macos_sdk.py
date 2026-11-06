#!/usr/bin/env python3
"""Read-only workspace gate: selected SDK and/or every Mach-O slice in an artifact."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BASELINE = '27.0'

def run(*args):
    return subprocess.run(args, text=True, capture_output=True, check=True).stdout.strip()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', type=Path, help='Mach-O executable or .app bundle')
    args = parser.parse_args()
    results = []
    if args.artifact:
        path = args.artifact.resolve()
        files = sorted((path / 'Contents' / 'MacOS').iterdir()) if path.suffix == '.app' else [path]
        for binary in files:
            if not binary.is_file():
                continue
            if 'Mach-O' not in run('file', '-b', str(binary)):
                continue
            metadata = run('xcrun', 'vtool', '-show-build', str(binary))
            versions = re.findall(r'^\s*sdk\s+(\S+)', metadata, re.M)
            results.append({'binary': str(binary), 'sdk_slices': versions,
                            'pass': bool(versions) and all(v == BASELINE for v in versions)})
        if not results:
            raise ValueError('Không tìm thấy Mach-O executable để kiểm tra')
    else:
        version = run('xcrun', '--sdk', 'macosx', '--show-sdk-version')
        results.append({'selected_sdk': version, 'sdk_path': run('xcrun', '--sdk', 'macosx', '--show-sdk-path'),
                        'pass': version == BASELINE})
    print(json.dumps({'baseline_sdk': BASELINE, 'checks': results}, ensure_ascii=False, indent=2))
    return 0 if all(item['pass'] for item in results) else 1

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(f'SDK gate error: {exc}', file=sys.stderr)
        sys.exit(2)
