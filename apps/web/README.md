# apps/web

Application web **Korise** (usage propriétaire, grand écran).
Stack : Next.js 15 (TypeScript) + Tailwind CSS + **export statique** (`output: 'export'`) —
le build produit dans `out/`, qui est le même code encapsulé par `apps/desktop` via Tauri.
Aucune fonctionnalité serveur (API routes / server actions / ISR) : toute la logique
vit dans le backend FastAPI, appelé en REST depuis le client.

Design : voir `../../documentation/DESIGN_SYSTEM.md` — Tailwind est configuré directement
depuis `packages/shared/design-tokens.json` (`tailwind.config.js`), polices Signika/Urbanist
via `next/font/google`, icônes `lucide-react` uniquement (zéro emoji).

## État actuel

- **`/login` — Connexion / création d'entreprise** : `POST /auth/login` (code entreprise +
  PIN) ou `POST /auth/register-business`. Le token JWT est persisté (`lib/session.ts`) et
  reste valable hors-ligne. `AuthGate` (dans `app/layout.tsx`) redirige vers `/login` si
  aucune session n'existe — pas de middleware serveur possible en export statique.
- **`/` — Tableau de bord patron** (fonctionnalité MVP #6) : appelle `GET /dashboard/daily`
  quand une connexion est disponible (ventes, dépenses, caisse attendue, dernière clôture,
  alertes stock, top produits, activité par employé). Bascule sur un calcul local
  (IndexedDB) si le backend est injoignable, avec indicateur "hors-ligne" visible.
- **`/closing` — Clôture de fin de journée** (fonctionnalité MVP #7) : caisse attendue via
  `GET /closing/expected-cash` (calcul serveur), repli local si hors-ligne → écart + motif
  → enregistrée dans la file hors-ligne, poussée via `/sync/push`.
- **`/sale` — Vente rapide** : catalogue produits synchronisé depuis `GET /products`
  (`lib/repo.ts#syncProductsFromServer`), jamais de fixtures. Mêmes règles que le mobile :
  jamais bloquée par un stock local insuffisant.

## Authentification

`lib/session.ts` stocke `{ access_token, user_id, business_id, business_code, role,
full_name }` dans `localStorage`. `lib/api.ts` attache `Authorization: Bearer <token>` à
chaque requête protégée — `business_id`/`user_id` ne sont **jamais** envoyés par le client,
ils viennent du token côté serveur (voir `documentation/SYNC_DESIGN.md` §7).

## Offline-first

Mêmes conventions que le mobile (`../../documentation/SYNC_DESIGN.md`) :
- Stockage local **IndexedDB** (`lib/db.ts`, wrapper minimal sans lib lourde).
- Outbox locale : toute saisie écrit localement + dans la file ; push → pull via
  `../../packages/shared/openapi.json` (`/sync/push`, `/sync/pull`).
- Le stock est **recalculé** (dernière valeur serveur − ventes locales en attente) ;
  jamais de blocage pour stock insuffisant.
- Une vente ne crée **jamais** localement ses mouvements dérivés : réconciliation au pull.

## Assets de marque

Le logo (`packages/shared/brand/*.png`) est copié dans `public/brand/` avant chaque
build/dev par `scripts/sync-brand.mjs` (`prebuild`/`predev`). Ce dossier `public/brand/`
est généré et gitignored — ne jamais l'éditer directement, éditer la source dans
`packages/shared/brand/`.

## Points ouverts (prochaine itération)

- Écrans Stock (04), Équipe (05) et Journal (06) pas encore construits — le backend a déjà
  `/products` (CRUD complet) et `/auth/employees`, mais pas encore d'endpoint de lecture du
  journal d'audit.
- Pas de refresh token : après 24h, l'utilisateur doit se reconnecter (`/login`).

## Commandes

```bash
npm install
npm run dev        # développement (SSR local) — copie d'abord les assets de marque
npm run build      # export statique → out/
npm run typecheck  # tsc --noEmit
```
