# Korise (Korah Business Manager)

Système de contrôle quotidien pour petites entreprises physiques (Cameroun) : caisse, ventes et
stock capturés via des événements métier uniques, avec réconciliation de fin de journée.

## Documents clés

- [`documentation/CAHIER_DES_CHARGES.md`](documentation/CAHIER_DES_CHARGES.md) — cahier des charges à jour (source de vérité produit).
- [`documentation/MVP_SPEC.md`](documentation/MVP_SPEC.md) — spécification produit du MVP (historique).
- [`documentation/SYNC_DESIGN.md`](documentation/SYNC_DESIGN.md) — protocole de synchronisation multi-appareils.
- [`documentation/DESIGN_SYSTEM.md`](documentation/DESIGN_SYSTEM.md) — design system Korise (couleurs, typo, composants, icônes).
- [`documentation/Korah Business Manager Problem Solution ICP MVP.pdf`](<documentation/Korah Business Manager Problem Solution ICP MVP.pdf>) — document produit original.
- [`documentation/BizFlow_Identite_Visuelle_Design_System.pdf`](documentation/BizFlow_Identite_Visuelle_Design_System.pdf) — design system original BizFlow (fondateur, historique).
- [`CLAUDE.md`](CLAUDE.md) — instructions de travail pour l'agent Claude Code (backend + web + desktop).
- [`opencode.md`](opencode.md) — instructions de travail pour l'agent OpenCode (mobile).

## Structure du monorepo

```
backend/            API (Python/FastAPI/PostgreSQL) — Claude Code
apps/web/            App web (Next.js) — Claude Code
apps/desktop/         Enveloppe desktop (Tauri + export statique de apps/web) — Claude Code
apps/mobile/         App mobile (React Native) — OpenCode
apps/admin/          Plateforme Super Admin (Next.js, déploiement séparé) — Claude Code
packages/shared/     Contrat API (OpenAPI), tokens design, assets de marque
documentation/       Specs produit et design
```

## Principes du MVP

Ultra simple d'utilisation. Ultra efficace pour résoudre le problème. Ultra léger sur les 3
plateformes. Zéro emoji dans l'UI — uniquement des icônes SVG (voir DESIGN_SYSTEM.md). Rien d'autre
ne prime tant que le MVP n'est pas validé.
