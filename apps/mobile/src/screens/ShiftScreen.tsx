import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { closeShift, getOpenShift, getShiftPreview, listMyShifts, openShift, ShiftRow } from '../db/repo';
import { fetchShifts, ShiftApi } from '../api/extraApi';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, formatTime } from '../format';
import { Button, Card, Field } from '../components/ui';
import { EmptyText, KpiCard, Notice, ScreenHeader, SectionTitle } from '../components/shared';

// Mon shift (cahier fonctionnel §8 « Ouverture / clôture de shift ») : fond de caisse au départ,
// opérations rattachées, comptage final. L'écart est attribué à la bonne personne.
export function ShiftScreen({ onBack }: { onBack: () => void }) {
  const { session, refreshKey, refresh, syncNow } = useApp();
  const isOwner = session?.role === 'owner';
  const [open, setOpen] = useState<ShiftRow | null>(null);
  const [preview, setPreview] = useState<{ expected: number; sales: number; salesTotal: number } | null>(null);
  const [local, setLocal] = useState<ShiftRow[]>([]);
  const [remote, setRemote] = useState<ShiftApi[]>([]);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const current = getOpenShift();
    setOpen(current);
    setPreview(current ? getShiftPreview(current) : null);
    setLocal(listMyShifts(8));
    void fetchShifts(30).then(setRemote).catch(() => setRemote([]));
  }, [refreshKey]);

  const countedNum = Math.round(Number(counted));
  const countedValid = counted.trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0;
  const diff = preview && countedValid ? countedNum - preview.expected : null;

  const doOpen = () => {
    const n = Math.round(Number(opening));
    if (!Number.isFinite(n) || n < 0 || opening.trim() === '') return;
    openShift(n);
    setOpening('');
    setFlash('Shift ouvert — toutes tes opérations lui sont rattachées.');
    refresh();
    void syncNow();
  };

  const doClose = () => {
    if (!countedValid) return;
    closeShift(countedNum, note.trim() || null);
    setCounted('');
    setNote('');
    setFlash('Shift clôturé — l’écart éventuel apparaît dans le centre d’anomalies.');
    refresh();
    void syncNow();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Mon shift" subtitle="Ouvre ton shift avec le fond de caisse, ferme-le avec le comptage." />
      {flash ? <Notice tone="success">{flash}</Notice> : null}

      {!open ? (
        <Card>
          <Field label="Fond de caisse au départ (FCFA)" keyboardType="number-pad" value={opening} onChangeText={(v) => setOpening(v.replace(/[^0-9]/g, ''))} placeholder="ex. 10000" />
          <Button title="Ouvrir mon shift" variant="accent" onPress={doOpen} disabled={opening.trim() === ''} />
        </Card>
      ) : (
        <>
          <Text style={typo.muted}>Ouvert depuis {formatDate(open.opened_at)} {formatTime(open.opened_at)}</Text>
          <View style={styles.kpis}>
            <KpiCard label="Fond de caisse" compact value={formatFcfa(open.opening_cash)} />
            <KpiCard label="Ventes" compact value={String(preview?.sales ?? 0)} />
            <KpiCard label="Espèces attendues" compact value={formatFcfa(preview?.expected ?? open.opening_cash)} />
          </View>
          <Card>
            <Field label="Espèces comptées à la fermeture (FCFA)" keyboardType="number-pad" value={counted} onChangeText={(v) => setCounted(v.replace(/[^0-9]/g, ''))} placeholder="ex. 24500" />
            {diff !== null && (
              <Text style={[typo.heading, { color: diff === 0 ? palette.success : diff > 0 ? palette.primary : palette.danger, marginBottom: SPACING.md }]}>
                Écart : {diff > 0 ? '+' : ''}
                {formatFcfa(diff)} ({diff === 0 ? 'caisse exacte' : diff > 0 ? 'excédent' : 'manquant'})
              </Text>
            )}
            <Field label="Commentaire (optionnel)" value={note} onChangeText={setNote} />
            <Button title="Clôturer mon shift" variant="accent" onPress={doClose} disabled={!countedValid} />
          </Card>
        </>
      )}

      <SectionTitle title={isOwner ? 'Shifts de l’équipe' : 'Mes derniers shifts'} />
      {remote.length === 0 && local.length === 0 ? (
        <EmptyText label="Aucun shift enregistré." />
      ) : remote.length > 0 ? (
        remote.map((s) => (
          <View key={s.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontWeight: '600' }]}>{isOwner ? s.user_name ?? '—' : formatDate(s.opened_at)}</Text>
              <Text style={typo.muted}>
                {formatDate(s.opened_at)} {formatTime(s.opened_at)} → {s.closed_at ? formatTime(s.closed_at) : 'en cours'} · ventes {formatFcfa(s.sales_total)}
              </Text>
            </View>
            <Text style={{ fontWeight: '700', fontFamily: typo.body.fontFamily, color: s.difference == null ? palette.textMuted : s.difference === 0 ? palette.success : s.difference > 0 ? palette.primary : palette.danger }}>
              {s.difference == null ? '—' : `${s.difference > 0 ? '+' : ''}${formatFcfa(s.difference)}`}
            </Text>
          </View>
        ))
      ) : (
        local.map((s) => (
          <View key={s.client_uuid} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontWeight: '600' }]}>{formatDate(s.opened_at)} {formatTime(s.opened_at)}</Text>
              <Text style={typo.muted}>Fond {formatFcfa(s.opening_cash)} · {s.closed_at ? `compté ${formatFcfa(s.counted_cash ?? 0)}` : 'en cours'}</Text>
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
  kpis: { flexDirection: 'row', gap: SPACING.sm, marginVertical: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: palette.surface, borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.sm },
});
