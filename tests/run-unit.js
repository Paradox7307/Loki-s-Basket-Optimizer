// Runs every tests/unit/*.test.js in its own process and prints a summary.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'unit');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const out = (r.stdout || '').trim().split('\n');
  const last = out[out.length - 1] || '';
  if (r.status === 0) console.log(`  ok    ${f.padEnd(24)} ${last}`);
  else { failed++; console.log(`  FAIL  ${f}\n${r.stdout}\n${r.stderr}`); }
}
console.log(failed ? `\n${failed} test file(s) failed` : `\nall ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
