// Détection de l'environnement Tauri (apps/desktop encapsule l'export statique
// web). Les deux globales existent selon la version de Tauri packagée — gardons
// les deux tant que ce n'est pas vérifié sur un poste réel (voir opencode.md §4.1).
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
}