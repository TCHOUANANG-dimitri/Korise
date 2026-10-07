// Régénère src/og.png (aperçu de partage WhatsApp/Facebook, 1200×630) via Chrome/Edge headless.
// À relancer seulement si le titre ou le logo change : `npm run og`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', '..', '..', 'packages', 'shared');
const tokens = JSON.parse(readFileSync(join(shared, 'design-tokens.json'), 'utf8'));
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const css = `:root{${Object.entries(tokens.color).map(([k, v]) => `--${kebab(k)}:${v}`).join(';')}}`;
const html = readFileSync(join(here, 'og.html'), 'utf8')
  .replace('/*%%TOKENS%%*/', css)
  .replace('%%LOGO%%', pathToFileURL(join(shared, 'brand', 'korise-logo-full.png')).href);
const tmp = join(tmpdir(), 'korise-og.html');
writeFileSync(tmp, html);

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p) => p && existsSync(p));
if (!browsers.length) throw new Error('Chrome/Edge introuvable (définir CHROME_PATH)');
const outFile = join(here, '..', 'src', 'og.png');
execFileSync(browsers[0], [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', '--virtual-time-budget=6000', `--screenshot=${outFile}`, pathToFileURL(tmp).href,
]);
console.log(`[og] ${outFile}`);
