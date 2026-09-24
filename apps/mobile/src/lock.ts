// Verrouillage automatique de la caisse après inactivité (cahier fonctionnel §12). Le PIN n'est
// jamais stocké : seulement une empreinte SHA-256 salée par utilisateur (kv SQLite), pour pouvoir
// déverrouiller hors-ligne. Verrou d'usage sur caisse partagée, pas une frontière de sécurité serveur.

import * as Crypto from 'expo-crypto';

import { getCursor, setCursor } from './db/repo';

export const DEFAULT_LOCK_MINUTES = 10;

export function getLockMinutes(): number {
  const raw = getCursor('lock_minutes');
  return raw === null || raw === '' ? DEFAULT_LOCK_MINUTES : Math.max(0, Number(raw) || 0);
}

export function setLockMinutes(minutes: number): void {
  setCursor('lock_minutes', String(minutes));
}

async function digest(userId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `korise:${userId}:${pin}`);
}

export async function rememberPin(userId: string, pin: string): Promise<void> {
  setCursor(`pin_digest_${userId}`, await digest(userId, pin));
}

// true / false, ou null si aucune empreinte locale n'existe (session ouverte avant cette fonction).
export async function checkPinLocally(userId: string, pin: string): Promise<boolean | null> {
  const stored = getCursor(`pin_digest_${userId}`);
  if (!stored) return null;
  return stored === (await digest(userId, pin));
}
