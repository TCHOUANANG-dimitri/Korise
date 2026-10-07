# Landing page Korise

Page de prospection (réseaux sociaux) avec un seul objectif : le clic sur « Essayer gratuitement »,
qui ouvre directement l'inscription de l'app web.

- **Ultra légère** : un seul HTML autonome (CSS + JS inline, ~9 Ko compressé) + logo + polices
  Google non bloquantes. Pas de framework.
- **Source** : `src/index.html`. Les couleurs et les rayons sont injectés au build depuis
  `packages/shared/design-tokens.json`, et le logo est copié depuis `packages/shared/brand/`.
  Ne jamais écrire un hex de marque à la main, ni committer une copie du logo ici.
- **Réglages** : `config.json`, qui contient l'URL de l'app, le numéro WhatsApp, le lien YouTube
  et les liens des réseaux sociaux. Un champ vide masque l'élément correspondant (la vidéo affiche
  alors « Bientôt en ligne »).

## Build et aperçu

```bash
node build.mjs          # → dist/
npx serve dist -l 4000  # aperçu local
npm run og              # régénère src/og.png (image de partage 1200×630), seulement si le titre ou le logo change
```

## Liens traçables (un par canal)

| Canal     | Lien à publier          |
|-----------|-------------------------|
| Facebook  | `https://<domaine>/fb`  |
| Instagram | `https://<domaine>/ig`  |
| TikTok    | `https://<domaine>/tt`  |
| WhatsApp  | `https://<domaine>/wa`  |

`?src=…` et `?utm_source=…` fonctionnent aussi. Le canal suit tout le parcours :

1. La landing ajoute `&src=<canal>` au lien d'inscription (`/login/?mode=register&src=…`).
2. L'app web garde le canal en mémoire, puis l'envoie à `POST /auth/register-business`
   (`signup_source`).
3. Le canal est enregistré sur l'entreprise (`Business.signup_source`).
4. Super Admin → Analytics → « Inscriptions par canal » affiche le nombre d'inscrits par canal et
   combien ont réellement vendu.

Une visite sans canal est comptée « landing » ; une inscription faite hors landing est comptée
« direct ». Le message WhatsApp pré-rempli mentionne aussi le canal d'arrivée.

## Déploiement (Vercel)

Créer un projet Vercel avec *Root Directory* = `apps/landing`. `vercel.json` définit le build, les
redirections `/fb`, `/ig`, `/tt` et `/wa`, et le cache. Vercel fournit
`VERCEL_PROJECT_PRODUCTION_URL`, qui sert d'URL absolue pour l'aperçu de partage. Avec un domaine
personnalisé, renseigner `siteUrl` dans `config.json`.
