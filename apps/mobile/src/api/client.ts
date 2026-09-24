// Client HTTP de base : en-tête Authorization Bearer + timeout.
// Les payloads d'événements n'embarquent plus business_id/user_id : le serveur
// les dériva du token (CLAUDE.md).

import { API_BASE_URL } from '../config';
import { getToken } from '../auth/session';
import { clientHeaders } from './telemetryApi';

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = init;
  const headers: Record<string, string> = { ...clientHeaders() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Réseau injoignable. Les saisies restent enregistrées sur cet appareil.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ApiError('Session expirée ou accès refusé. Reconnecte-toi.', res.status);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const parsed = (await res.json()) as { detail?: unknown };
      if (parsed && parsed.detail !== undefined) detail = JSON.stringify(parsed.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(`Erreur serveur (${res.status}) : ${detail}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}