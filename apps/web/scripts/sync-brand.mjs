// Copie les assets de marque canoniques (packages/shared/brand) vers public/brand
// avant chaque build/dev. Source unique de vérité = packages/shared/brand — ce
// dossier public/brand est généré, jamais édité à la main (voir .gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', '..', '..', 'packages', 'shared', 'brand');
const destDir = join(__dirname, '..', 'public', 'brand');

const FILES = ['korise-logo-full.png', 'korise-icon.png'];

mkdirSync(destDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log(`[sync-brand] ${FILES.length} asset(s) copiés depuis packages/shared/brand`);
