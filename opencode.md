# Korise (Korah Business Manager) — Instructions pour l'agent OpenCode

Ce fichier t'est destiné. Lis-le en entier avant de commencer, et relis-le à chaque nouvelle
session : il est mis à jour entre deux sessions.

## 🆕🆕🆕 Mise à jour (2026-09-24, soir) — Claude Code a repris la main sur mobile + web + admin

Le fondateur a explicitement demandé à Claude Code de **terminer lui-même** le chantier (mobile compris) et de
compiler l'APK. Ce que tu trouveras en reprenant, **déjà fait et vérifié** (ne le refais pas) :

* **Récupération du code entreprise (2026-09-24, ajout après ton build)** : nouvel endpoint backend
  `POST /auth/recover-code` (sans auth — c'est tout l'objet) dans `backend/app/api/auth.py` +
  `auth_service.recover_business_code`, testé dans `backend/tests/test_recover_code.py` (5 verts).
  Côté mobile : `recoverBusinessCode()` dans `src/api/authApi.ts` + mode `'recover'` dans
  `AuthScreen.tsx` (bouton « Code entreprise oublié ? » sur la carte de connexion). Parité web :
  page `/code-oublie`. Contrat régénéré dans `packages/shared/openapi.json`. Le message d'erreur
  est identique succès/échec d'identité (pas d'énumération d'entreprises) — ne le rends pas plus
  verbeux.
* **Bug Gradle §A.3 résolu — cause racine trouvée.** Le fichier `apps/mobile/android/local.properties` doit
  être au format *properties Java* : les antislash y sont des caractères d'échappement. Un `sdk.dir` avec des
  antislash **simples** devient `C:UsersAdmin...` (chemin invalide → « La syntaxe du nom de fichier… »).
  Écris toujours `sdk.dir=C:/Users/Admin/AppData/Local/Android/Sdk` (slashs normaux) après un
  `expo prebuild` — ce fichier est effacé à chaque prebuild. Ne cherche pas ailleurs.
* **Mobile à parité fonctionnelle avec le web** : 5 onglets (Accueil, Vente, Argent, Stock, Plus) + « Plus »
  (Clients & crédits, Mon shift, Clôture 7 étapes, Historique, Anomalies, Rapports, Équipe, Journal, Paramètres),
  panier + recherche + scan code-barres (`expo-camera`), catégories de dépense, produits (code-barres, catégorie,
  service), verrouillage par PIN après inactivité, PDF reçu / facture / rapports via `expo-file-system/legacy` +
  `expo-sharing`, télémétrie appareil (en-têtes `X-Device-Id` / `X-Platform` / `X-App-Version` + heartbeat
  après chaque synchro). Fichiers : `apps/mobile/src/screens/*`, `src/api/extraApi.ts`, `src/api/telemetryApi.ts`,
  `src/pdf.ts`, `src/lock.ts`, `src/components/{BarcodeScanner,IdleLock}.tsx`.
