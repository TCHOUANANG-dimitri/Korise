// Identité de l'appareil pour le Super Admin (voir backend/app/models/platform.py) :
// une clé stable générée une fois, la plateforme (web ou windows dans Tauri), la version
// de l'app. Envoyées en en-têtes sur chaque requête + un "heartbeat" après chaque synchro.

import { isTauri } from './platform';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0';
const KEY = 'korise_device_key';

function randomKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceKey(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let key = window.localStorage.getItem(KEY);
    if (!key) {
      key = randomKey();
      window.localStorage.setItem(KEY, key);
    }
    return key;
  } catch {
    return 'volatile';
  }
}

export function getPlatform(): 'web' | 'windows' {
  return isTauri() ? 'windows' : 'web';
}

export function clientHeaders(): Record<string, string> {
  return {
    'X-Device-Id': getDeviceKey(),
    'X-Platform': getPlatform(),
    'X-App-Version': APP_VERSION,
  };
}
