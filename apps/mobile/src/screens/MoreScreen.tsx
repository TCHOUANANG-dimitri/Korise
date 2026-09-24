import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BarChart3 from 'lucide-react-native/icons/chart-column';
import ClipboardCheck from 'lucide-react-native/icons/clipboard-check';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import History from 'lucide-react-native/icons/rotate-ccw-clock';
import Settings from 'lucide-react-native/icons/settings';
import ScrollText from 'lucide-react-native/icons/scroll-text';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Timer from 'lucide-react-native/icons/timer';
import Users from 'lucide-react-native/icons/users';

import { useApp } from '../context/AppContext';
import { fetchAnomalies } from '../api/extraApi';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { ScreenHeader } from '../components/shared';

export type SubScreen = 'credits' | 'closing' | 'shift' | 'history' | 'anomalies' | 'reports' | 'team' | 'journal' | 'settings';

interface Item {
  key: SubScreen;
  label: string;
  hint: string;
  Icon: typeof HandCoins;
  show: boolean;
}

// Menu « Plus » : toutes les fonctionnalités du cahier fonctionnel qui ne tiennent pas dans les
// onglets de saisie rapide — mêmes écrans, mêmes règles que le web.
export function MoreScreen({ open }: { open: (s: SubScreen) => void }) {
  const { session } = useApp();
  const isOwner = session?.role === 'owner';
  const canReports = isOwner || !!session?.can_view_owner_dashboard;
  const [anomalies, setAnomalies] = useState<number | null>(null);

  useEffect(() => {
    if (isOwner) void fetchAnomalies(14, true).then((a) => setAnomalies(a.length)).catch(() => setAnomalies(null));
  }, [isOwner]);

  const items: Item[] = [
    { key: 'credits', label: 'Clients & crédits', hint: 'Dettes, remboursements, historique client', Icon: HandCoins, show: true },
    { key: 'shift', label: 'Mon shift', hint: 'Fond de caisse, comptage final', Icon: Timer, show: true },
    { key: 'closing', label: 'Clôture de journée', hint: 'Cash, Mobile Money, Orange Money, stock', Icon: ClipboardCheck, show: true },
    { key: 'history', label: 'Mon historique', hint: 'Mes opérations et leur synchronisation', Icon: History, show: true },
    { key: 'anomalies', label: 'Anomalies', hint: anomalies ? `${anomalies} à traiter` : 'Écarts et situations à vérifier', Icon: ShieldAlert, show: isOwner },
    { key: 'reports', label: 'Rapports', hint: 'Chiffres par période et PDF brandés', Icon: BarChart3, show: canReports },
    { key: 'team', label: 'Équipe', hint: 'Employés, permissions, rapports', Icon: Users, show: isOwner },
    { key: 'journal', label: 'Journal', hint: 'Qui a fait quoi, quand', Icon: ScrollText, show: isOwner },
    { key: 'settings', label: 'Paramètres', hint: 'Entreprise, verrouillage, appareil', Icon: Settings, show: true },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Plus" subtitle="Tout Korise, sur ton téléphone comme sur le web." />
      {items
        .filter((i) => i.show)
        .map(({ key, label, hint, Icon }) => (
          <Pressable key={key} onPress={() => open(key)} style={styles.row}>
            <View style={styles.icon}>
              <Icon size={22} color={palette.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontWeight: '700' }]}>{label}</Text>
              <Text style={typo.muted}>{hint}</Text>
            </View>
            <Text style={[typo.heading, { color: palette.textMuted }]}>›</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: palette.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  icon: { width: 40, height: 40, borderRadius: RADIUS.field, backgroundColor: '#15161A', alignItems: 'center', justifyContent: 'center' },
});
