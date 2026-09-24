import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { fetchAnomalies, fetchAnomalyOperations, resolveAnomaly, AnomalyApi, RelatedOperationApi } from '../api/extraApi';
import { sharePdf } from '../pdf';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, formatTime } from '../format';
import { Badge, Button, Card, Field } from '../components/ui';
import { EmptyText, Notice, ScreenHeader } from '../components/shared';

const KIND: Record<AnomalyApi['kind'], string> = {
  closing_gap: 'Clôture',
  shift_gap: 'Shift',
  stock_adjustment: 'Stock',
  price_deviation: 'Prix',
};

// Centre d'anomalies (propriétaire) : « qu'est-ce qui nécessite mon attention ? » — montant, cause
// probable, opérations liées, résolution. Nécessite le réseau (calculé par le serveur).
export function AnomaliesScreen({ onBack }: { onBack: () => void }) {
  const { session, refreshKey } = useApp();
  const isOwner = session?.role === 'owner';
  const [items, setItems] = useState<AnomalyApi[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ops, setOps] = useState<RelatedOperationApi[] | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setError(null);
    fetchAnomalies(days, true)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Chargement impossible (connexion requise)'));
  }, [days]);

  useEffect(() => {
    if (isOwner) load();
  }, [load, refreshKey, isOwner]);

  const keyOf = (a: AnomalyApi) => `${a.kind}:${a.source_id}`;
  const amountText = (a: AnomalyApi) => (a.amount == null ? '' : a.kind === 'stock_adjustment' ? `${a.amount} unité(s)` : `${a.amount > 0 ? '+' : ''}${formatFcfa(a.amount)}`);

  const toggle = async (a: AnomalyApi) => {
    const k = keyOf(a);
    if (openKey === k) return setOpenKey(null);
    setOpenKey(k);
    setOps(null);
    try {
      setOps(await fetchAnomalyOperations(a.kind, a.source_id));
    } catch {
      setOps([]);
    }
  };

  const resolve = async (a: AnomalyApi) => {
    await resolveAnomaly(a.kind, a.source_id, note.trim() || null);
    setNoteFor(null);
    setNote('');
    load();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Anomalies" subtitle="Écarts de caisse, ajustements sans motif, prix inhabituels — à traiter." />

      {!isOwner ? (
        <Notice tone="warning">Le centre d’anomalies est réservé au propriétaire.</Notice>
      ) : (
        <>
          <View style={styles.periods}>
            {[7, 14, 30].map((d) => (
              <Pressable key={d} onPress={() => setDays(d)} style={[styles.period, days === d && { backgroundColor: palette.accent }]}>
                <Text style={[typo.muted, { fontWeight: '700', color: days === d ? palette.background : palette.textMuted }]}>{d} j</Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Button title="Rapport PDF" variant="secondary" onPress={() => void sharePdf(`/reports/anomalies.pdf?days=${days}`, 'anomalies.pdf').catch((e) => setError(e.message))} />
          </View>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {items.length === 0 && !error ? <Notice tone="success">Aucune anomalie à traiter sur la période.</Notice> : null}

          {items.map((a) => {
            const k = keyOf(a);
            return (
              <Card key={k}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                      <Badge label={KIND[a.kind]} tone="primary" />
                      <Text style={typo.muted}>{formatDate(a.date)}</Text>
                    </View>
                    <Text style={[typo.body, { fontWeight: '700' }]}>{a.label}</Text>
                    {a.detail ? <Text style={typo.muted}>{a.detail}</Text> : null}
                    {a.probable_cause ? <Text style={[typo.muted, { color: palette.text }]}>Cause probable : {a.probable_cause}</Text> : null}
                    {a.user_name ? <Text style={typo.muted}>Utilisateur : {a.user_name}</Text> : null}
                  </View>
                  <Text style={[typo.kpi, { fontSize: 18, color: (a.amount ?? 0) < 0 ? palette.danger : palette.primary }]}>{amountText(a)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Opérations liées" variant="secondary" onPress={() => void toggle(a)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Résolue" variant="accent" onPress={() => setNoteFor(noteFor === k ? null : k)} />
                  </View>
                </View>
                {noteFor === k && (
                  <View style={{ marginTop: SPACING.md }}>
                    <Field label="Explication (optionnel)" value={note} onChangeText={setNote} placeholder="ex. dépense fournisseur non saisie" />
                    <Button title="Valider la résolution" variant="accent" onPress={() => void resolve(a)} />
                  </View>
                )}
                {openKey === k && (
                  <View style={{ marginTop: SPACING.md }}>
                    {ops === null ? (
                      <Text style={typo.muted}>Chargement…</Text>
                    ) : ops.length === 0 ? (
                      <EmptyText label="Aucune opération trouvée." />
                    ) : (
                      ops.map((o, i) => (
                        <View key={i} style={styles.op}>
                          <View style={{ flex: 1 }}>
                            <Text style={[typo.body, { fontSize: 14 }]}>{o.label}</Text>
                            <Text style={typo.muted}>{formatDate(o.at)} {formatTime(o.at)}{o.user_name ? ` · ${o.user_name}` : ''}</Text>
                          </View>
                          {o.amount != null && <Text style={{ fontWeight: '700', color: o.amount < 0 ? palette.danger : palette.text }}>{a.kind === 'stock_adjustment' ? o.amount : formatFcfa(o.amount)}</Text>}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  periods: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  period: { borderRadius: RADIUS.field, borderWidth: 1, borderColor: '#22242A', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: '#15161A' },
  op: { flexDirection: 'row', gap: SPACING.sm, borderTopWidth: 1, borderTopColor: palette.border, paddingVertical: SPACING.sm },
});
