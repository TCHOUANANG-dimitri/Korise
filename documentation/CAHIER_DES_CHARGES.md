# Korise (Korah Business Manager) — Cahier des charges

> **Note (2026-09-23)** : le produit a été renommé **KORISE**. Pour le nom et le périmètre
> fonctionnel, ce document est désormais **partiellement remplacé** par les deux nouveaux PDF dans
> `documentation/` (`KORISE Cahier des fonctionnalites Web Mobile Desktop v0_1.pdf` et
> `KORISE Cahier des charges Super Admin MVP.pdf`) — même logique que ce fichier vis-à-vis de
> `MVP_SPEC.md`. Les sections ci-dessous restent valables pour l'architecture et les patterns
> d'implémentation qui n'ont pas changé.

> Ce document remplace et complète `MVP_SPEC.md` et `DESIGN_SYSTEM.md` comme référence produit à
> jour. Il documente le rebrand **BizFlow → Koness → Korise**, l'élargissement fonctionnel validé
> après analyse du socle marché, et la répartition des rôles entre les trois plateformes. Validé avec
> le fondateur le 2026-09-22. Les deux anciens documents restent en place pour l'historique
> d'implémentation déjà livrée (architecture événementielle, sync, écrans existants) — ce fichier
> prime en cas de divergence sur l'identité et le périmètre fonctionnel (sauf sur le nom et le
> périmètre, voir note ci-dessus).

## 1. Identité

- **Nom du produit : Korise.** « Korah Business Manager » reste le sous-titre/descriptif sous le
  logo (Korah = le studio/projet parent, Korise = la marque produit).
- **Promesse produit** (reformulée à partir du brief fondateur) : *Korise aide le commerçant à
  savoir ce qui se passe dans son commerce, à éviter les pertes et à garder le contrôle, sans avoir
  à tout surveiller lui-même.*
- **Quatre gestes que chaque écran doit renforcer** (inchangé dans l'esprit, hérité de BizFlow) :
  **Capturer · Suivre · Vérifier · Décider.**
- **Ton** : direct, rassurant, jamais technique pour faire technique. Vocabulaire concret : Vente,
  Cash, Stock, Écart, Crédit — pas de jargon comptable.

## 2. Cible (ICP)

Propriétaire/gérant de petit commerce physique au Cameroun, zones urbaines/périurbaines,
généralement 2-10 employés, volume de transactions quotidien élevé, gère simultanément
ventes/cash/Mobile Money/stock. **Souvent absent du lieu de vente** — doit déléguer sans perdre le
contrôle.

Secteurs cibles : mini-market, quincaillerie, boutique de vêtements/chaussures, boutique
téléphones/PC/accessoires, bar/snack/restaurant/fast-food, salon de coiffure/beauté, parfumerie,
garage auto.

Cœur du besoin : répondre chaque jour, rapidement, à quatre questions — *Qu'est-ce qui s'est passé
aujourd'hui ? Combien ai-je réellement vendu ? Où devrait être mon argent et mon stock ? Y a-t-il un
écart à expliquer ?* Ce n'est pas un problème de comptabilité ni d'inventaire pris isolément : c'est
un problème de **contrôle quotidien**.

Déclencheur d'achat : le problème devient coûteux ou fréquent (argent manquant, stock disparu,
dépenses inexpliquées, croissance de l'équipe ou du nombre de points de vente, absence croissante du
propriétaire).

## 3. Thèse produit — deux couches

**Couche 1 — Gestion** (le socle, nécessaire mais pas différenciant — le marché entier le fait) :
Vendre → Encaisser → Déduire le stock → Gérer les crédits → Enregistrer les dépenses → Suivre les
employés → Produire les rapports.

**Couche 2 — Contrôle** (la piste de différenciation) :
Calculer ce qui devrait être là → comparer au réel → détecter les écarts → identifier les opérations
concernées → attribuer les responsabilités → faire valider/corriger → produire le bilan.

