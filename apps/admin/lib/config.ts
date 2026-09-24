// Même backend FastAPI que apps/web (routes /admin/*, séparées des routes entreprise —
// voir backend/app/api/admin.py). En local le backend tourne sur localhost:8000 ; ailleurs
// (déploiement Vercel), le backend déployé séparément sur Vercel.
export const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
    : 'https://biz-flow-ge7w.vercel.app';
