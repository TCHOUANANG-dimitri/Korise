# Korah Business Manager — Spécification MVP

> Synthèse de travail à partir de `documentation/Korah Business Manager Problem Solution ICP MVP.pdf`.
> Ce document est la **source de vérité produit** pour le MVP. Toute décision de scope doit s'y référer.
>
> Le produit porte désormais le nom de marque **Korise** (identité visuelle définie dans
> `documentation/DESIGN_SYSTEM.md`, renommée BizFlow → Koness → Korise) — le contenu produit
> ci-dessous reste inchangé, seul le nom commercial s'ajoute.

## 1. Le problème (essence)

Les petites entreprises physiques au Cameroun à transactions quotidiennes fréquentes n'ont pas de
moyen simple et fiable de capturer en continu les mouvements d'argent et de stock. Résultat : fuites
financières, écarts inexpliqués, ruptures de stock découvertes trop tard.

Question fondamentale à laquelle l'app doit répondre :

> **« Qu'est-ce qui s'est passé aujourd'hui dans mon business, et est-ce que l'argent et le stock que
> j'ai correspondent à ce qu'il devrait y avoir ? »**

Ce n'est **pas** un problème Excel, ni un problème comptable, ni un problème d'inventaire pris isolément.

## 2. Thèse produit

« Un système de contrôle quotidien pour petites entreprises. » Architecture **événementielle** :
un événement métier (ex. une vente) met à jour automatiquement caisse, ventes et stock — jamais de
saisie multiple pour un même fait.

## 3. Cible / ICP (rappel)

Patron/gérant de commerce physique camerounais, généralement 2-10 employés, souvent absent du
terrain, dont le CA dépend du stock, avec smartphone + internet, à l'aise avec WhatsApp/Mobile Money,
et qui a quelque chose de réel à perdre (écarts de caisse, pertes de stock).

Secteurs initiaux possibles : cybers/secrétariats, mini-markets, cosmétiques, téléphonie/accessoires,
commerce général.

## 4. Les deux exigences non négociables du MVP

1. **Ultra simple d'utilisation** — un employé peu formé doit pouvoir enregistrer une vente en
   quelques secondes, sans réfléchir.
2. **Ultra efficace pour résoudre le problème** — le patron doit pouvoir répondre à la question
   fondamentale (section 1) tous les jours, sans effort.

Tout ce qui n'aide pas directement l'un de ces deux objectifs est hors scope MVP.

## 5. Fonctionnalités de base du MVP (périmètre figé)

| # | Fonctionnalité | Ce qu'elle doit faire |
|---|---|---|
| 1 | **Vente / transaction rapide** | Produit/service, quantité, mode de paiement. Un seul geste → MAJ auto ventes + caisse + stock. |
| 2 | **Argent IN / OUT** | Enregistrer entrée, dépense, retrait de caisse : montant, motif/catégorie, utilisateur, horodatage. |
| 3 | **Gestion de stock** | Produits : quantité, prix d'achat, prix de vente, seuil minimum. Entrées/sorties/ajustements. Une vente normale décrémente le stock automatiquement. |
| 4 | **Employés & permissions** | Le patron crée les comptes employés et définit leurs droits. Les employés ne voient pas les infos sensibles (prix d'achat, rapports patron) par défaut. |
| 5 | **Journal d'audit** | Chaque action importante = qui, quoi, quand. Rien ne doit disparaître silencieusement. |
| 6 | **Tableau de bord patron** | Vue quotidienne concise : ventes, dépenses, caisse attendue/réelle, écarts, alertes stock, top produits, activité employés. |
| 7 | **Clôture de fin de journée** (fonctionnalité signature) | Caisse attendue (calculée) vs caisse réelle (comptée) → écart affiché → motif attachable. |
| 8 | **Mode hors-ligne** | Les opérations essentielles continuent sans connexion et se synchronisent au retour du réseau. |

### Exemple de workflow (référence)
Un employé vend 3 jus à 1 500 FCFA → 1 seule saisie → ventes +1 500, caisse +1 500, stock jus -3,
employé + horodatage enregistrés automatiquement. Le patron voit tout, sans re-saisie.

### Exemple de clôture (référence)
Ventes 125 000 − dépenses 25 000 = caisse attendue 100 000. Caisse réelle comptée : 94 000.
Écart : −6 000 FCFA, à expliquer/classer.

## 6. Explicitement HORS du MVP

Comptabilité SYSCOHADA complète, paie/RH, CRM en module majeur, e-commerce, production,
achats complexes, reporting entreprise avancé, multiplication de modules secondaires, fonctionnalités IA.

Ces sujets sont volontairement reportés après validation du MVP — ne pas les anticiper dans le code
ou l'architecture au point de complexifier le MVP.

## 7. Décisions volontairement reportées (ne pas trancher maintenant)

Segmentation finale du marché, pricing, stratégie marketing/acquisition, différenciation finale vs
ShopTrack. Focus actuel = construire et valider le MVP.

## 8. Contraintes transverses (ajoutées pour le cadrage produit/technique du MVP)

- **Trois plateformes** : desktop, web, mobile — une seule expérience produit cohérente.
- **Ultra léger**, particulièrement sur mobile (taille d'app, temps de démarrage, consommation).
- **Design** : épuré, simple, beau, attrayant, sans jamais être lourd. (Discussion design séparée,
  à venir — brief de marque/logo à fournir par le fondateur.)
- **Offline-first** réel, pas cosmétique : la saisie ne doit jamais être bloquée par l'absence de réseau.
- **Stack confirmé** : mobile en React Native, web en Next.js, desktop en Tauri encapsulant un export
  statique du même code Next.js (voir `CLAUDE.md`/`opencode.md` pour le détail et le pourquoi).
- **Synchronisation multi-appareils** : contrat détaillé dans `documentation/SYNC_DESIGN.md`,
  contraignant pour le backend et pour les clients.

## 9. Idées pour plus tard (hors MVP — à discuter, ne pas construire maintenant)

Ces pistes sont notées pour mémoire, à valider avec le fondateur après le MVP :

- Alertes proactives (WhatsApp/SMS) sur seuil de stock bas ou écart de caisse important.
- Export simple (PDF/Excel) du rapport journalier/mensuel pour un comptable externe.
- Multi-caisse / multi-point de vente pour une même entreprise.
- Catégorisation fine des dépenses avec suggestions automatiques.
- Mode « plusieurs succursales » pour un même propriétaire.
- Statistiques simples de tendance (meilleur jour, produit en baisse) sans tomber dans le BI lourd.

## 10. Statut

Phase actuelle : **construction du MVP**, autour du problème validé, de l'ICP et du workflow décrit
ci-dessus. Voir `opencode.md` et `CLAUDE.md` à la racine du projet pour la répartition du travail et
l'architecture technique retenue.
