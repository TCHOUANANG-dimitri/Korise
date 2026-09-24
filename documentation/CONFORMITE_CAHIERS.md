# KORISE — Matrice de conformité aux cahiers des charges

État au **2026-09-24**. Sources : `KORISE Cahier des fonctionnalites Web Mobile Desktop v0_1.pdf`
(« cahier fonctionnel ») et `KORISE Cahier des charges Super Admin MVP.pdf` (« cahier Super Admin »).
Directive du fondateur (2026-09-24) : web et mobile exposent **la même couverture fonctionnelle** ;
desktop mis de côté pour l'instant.

Légende : ✅ fait et testé · 🟡 fait avec une limite assumée (précisée) · ⏳ pas encore fait (précisé) ·
❔ décision fondateur nécessaire (cahier §19).

## 1. Cahier fonctionnel — socle commun (§5) et priorisation (§16)

| Fonction (priorité) | Backend | Web | Mobile | Notes |
|---|---|---|---|---|
| Caisse / ventes rapides (P0) | ✅ | ✅ panier, recherche, scan douchette | ✅ panier, recherche, scan caméra | Remise = prix de ligne modifiable (les écarts > 50 % du catalogue remontent en anomalie). |
| Paiements espèces, Mobile Money (P0) | ✅ | ✅ | ✅ | |
| **Orange Money** (P1) | ✅ canal distinct partout | ✅ vente, argent, crédit, clôture | ✅ vente, argent, crédit, clôture | Enregistrement du moyen de paiement seulement (cahier §19 q.5 : intégration transactionnelle ❔). |
| Carte bancaire / virtuelle (plus tard) | — | — | — | Hors périmètre, comme prévu. |
| Produits & services, stockable / non stockable, seuil, catégorie | ✅ | ✅ | ✅ | Un service ne touche jamais au stock. |
| Stock : entrées, sorties, ajustements, seuils | ✅ | ✅ | ✅ | Transferts / inventaire avancé = P2 ⏳. |
| Code-barres | ✅ champ + recherche | ✅ recherche + douchette USB | ✅ caméra (expo-camera) | |
| Clients, crédits / dettes (P1) | ✅ | ✅ fiche, historique, remboursement | ✅ idem | Échéances : ❔ (§19 q.4) — crédit sans échéance pour l'instant. |
| Dépenses (catégorie, moyen de paiement, auteur) | ✅ | ✅ | ✅ | Justificatif éventuel ⏳ (pas de stockage de fichiers). |
| Employés & permissions | ✅ | ✅ création, permissions, désactivation | ✅ idem | Rôles Gérant / Magasinier / Comptable ⏳ : deux rôles (propriétaire, employé) + 2 permissions. |
| Audit trail | ✅ | ✅ journal | ✅ journal (via API) | Appareil : suivi au niveau appareil/session (télémétrie), pas par ligne d'audit. |
| Clôture / rapprochement caisse (P0) | ✅ attendu calculé serveur | ✅ 7 étapes | ✅ 7 étapes | 3 canaux + comptage stock sensible. |
| Rapports & dashboard | ✅ | ✅ | ✅ | |
| **PDF brandés** : reçu, facture, rapport journalier / stock / employé / anomalies (P1) | ✅ reportlab, logo + coordonnées de l'entreprise, « généré avec KORISE » | ✅ | ✅ partage natif | Logo réglé depuis le web (Paramètres). |
| Offline (P0) | ✅ idempotence | ✅ | ✅ | File de synchro visible, conflits affichés (opérations « refusées »). |
| Multi-boutiques / dépôts (P2) | ⏳ | ⏳ | ⏳ | Reporté (P2). Une entreprise = une boutique. |

## 2. Couche Contrôle (§6, §7.1) — cœur différenciant

