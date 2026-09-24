import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PanResponder, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { login as apiLogin } from '../api/authApi';
import { checkPinLocally, getLockMinutes, rememberPin } from '../lock';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Button, Field } from './ui';

// Caisse partagée : après N minutes sans toucher l'écran (ou au retour de l'app en arrière-plan
// longtemps), on demande le PIN de l'utilisateur connecté — ou de changer d'utilisateur.
export function IdleLock({ children }: { children: React.ReactNode }) {
  const { session, logout } = useApp();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const minutes = getLockMinutes();
    if (minutes <= 0) return;
    timer.current = setTimeout(() => setLocked(true), minutes * 60_000);
  }, []);

  useEffect(() => {
    arm();
    const sub = AppState.addEventListener('change', (s) => {
      const minutes = getLockMinutes();
      if (s === 'background' || s === 'inactive') backgroundedAt.current = Date.now();
      else if (s === 'active' && backgroundedAt.current && minutes > 0 && Date.now() - backgroundedAt.current > minutes * 60_000) {
        setLocked(true);
      }
      if (s === 'active') arm();
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [arm]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        arm();
        return false; // observe seulement : ne vole jamais le toucher
      },
    }),
  ).current;

  const unlock = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const local = await checkPinLocally(session.user_id, pin);
      if (local === true) {
        setLocked(false);
        setPin('');
        arm();
        return;
      }
      if (local === false) {
        setError('PIN incorrect.');
        return;
      }
      await apiLogin(session.business_code, pin); // pas d'empreinte locale : vérification en ligne une fois
      await rememberPin(session.user_id, pin);
      setLocked(false);
      setPin('');
      arm();
    } catch {
      setError('PIN incorrect ou connexion indisponible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
      {locked && session && (
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={[typo.title, { textAlign: 'center' }]}>Caisse verrouillée</Text>
            <Text style={[typo.muted, { textAlign: 'center', marginVertical: SPACING.md }]}>{session.full_name} — entre ton PIN pour continuer.</Text>
            <Field value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureTextEntry placeholder="PIN" maxLength={8} />
            {error ? <Text style={[typo.muted, { color: palette.danger, marginBottom: SPACING.md }]}>{error}</Text> : null}
            <Button title="Déverrouiller" variant="accent" onPress={() => void unlock()} disabled={busy || pin.length < 4} />
            <View style={{ height: SPACING.sm }} />
            <Button title="Changer d’utilisateur" variant="secondary" onPress={() => { setLocked(false); void logout(); }} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  box: { width: '100%', maxWidth: 360, backgroundColor: palette.surface, borderRadius: RADIUS.card, padding: SPACING.xl },
});
