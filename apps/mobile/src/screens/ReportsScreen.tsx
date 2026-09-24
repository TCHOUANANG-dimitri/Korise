import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { fetchReportSummary, ReportSummaryApi } from '../api/extraApi';
import { sharePdf } from '../pdf';
import { PAYMENT_METHOD_LABELS } from '../config';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatFcfa } from '../format';
import { Button, Card } from '../components/ui';
import { EmptyText, KpiCard, Notice, ScreenHeader, SectionTitle } from '../components/shared';

function dayKey(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PERIODS = [
  { label: 'Aujourd’hui', days: 0 },
  { label: '7 jours', days: 6 },
  { label: '30 jours', days: 29 },
];

// Rapports essentiels (cahier fonctionnel §15) : chiffres par période + PDF brandés. Réservé aux
// comptes avec accès au tableau de bord.
export function ReportsScreen({ onBack }: { onBack: () => void }) {
  const { session } = useApp();
  const canView = session?.role === 'owner' || !!session?.can_view_owner_dashboard;
  const isOwner = session?.role === 'owner';
  const [period, setPeriod] = useState(1);
  const [data, setData] = useState<ReportSummaryApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    setError(null);
    fetchReportSummary(dayKey(PERIODS[period].days), dayKey(0))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Rapport indisponible (connexion requise)'));
  }, [period, canView]);

  const pdf = async (key: string, path: string, name: string) => {
    setBusy(key);
    setError(null);
    try {
      await sharePdf(path, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF indisponible');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={[typo.muted, { color: palette.accent, marginBottom: SPACING.sm }]}>‹ Retour</Text>
      </Pressable>
      <ScreenHeader title="Rapports" subtitle="Ventes, paiements, dépenses, crédits — et PDF brandés à partager." />

      {!canView ? (
        <Notice tone="warning">Les rapports demandent l’accès au tableau de bord (permission à donner par le propriétaire).</Notice>
      ) : (
        <>
          <View style={styles.periods}>
            {PERIODS.map((p, i) => (
              <Pressable key={p.label} onPress={() => setPeriod(i)} style={[styles.period, period === i && { backgroundColor: palette.accent }]}>
                <Text style={[typo.muted, { fontWeight: '700', color: period === i ? palette.background : palette.textMuted }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Notice tone="danger">{error}</Notice> : null}

          {data && (
            <>
              <View style={styles.kpis}>
                <KpiCard label="Chiffre d’affaires" value={formatFcfa(data.sales_total)} sub={undefined} />
                <KpiCard label="Ventes" value={String(data.sales_count)} />
                <KpiCard label="Dépenses" value={formatFcfa(data.expenses_total)} tone="danger" />
                <KpiCard label="Dettes clients" value={formatFcfa(data.credit_outstanding)} tone={data.credit_outstanding > 0 ? 'danger' : undefined} />
              </View>
              {data.estimated_profit !== null && (
                <Text style={[typo.body, { color: palette.surface, marginVertical: SPACING.sm }]}>
                  Bénéfice estimé : <Text style={{ fontWeight: '700', color: data.estimated_profit < 0 ? palette.danger : palette.success }}>{formatFcfa(data.estimated_profit)}</Text>
                </Text>
              )}

              <SectionTitle title="Par moyen de paiement" />
              {data.by_payment.length === 0 ? <EmptyText label="Aucune vente." /> : (
                <Card>
                  {data.by_payment.map((r) => (
                    <View key={r.key} style={styles.line}>
                      <Text style={[typo.body, { flex: 1 }]}>{PAYMENT_METHOD_LABELS[r.key as keyof typeof PAYMENT_METHOD_LABELS] ?? r.key}</Text>
                      <Text style={typo.muted}>{r.count} vente(s)</Text>
                      <Text style={[typo.body, { fontWeight: '700', minWidth: 110, textAlign: 'right' }]}>{formatFcfa(r.total)}</Text>
                    </View>
                  ))}
                </Card>
              )}
              <SectionTitle title="Top produits" />
              {data.by_product.slice(0, 6).map((r) => (
                <View key={r.key} style={styles.line2}>
                  <Text style={[typo.body, { flex: 1 }]} numberOfLines={1}>{r.key}</Text>
                  <Text style={typo.muted}>{r.quantity} u.</Text>
                  <Text style={[typo.body, { fontWeight: '700', minWidth: 110, textAlign: 'right' }]}>{formatFcfa(r.total)}</Text>
                </View>
              ))}
              {isOwner && data.by_employee.length > 0 && (
                <>
                  <SectionTitle title="Par employé" />
                  {data.by_employee.map((r) => (
                    <View key={r.key} style={styles.line2}>
                      <Text style={[typo.body, { flex: 1 }]} numberOfLines={1}>{r.key}</Text>
                      <Text style={typo.muted}>{r.count} vente(s)</Text>
                      <Text style={[typo.body, { fontWeight: '700', minWidth: 110, textAlign: 'right' }]}>{formatFcfa(r.total)}</Text>
                    </View>
                  ))}
                </>
              )}
              {data.expenses_by_category.length > 0 && (
                <>
                  <SectionTitle title="Dépenses par catégorie" />
                  {data.expenses_by_category.map((r) => (
                    <View key={r.key} style={styles.line2}>
                      <Text style={[typo.body, { flex: 1 }]}>{r.key}</Text>
                      <Text style={[typo.body, { fontWeight: '700' }]}>{formatFcfa(r.total)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <SectionTitle title="PDF à partager" />
          <View style={{ gap: SPACING.sm }}>
            <Button title={busy === 'daily' ? 'Génération…' : 'Rapport journalier'} variant="secondary" onPress={() => void pdf('daily', `/reports/daily.pdf?day=${dayKey(0)}`, 'rapport-journalier.pdf')} disabled={busy !== null} />
            <Button title={busy === 'stock' ? 'Génération…' : 'Rapport de stock'} variant="secondary" onPress={() => void pdf('stock', '/reports/stock.pdf', 'rapport-stock.pdf')} disabled={busy !== null} />
            {isOwner && <Button title={busy === 'anom' ? 'Génération…' : 'Rapport des anomalies'} variant="secondary" onPress={() => void pdf('anom', '/reports/anomalies.pdf?days=30', 'rapport-anomalies.pdf')} disabled={busy !== null} />}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  periods: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  period: { borderRadius: RADIUS.field, borderWidth: 1, borderColor: '#22242A', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: '#15161A' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  line2: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: palette.surface, borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.xs },
});
