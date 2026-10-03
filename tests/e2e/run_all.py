"""Runs every browser test (tests/e2e/test_*.py). Needs: pip install playwright beautifulsoup4 lxml
and: python -m playwright install chromium. Screenshots go to tests/e2e/output/."""
import subprocess, sys
from pathlib import Path
here = Path(__file__).parent
failed = 0
for t in sorted(here.glob('test_*.py')):
    print(f'=== {t.name}')
    r = subprocess.run([sys.executable, str(t)], cwd=here, capture_output=True, text=True)
    print(r.stdout[-3000:])
    if r.returncode != 0 or 'ERRORS: [' in r.stdout or "errors: ['" in r.stdout:
        failed += 1
        print('FAILED', r.stderr[-3000:])
print(f'{failed} browser test(s) failed' if failed else 'all browser tests passed')
sys.exit(1 if failed else 0)
