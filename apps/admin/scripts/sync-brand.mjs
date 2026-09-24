// Même logique que apps/web/scripts/sync-brand.mjs : copie l'icône canonique depuis
// packages/shared/brand vers public/brand avant chaque build/dev — jamais éditée à la main.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', '..', '..', 'packages', 'shared', 'brand');
const destDir = join(__dirname, '..', 'public', 'brand');

const FILES = ['korise-icon.png'];

mkdirSync(destDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log(`[sync-brand] ${FILES.length} asset(s) copiés depuis packages/shared/brand`);
