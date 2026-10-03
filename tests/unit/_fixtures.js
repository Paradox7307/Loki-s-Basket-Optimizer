// Saved pages from Heureka/Zboží used by some tests. They are copies of third-party
// content, so they are not committed (see .gitignore and tests/fixtures/README.md).
// A test that needs a missing fixture is reported as skipped instead of failing.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'fixtures');
function fixture(name) {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) {
    console.log(`SKIPPED: fixture ${name} is missing (see tests/fixtures/README.md)`);
    process.exit(0);
  }
  return fs.readFileSync(p, 'utf8');
}
module.exports = { fixture, DIR };
