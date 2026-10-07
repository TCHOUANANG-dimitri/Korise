// Build de la landing Korise : un seul HTML autonome (CSS + JS inline) + logo + image de partage.
// - Couleurs/rayons injectés depuis packages/shared/design-tokens.json (jamais retranscrits à la main).
// - Logo copié depuis packages/shared/brand (source unique, jamais de copie committée ici).
// - Liens et numéros centralisés dans config.json.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', '..', 'packages', 'shared');
const out = join(here, 'dist');
const tokens = JSON.parse(readFileSync(join(shared, 'design-tokens.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));

// URL publique pour les balises de partage (og:image doit être absolue).
const siteUrl = (
  process.env.SITE_URL ||
  config.siteUrl ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
).replace(/\/$/, '');

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const vars = [
  ...Object.entries(tokens.color).map(([k, v]) => `--${kebab(k)}:${v}`),
  ...Object.entries(tokens.radius).map(([k, v]) => `--r-${k}:${v}px`),
];
const tokensCss = `:root{${vars.join(';')}}`;

const social = Object.entries(config.social || {})
  .filter(([, url]) => url)
  .map(([label, url]) => ({ label, url }));

let html = readFileSync(join(here, 'src', 'index.html'), 'utf8');
const replacements = {
  '/*%%TOKENS%%*/': tokensCss,
  '%%SITE_URL%%': siteUrl,
  '%%APP_URL%%': config.appUrl.replace(/\/$/, ''),
  '%%WHATSAPP%%': config.whatsapp,
  '%%YOUTUBE_URL%%': config.youtubeUrl || '',
  '%%TAGLINE%%': tokens.brand.tagline,
  '%%SOCIAL_JSON%%': JSON.stringify(social),
};
for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);
if (html.includes('%%')) throw new Error('Placeholder non remplacé dans index.html');

mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f), { recursive: true, force: true });
mkdirSync(join(out, 'brand'), { recursive: true });
writeFileSync(join(out, 'index.html'), html);
for (const f of ['korise-logo-full.png', 'korise-icon.png']) copyFileSync(join(shared, 'brand', f), join(out, 'brand', f));
copyFileSync(join(here, 'src', 'og.png'), join(out, 'og.png'));
console.log(`[landing] dist/ prêt (${(Buffer.byteLength(html) / 1024).toFixed(1)} Ko HTML) — site: ${siteUrl || '(SITE_URL non défini)'}`);
