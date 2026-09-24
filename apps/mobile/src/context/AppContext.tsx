import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { SYNC_INTERVAL_MS } from '../config';
import { Session, persistSession, loadSession, setSessionCache, clearSession as clearStored } from '../auth/session';
import { login as apiLogin, registerBusiness as apiRegister } from '../api/authApi';
import { initDatabase } from '../db/database';
import { rememberPin } from '../lock';
import { saveCurrentUser } from '../db/repo';
import { syncEngine, SyncState } from '../sync/syncEngine';

export type AuthStatus = 'loading' | 'loggedOut' | 'loggedIn';

export interface RegisteredBusiness {
  access_token: string;
  business_code: string;
  full_name: string;
}

interface AppContextValue {
  status: AuthStatus;
  session: Session | null;
  ready: boolean;
  refreshKey: number;
  refresh: () => void;
  syncNow: () => Promise<void>;
  syncState: SyncState;
  apiBaseUrl: string;
  login: (businessCode: string, pin: string) => Promise<void>;
  register: (request: {
    business_name: string;
    sector?: string | null;
    owner_full_name: string;
    owner_phone?: string | null;
    pin: string;
  }) => Promise<RegisteredBusiness>;
  enterAfterRegister: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>');
  return ctx;
}

interface TokenResponseLikeWithUser {
  access_token: string;
  user_id: string;
  business_id: string;
  business_code: string;
  business_name: string;
  role: Session['role'];
  full_name: string;
  can_view_purchase_prices: boolean;
  can_view_owner_dashboard: boolean;
}

function buildSession(token: TokenResponseLikeWithUser): Session {
  return {
    access_token: token.access_token,
    user_id: String(token.user_id),
    business_id: String(token.business_id),
    business_code: token.business_code,
    business_name: token.business_name,
    role: token.role,
    full_name: token.full_name,
    can_view_purchase_prices: token.can_view_purchase_prices,
    can_view_owner_dashboard: token.can_view_owner_dashboard,
  };
}

async function adoptSession(session: Session): Promise<void> {
  setSessionCache(session);
  await persistSession(session);
  saveCurrentUser({
    id: session.user_id,
    business_id: session.business_id,
    full_name: session.full_name,
    role: session.role,
    can_view_purchase_prices: session.can_view_purchase_prices,
    can_view_owner_dashboard: session.can_view_owner_dashboard,
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>({ phase: 'idle' });
  const [pending, setPending] = useState<Session | null>(null);
  const pendingPin = useRef<string>('');
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const syncNow = useCallback(async () => {
    await syncEngine.syncNow();
  }, []);

  // Boot : DB, session persistée, puis départ de la synchro si connecté.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        initDatabase();
        const stored = await loadSession();
        if (!alive) return;
        if (stored) {
          saveCurrentUser({
            id: stored.user_id,
            business_id: stored.business_id,
            full_name: stored.full_name,
            role: stored.role,
            can_view_purchase_prices: stored.can_view_purchase_prices,
            can_view_owner_dashboard: stored.can_view_owner_dashboard,
          });
          setSession(stored);
          setStatus('loggedIn');
        } else {
          setStatus('loggedOut');
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const off = syncEngine.subscribe((state) => {
      setSyncState(state);
      refresh();
    });
    return off;
  }, [refresh]);

  // Déclencheurs de sync uniquement quand connecté (SYNC_DESIGN §8).
  useEffect(() => {
    if (!ready || status !== 'loggedIn') return;

    void syncEngine.syncNow();

    const onAppState = (next: AppStateStatus) => {
      const wasBackground = appState.current === 'inactive' || appState.current === 'background';
      if (wasBackground && next === 'active') void syncEngine.syncNow();
      appState.current = next;
    };
    const sub = AppState.addEventListener('change', onAppState);

    const timer = setInterval(() => {
      void syncEngine.isNetworkReachable().then((ok) => {
        if (ok) void syncEngine.syncNow();
      });
    }, SYNC_INTERVAL_MS);

    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [ready, status]);

  const login = useCallback(async (businessCode: string, pin: string) => {
    const token = await apiLogin(businessCode.trim(), pin.trim());
    const s = buildSession(token);
    await adoptSession(s);
    await rememberPin(s.user_id, pin.trim());
    setSession(s);
    setStatus('loggedIn');
    void syncEngine.syncNow();
    refresh();
  }, [refresh]);

  // L'inscription ne bascule pas directement dans l'app : l'écran de succès
  // doit d'abord montrer le business_code à noter/partager.
  const register = useCallback(async (request: {
    business_name: string;
    sector?: string | null;
    owner_full_name: string;
    owner_phone?: string | null;
    pin: string;
  }): Promise<RegisteredBusiness> => {
    const token = await apiRegister(request);
    pendingPin.current = request.pin;
    setPending(buildSession(token));
    return {
      access_token: token.access_token,
      business_code: token.business_code,
      full_name: token.full_name,
    };
  }, []);

  const enterAfterRegister = useCallback(async () => {
    if (!pending) return;
    await adoptSession(pending);
    if (pendingPin.current) await rememberPin(pending.user_id, pendingPin.current);
    pendingPin.current = '';
    setSession(pending);
    setPending(null);
    setStatus('loggedIn');
    void syncEngine.syncNow();
    refresh();
  }, [pending, refresh]);

  const logout = useCallback(async () => {
    await clearStored();
    setSession(null);
    setStatus('loggedOut');
    setSyncState({ phase: 'idle' });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      session,
      ready,
      refreshKey,
      refresh,
      syncNow,
      syncState,
      apiBaseUrl: syncEngine.getApiBaseUrl(),
      login,
      register,
      enterAfterRegister,
      logout,
    }),
    [status, session, ready, refreshKey, refresh, syncNow, syncState, login, register, enterAfterRegister, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}