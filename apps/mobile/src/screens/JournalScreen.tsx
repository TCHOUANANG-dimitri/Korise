import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { fetchAuditLog, AuditEntry } from '../api/auditApi';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatTime } from '../format';
import { EmptyText, Notice, ScreenHeader } from '../components/shared';

// Journal d'audit (propriétaire) : qui a fait quoi, quand — même contenu que le web.
export function JournalScreen({ onBack }: { onBack: () => void }) {
  const { session } = useApp();
  const isOwner = session?.role === 'owner';
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    fetchAuditLog(120)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Journal indisponible (connexion requise)'));
  }, [isOwner]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Journal" subtitle="Qui a fait quoi, quand — chaque action sensible est tracée." />
      {!isOwner ? <Notice tone="warning">Le journal est réservé au propriétaire.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {isOwner && rows.length === 0 && !error ? <EmptyText label="Aucune action enregistrée." /> : null}
      {rows.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[typo.body, { fontWeight: '600', fontSize: 14 }]}>{r.label ?? r.action}</Text>
            <Text style={typo.muted}>{r.user_full_name}</Text>
          </View>
          <Text style={typo.muted}>{formatDate(r.created_at)} {formatTime(r.created_at)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  row: { flexDirection: 'row', gap: SPACING.md, backgroundColor: palette.surface, borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.xs },
});
