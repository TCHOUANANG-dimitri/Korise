import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { getCashTotal, getLowStockProducts, getMoneyMovementsToday, getPendingOutbox, getRejectedOutbox, getSalesToday, ProductRow } from '../db/repo';
import { dailyDashboard, DashboardOut } from '../api/closingApi';
import { fetchAnomalies, fetchReportSummary, ReportSummaryApi } from '../api/extraApi';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatDate, formatFcfa, todayKey } from '../format';
import { Card } from '../components/ui';
import { EmptyText, KpiCard, Notice, ScreenHeader, SectionTitle } from '../components/shared';

// Accueil / activité (cahier fonctionnel §15, menu Android) : ce qui compte aujourd'hui, calculé
// localement (donc disponible hors-ligne) et enrichi par le serveur quand la connexion et les
// permissions le permettent (dettes clients, bénéfice estimé, anomalies, top produits).
export function HomeScreen({ goto }: { goto: (screen: string) => void }) {
  const { session, refreshKey, syncState } = useApp();
  const isOwner = session?.role === 'owner';
  const canDash = isOwner || !!session?.can_view_owner_dashboard;
  const [salesTotal, setSalesTotal] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [cash, setCash] = useState(0);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [low, setLow] = useState<ProductRow[]>([]);
  const [dash, setDash] = useState<DashboardOut | null>(null);
  const [summary, setSummary] = useState<ReportSummaryApi | null>(null);
  const [anomalies, setAnomalies] = useState<number | null>(null);

  useEffect(() => {
    setSalesTotal(getSalesToday().reduce((a, s) => a + s.total_amount, 0));
    setExpenses(getMoneyMovementsToday().filter((m) => m.amount < 0).reduce((a, m) => a + Math.abs(m.amount), 0));
    setCash(getCashTotal());
    setPending(getPendingOutbox().length);
    setRejected(getRejectedOutbox().length);
    setLow(getLowStockProducts());
  }, [refreshKey]);

  useEffect(() => {
    if (!canDash) return;
    void dailyDashboard(todayKey()).then(setDash).catch(() => setDash(null));
    void fetchReportSummary(todayKey(), todayKey()).then(setSummary).catch(() => setSummary(null));
    if (isOwner) void fetchAnomalies(14, true).then((a) => setAnomalies(a.length)).catch(() => setAnomalies(null));
  }, [canDash, isOwner, refreshKey]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title={`Aujourd’hui — ${formatDate(new Date().toISOString())}`} subtitle="Est-ce que l’argent et le stock correspondent à ce qu’il devrait y avoir ?" />

      {syncState.phase === 'error' && <Notice tone="warning">Hors-ligne ou erreur de synchro — les saisies restent enregistrées sur l’appareil.</Notice>}
      {rejected > 0 && <Notice tone="danger">{rejected} opération(s) refusée(s) par le serveur — voir « Mon historique ».</Notice>}

      <View style={styles.kpis}>
        <KpiCard label="Ventes du jour" value={formatFcfa(dash ? dash.sales_total : salesTotal)} />
        <KpiCard label="Dépenses du jour" value={formatFcfa(dash ? dash.expense_total + dash.withdrawal_total : expenses)} tone="danger" />
        <KpiCard label="Caisse" value={formatFcfa(dash ? dash.expected_cash : cash)} />
        <KpiCard label="En attente de sync" value={String(pending)} tone={rejected > 0 ? 'danger' : undefined} />
      </View>

      {(summary || anomalies !== null) && (
        <View style={[styles.kpis, { marginTop: SPACING.sm }]}>
          {summary && <KpiCard label="Dettes clients" value={formatFcfa(summary.credit_outstanding)} tone={summary.credit_outstanding > 0 ? 'danger' : undefined} />}
          {summary && summary.estimated_profit !== null && <KpiCard label="Bénéfice estimé" value={formatFcfa(summary.estimated_profit)} />}
          {anomalies !== null && <KpiCard label="Anomalies à traiter" value={String(anomalies)} tone={anomalies > 0 ? 'danger' : undefined} sub={anomalies > 0 ? 'Voir dans « Plus »' : undefined} />}
        </View>
      )}

      <SectionTitle title="Alertes de stock" />
      {low.length === 0 ? (
        <EmptyText label="Aucune alerte. Tout le stock est au-dessus des seuils." />
      ) : (
        low.map((p) => (
          <View key={p.id} style={styles.alert}>
            <Text style={[typo.body, { flex: 1, fontSize: 14 }]}>
              <Text style={{ fontWeight: '700' }}>{p.name}</Text> — plus que {p.quantity} (seuil {p.minimum_stock})
            </Text>
          </View>
        ))
      )}

      {dash && dash.top_products.length > 0 && (
        <>
          <SectionTitle title="Top produits du jour" />
          {dash.top_products.map((t) => (
            <View key={t.product_id} style={styles.row}>
              <Text style={[typo.body, { flex: 1 }]} numberOfLines={1}>{t.name}</Text>
              <Text style={typo.muted}>{t.quantity_sold} u.</Text>
              <Text style={[typo.body, { fontWeight: '700' }]}>{formatFcfa(t.revenue)}</Text>
            </View>
          ))}
        </>
      )}
      {dash && dash.employee_activity.length > 0 && (
        <>
          <SectionTitle title="Activité par employé" />
          {dash.employee_activity.map((a) => (
            <View key={a.user_id} style={styles.row}>
              <Text style={[typo.body, { flex: 1 }]} numberOfLines={1}>{a.full_name}</Text>
              <Text style={typo.muted}>{a.sales_count} vente(s)</Text>
              <Text style={[typo.body, { fontWeight: '700' }]}>{formatFcfa(a.sales_total)}</Text>
            </View>
          ))}
        </>
      )}

      <Card style={{ marginTop: SPACING.md }}>
        <Text style={[typo.muted]}>Raccourcis : Vente, Argent, Stock en bas — Clients, clôture, shift, rapports et paramètres dans « Plus ».</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  alert: { backgroundColor: '#FCEBC8', borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: palette.surface, borderRadius: RADIUS.field, padding: SPACING.md, marginBottom: SPACING.xs },
});
