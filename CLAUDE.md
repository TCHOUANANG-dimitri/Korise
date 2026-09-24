# Korah Business Manager — Instructions de travail (Claude Code)

Ce fichier est mon contexte permanent de travail sur ce projet. Toute session future doit le lire
avant d'agir.

## Contexte produit

Voir `documentation/MVP_SPEC.md` — c'est la source de vérité produit. En résumé : Business Manager
pour petites entreprises physiques au Cameroun, architecture événementielle (une vente = un seul
événement qui met à jour ventes + caisse + stock), offline-first, 3 plateformes (desktop/web/mobile).

**Les deux exigences non négociables : ultra simple d'utilisation, ultra efficace pour résoudre le
problème.** Toute décision technique ou de scope doit être jugée à cette aune. Ne pas ajouter de
fonctionnalité hors du périmètre MVP (section 5 de MVP_SPEC.md) sans validation explicite du
fondateur.

## Répartition du travail (deux agents en parallèle)

Ce projet est développé en parallèle par **deux agents IA distincts** pour aller plus vite sans se
marcher dessus. Mise à jour (2026-09-17) : passage à la phase interfaces, répartition confirmée par
le fondateur.

- **Claude Code (moi)** : `backend/`, `apps/web/` (Next.js), `apps/desktop/` (Tauri, encapsule le
  build web), `packages/shared/` (contrat API + tokens design + assets de marque),
  `documentation/`, fichiers de coordination à la racine.
- **Agent OpenCode** : `apps/mobile/` (React Native) uniquement — priorité à la saisie rapide
  employé. Instructions détaillées dans `opencode.md`.

**Règle par défaut** : je ne modifie pas `apps/mobile/` pendant qu'OpenCode y travaille. Si un changement
de contrat API est nécessaire pour le mobile, je le documente dans `packages/shared/` et je mets à jour
`opencode.md`. **Exception (2026-09-24)** : le fondateur m'a explicitement demandé de terminer moi-même le
chantier « parité mobile/web » et de compiler l'APK — j'ai donc modifié `apps/mobile/` pour ce chantier
(voir `opencode.md`, section de tête). Cette exception ne vaut que pour ce chantier.

**Périmètre ajouté** : `apps/admin/` (Super Admin, Next.js séparé, port 3001) est aussi le mien. Matrice de
conformité aux deux cahiers des charges : `documentation/CONFORMITE_CAHIERS.md`. Desktop (`apps/desktop`)
mis de côté sur instruction du fondateur.

## Design system — implémentation web/desktop

Référence contraignante : `documentation/DESIGN_SYSTEM.md` (digitalisation du design system
BizFlow fourni par le fondateur, palette/typo ensuite reprises telles quelles par Koness puis
Korise — seul le nom du produit a changé) + `packages/shared/design-tokens.json` (tokens
machine-readable — **importer ce fichier, ne jamais retranscrire un hex à la main**) +
`packages/shared/brand/` (logo : `korise-logo-full.png` pour connexion/splash, `korise-icon.png`
pour favicon/petits formats — noms mis à jour lors du rebrand Koness → Korise, 2026-09-23).
**Zéro emoji dans l'UI, nulle part** — uniquement des icônes Lucide (voir plus bas).

Décisions d'implémentation pour Next.js :
- **Tailwind CSS**, avec le thème étendu directement depuis `packages/shared/design-tokens.json`
  (`require()` ce fichier dans `tailwind.config.js` plutôt que de dupliquer les couleurs) — une
  seule source de vérité pour les couleurs/rayons/espacements, partagée avec le futur code desktop
  qui réutilise exactement le même build.
- **Polices** : Manrope (titres, KPI) + Inter (corps, micro-labels) via `next/font/google` — jamais
  Aptos (substitution assumée et documentée dans DESIGN_SYSTEM.md §3, pour un rendu identique au
  mobile React Native).
- **Icônes** : `lucide-react`, style outline, 20-24px. Pas d'autre bibliothèque d'icônes, pas
  d'emoji de secours.
- **Logo** : composant `<Logo variant="full" | "icon" />` qui sert les PNG de `packages/shared/brand/`
  via `next/image` — ne jamais resauvegarder une copie locale du logo dans `apps/web/public/`, le
  build doit lire depuis `packages/shared/brand/` (via `files`/copy au build, ou un symlink) pour
  qu'une mise à jour du logo ne se fasse qu'à un seul endroit.
- **Écrans** (voir DESIGN_SYSTEM.md §6) : les 6 sont construits — Dashboard propriétaire (`/`),
  Vente rapide (`/sale`), Réconciliation fin de journée (`/closing`), Stock (`/stock`), Équipe
  (`/equipe`), Journal (`/journal`, sur `GET /audit-log`). Build statique + typecheck propres.
- **Desktop (Tauri)** : une fois le web stable, l'encapsuler avec `next.config.js` en
  `output: 'export'` pour le build packagé dans Tauri (voir raisonnement complet déjà noté plus haut
  dans ce fichier, section Architecture technique retenue) — pas de projet desktop séparé à
  maintenir en double.

