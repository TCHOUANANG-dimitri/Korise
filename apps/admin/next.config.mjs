/**
 * apps/admin est une app web déployée séparément (Vercel), jamais encapsulée dans Tauri —
 * contrairement à apps/web, pas de contrainte d'export statique ici (voir opencode.md
 * chantier D : "nouvelle app séparée... déploiement Vercel séparé").
 */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
