import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import LogOut from 'lucide-react-native/icons/log-out';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import WifiOff from 'lucide-react-native/icons/wifi-off';

import { useApp } from '../context/AppContext';
import { getPendingOutbox, getRejectedOutbox } from '../db/repo';
import { palette, RADIUS, SPACING, typo } from '../theme';

// Bandeau supérieur : logo, état En ligne / Hors ligne / Synchronisation / Erreur (cahier fonctionnel §11),
// nombre d'opérations en attente d'envoi, synchronisation manuelle, déconnexion.
export function TopBar() {
  const { syncState, syncNow, logout, refreshKey } = useApp();
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);

  useEffect(() => {
    setPending(getPendingOutbox().length);
    setRejected(getRejectedOutbox().length);
  }, [refreshKey, syncState]);

  let SyncIcon = RefreshCw;
  let syncColor: string = palette.textMuted;
  let label = 'Prêt';
  if (syncState.phase === 'ok') {
    SyncIcon = CheckCircle2;
    syncColor = palette.success;
    label = 'En ligne';
  } else if (syncState.phase === 'error') {
    SyncIcon = pending > 0 ? WifiOff : TriangleAlert;
    syncColor = palette.warning;
    label = 'Hors ligne';
  } else if (syncState.phase === 'syncing') {
    syncColor = palette.accent;
    label = 'Synchro…';
  }

  return (
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <Image source={require('../../assets/brand/korise-icon.png')} style={styles.icon} resizeMode="contain" />
        <Text style={[typo.heading, { color: palette.surface, fontSize: 16 }]}>Korise</Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.status}>
          <SyncIcon size={16} color={syncColor} />
          <Text style={[typo.muted, { color: syncColor, fontSize: 12 }]}>{label}</Text>
          {(pending > 0 || rejected > 0) && (
            <View style={[styles.pill, { backgroundColor: rejected > 0 ? palette.danger : palette.accent }]}>
              <Text style={styles.pillText}>{pending}{rejected > 0 ? ` · ${rejected}!` : ''}</Text>
            </View>
          )}
        </View>
        <Pressable onPress={() => void syncNow()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Synchroniser maintenant">
          <RefreshCw size={16} color={palette.surface} />
        </Pressable>
        <Pressable onPress={() => void logout()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Se déconnecter">
          <LogOut size={16} color={palette.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#22242A',
    backgroundColor: palette.background,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  icon: { width: 26, height: 26, borderRadius: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  pillText: { color: palette.background, fontSize: 11, fontWeight: '700', fontFamily: typo.microLabel.fontFamily },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: '#22242A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
