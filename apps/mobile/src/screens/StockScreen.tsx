import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import Package from 'lucide-react-native/icons/package';
import PackagePlus from 'lucide-react-native/icons/package-plus';
import RotateCcwClock from 'lucide-react-native/icons/rotate-ccw-clock';
import X from 'lucide-react-native/icons/x';

import { useApp } from '../context/AppContext';
import { addStockMovement, getProducts, getStockMovementFeed, ProductRow, StockKind, StockMovementFeedRow } from '../db/repo';
import { createProduct, updateProduct } from '../api/productsApi';
import { formatFcfa, formatTime } from '../format';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { Badge, Button, Card, Field, Stepper } from '../components/ui';
import { EmptyText, KpiCard, Notice, ScreenHeader } from '../components/shared';

type ProductDraft = {
  id: string | null;
  name: string;
  purchase_price: string;
  selling_price: string;
  minimum_stock: string;
  barcode: string;
  category: string;
  is_stockable: boolean;
};
type Form =
  | { mode: 'move'; kind: StockKind; product: ProductRow }
  | { mode: 'product'; draft: ProductDraft };

const emptyDraft = (): ProductDraft => ({
  id: null,
  name: '',
  purchase_price: '',
  selling_price: '',
  minimum_stock: '',
  barcode: '',
  category: '',
  is_stockable: true,
});