## Architecture technique retenue

Stack confirmée par le fondateur :

- **Backend** : Python + FastAPI + PostgreSQL (Postgres 17 déjà installé localement) + SQLModel/SQLAlchemy
  + Alembic pour les migrations. Multi-tenant (scoping par `business_id`). JWT pour l'auth (pas encore
  implémenté — voir "Prochaines étapes").
- **Contrat API** : OpenAPI généré par FastAPI → publié dans `packages/shared/` (schéma + éventuels
  types générés) pour que web/mobile/desktop consomment une seule source de vérité, sans dépendre
  d'une synchronisation manuelle avec l'agent OpenCode.
- **Web** : Next.js + TypeScript (mon scope désormais, voir "Répartition du travail" plus haut).
  C'est un outil interne authentifié (pas de besoin SEO/SSR public), donc le SSR de Next n'est pas
  une contrainte structurante ici — voir desktop.
- **Mobile** : React Native (scope agent OpenCode).
- **Desktop** : **Tauri encapsulant un export statique de l'app Next.js** (`next export` /
  `output: 'export'`), pas Electron. Raisonnement : Tauri = binaire natif de quelques Mo (webview
  système) contre 100+ Mo pour Electron, ce qui contredirait l'exigence "ultra léger" énoncée pour les
  trois plateformes. La contrainte en retour est que le build packagé pour le desktop ne peut pas
  utiliser les fonctionnalités serveur de Next (API routes, server actions, ISR) — sans problème ici
  puisque toute la logique vit dans le backend FastAPI et que le front ne fait que l'appeler en REST.
  Le déploiement web hébergé peut rester un Next standard (SSR) si utile ; c'est uniquement le build
  utilisé *dans* Tauri qui doit être l'export statique. Si un jour une fonctionnalité web exige
  vraiment du SSR incompatible avec l'export statique, on réévaluera desktop à ce moment-là — ne pas
  anticiper ce cas maintenant.
- **Offline-first** : chaque client tient un journal d'événements locaux (outbox pattern) avec ID
  généré côté client (UUID) + horodatage + device id ; synchronisation idempotente vers le backend
  quand la connexion revient. Le protocole exact (push/pull, dérivation automatique des effets d'une
  vente, gestion du stock négatif, règle de conflit sur Product/User) est **spécifié en détail et de
  façon contraignante dans `documentation/SYNC_DESIGN.md`** — le backend doit l'implémenter exactement
  ainsi, ne pas improviser un protocole différent au fil du code.

Ces choix sont réversibles tant que peu de code existe — à challenger si le fondateur a une préférence
différente, mais ne pas re-débattre sans raison nouvelle.

## Principes de conception backend

- Une vente / un mouvement de stock / un mouvement de caisse = **un seul événement métier** en base,
  jamais des écritures séparées à synchroniser manuellement entre tables.
- Toute action sensible (vente, mouvement d'argent, ajustement de stock, création d'employé,
  changement de permission) doit écrire dans le journal d'audit (qui, quoi, quand).
- Les endpoints doivent rester simples et directement mappés aux 8 fonctionnalités MVP
  (`documentation/MVP_SPEC.md` section 5) — pas d'endpoints génériques façon ERP.
- Pas de fonctionnalité hors scope (pas de paie, pas de comptabilité SYSCOHADA complète, pas de CRM,
  etc.) tant que le MVP n'est pas validé.

## Authentification (implémentée)

- `POST /auth/register-business` : crée l'entreprise (avec un `business_code` court généré, ex.
  `KRH4X2`) + le compte propriétaire (PIN), renvoie un JWT.
- `POST /auth/login` : `{ business_code, pin }` → JWT. Fonctionne pour propriétaire et employés
  (même mécanisme, différencié par `role` dans le token).
- `POST /auth/recover-code` (2026-09-24, sans authentification — c'est tout l'objet) : code
  entreprise oublié. Vérification légère nom entreprise + nom complet + téléphone du propriétaire
  (tous requis, correspondance exacte) ; message d'erreur volontairement identique succès/échec
  d'identité (pas d'énumération d'entreprises) ; demande journalisée (audit
  `business.code_recovered` + télémétrie). Le nom d'entreprise n'étant pas unique, le service
  examine tous les homonymes et retient celui dont le propriétaire correspond. **Ne pas durcir**
  (SMS/e-mail) sans validation du fondateur — le code seul ne permet aucune action, la connexion
  exige toujours le PIN. UI : page web `/code-oublie` (lien depuis `/login`, route publique dans
  AuthGate + AppShell) et mode `'recover'` de `AuthScreen` côté mobile. Tests :
  `backend/tests/test_recover_code.py` (5 verts).
- `POST /auth/employees` : réservé au propriétaire (`require_owner`), crée un employé avec son PIN
  et ses permissions (`can_view_purchase_prices`, `can_view_owner_dashboard`).
