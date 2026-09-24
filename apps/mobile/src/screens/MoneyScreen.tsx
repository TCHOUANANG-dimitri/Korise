import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ArrowDownCircle from 'lucide-react-native/icons/circle-arrow-down';
import ArrowUpCircle from 'lucide-react-native/icons/circle-arrow-up';
import Wallet from 'lucide-react-native/icons/wallet';

import { useApp } from '../context/AppContext';
import {
  addCreditRepayment,
  addMoneyMovement,
  customerRef,
  getMoneyMovementsToday,
  CustomerWithBalance,
  MoneyChannel,
  MoneyKind,
  MoneyMovementRow,
} from '../db/repo';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatFcfa, formatTime } from '../format';
import { Button, Card, Field, Segmented } from '../components/ui';
import { CustomerPicker } from '../components/CustomerPicker';
import { EmptyText, KpiCard, Notice, ScreenHeader, SectionTitle } from '../components/shared';

// Mêmes types, libellés et exemples de motif que l'écran « Argent » du web.
const KINDS: { value: MoneyKind; label: string; hint: string }[] = [
  { value: 'income', label: 'Entrée', hint: 'ex. apport personnel, remboursement' },
  { value: 'expense', label: 'Dépense', hint: 'ex. achat de sachets, transport' },
  { value: 'withdrawal', label: 'Retrait', hint: 'ex. retrait du patron pour lui-même' },
];

const CHANNELS: { value: MoneyChannel; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'orange_money', label: 'Orange Money' },
];

const labelOf = (type: MoneyMovementRow['type']) => {
  if (type === 'credit_repayment') return 'Remboursement crédit';
  return KINDS.find((k) => k.value === type)?.label ?? type;
};

const EXPENSE_CATEGORIES = ['Fournisseur', 'Transport', 'Loyer', 'Salaire', 'Électricité / eau', 'Autre'];

export function MoneyScreen() {
  const { refreshKey, refresh } = useApp();
  const [kind, setKind] = useState<MoneyKind>('expense');
  const [channel, setChannel] = useState<MoneyChannel>('cash');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [today, setToday] = useState<MoneyMovementRow[]>([]);
  const [repayCustomer, setRepayCustomer] = useState<CustomerWithBalance | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayChannel, setRepayChannel] = useState<MoneyChannel>('cash');

  const reload = () => setToday(getMoneyMovementsToday().filter((r) => r.type !== 'sale'));

  useEffect(() => {
    reload();
  }, [refreshKey]);

  const n = Math.round(Number(amount));
  const valid = Number.isFinite(n) && n > 0;

  const submit = () => {
    if (!valid) return;
    const row = addMoneyMovement(kind, n, reason.trim() || null, channel, kind === 'expense' ? category : null);
    if (row) {
      setAmount('');
      setReason('');
      setCategory(null);
      reload();
      refresh();
      setFlash(`${labelOf(kind)} enregistrée : ${formatFcfa(n)}`);
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const repayNum = Math.round(Number(repayAmount));
  const repayValid = repayCustomer !== null && Number.isFinite(repayNum) && repayNum > 0;

  const submitRepayment = () => {
    if (!repayValid || !repayCustomer) return;
    const row = addCreditRepayment(customerRef(repayCustomer), repayNum, repayChannel, null);
    if (row) {
      setFlash(`Remboursement enregistré : ${formatFcfa(repayNum)} — ${repayCustomer.full_name}`);
      setTimeout(() => setFlash(null), 4000);
      setRepayCustomer(null);
      setRepayAmount('');
      reload();
      refresh();
    }
  };

  const total = (type: MoneyKind) =>
    today.filter((r) => r.type === type).reduce((a, r) => a + Math.abs(r.amount), 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Argent"
        subtitle="Entrée, dépense ou retrait — hors ventes, qui alimentent la caisse automatiquement."
      />

      <View style={styles.kpiRow}>
        <KpiCard icon={<ArrowUpCircle size={14} color={palette.textMuted} />} label="Entrées" compact value={formatFcfa(total('income'))} tone="success" />
        <KpiCard icon={<ArrowDownCircle size={14} color={palette.textMuted} />} label="Dépenses" compact value={formatFcfa(total('expense'))} tone="danger" />
        <KpiCard icon={<Wallet size={14} color={palette.textMuted} />} label="Retraits" compact value={formatFcfa(total('withdrawal'))} tone="danger" />
      </View>

      {flash ? <Notice tone="success">{flash}</Notice> : null}

      <Card>
        <Segmented options={KINDS} value={kind} onChange={setKind} />

        <View style={{ height: SPACING.md }} />
        <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Canal</Text>
        <Segmented options={CHANNELS} value={channel} onChange={setChannel} />

        {kind === 'expense' && (
          <>
            <View style={{ height: SPACING.md }} />
            <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Catégorie</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(category === c ? null : c)}
                  style={{
                    borderWidth: 1,
                    borderColor: category === c ? palette.background : palette.border,
                    backgroundColor: category === c ? palette.background : palette.surface,
                    borderRadius: 999,
                    paddingHorizontal: SPACING.md,
                    paddingVertical: SPACING.xs + 2,
                  }}
                >
                  <Text style={[typo.muted, { color: category === c ? palette.surface : palette.textMuted, fontWeight: '600' }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.divider} />

        <Field
          label="Montant (FCFA)"
          keyboardType="number-pad"
          placeholder="ex. 2000"
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
        />
        <Field
          label="Motif"
          placeholder={KINDS.find((k) => k.value === kind)?.hint}
          value={reason}
          onChangeText={setReason}
        />

        <Button title="Enregistrer (hors-ligne)" variant="accent" onPress={submit} disabled={!valid} />
      </Card>

      <SectionTitle title="Rembourser un crédit" />
      <Card>
        <CustomerPicker selected={repayCustomer} onSelect={setRepayCustomer} label="Client qui rembourse" />
        {repayCustomer && (
          <>
            <Field
              label="Montant remboursé (FCFA)"
              keyboardType="number-pad"
              placeholder="ex. 5000"
              value={repayAmount}
              onChangeText={(v) => setRepayAmount(v.replace(/[^0-9]/g, ''))}
            />
            <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Canal</Text>
            <Segmented options={CHANNELS} value={repayChannel} onChange={setRepayChannel} />
            <View style={{ height: SPACING.md }} />
            <Button title="Enregistrer le remboursement" variant="accent" onPress={submitRepayment} disabled={!repayValid} />
          </>
        )}
      </Card>

      <SectionTitle title="Mouvements du jour" />
      {today.length === 0 ? (
        <EmptyText label="Aucun mouvement manuel aujourd’hui." />
      ) : (
        today.slice(0, 30).map((m) => (
          <View key={m.client_uuid} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontSize: 15, fontWeight: '600' }]}>{labelOf(m.type)}</Text>
              {m.reason ? <Text style={typo.muted}>{m.reason}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typo.kpi, { fontSize: 16, color: m.amount >= 0 ? palette.success : palette.danger }]}>
                {m.amount >= 0 ? '+' : ''}
                {formatFcfa(m.amount)}
              </Text>
              <Text style={typo.muted}>{formatTime(m.created_at)}</Text>
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
  kpiRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: SPACING.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: palette.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
});