// Même écran « Stock » que le web : KPI, alerte de seuil, liste avec actions
// Entrée / Ajuster (tous) et Modifier / Nouveau produit (propriétaire).
export function StockScreen() {
  const { session, refreshKey, refresh, syncNow } = useApp();
  const isOwner = session?.role === 'owner';
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [feed, setFeed] = useState<StockMovementFeedRow[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setProducts(getProducts());
    setFeed(getStockMovementFeed(30));
  }, [refreshKey]);

  const low = products.filter((p) => p.is_stockable !== 0 && p.quantity <= p.minimum_stock);

  const showFlash = (text: string) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 4000);
  };

  const submitMove = (product: ProductRow, kind: StockKind, qty: number, reason: string | null) => {
    const row = addStockMovement(product.id, kind, kind === 'restock' ? qty : -qty, reason);
    setForm(null);
    if (row) {
      showFlash(kind === 'restock' ? `Entrée enregistrée (+${qty})` : `Ajustement enregistré (${-qty})`);
      refresh();
    }
  };

  const submitProduct = async (draft: ProductDraft) => {
    if (!draft.name.trim()) return;
    if (draft.id) {
      await updateProduct(draft.id, {
        purchase_price: Number(draft.purchase_price) || 0,
        selling_price: Number(draft.selling_price) || 0,
        minimum_stock: Number(draft.minimum_stock) || 0,
        barcode: draft.barcode.trim() || null,
        category: draft.category.trim() || null,
        is_stockable: draft.is_stockable,
      });
    } else {
      await createProduct({
        name: draft.name.trim(),
        quantity: 0,
        purchase_price: Number(draft.purchase_price) || 0,
        selling_price: Number(draft.selling_price) || 0,
        minimum_stock: Number(draft.minimum_stock) || 0,
        barcode: draft.barcode.trim() || null,
        category: draft.category.trim() || null,
        is_stockable: draft.is_stockable,
      });
    }
    setForm(null);
    await syncNow();
    refresh();
  };

  if (form?.mode === 'move') {
    return (
      <MoveForm
        key={`${form.product.id}-${form.kind}`}
        product={form.product}
        kind={form.kind}
        onClose={() => setForm(null)}
        onSubmit={submitMove}
      />
    );
  }

  if (form?.mode === 'product' && isOwner) {
    return <ProductForm draft={form.draft} onClose={() => setForm(null)} onSubmit={submitProduct} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Stock"
        subtitle="Entrées, ajustements et alertes de seuil — un mouvement de stock pousse un seul événement."
      />

      <View style={styles.kpiRow}>
        <KpiCard compact label="Produits" value={String(products.length)} />
        <KpiCard compact label="Sous le seuil" value={String(low.length)} tone={low.length > 0 ? 'danger' : 'success'} />
        <KpiCard
          compact
          label="Alertes"
          value={`${products.length > 0 ? ((low.length / products.length) * 100).toFixed(0) : 0}%`}
          tone="warning"
        />
      </View>

      {low.length > 0 ? (
        <Notice tone="warning">
          {low.length} produit{low.length > 1 ? 's' : ''} sous le seuil minimum — penser à réapprovisionner.
        </Notice>
      ) : null}
      {flash ? <Notice tone="success">{flash}</Notice> : null}

      {products.length === 0 ? (
        <EmptyText label={isOwner ? 'Aucun produit — ajoute ton premier produit ci-dessous.' : 'Aucun produit connu pour l’instant.'} />
      ) : (
        products.map((p) => {
          const isLow = p.is_stockable !== 0 && p.quantity <= p.minimum_stock;
          return (
            <Card key={p.id} style={{ marginBottom: SPACING.sm }}>
              <View style={styles.nameRow}>
                <Text style={[typo.body, { fontWeight: '700', flexShrink: 1 }]} numberOfLines={1}>{p.name}</Text>
                {isLow ? <Badge label="stock bas" tone="danger" /> : null}
              </View>
              <Text style={[typo.muted, { marginTop: SPACING.xs }]}>
                stock <Text style={{ fontWeight: '700', color: palette.text }}>{p.quantity}</Text> · seuil {p.minimum_stock} · vente {formatFcfa(p.selling_price)}
              </Text>
              <View style={styles.actions}>
                <SmallAction icon={<PackagePlus size={16} color={palette.text} />} label="Entrée" onPress={() => setForm({ mode: 'move', kind: 'restock', product: p })} />
                <SmallAction icon={<Package size={16} color={palette.text} />} label="Ajuster" onPress={() => setForm({ mode: 'move', kind: 'adjustment', product: p })} />
                {isOwner ? (
                  <SmallAction
                    label="Modifier"
                    onPress={() =>
                      setForm({
                        mode: 'product',
                        draft: {
                          id: p.id,
                          name: p.name,
                          purchase_price: String(p.purchase_price ?? 0),
                          selling_price: String(p.selling_price),
                          minimum_stock: String(p.minimum_stock),
                          barcode: p.barcode ?? '',
                          category: p.category ?? '',
                          is_stockable: p.is_stockable !== 0,
                        },
                      })
                    }
                  />
                ) : null}
              </View>
            </Card>
          );
        })
      )}

      {isOwner ? (
        <View style={{ marginTop: SPACING.md }}>
          <Button title="Nouveau produit" variant="accent" onPress={() => setForm({ mode: 'product', draft: emptyDraft() })} />
        </View>
      ) : null}

      {feed.length > 0 ? (
        <Card style={{ marginTop: SPACING.lg }}>
          <View style={styles.feedHead}>
            <RotateCcwClock size={18} color={palette.primary} />
            <Text style={typo.microLabel}>Mouvements récents (tous employés)</Text>
          </View>
          {feed.map((m) => {
            const isSale = m.type === 'sale';
            const isRestock = m.type === 'restock';
            const deltaText = isSale ? `-${m.quantity_delta}` : isRestock ? `+${m.quantity_delta}` : `${m.quantity_delta}`;
            const deltaColor = isRestock ? palette.success : isSale ? palette.warning : palette.textMuted;
            return (
              <View key={m.client_uuid} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={[typo.body, { fontWeight: '600' }]} numberOfLines={1}>{m.product_name}</Text>
                  <Text style={typo.muted}>
                    Par {m.user_name} · {formatTime(m.created_at)}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </Text>
                </View>
                <Text style={[typo.body, { fontWeight: '700', color: deltaColor }]}>{deltaText}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </ScrollView>
  );
}

function SmallAction({ icon, label, onPress }: { icon?: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.smallAction} hitSlop={4}>
      {icon}
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function MoveForm({
  product,
  kind,
  onClose,
  onSubmit,
}: {
  product: ProductRow;
  kind: StockKind;
  onClose: () => void;
  onSubmit: (product: ProductRow, kind: StockKind, qty: number, reason: string | null) => void;
}) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.formTitleRow}>
        <Text style={[typo.title, { color: palette.surface, flex: 1, fontSize: 20 }]}>
          {kind === 'restock' ? 'Entrée de stock' : 'Ajustement'} — {product.name}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
          <X size={22} color={palette.surface} />
        </Pressable>
      </View>

      <Card>
        {kind === 'adjustment' ? (
          <Text style={[typo.muted, { marginBottom: SPACING.md }]}>
            Quantité négative : sortie/casse. Jamais bloqué, l’écart se réconcilie au sync.
          </Text>
        ) : null}
        <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Quantité</Text>
        <Stepper value={qty} onChange={setQty} min={1} />
        <View style={{ height: SPACING.lg }} />
        <Field
          label="Motif (optionnel)"
          placeholder={kind === 'restock' ? 'ex. livraison fournisseur' : 'ex. casse, perte'}
          value={reason}
          onChangeText={setReason}
        />
        <Button
          title={kind === 'restock' ? 'Enregistrer l’entrée' : 'Enregistrer l’ajustement'}
          variant="primary"
          onPress={() => onSubmit(product, kind, qty, reason.trim() || null)}
        />
        <View style={{ height: SPACING.sm }} />
        <Button title="Annuler" variant="secondary" onPress={onClose} />
      </Card>
    </ScrollView>
  );
}

function ProductForm({
  draft,
  onClose,
  onSubmit,
}: {
  draft: ProductDraft;
  onClose: () => void;
  onSubmit: (draft: ProductDraft) => Promise<void>;
}) {
  const isEdit = draft.id !== null;
  const [d, setD] = useState<ProductDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof ProductDraft) => (v: string) => setD((prev) => ({ ...prev, [field]: v }));
  const num = (field: keyof ProductDraft) => (v: string) => set(field)(v.replace(/[^0-9]/g, ''));

  const submit = () => {
    setBusy(true);
    setError(null);
    onSubmit(d)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Enregistrement impossible.'))
      .finally(() => setBusy(false));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.formTitleRow}>
        <Text style={[typo.title, { color: palette.surface, flex: 1, fontSize: 20 }]}>
          {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
          <X size={22} color={palette.surface} />
        </Pressable>
      </View>

      <Card>
        <Field label="Nom" placeholder="ex. Riz 5kg" value={d.name} onChangeText={set('name')} editable={!isEdit} />
        <Field label="Prix achat" keyboardType="number-pad" placeholder="0" value={d.purchase_price} onChangeText={num('purchase_price')} />
        <Field label="Prix vente" keyboardType="number-pad" placeholder="0" value={d.selling_price} onChangeText={num('selling_price')} />
        <Field label="Seuil" keyboardType="number-pad" placeholder="0" value={d.minimum_stock} onChangeText={num('minimum_stock')} />
        <Field label="Code-barres" placeholder="saisir ou coller le code" value={d.barcode} onChangeText={set('barcode')} />
        <Field label="Catégorie" placeholder="ex. Boissons" value={d.category} onChangeText={set('category')} />
        <Pressable onPress={() => setD((prev) => ({ ...prev, is_stockable: !prev.is_stockable }))} style={{ marginBottom: SPACING.md }}>
          <Text style={[typo.body, { fontWeight: '600' }]}>
            {d.is_stockable ? '[x]' : '[ ]'} Produit stockable
          </Text>
          <Text style={typo.muted}>Décoché = service : la vente ne touche jamais au stock.</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={isEdit ? 'Enregistrer' : 'Créer le produit'}
          variant="accent"
          onPress={submit}
          disabled={busy || !d.name.trim()}
        />
        <View style={{ height: SPACING.sm }} />
        <Button title="Annuler" variant="secondary" onPress={onClose} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  kpiRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  smallActionText: { fontFamily: typo.body.fontFamily, fontSize: 13, fontWeight: '600', color: palette.text },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, marginBottom: SPACING.lg },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  error: { fontFamily: typo.body.fontFamily, fontSize: 13, color: palette.danger, marginBottom: SPACING.md },
});
