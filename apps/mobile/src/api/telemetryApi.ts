// Identité de l'appareil pour le Super Admin (backend/app/models/platform.py) : clé stable générée
// une fois (kv SQLite), plateforme "android", version de l'app. Envoyées en en-têtes sur chaque
// requête, plus un heartbeat après chaque synchronisation.

import { Platform } from 'react-native';

import appConfig from '../../app.json';
import { getCursor, generateUuid, setCursor } from '../db/repo';
import { apiFetch } from './client';

export const APP_VERSION: string = appConfig.expo.version;
const KEY = 'device_key';

let cached: string | null = null;

export function getDeviceKey(): string {
  if (cached) return cached;
  try {
    let key = getCursor(KEY);
    if (!key) {
      key = generateUuid();
      setCursor(KEY, key);
    }
    cached = key;
  } catch {
    cached = generateUuid();
  }
  return cached;
}

export function getPlatformName(): 'android' | 'ios' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

export function clientHeaders(): Record<string, string> {
  return {
    'X-Device-Id': getDeviceKey(),
    'X-Platform': getPlatformName() === 'ios' ? 'web' : 'android',
    'X-App-Version': APP_VERSION,
  };
}

export async function sendHeartbeat(input: {
  pending_ops: number;
  rejected_ops: number;
  sync_ok: boolean | null;
  sync_error?: string | null;
  pushed?: number;
}): Promise<void> {
  try {
    await apiFetch('/telemetry/heartbeat', {
      method: 'POST',
      body: {
        device_key: getDeviceKey(),
        platform: getPlatformName() === 'ios' ? 'web' : 'android',
        app_version: APP_VERSION,
        ...input,
      },
    });
  } catch {
    /* la télémétrie ne doit jamais gêner l'utilisateur */
  }
}
