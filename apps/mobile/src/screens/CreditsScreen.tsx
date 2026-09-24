import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import Search from 'lucide-react-native/icons/search';
import UserPlus from 'lucide-react-native/icons/user-plus';

import { useApp } from '../context/AppContext';
import {
  addCreditRepayment,
  addCustomer,
  customerRef,
  getCustomerBalance,
  getCustomers,
  getCustomerTransactions,
  CustomerWithBalance,
  MoneyChannel,
} from '../db/repo';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, formatTime } from '../format';
import { Button, Card, Field, Segmented } from '../components/ui';
import { EmptyText, Notice, ScreenHeader, SectionTitle } from '../components/shared';

const CHANNELS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'orange_money', label: 'Orange Money' },
] as const;

// Clients & crédits (cahier fonctionnel §8 « Crédit client ») : liste, solde dû, historique, remboursement.
export function CreditsScreen({ onBack }: { onBack: () => void }) {
  const { refreshKey, refresh, syncNow } = useApp();
  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<MoneyChannel>('cash');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setCustomers(getCustomers());
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? customers.filter((c) => c.full_name.toLowerCase().includes(q)) : customers;
    return [...list].sort((a, b) => b.balance - a.balance);
  }, [customers, query]);

  const totalDue = customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  const open = customers.find((c) => c.client_uuid === openId) ?? null;

  const showFlash = (t: string) => {
    setFlash(t);
    setTimeout(() => setFlash(null), 4000);
  };

  const create = () => {
    const row = addCustomer(newName, newPhone.trim() || null);
    if (!row) return;
    setNewName('');
    setNewPhone('');
    setShowNew(false);
    showFlash(`Client « ${row.full_name} » ajouté.`);
    refresh();
    void syncNow();
  };

  const repay = () => {
    const n = Math.round(Number(amount));
    if (!open || !Number.isFinite(n) || n <= 0) return;
    const row = addCreditRepayment(customerRef(open), n, channel, note.trim() || null);
    if (row) {
      setAmount('');
      setNote('');
      showFlash(`Remboursement enregistré : ${formatFcfa(n)}`);
      refresh();
      void syncNow();
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={open ? () => setOpenId(null) : onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ {open ? 'Tous les clients' : 'Retour'}</Text>
      </Pressable>
      <ScreenHeader title="Clients & crédits" subtitle="Ce que les clients doivent, et les remboursements reçus." />
      {flash ? <Notice tone="success">{flash}</Notice> : null}

      {!open && (
        <>
          <Card>
            <View style={styles.rowBetween}>
              <View>
                <Text style={typo.microLabel}>Dettes clients en cours</Text>
                <Text style={[typo.kpi, { fontSize: 24, color: totalDue > 0 ? palette.danger : palette.success }]}>{formatFcfa(totalDue)}</Text>
              </View>
              <Button title="Nouveau client" variant="accent" onPress={() => setShowNew((v) => !v)} />
            </View>
          </Card>

          {showNew && (
            <Card>
              <Field label="Nom du client" value={newName} onChangeText={setNewName} placeholder="ex. Maman Rose" />
              <Field label="Téléphone (optionnel)" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
              <Button title="Ajouter le client" variant="accent" onPress={create} disabled={!newName.trim()} />
            </Card>
          )}

          <View style={styles.searchBox}>
            <Search size={16} color={palette.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un client…"
              placeholderTextColor={palette.textMuted}
            />
          </View>

          {filtered.length === 0 ? (
            <EmptyText label="Aucun client. Ils apparaissent ici dès qu’une vente est faite « à crédit » ou qu’un client est ajouté." />
          ) : (
            filtered.map((c) => (
              <Pressable key={c.client_uuid} onPress={() => setOpenId(c.client_uuid)} style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typo.body, { fontWeight: '600' }]} numberOfLines={1}>{c.full_name}</Text>
                    {c.phone ? <Text style={typo.muted}>{c.phone}</Text> : null}
                  </View>
                  <Text style={[typo.kpi, { fontSize: 18, color: c.balance > 0 ? palette.danger : palette.success }]}>{formatFcfa(c.balance)}</Text>
                </View>
              </Pressable>
            ))
          )}
        </>
      )}

      {open && (
        <>
          <Card>
            <View style={styles.rowStart}>
              <HandCoins size={20} color={palette.accent} />
              <Text style={[typo.heading, { flex: 1 }]} numberOfLines={1}>{open.full_name}</Text>
            </View>
            {open.phone ? <Text style={typo.muted}>{open.phone}</Text> : null}
            <Text style={[typo.microLabel, { marginTop: SPACING.md }]}>Solde dû</Text>
            <Text style={[typo.kpi, { fontSize: 30, color: getCustomerBalance(open) > 0 ? palette.danger : palette.success }]}>
              {formatFcfa(Math.max(0, getCustomerBalance(open)))}
            </Text>
          </Card>

          <SectionTitle title="Enregistrer un remboursement" icon={<UserPlus size={16} color={palette.accent} />} />
          <Card>
            <Field label="Montant remboursé (FCFA)" keyboardType="number-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))} placeholder="ex. 5000" />
            <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Canal</Text>
            <Segmented options={CHANNELS} value={channel} onChange={setChannel} />
            <View style={{ height: SPACING.md }} />
            <Field label="Note (optionnel)" value={note} onChangeText={setNote} placeholder="ex. avance de lundi" />
            <Button title="Enregistrer le remboursement" variant="accent" onPress={repay} disabled={!amount.trim()} />
          </Card>

          <SectionTitle title="Historique" />
          {getCustomerTransactions(open).length === 0 ? (
            <EmptyText label="Aucune transaction pour ce client." />
          ) : (
            getCustomerTransactions(open).map((t, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typo.body, { fontWeight: '600', color: t.kind === 'repayment' ? palette.success : palette.text }]}>{t.label}</Text>
                    <Text style={typo.muted}>{formatDate(t.at)} {formatTime(t.at)}{t.channel ? ` · ${t.channel}` : ''}</Text>
                  </View>
                  <Text style={[typo.body, { fontWeight: '700', color: t.kind === 'repayment' ? palette.success : palette.danger }]}>
                    {t.kind === 'repayment' ? '-' : ''}
                    {formatFcfa(t.amount)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  card: {
    backgroundColor: palette.surface,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: palette.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: palette.surface,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.md, fontSize: 16, color: palette.text, fontFamily: typo.body.fontFamily },
});
