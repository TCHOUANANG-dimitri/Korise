# Enveloppe Tauri autour de l'application web (voir ../../opencode.md).

Tout ce qui concerne le build desktop :

- `src-tauri/tauri.conf.json` : charge l'export statique de `apps/web` via
  `frontendDist: "../web/out"`, généré par `beforeBuildCommand: npm run build --prefix ../web`.
- `src-tauri/src/*` : coquille Rust minimale (aucune logique métier — le web appelle
  le backend FastAPI en REST).

## Prérequis (machine avec toolchain Rust)

- [Rust](https://rustup.rs) (stable) installé.

## Commandes

```bash
npm install            # installe @tauri-apps/cli
npm run dev            # build web + fenêtre Tauri en dev
npm run build          # build web export + binaire desktop (installer)
```

## Icons

Générées depuis l'icône officielle Korise (`packages/shared/brand/korise-icon.png`)
via `npx tauri icon ../../packages/shared/brand/korise-icon.png`. Si le logo change,
relancer cette commande — ne jamais éditer les PNG dans `src-tauri/icons/` à la main.

## Titre de fenêtre / identifiant

Nom de produit `Korise`, identifiant `com.korah.korise`, définis dans
`src-tauri/tauri.conf.json`.