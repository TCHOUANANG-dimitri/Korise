# Korise — Design System (référence d'implémentation)

> Digitalisation du document `BizFlow_Identite_Visuelle_Design_System.pdf` fourni par le fondateur,
> avec les décisions d'implémentation nécessaires pour que le web (Claude Code) et le mobile
> (OpenCode) produisent des interfaces identiques dans l'esprit, sans avoir à se resynchroniser à
> chaque écran. **Contraignant pour les deux agents.** Le PDF original et le logo source restent
> dans `documentation/` comme référence visuelle ultime en cas de doute.

## Règle absolue

**Zéro emoji dans l'app, nulle part.** Toute icône est un pictogramme SVG de la bibliothèque
retenue (voir §5). Un emoji dans un commit sera considéré comme un défaut à corriger, pas un détail.

## 0. Marque

- Nom : **Korise**. Tagline principale : *« Votre activité, sous contrôle »*.
- Taglines secondaires (usages ponctuels, écrans vides, onboarding) : *« Enregistrer · Suivre ·
  Décider »* / *« Plus de visibilité. Moins de pertes. »*
- Promesse produit : voir ce qui s'est passé, comprendre les écarts, agir vite.
- Ton : direct, rassurant, jamais technique pour faire technique. Vocabulaire concret : **Vente,
  Cash, Stock, Écart** — pas de jargon comptable.
- Quatre gestes que chaque écran doit renforcer : **Capturer · Suivre · Vérifier · Décider.**

## 1. Logo — assets

Fichiers sources dans `packages/shared/brand/` (les deux agents utilisent ces fichiers, jamais une
resauvegarde personnelle du PNG du dossier `documentation/`) :

- `korise-logo-full.png` — lockup complet (icône + mot Korise + tagline), fond noir. Pour écrans de
  connexion, splash screen, à-propos.
- `korise-icon.png` — icône seule, recadrée carrée. Pour
  favicon, icône d'app, petits formats, barre de navigation.

Règles d'usage (reprises du PDF, ne pas y déroger) :
- Toujours sur fond noir, blanc, ou indigo profond (`#1737A6`) — jamais sur un fond de couleur
  aléatoire ou une image chargée.
- Garder une zone de respiration autour du logo (au moins un espacement `24px`/`32px`, voir §3).
- Ne jamais étirer, biseauter, ajouter une ombre forte, ou recolorer le dégradé or.
- Le PNG fourni est une image raster (pas de vecteur source disponible). Si un jour un export SVG
  vectoriel arrive du fondateur, il remplace ces fichiers sans changer les noms — pas de refonte de
  code nécessaire côté web/mobile.

## 2. Couleurs

Tokens exacts dans `packages/shared/design-tokens.json` — **importer ce fichier, ne jamais
retranscrire les hex à la main** dans le code (source unique, évite toute dérive entre web et
mobile).

| Token | Hex | Usage |
|---|---|---|
| `background` | `#0B0B0D` | Fond noir premium (écrans sombres, sidebar, headers) |
| `surface` | `#FFFFFF` | Surfaces claires, cartes, fond principal des écrans de gestion |
| `text` | `#1F2937` | Texte principal sur fond clair |
| `textMuted` | `#6B7280` | Texte secondaire, labels discrets |
| `accent` | `#D4A017` | Or — action importante, validation, réconciliation. **Pas de décoration.** |
| `accentLight` | `#F5C95A` | Or clair — accent lumineux, hover/état actif sur fond sombre |
| `primary` | `#1737A6` | Indigo — navigation, boutons primaires sur fond clair |
| `focus` | `#2563EB` | Bleu électrique — liens, anneaux de focus clavier |
| `success` | `#16A34A` | Statut positif (réconcilié, synchronisé) |
| `warning` | `#D97706` | Statut à vérifier / alerte stock — **volontairement distinct de `accent`** pour ne pas confondre "action dorée" et "avertissement" |
| `danger` | `#DC2626` | Écart, erreur, action destructive |
| `border` | `#E4E7EC` | Bordures 1px sur surfaces claires |

Règle du PDF à respecter strictement : **l'or (`accent`) guide une action, il ne décore jamais.**
Si un écran a besoin de plus d'un élément doré visible en même temps hors bouton principal, c'est
probablement un signe que la hiérarchie de l'écran est à revoir.

Note d'implémentation : les couleurs `success`/`warning`/`danger` ne figuraient pas en hex précis
dans le PDF fourni (seuls des blocs de couleur). Les valeurs ci-dessus sont un choix assumé,
cohérent avec la palette et les standards d'accessibilité (contraste suffisant sur fond blanc et
noir). À remplacer uniquement si le fondateur fournit des valeurs exactes — ne pas les redéfinir au
cas par cas dans chaque app.

## 3. Typographie, espacement, rayons, bordures

**Substitution assumée** : le PDF recommande Aptos (police propriétaire Microsoft, peu praticable
en cross-platform web + mobile) avec Manrope/Inter comme alternatives déjà citées. Décision : on
standardise uniquement sur **Manrope + Inter** (Google Fonts, gratuites, disponibles nativement sur
web comme sur React Native) — jamais Aptos, pour que web et mobile rendent exactement pareil.