Cette version du cahier des charges **construit le socle manquant et une première brique de la
couche Contrôle** (clôture guidée). Le reste de la couche Contrôle (responsabilité par shift, centre
d'anomalies, assistant propriétaire) est documenté en §8 comme direction future validée, pas encore
scopée pour construction.

## 4. Analyse concurrentielle (résumé)

Recherche menée le 2026-09-22 sur les acteurs du même segment (Afrique de l'Ouest/Centrale, petit
commerce, hors-ligne).

| Acteur | Couverture du socle | Différenciation observée |
|---|---|---|
| **Wé** (Cameroun, direct) | Vente 2 taps + reçu, stock + profit par article, clôture (revenu/dépense/profit), **crédit client avec suivi de solde + IOU**, **visibilité par vendeur (vendu/collecté/crédité) + commission**. Hors-ligne, FR/EN, Mobile Money ready. | Aucune — reste au niveau du socle. |
| **Bumpa** (Nigeria, leader régional) | Stock, analytics, facturation/reçus, gestion de commandes, création de site vitrine. | Oriented e-commerce/vitrine, pas contrôle. |
| **TrackaBiz / Tracepos / Vendloop / MyTreda** (Nigeria) | Hors-ligne, crédit client + rappel WhatsApp (MyTreda), multi-canal stock. | Aucune différenciation "contrôle/anomalies" observée. |
| **Loyverse / Square** (référence internationale) | Socle complet + rôles d'accès granulaires (app de vente vs back-office). | Rapports d'écarts existent mais restent du reporting consultable, pas une détection proactive poussée vers le patron. |

**Constat clé** : sur le socle pur, Korise était **en retard** sur Wé (pas de crédit client, pas de
reçu). Sur la couche Contrôle (rapprochement automatique, détection d'anomalies), **aucun acteur
régional ne l'expose comme fonctionnalité vitrine** — c'est une vraie fenêtre de différenciation,
pas une réinvention de quelque chose de déjà commoditisé sur ce segment.

Sources : [Wé](https://wegrows.tech/) · [TrackaBiz](https://trackabiz.ng/blog/best-pos-software-nigeria) · [Tracepos](https://www.tracepos.net/) · [Vendloop](https://vendloop.com/) · [MyTreda](https://mytreda.com/blog/best-inventory-management-software-nigeria) · [Bumpa](https://www.getbumpa.com/) · [Loyverse Back Office](https://help.loyverse.com/help/how-manage-access-rights-employees) · [Square Dashboard](https://squareup.com/us/en/the-bottom-line/inside-square/updated-square-pos-and-square-dashboard-app)

## 5. Périmètre fonctionnel

### 5.1 Déjà construit (inchangé, voir `MVP_SPEC.md` §5 pour le détail)

Vente rapide événementielle, argent IN/OUT, gestion de stock (entrées/ajustements/seuils),
employés & permissions (création + rôles, sans édition/désactivation), journal d'audit, dashboard
patron, clôture de caisse (attendu vs réel, agrégé), mode hors-ligne, synchronisation multi-appareils.

### 5.2 Ajouts validés pour cette version

| # | Fonctionnalité | Ce qu'elle doit faire | Pourquoi |
|---|---|---|---|
| 1 | **Crédit client** | Nouvel objet *Client* (nom, téléphone optionnel). Vente marquée « à crédit » au lieu d'encaissée : ne compte pas dans la caisse tant que non remboursée. Remboursement partiel ou total, avec solde par client à tout moment. | Combler un manque face au socle marché (Wé le fait déjà) ; c'est aussi la matière première d'un futur « qui me doit combien ». |
| 2 | **Séparation cash / Mobile Money à la clôture** | La caisse attendue est actuellement un seul chiffre agrégé. Elle doit être scindée en deux : espèces attendues vs solde Mobile Money attendu (dérivés du `payment_method` déjà enregistré par vente/mouvement), avec deux comptages distincts et deux écarts distincts. | Les deux sont physiquement à deux endroits différents (tiroir-caisse vs solde opérateur) — un seul chiffre agrégé masque lequel des deux a un écart. |
| 3 | **Reçu léger** | Après une vente, un résumé formaté (produit, quantité, prix, total, mode de paiement, date/heure, nom du commerce) prêt à copier/partager en un geste (WhatsApp/SMS). Pas de PDF, pas d'imprimante, pas de numérotation fiscale — juste un texte structuré partageable. | Attendu par le client final chez la plupart des commerces ciblés ; reste dans l'esprit « ultra simple », pas un module de facturation. |
| 4 | **Clôture quotidienne guidée** | Remplace le formulaire à un seul champ par un court parcours en étapes : (1) caisse espèces comptée, (2) solde Mobile Money vérifié, (3) alertes stock à confirmer, (4) dépenses du jour à valider, (5) bilan récapitulatif avec les écarts mis en évidence. | Première brique de la Couche 2 (Contrôle) : rendre la clôture aussi fiable qu'un vrai rapprochement, sans effort supplémentaire perçu. |
| 5 | **Modifier/désactiver un employé** | `PATCH /auth/employees/{id}` (déjà documenté comme dette technique dans `opencode.md`), exposé dans l'écran Équipe. | Trou fonctionnel basique du socle — un employé qui part doit pouvoir être désactivé sans supprimer son historique. |

### 5.3 Explicitement reporté (direction validée, pas construit dans cette version)

- **Responsabilité par shift** : ouverture de caisse déclarée par l'employé → activité → fermeture,
  pour attribuer un écart à une session précise plutôt qu'à une journée entière. Le chantier le plus
  lourd des quatre pistes de la Couche 2 (nouveau modèle de données `Shift`) — à scoper dans une
  prochaine itération une fois le socle (§5.2) stabilisé.
- **Centre d'anomalies** : liste automatique d'opérations à vérifier (écart de clôture ≠ 0,
  ajustement de stock important sans motif, prix de vente très différent du catalogue), cliquable
  vers l'opération et l'employé concernés. Dépend du modèle Shift pour être pleinement utile.
- **Assistant propriétaire en langage naturel** (« Où ai-je perdu de l'argent ? »). Nécessite que
  crédit client, shift et centre d'anomalies existent déjà comme source de données. Pure vision long
  terme, non actionnable maintenant.
- Multi-boutique/dépôt, alertes proactives WhatsApp/SMS, export PDF/Excel pour comptable externe,
  catégorisation fine des dépenses — inchangés, toujours hors scope (voir `MVP_SPEC.md` §6/§9).

## 6. Rôles par plateforme

Recherche menée sur les précédents du secteur (Loyverse, Square, Bumpa, Vendloop) avant de trancher.
Constat constant : aucun de ces acteurs ne différencie « web » et « desktop » comme deux rôles
séparés — le clivage réel est **app de vente (mobile/tablette, staff)** vs **app de contrôle
(navigateur, accessible depuis n'importe quel appareil, patron)**. Korise reprend ce principe, avec
un ajustement pour le desktop (voir plus bas).

| Plateforme | Rôle | Contenu |
|---|---|---|
| **Mobile** | App de vente / saisie | Vente rapide, Argent, Stock (entrées/ajustements), reçu léger après une vente. Volontairement minimal — pas de gestion produits/équipe. Sert aussi l'objectif « app ultra légère » (moins d'écrans = bundle plus petit). Le propriétaire peut aussi l'utiliser en déplacement pour saisir vite. |
| **Web** | App de contrôle, accessible partout | Dashboard, clôture guidée, équipe, produits, journal, crédits clients. Utilisable aussi bien sur PC que depuis le navigateur du téléphone du patron — pas besoin d'une deuxième app mobile dédiée au contrôle. |
| **Desktop (Tauri)** | Même app de contrôle que le web, **+ un volet dashboard léger** | Reprend l'intégralité des fonctions du web (même code, même rôle). Ajout spécifique validé : un écran d'accueil simplifié — aperçu rapide (ventes du jour, caisse attendue, alertes) sans naviguer — adapté à un poste toujours allumé en arrière-boutique, avant d'ouvrir le dashboard complet pour le détail. |

## 7. Identité visuelle — mise à jour du design system

Remplace intégralement `DESIGN_SYSTEM.md` §0 à §2 (le reste — composants, icônes Lucide, règle zéro
emoji — reste valable et inchangé).

### 7.1 Marque

- Nom : **Korise**. Sous-titre : *Korah Business Manager*.
- Logo : pictogramme géométrique abstrait blanc sur carré orange arrondi (fichiers déjà fournis dans
  `documentation/Stricte neccessaire charte graphique koness/` — à copier dans
  `packages/shared/brand/` en remplacement des fichiers `bizflow-*`, mêmes règles d'usage qu'avant
  §1 du DESIGN_SYSTEM : jamais étiré, jamais recoloré, zone de respiration conservée).
- Inspiration visuelle assumée (Microsoft, Odoo, Adobe) : direction "SaaS professionnel/utilitaire",
  pas "premium doré" comme l'ancienne identité BizFlow.

### 7.2 Couleurs

| Token | Hex | Usage | Changement |
|---|---|---|---|
| `background` | `#000000` | Fond noir (sidebar, écrans sombres) | Remplace `#0B0B0D` |
| `surface` | `#FFFFFF` | Surfaces claires, cartes | Inchangé |
| `accent` | `#F85602` | Orange — action importante, une seule par écran | Remplace l'or `#D4A017` |
| `accentLight` | `#FEBFA0` | Orange clair — hover/état actif sur fond sombre | Remplace `#F5C95A` ; teinte issue directement des fichiers de la charte |
| `primary` | `#000000` | Navigation, boutons secondaires sur fond clair | Remplace l'indigo `#1737A6` — la charte ne fournit que orange + noir, donc `primary` fusionne avec `background` |
| `warning` | `#FDF770` (texte sombre dessus) | Statut à vérifier / alerte stock | Remplace `#D97706` — **décision volontaire** : l'ancien warning (orange) entrerait en conflit visuel avec le nouvel `accent` (orange) ; le jaune trouvé dans les fichiers de la charte règle ce conflit et reste dans la palette fournie |
| `focus` | `#2563EB` | Anneaux de focus clavier | Inchangé (convention d'accessibilité, indépendante de la marque) |
| `success` | `#16A34A` | Statut positif | Inchangé |
| `danger` | `#DC2626` | Écart, erreur | Inchangé |
| `text` / `textMuted` / `border` | inchangés | | |

Règle héritée de BizFlow, toujours valable : **l'orange (`accent`) guide une action, il ne décore
jamais.**

### 7.3 Typographie

| Rôle | Police | Graisse |
|---|---|---|
| Titres | **Signika** | Bold (700 — poids maximal disponible sur Google Fonts) |
| Chiffres KPI | Signika | Bold (700) |
| Corps de texte | **Urbanist** | Regular (400) |
| Micro-labels | Urbanist | Medium (500), majuscules, `letter-spacing` léger |

Les deux polices sont gratuites sur Google Fonts (`next/font/google` pour le web, chargement
`expo-font`/`@expo-google-fonts` pour le mobile) — même mécanisme que Manrope/Inter aujourd'hui,
substitution triviale.

### 7.4 Ce qui ne change pas

Espacement (4/8/12/16/24/32px), rayons (8/12/16px), bordures 1px, composants (boutons/champs/badges/
carte KPI), bibliothèque d'icônes Lucide, règle zéro emoji.

## 8. Statut

Ce document est **validé** sur : identité visuelle (§7), périmètre fonctionnel de cette version
(§5.2), et rôles par plateforme (§6). Rien n'est encore implémenté dans le code à la date de ce
document — c'est la prochaine étape, à mener explicitement écran par écran / plateforme par
plateforme plutôt qu'en un seul geste, étant donné l'ampleur du changement (rebrand complet +
nouveau modèle de données crédit).
