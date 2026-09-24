// Session persistée localement (localStorage) — le token JWT reste valable
// hors-ligne (voir documentation/SYNC_DESIGN.md §7). Pas de refresh token pour
// l'instant côté backend : à 24h l'utilisateur doit se reconnecter.

export interface Session {
  access_token: string;
  user_id: string;
  business_id: string;
  business_code: string;
  business_name: string;
  role: 'owner' | 'employee';
  full_name: string;
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
}

const KEY = 'korise_session';

let cached: Session | null | undefined;

export function getSession(): Session | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(raw) as Session;
  } catch {
    cached = null;
  }
  return cached;
}

export function setSession(session: Session): void {
  cached = session;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('korise-session-changed'));
}

export function clearSession(): void {
  cached = null;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('korise-session-changed'));
}
