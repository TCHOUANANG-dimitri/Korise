// Canal d'acquisition (liens traçables de la landing page : ?src=facebook|instagram|tiktok|whatsapp).
// Gardé en localStorage le temps que le visiteur s'inscrive, puis envoyé à register-business.
// Purement marketing : toute erreur de stockage est ignorée, l'inscription ne dépend jamais de ça.

const KEY = 'korise.signup_source';

export function captureSignupSource(): void {
  try {
    const src = new URLSearchParams(window.location.search).get('src');
    if (src && /^[a-z0-9_-]{1,32}$/i.test(src)) localStorage.setItem(KEY, src.toLowerCase());
  } catch {
    /* stockage indisponible : tant pis pour l'attribution */
  }
}

export function getSignupSource(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
