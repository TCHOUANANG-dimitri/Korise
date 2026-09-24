// Session Super Admin — jamais la même clé de stockage ni la même forme que la session
// entreprise de apps/web/apps/mobile (séparation stricte des comptes, voir
// backend/app/models/admin.py et opencode.md chantier D).

export interface AdminSession {
  access_token: string;
  super_admin_id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'product_manager' | 'support' | 'developer';
  environment?: string;
}

const KEY = 'korise_admin_session';

let cached: AdminSession | null | undefined;

export function getAdminSession(): AdminSession | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(raw) as AdminSession;
  } catch {
    cached = null;
  }
  return cached;
}

export function setAdminSession(session: AdminSession): void {
  cached = session;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('korise-admin-session-changed'));
}

export function clearAdminSession(): void {
  cached = null;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('korise-admin-session-changed'));
}