- `/sync/push` et `/sync/pull` exigent maintenant un token Bearer valide ; `business_id`/`user_id`
  sont dérivés du token, plus jamais acceptés depuis le corps/la query de la requête — l'ancienne
  dette de sécurité notée précédemment est résolue.
- PIN hashé avec bcrypt via passlib. **Note technique** : `bcrypt` est épinglé à `4.0.1` dans
  `requirements.txt` — les versions `bcrypt>=4.1` cassent la détection de version interne de
  `passlib` 1.7.4 (bug connu de l'écosystème, pas une régression locale). Ne pas monter cette
  version sans revalider `tests/test_auth_and_sync.py`.
- Couverture de test : `backend/tests/test_auth_and_sync.py` (5 tests, tous verts) — inscription,
  refus de mauvais PIN, création d'employé, permissions owner/employee, et le scénario complet
  vente → dérivation stock+caisse → idempotence au rejeu.

## Migrations (implémentées)

Alembic est câblé sur `app.core.config.settings.database_url` (voir `alembic/env.py` — ne passe pas
par `config.set_main_option`/le fichier `.ini` car un mot de passe Postgres peut contenir `%`, que
configparser interprète). Le schéma initial (`alembic/versions/..._initial_schema.py`) a été généré
par autogenerate contre la vraie base Postgres locale de l'utilisateur (base `korah`) et appliqué
avec succès (`alembic upgrade head`). **Rappel pour toute future migration** : `script.py.mako`
inclut déjà `import sqlmodel` (bug connu d'autogenerate qui omet cet import sinon) — ne pas le
retirer.

## Produits, clôture, dashboard (implémentés)

- `POST /products` (propriétaire), `GET /products`, `GET /products/{id}`, `PATCH /products/{id}`
  (propriétaire). Le prix d'achat (`purchase_price`) n'est renvoyé que si
  `can_view_purchase_prices` est vrai pour l'utilisateur (toujours vrai pour le propriétaire) — deux
  schémas de sortie différents (`ProductOut` / `ProductOutRestricted`), jamais le même objet filtré
  a posteriori côté client.
- `GET /closing/expected-cash?closing_date=...` : prévisualisation de la caisse attendue avant
  saisie du montant compté. **La caisse attendue est calculée côté serveur, jamais fournie par le
  client** — `DailyClosingIn` (dans `/sync/push`) n'accepte plus de champ `expected_cash` du tout.
  Calcul = somme des `MoneyMovement` de la journée civile concernée (`func.date(created_at)`), pas
  un solde cumulé depuis le début — chaque jour est réconcilié indépendamment (limite MVP assumée,
  voir `documentation/SYNC_DESIGN.md`).
- `GET /dashboard/daily?day=...` (nécessite `can_view_owner_dashboard`, vrai par défaut pour le
  propriétaire) : ventes/dépenses/entrées/retraits du jour, caisse attendue, dernière clôture du
  jour si elle existe, alertes de stock (`quantity <= minimum_stock`), top 5 produits du jour,
  activité par employé. Correspond à la fonctionnalité MVP #6.

## Journal d'audit et liste des employés (implémentés, 2026-09-18)

- `GET /audit-log` (propriétaire uniquement, `require_owner`) : liste paginée (`limit`, filtre
  `action`), consommé par `apps/web/app/journal/page.tsx` (écran MVP #6).
- `GET /auth/employees` (propriétaire uniquement) : liste des comptes actifs sans le PIN.
- `TokenResponse` (`/auth/login`, `/auth/register-business`) expose maintenant
  `can_view_purchase_prices` et `can_view_owner_dashboard`, pas seulement `role` — corrige un bug
  remonté par l'agent OpenCode (un employé autorisé au dashboard ne le voyait pas côté mobile faute
  de ces champs dans le token).
- `GET /products` (liste et détail) a désormais un `response_model` déclaré
  (`ProductOut | ProductOutRestricted`) — le schéma OpenAPI n'était plus vide.
- 20/20 tests backend verts après ces correctifs ; `packages/shared/openapi.json` régénéré.

## Prochaines étapes backend (dette explicite, pas oubliée)

- Expiration/refresh du token : le JWT expire après 24h (`jwt_access_token_expire_minutes`) sans
  mécanisme de refresh — acceptable pour le MVP hors-ligne (voir SYNC_DESIGN.md §7) mais à revoir.
- Le calcul de caisse attendue par jour civil (voir ci-dessus) ne gère pas un commerce ouvert la
  nuit à cheval sur deux dates UTC — non bloquant pour le MVP, à surveiller si ça remonte en usage
  réel.

## Ce qui est reporté (ne pas y toucher sans demande explicite)

Pricing, marketing, acquisition, segmentation finale de marché, différenciation finale vs
concurrents (Odoo, KiboERP, ShopTrack). Voir MVP_SPEC.md section 7.
