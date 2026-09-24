// Verrouillage automatique de la caisse après inactivité (cahier fonctionnel §12).
// Le PIN n'est jamais stocké : on garde seulement une empreinte SHA-256 salée par
// utilisateur, pour pouvoir déverrouiller hors-ligne. Ce n'est PAS une frontière de sécurité
// serveur (le token JWT reste valable) : c'est un verrou d'usage sur une caisse partagée.

const MINUTES_KEY = 'korise_lock_minutes';
const DIGEST_PREFIX = 'korise_pin_digest_';
export const DEFAULT_LOCK_MINUTES = 10;

export function getLockMinutes(): number {
  if (typeof window === 'undefined') return DEFAULT_LOCK_MINUTES;
  try {
    const raw = window.localStorage.getItem(MINUTES_KEY);
    return raw === null ? DEFAULT_LOCK_MINUTES : Math.max(0, Number(raw) || 0);
  } catch {
    return DEFAULT_LOCK_MINUTES;
  }
}

export function setLockMinutes(minutes: number): void {
  try {
    window.localStorage.setItem(MINUTES_KEY, String(minutes));
    window.dispatchEvent(new Event('korise-lock-settings-changed'));
  } catch {
    /* stockage indisponible */
  }
}

async function digest(userId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`korise:${userId}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function rememberPin(userId: string, pin: string): Promise<void> {
  try {
    window.localStorage.setItem(DIGEST_PREFIX + userId, await digest(userId, pin));
  } catch {
    /* pas bloquant */
  }
}

// true / false, ou null si aucune empreinte locale n'existe encore (session antérieure).
export async function checkPinLocally(userId: string, pin: string): Promise<boolean | null> {
  try {
    const stored = window.localStorage.getItem(DIGEST_PREFIX + userId);
    if (!stored) return null;
    return stored === (await digest(userId, pin));
  } catch {
    return null;
  }
}