| Rôle | Police | Graisse |
|---|---|---|
| Titres | Manrope | ExtraBold (800) |
| Chiffres KPI | Manrope | Bold (700) |
| Corps de texte | Inter | Regular (400) |
| Micro-labels | Inter | Medium (500), majuscules, `letter-spacing` léger |

- Espacement : échelle stricte **4 / 8 / 12 / 16 / 24 / 32 px** — pas de valeur en dehors de cette
  échelle.
- Rayons : **8px** champs de formulaire, **12px** cartes, **16px** blocs/conteneurs.
- Bordures : **1px**, couleur `border` (`#E4E7EC`).
- Ombres : très légères — la profondeur vient des surfaces (blanc sur noir, cartes sur fond gris
  très clair), pas d'ombres portées marquées.

## 4. Composants essentiels

- **Boutons** : trois variantes seulement.
  - *Principale* : fond noir (`background`), texte blanc — action stable/par défaut.
  - *Accent* : fond `accent` (or), texte noir — validation, action importante (ex. valider une
    clôture). Une seule action accent visible par écran, jamais plusieurs en même temps.
  - *Secondaire* : fond blanc, bordure `border`, texte `text` — action secondaire sur surface claire.
- **Champs de formulaire** : rayon `field` (8px), bordure `border`, label en micro-label au-dessus
  (jamais de placeholder-only, l'utilisateur doit toujours voir ce qu'il remplit).
- **Badges de statut** (texte + couleur, jamais la couleur seule — accessibilité) :
  - `ENREGISTRÉ` → `primary` (indigo)
  - `À VÉRIFIER` → `warning`
  - `ÉCART` → `danger`
  - `RÉCONCILIÉ` → `success`
- **Carte KPI** : un micro-label discret (ex. "VENTES DU JOUR"), un grand chiffre en `kpi` en
  dessous, éventuellement une variation (`↑ 8,4% vs hier`) en `textMuted` ou `success`/`danger`
  selon le sens. Une carte = une idée. Ne jamais empiler plus de 4-6 KPI sur un même écran.
- **Ligne de réconciliation** : libellé à gauche (`textMuted`), montant à droite en gras ; la ligne
  "Écart" est mise en évidence (`danger` si négatif, `success` si nul).

## 5. Icônes

- Bibliothèque retenue pour les deux plateformes : **Lucide** (`lucide-react` pour le web/Next.js,
  `lucide-react-native` pour React Native). Style outline/géométrique, license MIT, correspond
  exactement à la spec du PDF ("outline/géométrique, 20-24px"). **Ne pas mélanger avec une autre
  bibliothèque d'icônes** — un seul jeu visuel sur toute l'app, sur les deux plateformes.
- Taille : 20-24px selon le contexte (20px en liste dense, 24px pour une action principale).
- **Aucun emoji, jamais**, y compris dans les messages d'erreur, les notifications, les états vides.
  Un état vide ou une confirmation utilise une icône Lucide (ex. `check-circle` pour succès,
  `alert-triangle` pour alerte stock, `package` pour stock, `banknote`/`wallet` pour cash, `users`
  pour équipe, `clipboard-list` pour le journal).

## 6. Écrans du MVP (mapping plateforme)

Le PDF liste 6 écrans. Répartition retenue avec le fondateur : Claude Code construit le web
(Next.js) + desktop (Tauri, même code) ; OpenCode construit le mobile (React Native), centré sur la
saisie rapide employé.

| Écran | Contenu (PDF) | Plateforme principale |
|---|---|---|
| 01 · Dashboard propriétaire | Ventes, dépenses, cash attendu/réel, écart, alertes stock, activité employés | **Web/desktop** (Claude Code) — `GET /dashboard/daily` |
| 02 · Nouvelle transaction | Produit/service, quantité, moyen de paiement, confirmation rapide | **Mobile** (OpenCode), aussi accessible en secondaire sur web — `POST /sync/push` |
| 03 · Réconciliation fin de journée | Attendu vs réel, différence, motif, validation | **Web/desktop** en priorité (patron), mobile en secondaire — `GET /closing/expected-cash` + `/sync/push` |
| 04 · Stock | Entrées, sorties, ajustements, seuil minimum, alertes | **Web/desktop** (Claude Code) — `/products`, `/sync/push` (stock_movements) |
| 05 · Équipe | Employés, rôles, permissions, actions tracées | **Web/desktop** (Claude Code) — `/auth/employees` |
| 06 · Journal | Qui a fait quoi, quand, type d'opération | **Web/desktop** (Claude Code) — endpoint pas encore construit côté backend, à venir |

Priorité UX du PDF, à ne jamais perdre de vue : **l'employé saisit vite, le propriétaire comprend
vite.** Une vente ne s'entre qu'une fois — jamais de double saisie (voir
`documentation/SYNC_DESIGN.md`).

## 7. Do / Don't (du PDF, à respecter tel quel)

| Faire | Ne pas faire |
|---|---|
| Montrer l'essentiel en premier | Afficher 20 indicateurs au même niveau |
| Utiliser l'or pour guider une action | Mettre de l'or partout |
| Mots concrets : Vente, Cash, Stock, Écart | Jargon comptable ou technique inutile |
| Confirmer clairement les actions sensibles | Masquer une modification importante |
| Associer chaque action importante à un utilisateur et une date | Laisser une opération sans trace |