| Fonction | État |
|---|---|
| Rapprochement automatique global | ✅ attendu vs réel par canal (cash / MoMo / Orange) + comptage stock des produits sous seuil |
| Clôture quotidienne intelligente (checklist guidée) | ✅ web et mobile |
| Responsabilité par employé / shift | ✅ ouverture (fond de caisse) / fermeture (comptage) par employé ; attendu = fond + flux espèces de l'employé sur la période ; écart → anomalie |
| Centre d'anomalies (P1) | ✅ écarts de clôture, écarts de shift, ajustements de stock sans motif, prix hors catalogue ; montant, **cause probable**, opérations liées, résolution ; réservé au propriétaire (❔ §19 q.8) |
| Historique d'un écart | ✅ « Opérations liées » remonte jusqu'aux mouvements |
| Workflow de correction (proposer / valider / conserver l'ancienne valeur) | ⏳ pas construit : aucune suppression silencieuse n'existe (tout est append-only + audit), mais pas de flux « demande de correction ». |
| Bilan automatique de journée | ✅ rapport journalier PDF + écran Rapports |
| Assistant propriétaire (P3) | — hors périmètre |

## 3. Écrans par plateforme (§7, §8, §15)

* **Web (Command Center)** : Aujourd'hui, Vente, Clients & crédits, Argent, Stock, Mon shift, Clôture, Rapports, Anomalies, Équipe, Journal, Paramètres. ✅
* **Mobile (Operational App)** : Accueil, Vente, Argent, Stock + « Plus » (Clients & crédits, Mon shift, Clôture, Mon historique, Anomalies, Rapports, Équipe, Paramètres). ✅
* Notifications : cloche (anomalies à traiter + alertes de stock) sur le web ; alertes stock et anomalies sur l'accueil / « Plus » mobile. Push / WhatsApp / e-mail ❔ (§19 q.9) ⏳.
* **Desktop** : mis de côté sur instruction du fondateur (le code compile ; empaquetage MSI non testé faute d'accès réseau au téléchargement de WiX).

## 4. Sécurité et connexion (§3, §4, §12)

| Point | État |
|---|---|
| Comptes individuels + PIN | ✅ |
| Récupération du code entreprise (hors cahier, ajout 2026-09-24) | ✅ `POST /auth/recover-code` + écran dédié web (`/code-oublie`) et mobile — vérification nom entreprise + nom + téléphone du propriétaire, message d'erreur identique succès/échec (pas d'énumération), demande journalisée (audit + télémétrie). Le code seul ne permet aucune action : la connexion exige toujours le PIN. |
| Verrouillage automatique après inactivité | ✅ web et mobile, durée réglable (défaut 10 min) — PIN vérifié hors-ligne via empreinte salée, jamais stocké en clair |
| Changement d'employé rapide | 🟡 verrou → « Changer d'utilisateur » (déconnexion + nouvelle saisie). L'écran « Qui utilisez-vous ? » à cartes de profils (§4.1) n'est pas fait : le fondateur l'a écarté pour le MVP (« pas besoin de tout ça »). |
| Désactivation immédiate d'un utilisateur | ✅ |
| Historique des appareils / sessions | ✅ côté Super Admin (Devices & Versions) |
| 2FA propriétaire | — écarté pour le MVP par le fondateur |
| Impossible de supprimer silencieusement une opération | ✅ aucun endpoint de suppression d'événement |

## 5. Cahier Super Admin — modules (§5)

| Module | Priorité | État |
|---|---|---|
| Overview / Dashboard | P0 | ✅ alertes urgentes en premier, blocs Entreprises / Usage / Structure / Business SaaS / Technique, funnel d'activation, entreprises et utilisateurs actifs (30 j), top fonctionnalités, comptes inactifs |
| Entreprises | P0 | ✅ recherche, filtres (santé, plan, statut, plateforme), pagination, colonnes configurables |
| Fiche entreprise | P0 | ✅ compte, structure, usage, fonctionnalités utilisées, technique (appareils, versions, dernière synchro, file, erreurs), historique, notes, tickets |
| Analytics produit | P0 | ✅ usage des fonctionnalités, funnel, rétention 7 / 30 j, DAU / WAU / MAU, segmentation période / plan / version / plateforme / actif-inactif |
| Monitoring technique | P0 | ✅ appareils offline, opérations en attente, erreurs de synchro et serveur, conflits, versions obsolètes, alertes (« Boutique X — 147 opérations non synchronisées — dernière synchro il y a 18 h ») |
| Support / diagnostic | P1 | ✅ tickets (ouvert / en cours / résolu), notes internes, diagnostic depuis la fiche |
| Billing | P1 | 🟡 plans, abonnements, MRR / ARR calculés, essais, changement de plan, prolongation d'essai. Revenus encaissés / remboursements / remises : pas de processeur de paiement (volontaire) |
| Devices & Versions | — | ✅ |
| Administration Super Admin | P1 | ✅ comptes, rôles, désactivation, journal d'audit |
| Cohortes avancées / IA | P2 | — hors périmètre |

Principes transverses : comptes séparés (jeton `typ=super_admin`, jamais interchangeable avec un compte
entreprise) ✅ · rôles à moindre privilège appliqués **côté serveur** et dans la navigation ✅ ·
confirmation + motif avant toute action sensible, tracée dans l'audit ✅ · statut de santé calculé par
règles configurables (`HEALTH_WATCH_AFTER_DAYS`, `HEALTH_RISK_AFTER_DAYS`, sync bloquée, paiement échoué)
✅ · indicateur d'environnement + recherche globale + alertes dans la barre supérieure ✅ · graphiques
simples, une série par graphique, vue tableau, infobulles ✅.

Limites assumées : la santé et l'usage sont calculés à partir des tables métier et de la télémétrie
(`Device`, `PlatformEvent`) ; les appareils n'apparaissent qu'à partir de la version qui envoie le
heartbeat (web et mobile 0.2.0 et suivants). « Boutiques » = 1 par entreprise tant que le multi-boutiques
(P2) n'existe pas.

## 6. Questions ouvertes du cahier fonctionnel §19 (décisions à prendre)

1. Propriétaire connecté sur plusieurs appareils : autorisé aujourd'hui, aucune action bloquée.
2. Ouverture de shift obligatoire avant la première vente ? Aujourd'hui **facultative**.
3. Employé multi-boutiques : sans objet tant que le multi-boutiques n'existe pas.
4. Crédit avec / sans échéance : sans échéance pour l'instant.
5. Orange Money : enregistrement du moyen de paiement seulement.
6. Périphériques Windows : desktop mis de côté.
7. Capacité locale particulière du desktop hors connexion : idem.
8. Qui génère les PDF : reçus / factures = tout utilisateur connecté ; rapports = propriétaire (ou droit tableau de bord) ; rapport employé et anomalies = propriétaire.
9. Qui clôture une anomalie : propriétaire uniquement.
10. Alertes critiques par push / WhatsApp / e-mail : alertes dans l'interface seulement.
