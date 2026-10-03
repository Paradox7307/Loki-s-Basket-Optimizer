// Builds the store packages from extension/ into dist/:
//   lokis-basket-optimizer-chrome-<version>.zip   (Chrome Web Store: Firefox-only keys removed)
//   lokis-basket-optimizer-firefox-<version>.zip  (addons.mozilla.org)
// The version comes from extension/manifest.json.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webExt from 'web-ext';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const dist = path.join(root, 'dist');
const chromeSrc = path.join(dist, '.chrome-src');
const manifest = JSON.parse(readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const v = manifest.version;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Chrome: same files, manifest without Firefox-only settings
cpSync(src, chromeSrc, { recursive: true, filter: (p) => !p.endsWith('icon.svg') });
const chromeManifest = { ...manifest, background: { service_worker: manifest.background.service_worker } };
delete chromeManifest.browser_specific_settings;
writeFileSync(path.join(chromeSrc, 'manifest.json'), JSON.stringify(chromeManifest, null, 2));

const opts = { shouldExitProgram: false };
await webExt.cmd.build({ sourceDir: chromeSrc, artifactsDir: dist, filename: `lokis-basket-optimizer-chrome-${v}.zip`, overwriteDest: true }, opts);
await webExt.cmd.build({ sourceDir: src, artifactsDir: dist, filename: `lokis-basket-optimizer-firefox-${v}.zip`, overwriteDest: true, ignoreFiles: ['icons/icon.svg'] }, opts);
rmSync(chromeSrc, { recursive: true, force: true });
console.log(`\nBuilt version ${v} in dist/`);
