// Session persistée hors-ligne (SYNC_DESIGN §7) : le JWT est conservé dans le
// SecureStore de l'OS. Rappel : le backend accepte un JWT jusqu'à 24h sans
// mécanisme de refresh — l'app repasse par l'écran de connexion après ça.

import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'korise.session';

export type Role = 'owner' | 'employee';

export interface Session {
  access_token: string;
  user_id: string;
  business_id: string;
  business_code: string;
  business_name: string;
  role: Role;
  full_name: string;
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
}

// Token mis en cache en mémoire pour éviter une lecture SecureStore par appel API.
let cachedToken: string | null = null;
let cachedSession: Session | null = null;

// Accès synchrone pour la couche SQLite (les lectures SecureStore sont async).
export function setSessionCache(session: Session | null): void {
  cachedSession = session;
  cachedToken = session ? session.access_token : null;
}

export function getSessionSync(): Session | null {
  return cachedSession;
}

export async function persistSession(session: Session): Promise<void> {
  cachedToken = session.access_token;
  cachedSession = session;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    // Anciennes sessions (persistées avant que TokenResponse ne porte les
    // permissions ni le business_name) : on rétablit des défauts sûrs.
    session.can_view_purchase_prices = session.can_view_purchase_prices ?? session.role === 'owner';
    session.can_view_owner_dashboard = session.can_view_owner_dashboard ?? session.role === 'owner';
    session.business_name = session.business_name ?? '';
    cachedToken = session.access_token;
    cachedSession = session;
    return session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  cachedToken = null;
  cachedSession = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function getToken(): string | null {
  return cachedToken;
}

export function setTokenMemory(token: string | null): void {
  cachedToken = token;
}