* **Protocole de synchro étendu** : nouvelle liste `shifts` dans `POST /sync/push` (ouverture puis fermeture
  partagent le `client_uuid` du shift ; l'outbox utilise `<uuid>:close` pour la fermeture) et champ
  `category` sur les mouvements d'argent. Les résultats du serveur sont associés aux entrées d'outbox **par
  index** dans chaque liste — garde ce principe si tu touches à `syncEngine.ts`.
* Backend : anomalies enrichies (écarts de shift, cause probable, opérations liées), rapports + PDF brandés
  (`reportlab`), paramètres entreprise (`/business/me`, logo), télémétrie (`Device`, `PlatformEvent`), tous les
  écrans Super Admin. Matrice complète : `documentation/CONFORMITE_CAHIERS.md`.
* Le mobile est à la version `0.2.0` (`app.json`) ; `android.package` reste `com.korah.bizflow`.

À toi, si le fondateur te le redemande : tests manuels sur téléphone (scan caméra, partage PDF, verrouillage),
puis multi-boutiques et workflow de correction (P2, listés « ⏳ » dans la matrice).

---

## 🆕🆕 Mise à jour (2026-09-24) — prime sur tout ce qui suit, lis ceci en premier

Le fondateur a redonné trois directives pendant que tu compilais l'APK. Elles **remplacent**
certains points du chantier du 2026-09-23 juste en dessous — garde ce chantier pour le détail
technique déjà fait (backend crédit/canal/clôture, rebrand Korise), mais applique les
correctifs suivants par-dessus.

### 1. Priorité : mobile + web d'abord, desktop mis de côté

Le fondateur : *"on va se concentrer uniquement sur les versions mobile et web... tu peux
mettre la version desktop de côté pour le moment."* Ne investis plus de temps sur
`apps/desktop` sauf demande explicite. Pour information seulement (pas une action à
poursuivre) : le desktop compile maintenant avec succès de mon côté — les deux bugs §A.4/§A.4bis
plus bas sont corrigés (le `[lib]` de `Cargo.toml` a été ajouté). Le blocage Gradle mobile
(§A.3, "La syntaxe du nom de fichier...") reste lui un vrai blocage mobile à résoudre, pas du
desktop — ne le confonds pas avec la mise de côté du desktop.

### 2. Mobile et web : même couverture fonctionnelle, pas de différenciation forte

Le fondateur : *"elles donnent exactement la même interface des deux côtés, sans avoir à
faire une différenciation ultra spécifique au niveau des deux."* Ça **annule** la décision
prise plus bas dans ce fichier (§5, "recentrage sur la saisie") de réduire le mobile à 3 onglets
Vente/Argent/Stock seulement. Le mobile doit couvrir les mêmes fonctionnalités que le web —
Crédits, Équipe, Journal, et la Clôture guidée y compris — pas seulement la saisie rapide.

Ce que ça implique concrètement pour toi :
- Les écrans supprimés pendant le chantier précédent (`TodayScreen`, `ClosingScreen`,
  `TeamScreen`, `JournalScreen`) doivent revenir sous une forme ou une autre — pas forcément
  fichier pour fichier identiques à avant, mais la fonctionnalité doit être accessible sur
  mobile : clôture de fin de journée (avec le canal Orange Money en plus, voir point 4),
  gestion de l'équipe (permissions, désactivation), journal d'audit.
- Les écrans crédit (`CustomerPicker` dans `SaleScreen`/`MoneyScreen`) sont déjà faits, garde-les
  tels quels.
- Le composant de navigation (`Navigation.tsx`, `App.tsx`) doit donc redevenir capable
  d'accueillir plus que 3 onglets — un `Drawer`/menu comme avant plutôt qu'une bottom bar à 3
  entrées, ou toute structure de ton choix qui reste "ultra simple" (MVP_SPEC.md) tout en
  exposant tout.
- Je n'ai pas touché `apps/mobile` moi-même pendant que tu compilais dessus, pour ne pas
  provoquer de conflit avec ton build en cours — ce point est donc entièrement à faire de ton
  côté, pas déjà commencé.

### 3. Billing : jamais dans web/mobile, plan gratuit par défaut géré depuis l'admin

Le fondateur : *"ne pas avoir une tierce base de billing concrète dans les applications web et
mobiles... les personnes pourront créer un compte dans l'application sans avoir à passer par
un billing. On aura un billing par défaut qu'on va mettre gratuit au niveau de l'interface
admin."* **Déjà fait côté backend par Claude Code**, rien à faire de ton côté sur ce point :
- `backend/app/models/billing.py` : `Plan`, `Subscription` (remplace la version "trial 14
  jours" décrite au chantier C plus bas, qui n'est **plus** d'actualité — ignore ce paragraphe
  de la section Chantier C).
- `register_business` crée automatiquement un abonnement `active` sur un plan "Gratuit" (créé
  à la volée, prix 0) — **aucune étape de billing, jamais, dans l'app métier**. Rien à afficher
  côté mobile ou web pour ce chantier.
- Le plan/l'abonnement ne sont visibles/gérables que depuis `apps/admin` (voir point 5).

### 4. Orange Money : déjà fait côté backend + web, mobile reste à faire

`MoneyMovementChannel` a maintenant trois valeurs (`cash`/`mobile_money`/`orange_money`),
migration appliquée sur Supabase. `DailyClosing` a trois demi (cash/momo/orange). Web (`/sale`,
`/argent`, `/credits`, `/closing` — clôture maintenant en 6 étapes) déjà mis à jour. **À faire
côté mobile** (`SaleScreen`, `MoneyScreen`) : ajoute "Orange Money" comme 3ᵉ option partout où
`CHANNELS`/le sélecteur cash/mobile_money apparaît déjà (même pattern que l'ajout du crédit) —
et si tu restaures un écran de clôture mobile (point 2), il doit avoir les 3 canaux dès le
départ, pas seulement 2.

### 5. Super Admin : backend + app web déjà bootstrappés par Claude Code

`apps/admin/` existe maintenant (Next.js séparé, port 3001 en dev, pas de contrainte d'export
statique). Auth Super Admin entièrement séparée (`backend/app/models/admin.py:SuperAdminUser`,
jamais le même token qu'un compte entreprise — testé explicitement, voir
`backend/tests/test_admin.py`). Écrans faits avec de vraies données : Overview (KPI globaux),
Entreprises (liste + santé calculée), Fiche entreprise (détail). Pas encore faits : Analytics
produit, Monitoring technique (nécessitent le vrai journal `PlatformEvent`, §D.2 plus bas — pas
construit, la santé/les KPI actuels sont une approximation à partir des tables existantes).
**Pas dans ton scope** (backend + `apps/admin` restent chez Claude Code), mentionné ici pour
que tu saches que ça existe si le fondateur en parle. Premier compte créé via
`backend/scripts/create_super_admin.py` (pas d'auto-inscription).

---

## 🆕 Chantier actif (2026-09-23) — lis cette section en premier

Le chantier daté du 2026-09-22 plus bas (rebrand BizFlow→Koness + crédit client) est **terminé et
vérifié** : backend 27 tests verts, web/mobile typecheck OK, APK release compilé et testé (19,4 Mo,
nom "Koness" correct), build desktop lancé pour la première fois avec succès (après correction d'un
bug préexistant dans `tauri.conf.json`, voir §A.4 plus bas). Garde cette section pour l'historique
technique (patterns de code à réutiliser) mais le **périmètre autorisé qu'elle décrit reste valable
pour ce nouveau chantier aussi** : backend + web + desktop + mobile, à nouveau explicitement demandé
par le fondateur.

Deux nouveaux documents sont arrivés dans `documentation/` :
- `KORISE Cahier des fonctionnalites Web Mobile Desktop v0_1.pdf`
- `KORISE Cahier des charges Super Admin MVP.pdf`

**Nouveau nom produit : KORISE** (remplace Koness). **La palette et la typographie ne changent
pas** (`#F85602`/noir, Signika/Urbanist) — seul le mot change. Priorités confirmées par le
fondateur, dans cet ordre :

1. Rename Koness → Korise (chantier A ci-dessous)
2. Combler le cahier des fonctionnalités — priorité aux items **P1** de leur section 16, le P0 est
   déjà couvert (chantier B)
3. Construire un vrai modèle d'abonnement côté backend (chantier C) — **avant** le Super Admin,
   pour que celui-ci ait de vraies données à afficher plutôt que des écrans vides
4. Super Admin (chantier D) — nouvelle app séparée

### État en cours au moment où ce texte est écrit

Deux builds tournent en arrière-plan sous ma session au moment où j'écris ceci (je ne les ai pas
interrompus) : reconstruction de l'APK mobile avec les icônes natives corrigées (voir §A.3), et le
premier build desktop réussi. Si tu commences ce chantier après moi, vérifie juste que
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk` et
`apps/desktop/src-tauri/target/release/bundle/` existent et sont à jour — sinon relance les
commandes du §A.3/§A.4.

---

## Chantier A — Rename Koness → Korise

### A.1 Logo : pas de nouveaux fichiers propres reçus, extraction depuis le PDF

Le fondateur n'a pas fourni de nouveaux PNG (contrairement au rebrand BizFlow→Koness). Le logo
"Korise" existe cependant en qualité correcte **à l'intérieur des deux PDF** (image intégrée
1080×491, fond transparent, uniquement le pictogramme + le mot "Korise" — **sans** le sous-titre
"Korah Business Manager", qui doit être géré en texte séparé, voir A.2). Extraction reproductible :

```python
import fitz  # pip install pymupdf
doc = fitz.open(r"documentation/KORISE Cahier des fonctionnalites Web Mobile Desktop v0_1.pdf")
page = doc[0]
for img in page.get_images(full=True):
    xref = img[0]
    base = doc.extract_image(xref)
    if base.get("width", 0) > 300:  # la vraie image du logo fait 1080x491, les autres sont des puces/icônes minuscules
        open("korise-logo-full.png", "wb").write(base["image"])
```

Fichiers à produire dans `packages/shared/brand/` **et** `apps/mobile/assets/brand/` (mêmes deux
emplacements que pour Koness) :
- `korise-logo-full.png` — l'image extraite ci-dessus (mark + mot "Korise", sans sous-titre).
- `korise-icon.png` — **identique à `koness-icon.png`**, juste renommé (l'icône seule ne contient
  aucun texte, donc aucune extraction nécessaire, une simple copie suffit).
- `korise-icon-white.png` — même chose, copie de `koness-icon-white.png`.

Supprime les trois `koness-*.png` une fois toutes les références basculées (voir A.2). Si le
fondateur envoie un jour un fichier `korise-logo-full.png` de meilleure qualité (avec le sous-titre
inclus ou non), il suffit de remplacer ce fichier — même nom, aucun changement de code.

### A.2 Remplacer tout le texte "Koness"/"koness" par "Korise"/"korise"

Même exercice que le rename BizFlow→Koness (voir le chantier du 2026-09-22 plus bas pour la
méthode). Fichiers concernés, à vérifier un par un :

- `packages/shared/design-tokens.json` — `brand.name`.
- `apps/web/app/components/Logo.tsx` — `src="/brand/koness-*.png"` → `korise-*.png`, texte `alt`.
  **Ajoute aussi le sous-titre manquant** : pour `variant === 'full'`, affiche un `<p>` ou `<span>`
  "Korah Business Manager" sous l'image (police Urbanist, petit, gris/noir) — l'image extraite du
  PDF ne le contient plus, il doit donc être rendu en vrai texte à côté (plus robuste de toute
  façon : plus besoin de refaire l'extraction si le sous-titre doit changer un jour).
- `apps/web/app/layout.tsx` — `metadata.title`.
- `apps/web/scripts/sync-brand.mjs` — tableau `FILES`.
- `apps/mobile/app.json` — `"name"`, `"slug"` (même remarque que la dernière fois : changer le slug
  est sans risque, EAS n'a jamais été relié).
- `apps/mobile/App.tsx`, `apps/mobile/src/screens/AuthScreen.tsx`, tout composant affichant le logo
  — chemins `require('.../koness-*.png')` → `korise-*.png`. Dans `AuthScreen.tsx`, ajoute le même
  `<Text>Korah Business Manager</Text>` sous le logo complet que côté web (A.2 ci-dessus).
- `apps/mobile/android/app/src/main/res/values/strings.xml` — `app_name` → `Korise`. **Attention à
  l'ordre** : si tu dois relancer `expo prebuild --clean` pour une autre raison après ce rename, ce
  fichier sera régénéré avec la valeur de `app.json` à ce moment-là (donc regénère `app.json`
  **avant** de lancer `prebuild`, pas l'inverse) — sinon édite juste ce fichier directement après
  coup, pas besoin de reprebuild seulement pour ce nom.
- `apps/desktop/src-tauri/tauri.conf.json` — `productName`, `window.title`. Pour `identifier`
  (actuellement `com.korah.koness`) : comme pour BizFlow→Koness, aucun desktop packagé n'a encore
  été distribué à un utilisateur réel (seulement compilé ici en local pour test) — tu peux donc le
  changer sans risque en `com.korah.korise`.
- `README.md` racine, `apps/*/README.md`.
- `documentation/MVP_SPEC.md`, `documentation/DESIGN_SYSTEM.md`, `documentation/CAHIER_DES_CHARGES.md`
  — mets à jour le nom mentionné. Pour `CAHIER_DES_CHARGES.md` en particulier, ajoute une ligne en
  haut du fichier indiquant qu'il est maintenant partiellement remplacé par les deux nouveaux PDF
  pour le nom et le périmètre fonctionnel (même logique que ce document-ci vis-à-vis de `MVP_SPEC.md`).
- **Ne touche pas** `CLAUDE.md` (mon fichier).
- Balayage final : `grep -rniI "koness" .` (hors `node_modules`, `.git`, dossiers `build`/`dist`,
  et hors les sections **datées** de ce fichier `opencode.md` qui restent un journal historique, pas
  du code à corriger).

### A.3 Régénération des icônes natives — bug déjà rencontré une fois, ne pas le refaire

**Contexte important** : lors du chantier précédent, l'app mobile avait été rebrandée en Koness côté
code (`app.json`, `design-tokens.json`) mais les fichiers d'icône **natifs** Android
(`android/app/src/main/res/mipmap-*/ic_launcher*.webp`, générés par `expo prebuild` et jamais
regénérés depuis) étaient restés ceux de BizFlow. Résultat : l'APK compilé montrait encore l'ancien
logo malgré un code entièrement à jour. **Toujours régénérer le natif après un changement d'icône :**

```bash
cd apps/mobile
npx expo prebuild --platform android --clean   # ANDROID_HOME doit être exporté avant
```

`--clean` supprime `android/` et le régénère entièrement depuis `app.json` — donc `local.properties`
(qui contient `sdk.dir`, jamais commité, gitignored) disparaît aussi et doit être recréé après coup :

```
sdk.dir=C\:\\Users\\Admin\\AppData\\Local\\Android\\Sdk
```

Vérifie que l'icône régénérée est la bonne couleur avant de rebuild (évite de recompiler pour rien
si l'extraction a échoué) :

```python
from PIL import Image
im = Image.open("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp").convert("RGB")
print(sorted(im.getcolors(im.width * im.height), reverse=True)[:3])
# doit contenir (248, 86, 2) ou proche — c'est #F85602
```

Puis rebuild : `cd android && ./gradlew assembleRelease` (`ANDROID_HOME`/`ANDROID_SDK_ROOT` exportés).

**Bug rencontré à ce stade, non résolu — à diagnostiquer avant de continuer le mobile.** Après le
`expo prebuild --platform android --clean` ci-dessus, `assembleRelease` échoue systématiquement (y
compris après avoir recréé `local.properties`) avec :

```
Build file '...\android\build.gradle' line: 24
* What went wrong:
A problem occurred evaluating root project 'Koness'.
> Failed to apply plugin 'com.facebook.react.rootproject'.
   > A problem occurred configuring project ':app'.
      > Failed to notify project evaluation listener.
         > La syntaxe du nom de fichier, de répertoire ou de volume est incorrecte
```

("La syntaxe du nom de fichier..." = message Windows localisé en français pour l'erreur système 123
`ERROR_INVALID_NAME`, typiquement un chemin malformé passé à une API fichier.) Ce que j'ai déjà
vérifié et éliminé comme cause : `local.properties` est propre en hex (pas de caractère invisible,
pas de BOM, un seul antislash par séparateur — `sdk.dir=C\:\Users\Admin\AppData\Local\Android\Sdk`,
exactement le même format qui fonctionnait avant le `prebuild --clean`), `node` se résout
correctement (`C:\Program Files\nodejs\node.exe`, v24.14.1), pas de déclaration `sdk.dir` en double
dans `android/`. La cause reste donc à trouver **ailleurs** — probablement dans un fichier régénéré
par `prebuild --clean` (le plugin `com.facebook.react.rootproject` construit des chemins quelque
part lors de l'évaluation du projet racine). Prochaine étape de diagnostic : relancer avec
`./gradlew assembleRelease --stacktrace` pour voir la frame Java exacte qui lève l'erreur, plutôt que
de deviner plus loin. Ne relance pas `prebuild --clean` une deuxième fois en espérant que ça se
résolve tout seul — ça reproduira très probablement le même état.

Pour le desktop, l'équivalent est `npx tauri icon ../../packages/shared/brand/korise-icon.png`
depuis `apps/desktop` (régénère toute la série `icons/*.png`/`.icns`/`.ico`), à faire **après** avoir
mis en place les nouveaux fichiers du §A.1.

### A.4 Bug déjà corrigé dans `tauri.conf.json` — pour information, ne pas le réintroduire

Le tout premier build desktop de ce projet (jamais réussi avant faute de toolchain Rust disponible)
a révélé un bug de configuration resté invisible jusque-là : `frontendDist` valait `"../web/out"`
dans `src-tauri/tauri.conf.json`, alors que ce chemin est relatif à `src-tauri/` — donc résolu vers
`apps/desktop/web/out` (inexistant) au lieu de `apps/web/out`. Corrigé en `"../../web/out"`. Si tu
vois cette erreur : `Unable to find your web assets... frontendDist is set to "../web/out"`, c'est
exactement ce bug — vérifie que le correctif est toujours en place avant de chercher ailleurs.

### A.4bis Deuxième bug desktop trouvé après correction du premier (§A.4) — à corriger avant de rebuild

Une fois `frontendDist` corrigé (§A.4), le premier vrai build Rust a échoué avec :

```
error[E0433]: failed to resolve: use of unresolved module or unlinked crate `korah_desktop_lib`
 --> src/main.rs:5:5
5 |     korah_desktop_lib::run()
help: there is a crate or module with a similar name: `korah_desktop`
```

Cause : `apps/desktop/src-tauri/Cargo.toml` n'a **pas de section `[lib]`**, donc le nom de crate lib
par défaut est `korah_desktop` (dérivé de `name = "korah-desktop"`), alors que `src/main.rs` importe
`korah_desktop_lib::run()` — c'est le nom que le vrai template Tauri v2 utilise habituellement, via
une section `[lib]` explicite absente ici. Corrige `Cargo.toml` en ajoutant :

```toml
[lib]
name = "korah_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

(à placer juste après le bloc `[package]`). Ne touche pas à `src/main.rs` ni `src/lib.rs` — c'est
`Cargo.toml` qui a la section manquante, pas eux qui ont le mauvais nom. Une fois corrigé, relance
`npm run build` depuis `apps/desktop`.

### A.5 Vérification chantier A

`npm run typecheck` + `npm run build` dans `apps/web` ; `npx tsc --noEmit` dans `apps/mobile` ;
grep final sans résultat (A.2) ; APK et bundle desktop reconstruits avec le bon nom et la bonne
icône (vérifiable via `aapt2 dump badging app-release.apk | grep application-label` côté Android).

---

## Chantier B — Cahier des fonctionnalités : combler les priorités P1

Référence : `documentation/KORISE Cahier des fonctionnalites Web Mobile Desktop v0_1.pdf`, section
16 (« Priorisation fonctionnelle »). Le P0 de leur tableau est déjà entièrement couvert (vente,
caisse, cash/Mobile Money, stock, employés/permissions, offline, audit, clôture, dashboard de base,
**et crédit client** — leur doc le classe encore "À AJOUTER" mais c'est fait depuis le chantier du
2026-09-22, ne le reconstruis pas).

Le P1 restant, dans l'ordre où je recommande de l'attaquer (du plus petit au plus structurant) :

### B.1 Orange Money — mode de paiement distinct

Aujourd'hui, `payment_method`/`channel` (`backend/app/models/events.py`,
`MoneyMovementChannel`) n'a que `cash`/`mobile_money`/`credit`. Le document demande Orange Money
comme mode **distinct** de "Mobile Money" générique (probablement MTN Mobile Money implicitement).
- Ajoute une valeur `orange_money` à `MoneyMovementChannel` et à la liste des `payment_method`
  possibles sur `Sale` (`cash`/`mobile_money`/`orange_money`/`credit`).
- Migration Alembic pour l'enum si stocké en tant que tel côté DB (sinon juste une valeur `str` de
  plus, pas de migration nécessaire si le champ est déjà un `str` libre validé côté Pydantic
  uniquement — vérifie comment c'est fait actuellement avant de migrer).
- Web (`/sale`, `/argent`, `/closing`) et mobile (`SaleScreen`, `MoneyScreen`, écran clôture web
  uniquement puisque la clôture n'est plus sur mobile) : le sélecteur "Cash / Mobile Money" devient
  "Cash / Mobile Money / Orange Money" partout où il apparaît.
- La clôture guidée (déjà scindée cash/momo, voir chantier précédent §2.7) doit maintenant scinder
  en **trois** : cash, Mobile Money, Orange Money — `DailyClosing` gagne
  `expected_orange`/`actual_orange`/`difference_orange` (nullable, même raison que pour momo : ne
  pas casser les clôtures historiques).

### B.2 Centre d'anomalies (mentionné comme différenciant dans les deux documents)

- Nouveau backend : un endpoint `GET /anomalies` qui **dérive** (ne stocke pas séparément) une
  liste d'événements à vérifier à partir des données déjà existantes :
  - clôtures avec `difference != 0` (n'importe quel canal) des N derniers jours,
  - mouvements de stock de type `adjustment` avec `quantity_delta` négatif important et sans motif
    (`reason IS NULL`),
  - ventes dont `unit_price` diffère fortement du `selling_price` catalogue du produit au moment de
    la vente (nécessite de comparer au prix catalogue **actuel** du produit, approximation acceptée
    pour le MVP).
  - Chaque anomalie : type, montant/écart, date, produit/employé concerné, lien vers l'opération
    source, statut (`ouvert`/`résolu` — nouveau champ minimal, soit une table `AnomalyResolution`
    séparée qui référence le type+id de l'opération source et qui-a-résolu/quand, plutôt que de
    complexifier chaque table métier).
- Web uniquement (c'est un outil de contrôle, pas de saisie — cohérent avec le rôle mobile=saisie
  déjà tranché) : nouvel écran `/anomalies`, dans `Sidebar.tsx` → `OWNER_LINKS` (réservé au
  propriétaire, comme Journal).

### B.3 Rapprochement global (étendre la clôture guidée existante)

La clôture guidée (chantier précédent) couvre déjà cash/Mobile Money + une étape stock "à
vérifier" simple confirmation. Le document demande d'aller plus loin : calculer explicitement ce qui
*devrait* être en stock (déjà dérivable des mouvements) et le présenter comme un vrai rapprochement
(attendu vs compté), pas seulement une liste d'alertes à confirmer. Ajoute une étape optionnelle
"comptage stock" dans le parcours de clôture web, avec saisie du compte réel pour les produits sous
alerte uniquement (pas tout le catalogue à chaque fois — resterait "ultra simple").

### B.4 Fiche client complète

`Customer`/`CustomerWithBalance` existent déjà (solde dérivé). Le document veut une vraie fiche :
historique des ventes à crédit ET remboursements dans l'ordre chronologique (déjà en grande partie
disponible via `get_customer_detail`/`CustomerDetailOut`, vérifie ce qui manque), et sur le web,
un écran de détail client plus riche que la vue actuelle dans `/credits` (déjà en place — vérifie si
un vrai écran dédié `/credits/[id]` apporterait de la valeur vs la vue expand-inline actuelle, sinon
ne duplique pas pour le principe).

### B.5 Connexion par profil (façon Chrome) — mentionné section 4 du cahier fonctionnel

Pas explicitement listé P0/P1 dans leur tableau de priorisation (section 16), mais présenté comme
un principe UX important (section 4). Pour le MVP, je recommande de **ne pas** le construire tout
de suite (vrai changement de modèle de session, plusieurs profils mémorisés par appareil) — à
proposer au fondateur comme P1-bis séparé plutôt que de l'attaquer sans validation explicite. Note
dans "Points ouverts" si tu penses qu'il faut le prioriser autrement.

### B.6 Reçus/factures PDF et rapports PDF brandés

Le reçu léger actuel (texte partageable, chantier précédent) reste valable pour le "reçu de vente"
version rapide. Le document demande en plus de vrais PDF (reçu détaillé, facture, rapport
journalier/stock/employé/anomalies) avec le logo et les coordonnées de l'entreprise cliente. C'est
un chantier à part entière :
- **Décision technique à prendre avant de coder** : génération PDF côté backend (Python —
  `reportlab` ou `weasyprint`, plus robuste pour un rendu identique quel que soit le client) ou côté
  client web (`jsPDF`/`@react-pdf/renderer`, évite une dépendance backend mais duplique la mise en
  page si le mobile en a besoin un jour). Je recommande **backend**, cohérent avec "toute la logique
  vit dans le backend FastAPI" déjà établi dans ce projet — note ce choix dans "Points ouverts" si
  tu trancherais différemment.
- Nouveau endpoint(s) : `GET /reports/daily.pdf?day=...`, `GET /receipts/{sale_id}.pdf`, etc. —
  scope exact à définir selon les documents (reçu de vente, facture, rapport journalier, rapport
  stock, rapport employé, rapport anomalies — voir tableau section 13 du cahier fonctionnel pour le
  contenu minimum attendu par type de document).

### B.7 Responsabilité par employé / shift — dépendance du centre d'anomalies

Les deux documents insistent sur l'ouverture/clôture de shift pour attribuer un écart à une
session précise, pas juste à une journée. C'est le chantier le plus structurant du P1 (nouveau
modèle `Shift` : ouverture déclarée par l'employé, fond de caisse initial, toutes les opérations du
shift rattachées, comptage à la fermeture). Je recommande de le faire **après** B.1-B.4 (plus petits,
plus vite en production), mais avant B.6 si le temps manque — c'est plus proche du cœur différenciant
du produit qu'un générateur de PDF.

---

## Chantier C — Modèle d'abonnement (billing) côté backend

Prérequis explicitement demandé par le fondateur avant le Super Admin : **de vraies données**, pas
des écrans vides. Pas d'intégration d'un vrai processeur de paiement pour l'instant (Stripe, Mobile
Money marchand, etc.) — juste le modèle de données et les statuts, gérés manuellement pour l'instant
côté Super Admin (chantier D) une fois qu'il existe.

- Nouveau modèle `Plan` (id, nom, prix, période — mensuel/annuel, actif).
- Nouveau modèle `Subscription` (business_id, plan_id, statut : `trial`/`active`/`expired`/
  `payment_failed`/`cancelled`, date de début, date de fin/renouvellement, date de conversion depuis
  l'essai si applicable).
- `Business` reste inchangé structurellement — la relation se fait via `Subscription.business_id`.
- Au `register-business`, crée automatiquement une `Subscription` en statut `trial` avec une durée
  d'essai par défaut (à définir — proposer 14 jours si rien n'est précisé côté fondateur, à
  confirmer dans "Points ouverts").
- Pas d'UI cliente pour ce chantier (le propriétaire d'une entreprise ne voit pas encore son
  abonnement dans Korise lui-même) — uniquement la donnée, consommée par le Super Admin (chantier D).
- Endpoint interne (protégé, réservé au Super Admin — voir chantier D pour le modèle d'auth) pour
  changer le statut d'un abonnement manuellement.

---

## Chantier D — Super Admin (nouvelle application web)

Référence complète : `documentation/KORISE Cahier des charges Super Admin MVP.pdf`. Nouvelle app
**séparée**, pas une section cachée dans `apps/web` — nouveau dossier `apps/admin/` (même stack que
`apps/web` : Next.js/TypeScript, déploiement Vercel séparé). Séparation stricte des comptes
(section 3 du PDF) : **jamais** le même système d'auth que les comptes entreprise — nouveau modèle
`SuperAdminUser` côté backend (ou un service/schéma d'auth entièrement distinct), avec ses propres
rôles (`owner`/`product_manager`/`support`/`developer`, section 16 du PDF).

### D.1 Portée du MVP — uniquement les modules P0 de leur section 5

Ne construis **que** : Overview/Dashboard, Entreprises (liste), Fiche entreprise (détail),
Analytics produit, Monitoring technique. **Ne construis pas** Support/diagnostic, Billing UI (le
modèle de données existe depuis le chantier C mais pas encore d'écran dédié), Administration Super
Admin (gestion des rôles), Cohortes avancées, Automatisations/IA — tous explicitement P1/P2 dans
leur propre document, donc après validation du P0.

### D.2 Instrumentation nécessaire côté backend avant tout écran

Le Super Admin ne peut rien afficher sans données à observer. Avant les écrans eux-mêmes :
- Nouvelle table d'événements plateforme (`PlatformEvent` ou similaire) : type d'événement
  (inscription, connexion, vente, sync démarrée/terminée/échouée, etc. — voir tableau section 20 du
  PDF), business_id, timestamp, métadonnées JSON libres. Alimentée en tâche de fond par les services
  existants (`register_business`, `login`, `push_batch`, etc.) — ajoute l'écriture d'un événement à
  chacun de ces points sans changer leur comportement actuel.
- Les KPI du dashboard (section 7.1 du PDF) se calculent par requête agrégée sur cette table +
  les tables métier existantes (`Business`, `User`, `Sale`, `Subscription`) — pas de duplication de
  données, calcul à la volée comme partout ailleurs dans ce projet.

### D.3 Écrans (voir sections 7 à 12 du PDF pour le détail exact de chaque module)

- **Overview** : KPI (entreprises, usage, structure, business SaaS depuis chantier C, technique) +
  widgets (funnel d'activation, alertes critiques, entreprises actives dans le temps, top
  fonctionnalités, comptes inactifs).
- **Entreprises** : liste filtrable/recherchable avec statut de santé calculé (`healthy`/`à
  surveiller`/`à risque` — règles configurables, commence simple : X jours sans activité = à
  surveiller, Y jours = à risque).
- **Fiche entreprise** : compte, structure, usage, fonctionnalités utilisées, technique
  (appareils/versions/sync), historique.
- **Analytics** : usage par fonctionnalité, funnel d'activation, rétention 7/30j simple,
  segmentation (période/plan/version/plateforme/actif-inactif).
- **Monitoring** : appareils offline, opérations en attente de sync, erreurs, versions obsolètes.

### D.4 Design

Même palette Korise (`#F85602` en accent d'action uniquement, pas de fond coloré — section 17 du
PDF est explicite là-dessus), mais **interface distincte** de l'app métier (orientée données/tableaux,
pas orientée saisie rapide) : réutilise `packages/shared/design-tokens.json` pour les couleurs de
base, mais construis des composants propres à `apps/admin` (tableaux filtrables, cartes KPI
compactes, graphiques) plutôt que de réutiliser les composants de `apps/web` pensés pour un tout
autre usage.

---

## Points ouverts propres à ce chantier (2026-09-23)

- Décision technique PDF (backend vs client) — voir B.6, à trancher/confirmer avant de coder.
- Durée d'essai par défaut pour `Subscription` (proposé 14 jours, à confirmer) — voir chantier C.
- Connexion par profil façon Chrome (B.5) : je recommande de ne pas l'attaquer sans validation
  explicite du fondateur, vu l'ampleur du changement de modèle de session — à soulever plutôt qu'à
  construire directement.

---

## ⚠️ Changement de périmètre pour ce chantier (2026-09-22)

Jusqu'ici la règle était stricte : tu ne touchais qu'à `apps/mobile/`, le reste (`backend/`,
`apps/web/`, `apps/desktop/`, `documentation/`, `packages/shared/`) restait au seul agent Claude
Code. **Pour ce chantier précis, le fondateur t'a explicitement demandé d'implémenter l'intégralité
de ce qui suit — backend, web, desktop ET mobile.** C'est une autorisation ponctuelle et documentée
ici, pas un changement permanent de règle : une fois ce chantier terminé, considère que le périmètre
historique (mobile uniquement) redevient la référence par défaut, sauf nouvelle instruction du
fondateur. `CLAUDE.md` (le fichier de l'autre agent) n'a pas été modifié en conséquence — ne t'en
étonne pas, c'est normal, il sera mis à jour séparément.

Document de référence produit pour tout ce chantier : **`documentation/CAHIER_DES_CHARGES.md`**
(nouveau, validé avec le fondateur le 2026-09-22). Lis-le en entier avant de commencer — ce fichier
ci-dessous n'en est que la déclinaison technique, chantier par chantier, fichier par fichier.
`documentation/MVP_SPEC.md` et `documentation/DESIGN_SYSTEM.md` restent valables pour tout ce que le
cahier des charges ne modifie pas explicitement (architecture événementielle, sync, écrans
existants) mais **le cahier des charges prime** sur l'identité et le périmètre fonctionnel en cas de
divergence.

## Table des matières de ce chantier

1. Rebrand visuel — BizFlow → Koness (tous les repos)
2. Backend — crédit client, canal cash/Mobile Money, clôture scindée, édition employé
3. Web (`apps/web`) — nouveaux écrans et flux
4. Desktop (`apps/desktop`) — volet dashboard léger
5. Mobile (`apps/mobile`) — recentrage sur la saisie
6. Ordre d'exécution recommandé et vérifications

Chaque chantier donne des noms de fichiers, de champs et de types précis — ce n'est pas une
suggestion de direction, c'est la spec à suivre. Si un détail non couvert ici se présente, tranche
dans l'esprit du §5 de `MVP_SPEC.md` (ultra simple, ultra efficace) et note ton choix dans "Points
ouverts" en bas de ce fichier.

---

## 1. Rebrand visuel — BizFlow → Koness

Source de vérité : `documentation/CAHIER_DES_CHARGES.md` §7. Assets sources bruts dans
`documentation/Stricte neccessaire charte graphique koness/` (ne jamais coder depuis ce dossier
directement — copie les fichiers vers les emplacements ci-dessous, une seule fois).

### 1.1 Assets de marque

Dans `packages/shared/brand/` :
- Copie `documentation/Stricte neccessaire charte graphique koness/Logo_primary.png` →
  `packages/shared/brand/koness-logo-full.png`
- Copie `documentation/Stricte neccessaire charte graphique koness/icon_app_model.png` →
  `packages/shared/brand/koness-icon.png` (déjà recadré carré arrondi, c'est la bonne source pour
  une icône d'app — pas `icon orange.png`, qui est la version plate/à bord perdu)
- Copie `documentation/Stricte neccessaire charte graphique koness/Icon_blanche.png` →
  `packages/shared/brand/koness-icon-white.png` (variante blanche pour fonds sombres, ex. splash
  screen mobile)
- **Supprime** les anciens `bizflow-logo-full.png`, `bizflow-icon.png` une fois toutes les
  références basculées (voir plus bas) — pas de fichiers morts.

### 1.2 `packages/shared/design-tokens.json`

Remplace le contenu du bloc `color` par exactement ceci (les autres clés — `brand.tagline`, `radius`,
`spacing`, `font.*`, `icon` — restent structurellement identiques, seules les valeurs de police
changent, voir §1.4) :

```json
"color": {
  "background": "#000000",
  "surface": "#FFFFFF",
  "text": "#1F2937",
  "textMuted": "#6B7280",
  "accent": "#F85602",
  "accentLight": "#FEBFA0",
  "primary": "#000000",
  "focus": "#2563EB",
  "success": "#16A34A",
  "warning": "#FDF770",
  "danger": "#DC2626",
  "border": "#E4E7EC"
}
```

Points d'attention :
- `primary` vaut maintenant la même valeur que `background` (`#000000`) — la charte ne fournit que
  orange + noir, `primary` (navigation/boutons secondaires) fusionne donc avec le noir. Ne supprime
  pas la clé `primary` du JSON pour autant : le code web/mobile la référence par son nom, la
  supprimer casserait des imports.
- `warning` passe au jaune `#FDF770` (au lieu d'un orange) **volontairement** : l'ancien warning
  était déjà un orange distinct de l'accent doré ; avec le nouvel accent lui-même orange
  (`#F85602`), garder un warning orange créerait une confusion visuelle. Le jaune vient des fichiers
  sources de la charte, ce n'est pas une improvisation.
- Sur `warning` (`#FDF770`, jaune clair), le texte doit être sombre (`text`/`background`) pour rester
  lisible — jamais de texte blanc dessus.
- `brand.name` (si ce champ existe dans le JSON) : "BizFlow" → "Koness".

### 1.3 `apps/web/`

- `scripts/sync-brand.mjs` : le tableau `FILES` et les noms de fichiers copiés vers `public/brand/`
  passent de `bizflow-logo-full.png`/`bizflow-icon.png` à `koness-logo-full.png`/`koness-icon.png`.
- `app/components/Logo.tsx` : les deux `src="/brand/bizflow-*.png"` → `/brand/koness-*.png`, et le
  texte `alt` ("BizFlow — ...") → "Koness — Votre activité, sous contrôle" (garde la tagline
  actuelle, voir note plus bas).
- `app/layout.tsx` : remplace les imports `next/font/google` `Manrope`/`Inter` par `Signika`/
  `Urbanist` (voir §1.4 pour les poids exacts). Renomme les variables CSS `--font-manrope` →
  `--font-signika`, `--font-inter` → `--font-urbanist`. `metadata.title`/`description` : "BizFlow" →
  "Koness" (garde le reste de la description telle quelle). `metadata.icons.icon` → nouveau chemin
  favicon.
- `app/globals.css` : toute référence à `var(--font-inter)`/`var(--font-manrope)` → `var(--font-urbanist)`/
  `var(--font-signika)`.
- `tailwind.config.js` : **aucun changement structurel nécessaire** — les clés (`background`,
  `accent`, etc.) restent les mêmes, seules leurs valeurs bougent via `design-tokens.json` (§1.2).
  Seul `fontFamily.heading`/`fontFamily.body` doit suivre le renommage des variables CSS ci-dessus.
- `app/login/page.tsx` : ne contient pas de texte "BizFlow" en dur (il passe déjà par `<Logo>`) — rien
  à faire côté texte. **Ne change pas la tagline** ("Votre activité, sous contrôle") : rien dans la
  nouvelle charte n'en propose une autre, elle reste valable telle quelle.
- Balayage final : `grep -rniI "bizflow" apps/web --include="*.{ts,tsx,css,json}"` et corrige tout ce
  qui reste (hors `node_modules`).

### 1.4 `apps/mobile/`

- Copie les 3 mêmes fichiers que §1.1 dans `apps/mobile/assets/brand/` (le mobile garde une copie
  locale physique, il ne lit pas `packages/shared/` au runtime pour les images — seul
  `design-tokens.json` est importé directement, voir plus bas).
- Remplace tous les `require('../../assets/brand/bizflow-logo-full.png')` et
  `require('../../assets/brand/bizflow-icon.png')` par les chemins `koness-*`. Fichiers concernés à
  ce jour : `App.tsx` (écran de démarrage), `src/screens/AuthScreen.tsx` (logo plein sur l'écran de
  connexion), et tout composant de navigation qui affiche le logo (voir chantier 5 — la nav mobile
  change de forme dans ce même chantier, fais les deux changements ensemble).
- `app.json` :
  - `"name": "BizFlow"` → `"Koness"`.
  - `"slug"` : tu peux le passer à `"koness"` si tu veux, c'est sans risque ici — EAS n'a jamais été
    configuré avec succès sur ce projet (bloqué faute de connexion), donc rien à recâbler.
  - **Ne touche pas `android.package` (`com.korah.bizflow`).** Un APK a déjà été construit et testé
    avec cet identifiant — le changer romprait toute mise à jour in-place d'une installation
    existante (Android traiterait ça comme une app différente). Le nom affiché change, l'identifiant
    technique reste.
  - `backgroundColor` (racine `android` et plugin `expo-splash-screen`) : `#0B0B0D` → `#000000`.
  - `icon`, `android.adaptiveIcon.foregroundImage`, plugin `expo-splash-screen.image` → nouveaux
    chemins `koness-icon.png` / `koness-icon-white.png` selon le fond (icône = orange sur fond
    transparent recommandé pour l'adaptive icon, splash = blanc sur fond noir).
- Polices — remplace Manrope/Inter par Signika/Urbanist :
  - `npx expo install @expo-google-fonts/signika @expo-google-fonts/urbanist` (garde ou retire les
    anciens packages `@expo-google-fonts/manrope`/`@expo-google-fonts/inter` une fois qu'aucun
    fichier n'y fait plus référence).
  - `App.tsx` : dans `useFonts({...})`, remplace les imports/clés `Manrope_800ExtraBold`,
    `Manrope_700Bold`, `Inter_400Regular`, `Inter_500Medium` par `Signika_700Bold`,
    `Urbanist_400Regular`, `Urbanist_500Medium` (Signika ne propose pas de graisse 800 sur Google
    Fonts — 700 est le maximum disponible, utilise-le pour titres ET KPI comme le veut le cahier des
    charges §7.3).
  - `src/theme/index.ts` : le mapping `FONT` (`heading`, `kpi`, `body`, `microLabel`) doit pointer
    vers les nouveaux noms exacts exportés par les packages `@expo-google-fonts/*` ci-dessus.
- `src/theme/tokens.ts` : **rien à faire** — il importe `packages/shared/design-tokens.json`
  directement, donc les nouvelles couleurs (§1.2) s'appliquent automatiquement dès que ce fichier est
  mis à jour.
- Balayage final : `grep -rniI "bizflow" apps/mobile/src apps/mobile/App.tsx apps/mobile/app.json`.

### 1.5 `apps/desktop/`

- `src-tauri/tauri.conf.json` : `productName` "BizFlow" → "Koness", `window.title` → "Koness". Tu
  peux aussi changer `identifier` (`com.korah.bizflow` → `com.korah.koness`) **sans risque** cette
  fois : contrairement au mobile, aucun build desktop n'a jamais abouti (pas de toolchain Rust
  disponible jusqu'ici), donc aucune installation existante à préserver.
- Régénère les icônes packagées : depuis `apps/desktop`, `npx tauri icon
  ../../packages/shared/brand/koness-icon.png` (remplace toute la série `icons/*.png`,
  `icons/icon.icns`, `icons/icon.ico` référencée dans `bundle.icon`).

### 1.6 Vérification chantier 1

- Web : `npm run typecheck` et `npm run build` dans `apps/web` doivent passer.
- Mobile : `npx tsc --noEmit` dans `apps/mobile` doit passer ; relance `npx expo export --platform
  android` pour confirmer que les nouvelles polices/images se bundlent sans erreur.
- Grep final repo entier (hors `node_modules`, `.git`) : `grep -rniI "bizflow" .` ne doit plus rien
  remonter, **sauf** dans les sections datées de ce fichier (`opencode.md`, historique "Traités"
  ci-dessous) qui restent un journal, pas du code — ne les réécris pas.

---

## 2. Backend — crédit client, canal cash/Mobile Money, clôture scindée, édition employé

Tout ce chantier suit le même style que le code existant (`backend/app/models/events.py`,
`backend/app/services/sync_service.py`) : idempotence par `client_uuid`, un événement = une écriture
en base + un `AuditLog`, jamais d'écriture séparée à synchroniser manuellement. **Ne réinvente pas un
autre style — copie exactement les patterns déjà en place dans ces fichiers.**

### 2.1 Nouveau modèle `Customer`

Nouveau fichier `backend/app/models/customer.py` :

```python
import uuid
from datetime import datetime, timezone
from sqlmodel import Field, SQLModel

class Customer(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    client_uuid: uuid.UUID = Field(index=True, unique=True)
    business_id: uuid.UUID = Field(foreign_key="business.id", index=True)
    full_name: str
    phone: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

Ajoute `from app.models.customer import Customer` dans `backend/app/models/__init__.py` (même
pattern que les autres modèles) — sinon Alembic ne le verra jamais à l'autogenerate.

### 2.2 Modification `MoneyMovement` (`backend/app/models/events.py`)

- Ajoute une valeur `credit_repayment` à `MoneyMovementType` (aux côtés de `sale`/`income`/
  `expense`/`withdrawal`).
- Nouvel enum `MoneyMovementChannel(str, Enum)` : `cash = "cash"`, `mobile_money = "mobile_money"`.
- Ajoute deux champs à `MoneyMovement` :
  - `channel: MoneyMovementChannel | None = None` — **nullable en base** volontairement : les lignes
    historiques déjà en production (Supabase) n'ont pas cette info, pas question de les backfiller
    en migration. Pour toute NOUVELLE écriture (dès ce chantier), ce champ doit être rempli par le
    service, jamais laissé `None` — ce n'est optionnel qu'au niveau de la colonne SQL, pas au niveau
    de la logique métier.
  - `customer_id: uuid.UUID | None = Field(default=None, foreign_key="customer.id")` — rempli
    uniquement pour `type == credit_repayment`.

### 2.3 Modification `Sale` (`backend/app/models/events.py`)

- Ajoute `customer_id: uuid.UUID | None = Field(default=None, foreign_key="customer.id")`.
- `payment_method` reste un `str` libre (pas d'enum au niveau DB, comme aujourd'hui) mais accepte
  désormais la valeur `"credit"` en plus de `"cash"`/`"mobile_money"` — validation côté schéma
  Pydantic uniquement (voir §2.5).

### 2.4 Modification `DailyClosing` (`backend/app/models/events.py`)

Ajoute trois champs nullable : `expected_momo: int | None = None`, `actual_momo: int | None = None`,
`difference_momo: int | None = None`. Les colonnes `expected_cash`/`actual_cash`/`difference`
existantes ne bougent pas de nom, mais représentent désormais **la seule composante cash** (pas
l'agrégat cash+MoMo comme avant ce chantier) — les lignes historiques restent valides telles quelles,
juste sans ventilation momo (`expected_momo`/`actual_momo` à `NULL` pour elles).

### 2.5 Schémas — `backend/app/schemas/sync.py`

- `SaleIn` : ajoute `customer_id: uuid.UUID | None = None`.
- `MoneyMovementIn` : ajoute `channel: MoneyMovementChannel` (**requis**, pas optionnel — contrairement
  à la colonne DB qui elle est nullable pour raison de migration, voir §2.2).
- `DailyClosingIn` : ajoute `actual_momo: int` (requis, aux côtés de `actual_cash` qui reste requis).
- Nouveaux schémas :

```python
class CustomerIn(BaseModel):
    client_uuid: uuid.UUID
    full_name: str
    phone: str | None = None

class CreditRepaymentIn(BaseModel):
    client_uuid: uuid.UUID
    customer_id: uuid.UUID
    amount: int
    channel: MoneyMovementChannel
    note: str | None = None
```

- `PushRequest` : ajoute `customers: list[CustomerIn] = []` et
  `credit_repayments: list[CreditRepaymentIn] = []`.
- `PushResponse` : ajoute `customers: list[PushResult] = []` et
  `credit_repayments: list[PushResult] = []`.
- `PullResponse` : ajoute `customers: list[dict]`. **Ne crée pas d'entrée `credit_repayments`
  séparée dans `PullResponse`** — un remboursement de crédit n'est qu'un `MoneyMovement` de type
  `credit_repayment` en base, il remonte donc déjà automatiquement via le `money_movements` existant
  du pull. Créer une deuxième entité pull dupliquerait la donnée pour rien.

### 2.6 Service — `backend/app/services/sync_service.py`

- `_record_sale` : ne crée le `MoneyMovement` dérivé **que si** `item.payment_method != "credit"`
  (le `StockMovement`, lui, se crée toujours — la marchandise sort du stock quel que soit le mode de
  paiement). Si `payment_method == "credit"` et `item.customer_id is None`, lève une exception (elle
  sera capturée par le `try/except` déjà présent dans `push_batch`, qui renverra `status: "rejected"`
  pour cet item — ne duplique pas cette gestion d'erreur). Quand un `MoneyMovement` est créé pour une
  vente cash/mobile_money, renseigne `channel = item.payment_method` (les valeurs correspondent 1:1).
- Nouveau fichier `backend/app/services/credit_service.py` :
  - `create_customer(session, business_id, user_id, item: CustomerIn) -> Customer` — idempotent sur
    `client_uuid` (même pattern `existing = session.exec(select(Customer).where(...)).first()` que
    partout ailleurs), écrit un `AuditLog` `"customer.created"`.
  - `list_customers(session, business_id) -> list[CustomerWithBalance]` — pour chaque client, solde
    = `SUM(Sale.total_amount WHERE payment_method='credit' AND customer_id=X) -
    SUM(MoneyMovement.amount WHERE type='credit_repayment' AND customer_id=X)`. Trié par
    `full_name`.
  - `get_customer_detail(session, business_id, customer_id)` — solde + historique complet
    (ventes à crédit + remboursements, triés par date).
  - `record_repayment(session, business_id, user_id, item: CreditRepaymentIn) -> PushResult` —
    idempotent sur `client_uuid`, crée un `MoneyMovement(type=credit_repayment, amount=item.amount,
    channel=item.channel, customer_id=item.customer_id, reason=item.note)`, `AuditLog`
    `"credit_repayment.created"`. **Ne bloque jamais** si le montant dépasse le solde dû — même
    philosophie que le stock qui peut aller négatif (`SYNC_DESIGN.md` §6) : on n'empêche jamais une
    saisie, on réconcilie après.
- `push_batch` : ajoute les deux boucles `customers`/`credit_repayments`, même style try/except que
  les quatre boucles existantes.
- `pull_batch` : ajoute la pagination de `Customer` via le helper générique `_paginate` déjà présent
  (il fonctionne pour n'importe quel modèle avec `business_id`/`created_at`/`id`, pas de code
  spécifique à écrire) — nouvelle clé de curseur `"customers"`.

### 2.7 Clôture — `backend/app/services/closing_service.py`

- Remplace/complète `compute_expected_cash` par une fonction qui renvoie les deux montants :
  `compute_expected_amounts(session, business_id, closing_date) -> tuple[int, int]` (cash, momo) —
  même agrégation qu'aujourd'hui (somme des `MoneyMovement` du jour, tous types confondus), mais
  groupée par `channel` au lieu d'un seul total. Les lignes historiques avec `channel = NULL`
  comptent comme `cash` par convention (`COALESCE(channel, 'cash')` côté requête).
- `_record_daily_closing` (`sync_service.py`) : calcule les deux montants attendus, stocke les 6
  champs (`expected_cash`, `actual_cash`, `difference`, `expected_momo`, `actual_momo`,
  `difference_momo`) — `actual_momo`/`actual_cash` viennent directement de `DailyClosingIn`.
- `GET /closing/expected-cash` (`backend/app/api/closing.py` + son schéma de réponse) : ajoute
  `expected_momo` à la réponse existante. Les totaux détaillés (`sales_total`, `income_total`,
  etc.) peuvent rester agrégés tous canaux confondus pour cette version — seule la ventilation
  cash/momo des DEUX montants attendus est requise, pas une ventilation fine de chaque sous-total.

### 2.8 Employé — édition/désactivation

- `backend/app/schemas/auth.py` : `UpdateEmployeeRequest(BaseModel)` — `can_view_purchase_prices:
  bool | None = None`, `can_view_owner_dashboard: bool | None = None`, `is_active: bool | None =
  None`. Jamais de champ `role` ni `pin` dans ce schéma.
- `backend/app/services/auth_service.py` : `update_employee(session, business_id, employee_id,
  request) -> User` — récupère l'employé scopé à `business_id` (404 si absent ou mauvaise
  entreprise), applique uniquement les champs fournis (`exclude_unset=True`), `AuditLog`
  `"employee.updated"`.
- `backend/app/api/auth.py` : `@router.patch("/employees/{employee_id}", response_model=UserOut)`,
  protégé par `require_owner`.

### 2.9 `TokenResponse` — nom de l'entreprise

Ajoute `business_name: str` à `TokenResponse` (`backend/app/schemas/auth.py`), rempli dans
`_token_for()` (`backend/app/services/auth_service.py`) depuis `business.name`. Nécessaire pour que
le reçu léger (chantiers 3 et 5) affiche le nom de la boutique sans appel réseau supplémentaire.

### 2.10 Nouvel endpoint — `backend/app/api/customers.py`

```python
router = APIRouter(prefix="/customers", tags=["customers"])

@router.post("", response_model=CustomerOut)
def create(...)  # tout utilisateur authentifié, pas owner-only — un employé crée un client au moment de la vente

@router.get("", response_model=list[CustomerOut])
def list_all(...)  # tout utilisateur authentifié voit la liste + solde — pas de restriction par permission ici, la visibilité du crédit fait partie de la responsabilisation employé voulue par le cahier des charges

@router.get("/{customer_id}", response_model=CustomerDetailOut)
def get_one(...)
```

N'oublie pas `app.include_router(customers_router)` dans `backend/app/main.py`.

### 2.11 Migrations et régénération du contrat

1. `cd backend && alembic revision --autogenerate -m "credit clients, canal argent, cloture cash momo, edition employe"`.
2. Vérifie que le fichier généré importe bien `sqlmodel` (déjà garanti par `script.py.mako`, mais
   vérifie quand même).
3. `alembic upgrade head` en local d'abord. Une fois les tests §2.12 verts, applique la même
   migration sur la base Supabase de production (même `DATABASE_URL` que celui déjà configuré dans
   `.env` — ne le recrée pas, il fonctionne déjà).
4. Régénère `packages/shared/openapi.json` depuis `backend/` :
   `python -c "import json; import app.models; from app.main import app as fastapi_app; json.dump(fastapi_app.openapi(), open('../packages/shared/openapi.json','w'), indent=2)"`.

### 2.12 Tests à ajouter (`backend/tests/`)

- Vente à crédit : ne crée pas de `MoneyMovement` immédiat, décrémente bien le stock, nécessite un
  `customer_id`.
- Remboursement : partiel puis total ramène le solde à 0 ; rejeu du même `client_uuid` = idempotent
  (`status: "duplicate"`, pas de doublon en base).
- Clôture : `expected_cash`/`expected_momo` corrects sur un jeu de mouvements mixtes
  cash/mobile_money/credit_repayment.
- Édition employé : seul le propriétaire peut appeler l'endpoint ; le rôle ne change jamais via ce
  endpoint même si on l'envoie dans le corps de la requête.

---

## 3. Web (`apps/web`) — nouveaux écrans et flux

Rappel de rôle (cahier des charges §6) : le web est **l'app de contrôle complète**, utilisable
depuis n'importe quel appareil. Tout ce qui suit y a sa place, rien n'est à alléger ici.

### 3.1 Nouvelle page `/credits` — Crédit clients

Nouveau fichier `apps/web/app/credits/page.tsx`, même style que `apps/web/app/equipe/page.tsx`
(cartes `kpi-card`, `field-input`, etc.) :
- Liste des clients avec leur solde dû (`GET /customers`), triée par solde décroissant.
- Formulaire "Enregistrer un remboursement" : sélection du client (liste déroulante ou recherche
  texte simple), montant, canal (Cash/Mobile Money — même composant segmenté que `/argent`), motif
  optionnel.
- Détail client au clic : historique des ventes à crédit + remboursements (`GET
  /customers/{id}`).
- Ajoute le lien dans `apps/web/app/components/Sidebar.tsx` → tableau `LINKS` (pas
  `OWNER_LINKS` : la visibilité du crédit est volontairement ouverte à tout employé, voir §2.10).
  Icône Lucide suggérée : `HandCoins` ou `Wallet` (vérifie qu'elle n'est pas déjà utilisée ailleurs
  pour éviter toute confusion visuelle avec Argent).

### 3.2 `/sale` — vente à crédit

- `apps/web/lib/config.ts` : `PAYMENT_METHODS` passe de `['cash', 'mobile_money']` à `['cash',
  'mobile_money', 'credit']`.
- `apps/web/app/sale/page.tsx` : le sélecteur de paiement affiche désormais 3 options ("Cash",
  "Mobile Money", "Crédit"). Quand "Crédit" est choisi, affiche un champ de sélection/création de
  client (recherche dans les clients déjà connus localement, ou saisie d'un nom + téléphone optionnel
  pour en créer un nouveau à la volée) **avant** d'activer le bouton d'encaissement — un
  `customer_id` est obligatoire pour valider une vente à crédit.
- Après une vente réussie (tous modes de paiement confondus) : affiche le reçu léger (§3.3).

### 3.3 Reçu léger — composant partagé

Nouveau fichier `apps/web/app/components/Receipt.tsx` (ou fonction utilitaire dans `lib/format.ts`
si plus simple) qui construit un texte du type :

```
{business_name}
—
{quantité} × {nom du produit} @ {prix unitaire} FCFA
Total : {total} FCFA
Paiement : {Cash | Mobile Money | Crédit — nom du client}
{date} à {heure}
```

`business_name` vient désormais de la session (`Session.business_name`, voir §2.9 — met à jour
`apps/web/lib/session.ts` pour inclure ce champ). Affiche ce texte après une vente avec un bouton
"Partager" (`navigator.share` si disponible) et un repli "Copier" (`navigator.clipboard.writeText`)
si `navigator.share` n'existe pas (Safari desktop, par exemple).

### 3.4 `/argent` — canal de paiement

`apps/web/app/argent/page.tsx` : ajoute un sélecteur "Cash / Mobile Money" (même composant segmenté
que le type income/expense/withdrawal) — champ requis, envoyé comme `channel` dans le mouvement
poussé. `apps/web/lib/repo.ts` (`addMoneyMovement`) doit accepter et transmettre ce nouveau
paramètre.

### 3.5 `/closing` — clôture guidée en 5 étapes

Restructure `apps/web/app/closing/page.tsx` en parcours à étapes plutôt qu'un formulaire unique.
Garde un état `step: 1 | 2 | 3 | 4 | 5` avec boutons Suivant/Précédent :

1. **Caisse espèces** : affiche `expected_cash` (nouveau champ scindé, §2.7), champ de saisie du
   comptage réel.
2. **Mobile Money** : affiche `expected_momo`, champ de saisie du solde réel constaté.
3. **Stock à vérifier** : liste des produits sous seuil (déjà calculable côté client depuis les
   produits chargés) — simple confirmation "j'ai vérifié", pas de saisie de quantité ici (le
   comptage physique du stock reste hors scope, voir cahier des charges §5.3).
4. **Dépenses du jour** : rappel des mouvements `expense`/`withdrawal` du jour (déjà en local via
   `getMoneyMovementsToday`), simple confirmation visuelle.
5. **Bilan** : récapitulatif des deux écarts (cash et momo) mis en évidence comme aujourd'hui
   (`badge-success`/`badge-primary`/`badge-danger` selon le signe), motif optionnel, bouton "Valider
   la clôture" qui pousse `daily_closings: [{ client_uuid, closing_date, actual_cash, actual_momo,
   note? }]`.

Garde l'historique des clôtures sous le parcours, comme aujourd'hui, mais affiche désormais les deux
écarts (cash/momo) par ligne au lieu d'un seul.

### 3.6 `/equipe` — édition et désactivation

Sur chaque carte employé (hors propriétaire), ajoute deux actions :
- "Modifier les permissions" → réouvre les deux cases à cocher (prix d'achat / dashboard patron)
  pré-remplies, bouton "Enregistrer" → `PATCH /auth/employees/{id}`.
- "Désactiver" → confirmation, puis `PATCH /auth/employees/{id}` avec `{ is_active: false }`.
  L'employé désactivé disparaît de la liste par défaut (le backend ne renvoie que les comptes actifs,
  voir `list_users` existant — aucun changement backend nécessaire ici au-delà de §2.8).

### 3.7 Stockage local (`apps/web/lib/db.ts`, `repo.ts`, `api.ts`)

- Ajoute deux tables IndexedDB (ou équivalent déjà utilisé) : `customers`, et étends le type
  `OutboxKind` pour inclure `'customer'` et `'credit_repayment'` — même pattern exact que les quatre
  types existants (`sale`/`money`/`stock`/`closing`).
- `lib/api.ts` : ajoute les fonctions `createCustomer`, `listCustomers`, `getCustomerDetail`,
  `recordRepayment`, en suivant le style des fonctions existantes (`createEmployee`,
  `listEmployees`).
- `lib/sync.ts` : étends `pushOutbox`/`doPull` pour inclure les deux nouveaux tableaux du protocole
  (`customers`, `credit_repayments` au push ; `customers` au pull) — même boucle générique que les
  quatre entités existantes.

### 3.8 Vérification chantier 3

`npm run typecheck` et `npm run build` dans `apps/web` doivent passer avant de considérer ce
chantier terminé.

---

## 4. Desktop (`apps/desktop`) — volet dashboard léger

Le desktop encapsule le **même** export statique que le web (voir `CLAUDE.md`/cahier des charges
§6) — ce n'est pas un code séparé à maintenir, c'est une détection d'environnement dans le code web
partagé.

### 4.1 Détection de l'environnement Tauri

Nouveau fichier `apps/web/lib/platform.ts` :

```ts
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window;
}
```

(Les deux globales existent selon la version de Tauri packagée — vérifie laquelle est réellement
injectée une fois `apps/desktop` compilé sur un poste avec la toolchain Rust, et simplifie si un
seul des deux suffit — mais garde les deux tant que ce n'est pas vérifié en conditions réelles.)

### 4.2 Page d'accueil (`apps/web/app/page.tsx`)

Quand `isTauri()` est vrai, affiche en tout premier un bandeau compact "aperçu rapide" : 3-4 chiffres
clés en gros (ventes du jour, caisse attendue, nombre d'alertes stock) — **avant** le reste du
contenu de la page, qui continue d'exister tel quel en dessous (rien à supprimer). Sur le web
classique (navigateur, hors Tauri), ce bandeau ne s'affiche pas, la page commence directement par le
contenu actuel.

C'est la seule différence entre web et desktop — ne duplique pas la page, ne crée pas de route
séparée : un seul fichier, une seule condition d'affichage.

### 4.3 Vérification chantier 4

Ce chantier ne peut être vérifié visuellement qu'une fois `apps/desktop` compilé avec succès (toolchain
Rust requise, jamais disponible jusqu'ici dans cet environnement — voir historique en bas de ce
fichier). Vérifie au minimum que `apps/web` continue de builder et typechecker normalement avec ce
changement (le bandeau ne doit jamais apparaître en dehors de Tauri).

---

## 5. Mobile (`apps/mobile`) — recentrage sur la saisie

**Ceci annule une partie du travail fait lors d'une session précédente** (alignement du mobile sur
les 7 sections du web avec un menu latéral). Ce n'était pas une erreur à l'époque — c'était avant que
le cahier des charges ne tranche explicitement les rôles par plateforme. Le rôle mobile est
maintenant : **app de vente/saisie, volontairement minimale** (cahier des charges §6), pas une copie
du web.

### 5.1 Écrans à retirer

Supprime `src/screens/TodayScreen.tsx`, `src/screens/ClosingScreen.tsx`,
`src/screens/TeamScreen.tsx`, `src/screens/JournalScreen.tsx` et leur intégration dans la navigation.
Ces quatre écrans (dashboard, clôture, équipe, journal) relèvent du rôle "contrôle", qui est
maintenant exclusivement web/desktop (chantier 3).

### 5.2 Navigation — retour à une barre d'onglets simple

Retire `src/components/Navigation.tsx` (le menu latéral/drawer construit pour la parité avec le web)
et la logique associée dans `App.tsx`. Reviens à une barre d'onglets en bas d'écran avec 3 onglets :
**Vendre, Argent, Stock** (retire l'onglet "Jour" — le dashboard n'a plus sa place ici). Garde un
bandeau supérieur minimal : logo Koness + statut de synchronisation + déconnexion, sans bouton menu
(plus de drawer à ouvrir).

### 5.3 `SaleScreen.tsx` — vente à crédit

- Ajoute "Crédit" comme troisième option du `Segmented` paiement (aux côtés de Cash/Mobile Money).
- Quand "Crédit" est sélectionné : affiche un champ de recherche simple contre les clients déjà
  synchronisés localement (table SQLite `customers`, `WHERE full_name LIKE '%...%'`), liste
  filtrée en dessous à mesure de la saisie, tap pour sélectionner — ou continue de taper un nom qui
  ne matche rien pour créer un nouveau client (nom + téléphone optionnel).
- `apps/mobile/src/config.ts` : `PAYMENT_METHODS` → ajoute `'credit'`.
- Après une vente : affiche le reçu léger (même contenu texte qu'au §3.3) avec un bouton "Partager"
  utilisant l'API `Share` native de React Native (`import { Share } from 'react-native'; Share.share({
  message: texte })`) — **pas** `expo-sharing`, pour ne pas ajouter de dépendance/poids inutile alors
  que `Share` core suffit largement ici.

### 5.4 `MoneyScreen.tsx` — canal et remboursement

- Ajoute un sélecteur Cash/Mobile Money (même composant `Segmented`) à côté du type de mouvement
  existant — requis, transmis comme `channel`.
- Ajoute une section "Rembourser un crédit" (pas un nouvel écran, une carte en plus sur cet écran) :
  recherche du client (même mécanisme qu'au §5.3), montant, canal, motif optionnel, bouton
  "Enregistrer le remboursement".

### 5.5 Stockage local (`src/db/repo.ts`)

- Nouvelle table SQLite `customers` (mêmes colonnes que le modèle backend §2.1, plus les colonnes
  de synchro habituelles `client_uuid`/`server_id`).
- Étends l'union `OutboxKind` pour inclure `'customer'` et `'credit_repayment'`.
- Étends `applyPullEvents` pour upsert les clients reçus du serveur (nécessaire pour qu'un client créé
  sur un autre appareil soit trouvable localement).

### 5.6 Ce qui ne bouge pas

`src/theme/tokens.ts` importe `packages/shared/design-tokens.json` directement — les nouvelles
couleurs (chantier 1) s'appliquent sans rien faire de plus ici. `src/api/*`, `src/auth/session.ts`
suivent simplement les nouveaux champs de schéma (§2.5, §2.9) comme pour n'importe quelle évolution de
contrat déjà vécue sur ce projet.

### 5.7 Vérification chantier 5

- `npx tsc --noEmit` dans `apps/mobile`.
- `npx expo export --platform android` doit toujours réussir.
- Reconstruis l'APK release une fois ce chantier terminé
  (`cd android && ./gradlew assembleRelease`, toolchain Android déjà installée sur ce poste) — les
  réglages de réduction de taille déjà commités (`app.json` → plugin `expo-build-properties`,
  2 architectures, R8, compression) s'appliquent automatiquement, rien à reconfigurer.

---

## 6. Ordre d'exécution recommandé

1. **Backend (chantier 2) en premier** — tout le reste dépend du contrat API. Termine, teste,
   régénère `openapi.json` avant de commencer le reste.
2. **Rebrand (chantier 1)** — indépendant du reste, peut se faire en parallèle du backend si tu
   préfères, ou juste après. Aucune dépendance technique avec les chantiers 2-5.
3. **Web (chantier 3)** — dépend du backend terminé (chantier 2).
4. **Desktop (chantier 4)** — petit, dépend du web (chantier 3) puisque c'est le même code.
5. **Mobile (chantier 5)** — dépend du backend terminé (chantier 2), indépendant du web.

À chaque chantier terminé, lance les vérifications listées à la fin de sa section avant de passer au
suivant — ne laisse jamais un chantier "presque fini" pour enchaîner sur le suivant, ce projet a déjà
payé le prix de fonctionnalités jamais vérifiées bout en bout (voir historique ci-dessous).

---

## Points ouverts (à compléter au fil de l'eau)

Utilise cette section pour noter toute question bloquante, tout écart par rapport à cette spec, ou
toute décision que tu as dû prendre faute de précision ici — avec la date, pour que ce soit traçable.

### Historique — état au 2026-09-18, avant ce chantier

Les 7 écrans MVP (Dashboard/Vente/Argent/Clôture/Stock/Équipe/Journal) étaient construits web +
mobile, hors édition/désactivation employé (§2.8 de ce chantier la couvre enfin) et refresh token
(toujours non bloquant, inchangé). Le desktop n'avait jamais été compilé (pas de toolchain Rust
disponible à l'époque) — **si tu as maintenant accès à une toolchain Rust sur ce poste, c'est
l'occasion de vérifier `apps/desktop` pour de bon**, personne ne l'a jamais fait. Aucun commit git
n'existait sur le projet à cette date (corrigé depuis — le repo est maintenant sous git avec un
historique de commits réguliers, vérifie `git log` pour te faire une idée de ce qui a été fait entre
temps avant de commencer).

La note technique de l'époque sur un souci Playwright/Chromium empêchant toute vérification visuelle
du web s'est révélée être un faux diagnostic — le vrai problème était un bug de code réel (comparaison
de route cassée par `trailingSlash: true`), trouvé et corrigé début de session suivante. Retiens-en
ceci : si un outil de capture semble montrer un écran vide alors que build/typecheck passent, ne
conclus pas trop vite à un problème d'environnement — vérifie d'abord le code, spécialement tout ce
qui touche au routing.

### Traités avant ce chantier (résumé, détail perdu volontairement — voir `git log` pour l'historique complet)

Auth réelle (PIN + business_code), sync bout-en-bout vérifié par test d'intégration, permissions
`can_view_purchase_prices`/`can_view_owner_dashboard` consommées côté mobile, `GET /auth/employees`
exposé, écran Argent ajouté sur web, sidebar rétractable + code entreprise copiable sur web,
déploiement web (Vercel) et backend (Vercel + Supabase) fonctionnels en production, mobile aligné
puis réaligné sur les rôles différenciés (ce chantier).
