import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import {
  addDailyClosing,
  addStockMovement,
  getExpectedByChannelLocal,
  getLastClosings,
  getLowStockProducts,
  DailyClosingRow,
  ProductRow,
} from '../db/repo';
import { expectedCash } from '../api/closingApi';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, todayKey } from '../format';
import { Button, Card, Field } from '../components/ui';
import { EmptyText, Notice, ScreenHeader, SectionTitle } from '../components/shared';

const STEPS = ['Jour', 'Caisse', 'MoMo', 'Orange', 'Stock', 'Motif', 'Valider'];

// Clôture de fin de journée guidée (cahier fonctionnel §6 « clôture quotidienne intelligente ») :
// cash, Mobile Money et Orange Money réconciliés séparément, comptage des produits sous le seuil,
// motif, validation. L'attendu vient du serveur (jamais du client) — repli local hors-ligne.
export function ClosingScreen({ onBack }: { onBack: () => void }) {
  const { refreshKey, refresh, syncNow } = useApp();
  const [step, setStep] = useState(0);
  const [dateKey, setDateKey] = useState(todayKey());
  const [expected, setExpected] = useState({ cash: 0, momo: 0, orange: 0 });
  const [source, setSource] = useState<'server' | 'local'>('local');
  const [cash, setCash] = useState('');
  const [momo, setMomo] = useState('');
  const [orange, setOrange] = useState('');
  const [note, setNote] = useState('');
  const [low, setLow] = useState<ProductRow[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<DailyClosingRow[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    setHistory(getLastClosings(8));
    setLow(getLowStockProducts());
    const local = getExpectedByChannelLocal(dateKey);
    void expectedCash(dateKey)
      .then((s) => {
        if (!alive) return;
        setExpected({ cash: s.expected_cash, momo: s.expected_momo, orange: s.expected_orange });
        setSource('server');
      })
      .catch(() => {
        if (!alive) return;
        setExpected(local);
        setSource('local');
      });
    return () => {
      alive = false;
    };
  }, [dateKey, refreshKey]);

  const num = (v: string) => Math.round(Number(v));
  const valid = (v: string) => v.trim() !== '' && Number.isFinite(num(v)) && num(v) >= 0;
  const diff = (v: string, e: number) => (valid(v) ? num(v) - e : 0);
  const allValid = valid(cash) && valid(momo) && valid(orange);

  const canNext = step === 1 ? valid(cash) : step === 2 ? valid(momo) : step === 3 ? valid(orange) : step === 6 ? allValid : true;

  const submit = () => {
    if (!allValid) return;
    addDailyClosing(dateKey, expected, { cash: num(cash), momo: num(momo), orange: num(orange) }, note.trim() || null);
    for (const p of low) {
      const raw = counts[p.id];
      if (raw === undefined || raw.trim() === '') continue;
      const real = Math.round(Number(raw));
      if (!Number.isFinite(real) || real < 0 || real === p.quantity) continue;
      addStockMovement(p.id, 'adjustment', real - p.quantity, `Comptage à la clôture du ${formatDate(dateKey)}`);
    }
    setCash('');
    setMomo('');
    setOrange('');
    setNote('');
    setCounts({});
    setStep(0);
    setSaved(true);
    refresh();
    void syncNow();
  };

  const tone = (d: number) => (d === 0 ? palette.success : d > 0 ? palette.primary : palette.danger);

  const channelStep = (label: string, exp: number, value: string, setValue: (v: string) => void, placeholder: string) => (
    <Card>
      <Text style={typo.microLabel}>{label} attendu</Text>
      <Text style={[typo.kpi, { fontSize: 26, marginBottom: SPACING.md }]}>{formatFcfa(exp)}</Text>
      <Field label="Montant constaté (FCFA)" keyboardType="number-pad" value={value} onChangeText={(v) => setValue(v.replace(/[^0-9]/g, ''))} placeholder={placeholder} />
      {valid(value) && (
        <Text style={[typo.heading, { color: tone(diff(value, exp)) }]}>
          Écart : {diff(value, exp) > 0 ? '+' : ''}
          {formatFcfa(diff(value, exp))} ({diff(value, exp) === 0 ? 'exact' : diff(value, exp) > 0 ? 'excédent' : 'manquant'})
        </Text>
      )}
    </Card>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Clôture de fin de journée" subtitle="Cash, Mobile Money et Orange Money sont réconciliés séparément." />
      {saved ? <Notice tone="success">Clôture enregistrée. Un écart éventuel apparaît dans le centre d’anomalies.</Notice> : null}

      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <Pressable
            key={s}
            onPress={() => i < step && setStep(i)}
            style={[styles.step, i === step && { backgroundColor: palette.background, borderColor: palette.surface }, i < step && { backgroundColor: palette.accentLight }]}
          >
            <Text style={[typo.muted, { fontSize: 11, color: i === step ? palette.surface : i < step ? palette.background : palette.textMuted, fontWeight: '700' }]}>
              {i + 1}. {s}
            </Text>
          </Pressable>
        ))}
      </View>

      {step === 0 && (
        <Card>
          <Field label="Journée concernée (AAAA-MM-JJ)" value={dateKey} onChangeText={setDateKey} />
          <Text style={typo.body}>Cash attendu : <Text style={{ fontWeight: '700' }}>{formatFcfa(expected.cash)}</Text></Text>
          <Text style={typo.body}>Mobile Money attendu : <Text style={{ fontWeight: '700' }}>{formatFcfa(expected.momo)}</Text></Text>
          <Text style={typo.body}>Orange Money attendu : <Text style={{ fontWeight: '700' }}>{formatFcfa(expected.orange)}</Text></Text>
          <Text style={[typo.muted, { marginTop: SPACING.sm }]}>
            {source === 'server' ? 'Calculés par le serveur à partir des mouvements du jour.' : 'Hors-ligne : calcul local temporaire, à réconcilier à la synchro.'}
          </Text>
        </Card>
      )}
      {step === 1 && channelStep('Caisse physique', expected.cash, cash, setCash, 'ex. 45000')}
      {step === 2 && channelStep('Mobile Money', expected.momo, momo, setMomo, 'ex. 18500')}
      {step === 3 && channelStep('Orange Money', expected.orange, orange, setOrange, 'ex. 9000')}
      {step === 4 && (
        <Card>
          <Text style={[typo.heading, { marginBottom: SPACING.sm }]}>Comptage du stock sensible</Text>
          {low.length === 0 ? (
            <Text style={typo.muted}>Aucun produit sous son seuil d’alerte : rien à compter aujourd’hui.</Text>
          ) : (
            <>
              <Text style={[typo.muted, { marginBottom: SPACING.md }]}>Compte ces produits en rayon. Laisse vide pour ne pas vérifier : un écart crée un ajustement tracé.</Text>
              {low.map((p) => {
                const raw = counts[p.id];
                const real = raw === undefined || raw.trim() === '' ? null : Math.round(Number(raw));
                const gap = real === null || !Number.isFinite(real) ? null : real - p.quantity;
                return (
                  <View key={p.id} style={styles.stockRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[typo.body, { fontWeight: '600' }]}>{p.name}</Text>
                      <Text style={typo.muted}>Attendu : {p.quantity} (seuil {p.minimum_stock})</Text>
                    </View>
                    <View style={{ width: 100 }}>
                      <Field keyboardType="number-pad" value={raw ?? ''} placeholder="Compté" onChangeText={(v) => setCounts({ ...counts, [p.id]: v.replace(/[^0-9]/g, '') })} />
                    </View>
                    {gap !== null && <Text style={{ fontWeight: '700', color: gap === 0 ? palette.success : palette.danger }}>{gap > 0 ? '+' : ''}{gap}</Text>}
                  </View>
                );
              })}
            </>
          )}
        </Card>
      )}
      {step === 5 && (
        <Card>
          <Field label="Motif de l’écart (optionnel)" value={note} onChangeText={setNote} placeholder="ex. 6000 payés au fournisseur non saisi" />
          <Text style={typo.muted}>Ne rien saisir si l’écart a déjà été expliqué par un mouvement enregistré.</Text>
        </Card>
      )}
      {step === 6 && (
        <Card>
          {([['Cash', expected.cash, cash], ['Mobile Money', expected.momo, momo], ['Orange Money', expected.orange, orange]] as const).map(([label, e, v]) => (
            <View key={label} style={styles.sumRow}>
              <Text style={[typo.body, { flex: 1, fontWeight: '600' }]}>{label}</Text>
              <Text style={typo.muted}>{formatFcfa(e)} → {valid(v) ? formatFcfa(num(v)) : '—'}</Text>
              <Text style={{ fontWeight: '700', color: tone(diff(v, e)), minWidth: 90, textAlign: 'right' }}>{formatFcfa(diff(v, e))}</Text>
            </View>
          ))}
          {note.trim() ? <Text style={[typo.muted, { marginTop: SPACING.sm }]}>Motif : {note.trim()}</Text> : null}
          <View style={{ marginTop: SPACING.md }}>
            <Button title="Valider la clôture (hors-ligne)" variant="accent" onPress={submit} disabled={!allValid} />
          </View>
        </Card>
      )}

      <View style={styles.nav}>
        <View style={{ flex: 1 }}>
          <Button title="Précédent" variant="secondary" onPress={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} />
        </View>
        {step < STEPS.length - 1 && (
          <View style={{ flex: 1 }}>
            <Button title="Suivant" variant="accent" onPress={() => setStep((s) => s + 1)} disabled={!canNext} />
          </View>
        )}
      </View>

      <SectionTitle title="Historique des clôtures" />
      {history.length === 0 ? (
        <EmptyText label="Aucune clôture enregistrée." />
      ) : (
        history.map((c) => (
          <View key={c.client_uuid} style={styles.histRow}>
            <Text style={[typo.body, { fontWeight: '600', flex: 1 }]}>{formatDate(c.closing_date)}</Text>
            <Text style={{ color: tone(c.difference), fontWeight: '700', fontFamily: typo.body.fontFamily }}>cash {c.difference > 0 ? '+' : ''}{formatFcfa(c.difference)}</Text>
            {c.difference_momo != null && <Text style={{ color: tone(c.difference_momo), fontFamily: typo.body.fontFamily }}> · MoMo {formatFcfa(c.difference_momo)}</Text>}
            {c.difference_orange != null && <Text style={{ color: tone(c.difference_orange), fontFamily: typo.body.fontFamily }}> · OM {formatFcfa(c.difference_orange)}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  step: { borderRadius: 999, borderWidth: 1, borderColor: '#22242A', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, backgroundColor: '#15161A' },
  nav: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: palette.border, paddingVertical: SPACING.sm },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: palette.border },
  histRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: RADIUS.field,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
});
