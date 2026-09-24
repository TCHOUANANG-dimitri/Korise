# apps/mobile

Application mobile **Korise** (Korah Business Manager) — périmètre unique de l'agent OpenCode
(`../../opencode.md`). Priorité : **saisie rapide employé**, ultra légère, offline-first.
Stack : Expo SDK 57 (React Native) + TypeScript, SQLite (`expo-sqlite`).

## Écrans

- **Vendre** (MVP #1, priorité) : catalogue → quantité → moyen de paiement → encaissement.
- **Argent** (MVP #2) : entrée / dépense / retrait, avec motif et journal du jour.
- **Stock** (MVP #3) : inventaire et ajustements.
- **Stock** (MVP #3) : réappro (entrée) et ajustement (perte/casse) ; alertes de seuil.
- **Jour** (MVP #6/#7 en secondaire) : caisse calculée, ventes du jour, synchronisation,
  dernières ventes/clôtures ; **propriétaire** : caisse attendue (calcul serveur), clôture
  de fin de journée, top produits et activité employés, et **création d'employé** (MVP #5 —
  création seule : la liste des employés n'est pas encore exposée par l'API).

## Authentification (implémentée)

- Écran **connexion** : `business_code` + `PIN` (`POST /auth/login`).
- Écran **création d'entreprise** : `POST /auth/register-business` → affiche le `business_code`
  à noter/partager, puis entrée dans l'app.
- Le JWT est conservé dans le **SecureStore** de l'OS (session hors-ligne, `SYNC_DESIGN §7`).
  Le backend ne propose pas encore de refresh : au-delà de ~24h, reconnexion demandée.

## Design system (contraignant)

- Couleurs/rayons/espacements : **lus depuis `packages/shared/design-tokens.json`** via
  `src/theme/tokens.ts` (jamais de hex retranscrit à la main). Metro est configuré pour voir le
  monorepo (`metro.config.js` → `watchFolders`).
- Polices **Manrope** (titres/KPI) + **Inter** (corps/micro-labels), chargées par `expo-font`.
- Icônes **Lucide** (`lucide-react-native`), importées **par icône** pour ne pas embarquer tout
  le jeu (bundle plus léger).
- **Zéro emoji** dans l'UI. Boutons : principal (noir), accent (or, une seule action par écran),
  secondaire (blanc bordé). Micro-labels en majuscules.

## Offline-first

Contrat respecté (`../../documentation/SYNC_DESIGN.md`, `../../packages/shared/openapi.json`) :

- `client_uuid` généré sur l'appareil (`expo-crypto`) pour chaque événement.
- Une vente pousse **un seul événement** `Sale` ; les effets stock/caisse ne sont **jamais**
  construits côté client, ils sont reçus par `pull` (optimiste local en attendant).
- Stock recalculé : `base (quantité serveur connue) + mouvements reçus − ventes locales en attente`.
  Une vente n'est jamais bloquée par un stock insuffisant.
- Push : `accepted`/`duplicate` → retiré de l'outbox ; `rejected` → conservé et signalé.
- Pull : upsert par `client_uuid` (`INSERT OR IGNORE`), curseurs dans la table `kv`.
- Catalogue synchronisé via `GET /products` (le propriétaire le crée côté web).

## Configuration

`src/config.ts` → `API_BASE_URL` (par défaut `http://10.0.2.2:8000` = `localhost` vu de
l'émulateur Android). À adapter pour un appareil physique (IP de la machine).

## Commandes

```bash
npm install
npm start                 # Expo dev server
npx tsc --noEmit          # typecheck
npx expo export --platform android   # vérifie que le bundle se construit
```