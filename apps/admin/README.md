# Korise Super Admin

Plateforme interne (Next.js) pour l'équipe Korise — vue d'ensemble des entreprises clientes,
santé du portefeuille, détail par entreprise. **Séparée de `apps/web`** : authentification
propre (`SuperAdminUser` côté backend, jamais le même compte ni le même token qu'une entreprise
cliente), déploiement Vercel séparé. Voir `documentation/KORISE Cahier des charges Super Admin
MVP.pdf` pour le cahier des charges complet, et `opencode.md` (chantier D) pour l'état
d'avancement détaillé.

## Démarrer en local

```bash
cd apps/admin
npm install
npm run dev   # http://localhost:3001 — le backend doit tourner sur localhost:8000
```

## Créer le premier compte

Pas d'auto-inscription (volontaire, sécurité) — le premier compte se crée depuis `backend/` :

```bash
cd backend
venv/Scripts/activate   # ou source venv/bin/activate sur Mac/Linux
python scripts/create_super_admin.py --email toi@korise.app --name "Ton nom" --role owner
```

## Périmètre actuel (P0, voir cahier des charges §5)

Fait, avec de vraies données : Overview (KPI globaux), Entreprises (liste + santé calculée),
Fiche entreprise (détail). Pas encore fait : Analytics produit, Monitoring technique — nécessitent
un vrai journal d'événements plateforme (`PlatformEvent`, non construit) plutôt que
l'approximation actuelle (santé calculée à partir de la dernière vente enregistrée).
