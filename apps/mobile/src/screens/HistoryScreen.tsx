import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { getMyOperations, MyOperation } from '../db/repo';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, formatTime } from '../format';
import { Badge } from '../components/ui';
import { EmptyText, ScreenHeader } from '../components/shared';

// Historique personnel (cahier fonctionnel §8) : mes opérations et leur statut de synchronisation.
export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const { refreshKey } = useApp();
  const [ops, setOps] = useState<MyOperation[]>([]);

  useEffect(() => {
    setOps(getMyOperations(80));
  }, [refreshKey]);

  const pending = ops.filter((o) => o.sync === 'pending').length;
  const rejected = ops.filter((o) => o.sync === 'rejected').length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader
        title="Mon historique"
        subtitle={`${ops.length} opération(s) — ${pending} en attente d’envoi${rejected > 0 ? `, ${rejected} refusée(s)` : ''}.`}
      />
      {ops.length === 0 ? (
        <EmptyText label="Aucune opération enregistrée sur cet appareil." />
      ) : (
        ops.map((o) => (
          <View key={o.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontWeight: '600' }]} numberOfLines={2}>{o.label}</Text>
              <Text style={typo.muted}>{formatDate(o.at)} {formatTime(o.at)}</Text>
              {o.error ? <Text style={[typo.muted, { color: palette.danger }]} numberOfLines={2}>{o.error}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {o.amount !== null && (
                <Text style={[typo.body, { fontWeight: '700', color: o.amount < 0 ? palette.danger : palette.text }]}>
                  {o.kind === 'stock' ? o.amount : formatFcfa(o.amount)}
                </Text>
              )}
              <Badge label={o.sync === 'synced' ? 'Synchronisée' : o.sync === 'pending' ? 'En attente' : 'Refusée'} tone={o.sync === 'synced' ? 'success' : o.sync === 'pending' ? 'warning' : 'danger'} />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  row: { flexDirection: 'row', gap: SPACING.md, backgroundColor: palette.surface, borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.sm },
});
