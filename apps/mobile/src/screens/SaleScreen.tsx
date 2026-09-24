import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CheckCircle2 from 'lucide-react-native/icons/circle-check';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import ScanBarcode from 'lucide-react-native/icons/scan-barcode';
import Search from 'lucide-react-native/icons/search';
import Trash2 from 'lucide-react-native/icons/x';

import { useApp } from '../context/AppContext';
import { addSale, customerRef, getProductByBarcode, getProducts, CustomerWithBalance, ProductRow } from '../db/repo';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PaymentMethod } from '../config';
import { palette, RADIUS, SPACING, typo } from '../theme';
import { formatFcfa, formatTime } from '../format';
import { ReceiptData, shareReceipt } from '../receipt';
import { sharePdf } from '../pdf';
import { Button, Card, Segmented } from '../components/ui';
import { CustomerPicker } from '../components/CustomerPicker';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { Notice, ScreenHeader } from '../components/shared';

interface CartLine {
  product: ProductRow;
  qty: number;
  price: string; // prix unitaire éditable (remise autorisée) ; vide = prix catalogue
}

const linePrice = (l: CartLine): number => {
  const n = Number(l.price);
  return l.price.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : l.product.selling_price;
};

export function SaleScreen() {
  const { refreshKey, refresh, syncNow } = useApp();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [customer, setCustomer] = useState<CustomerWithBalance | null>(null);
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  useEffect(() => {
    setProducts(getProducts());
  }, [refreshKey]);

  const total = cart.reduce((a, l) => a + linePrice(l) * l.qty, 0);
  const itemCount = cart.reduce((a, l) => a + l.qty, 0);
  const creditReady = payment !== 'credit' || customer !== null;

  const addToCart = (product: ProductRow) => {
    setReceipt(null);
    setCart((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product, qty: 1, price: '' }];
    });
  };

  const changeQty = (id: string, delta: number) =>
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase() === q || (p.category ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  const onScanned = (code: string) => {
    const p = getProductByBarcode(code);
    if (p) {
      addToCart(p);
      setScanMsg(`${p.name} ajouté au panier`);
      setScanning(false);
    } else {
      setScanMsg(`Code ${code} inconnu : ajoute-le à un produit depuis l’écran Stock.`);
      setScanning(false);
    }
  };

  const confirm = () => {
    if (cart.length === 0 || total <= 0 || !creditReady) return;
    const saleIds: string[] = [];
    const createdAt = new Date().toISOString();
    for (const l of cart) {
      const sale = addSale(l.product.id, l.qty, linePrice(l), payment, customer ? customerRef(customer) : null);
      if (sale) saleIds.push(sale.client_uuid);
    }
    setReceipt({
      lines: cart.map((l) => ({ productName: l.product.name, quantity: l.qty, unitPrice: linePrice(l) })),
      total,
      paymentMethod: payment,
      customerName: customer ? customer.full_name : null,
      createdAt,
      saleIds,
    });
    setCart([]);
    setCustomer(null);
    setPayment('cash');
    setSearch('');
    setPdfError(null);
    refresh();
  };

  const pdf = async (kind: 'receipts' | 'invoices') => {
    if (!receipt?.saleIds?.length) return;
    setPdfError(null);
    try {
      await syncNow(); // la vente doit exister côté serveur pour être imprimée
      await sharePdf(`/${kind}.pdf?refs=${receipt.saleIds.join(',')}`, `${kind === 'receipts' ? 'recu' : 'facture'}.pdf`);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF indisponible');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Vente rapide" subtitle="Touchez les produits pour remplir le panier : une validation met à jour ventes, caisse et stock." />

      {receipt && (
        <Card style={{ backgroundColor: '#F1F8F4', borderColor: '#CBE6D7' }}>
          <View style={styles.rowStart}>
            <CheckCircle2 size={22} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={[typo.body, { fontWeight: '700' }]}>Vente enregistrée</Text>
              <Text style={typo.muted}>
                {formatFcfa(receipt.total)} · {formatTime(receipt.createdAt)} · {receipt.lines.length} ligne(s)
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Partager" variant="accent" onPress={() => void shareReceipt(receipt)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Reçu PDF" variant="secondary" onPress={() => void pdf('receipts')} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Facture PDF" variant="secondary" onPress={() => void pdf('invoices')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Nouvelle vente" variant="secondary" onPress={() => setReceipt(null)} />
            </View>
          </View>
          {pdfError && <Text style={[typo.muted, { color: palette.danger, marginTop: SPACING.sm }]}>{pdfError}</Text>}
        </Card>
      )}

      {scanMsg && <Notice tone="warning">{scanMsg}</Notice>}

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={palette.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un produit…"
            placeholderTextColor={palette.textMuted}
            autoCorrect={false}
          />
        </View>
        <Pressable style={styles.scanBtn} onPress={() => { setScanMsg(null); setScanning(true); }} accessibilityLabel="Scanner un code-barres">
          <ScanBarcode size={22} color={palette.background} />
        </Pressable>
      </View>

      {filtered.length === 0 ? (
        <Card>
          <Text style={typo.body}>{products.length === 0 ? 'Aucun produit disponible — ajoute des produits depuis l’écran Stock.' : 'Aucun produit ne correspond.'}</Text>
        </Card>
      ) : (
        filtered.map((p) => {
          const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
          return (
            <Pressable key={p.id} onPress={() => addToCart(p)} style={[styles.card, inCart > 0 && { borderColor: palette.accent }]}>
              <View style={styles.rowBetween}>
                <Text style={[typo.body, { flex: 1, fontWeight: '600' }]}>{p.name}</Text>
                <Text style={[typo.kpi, { fontSize: 18, color: palette.primary }]}>{formatFcfa(p.selling_price)}</Text>
              </View>
              <Text style={typo.muted}>
                {p.is_stockable === 0 ? 'service' : `stock ${p.quantity} · seuil ${p.minimum_stock}`}
                {inCart > 0 ? `  ·  ${inCart} au panier` : ''}
              </Text>
            </Pressable>
          );
        })
      )}

      {cart.length > 0 && (
        <Card>
          <Text style={[typo.heading, { marginBottom: SPACING.md }]}>Panier — {itemCount} article{itemCount > 1 ? 's' : ''}</Text>
          {cart.map((l) => (
            <View key={l.product.id} style={styles.cartLine}>
              <View style={{ flex: 1 }}>
                <Text style={[typo.body, { fontWeight: '600' }]} numberOfLines={1}>{l.product.name}</Text>
                <View style={styles.priceRow}>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="number-pad"
                    value={l.price}
                    placeholder={String(l.product.selling_price)}
                    placeholderTextColor={palette.textMuted}
                    onChangeText={(v) => setCart((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, price: v.replace(/[^0-9]/g, '') } : x)))}
                  />
                  <Text style={typo.muted}>FCFA l’unité</Text>
                </View>
              </View>
              <View style={styles.qty}>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(l.product.id, -1)}><Minus size={16} color={palette.primary} /></Pressable>
                <Text style={[typo.kpi, { fontSize: 18, minWidth: 28, textAlign: 'center' }]}>{l.qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(l.product.id, 1)}><Plus size={16} color={palette.primary} /></Pressable>
                <Pressable style={styles.qtyBtn} onPress={() => changeQty(l.product.id, -l.qty)}><Trash2 size={16} color={palette.danger} /></Pressable>
              </View>
            </View>
          ))}

          <View style={styles.divider} />
          <Text style={[typo.microLabel, { marginBottom: SPACING.sm }]}>Paiement</Text>
          <Segmented
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            value={payment}
            onChange={(next) => {
              setPayment(next);
              if (next !== 'credit') setCustomer(null);
            }}
          />
          {payment === 'credit' && (
            <View style={{ marginTop: SPACING.lg }}>
              <CustomerPicker selected={customer} onSelect={setCustomer} />
            </View>
          )}

          <View style={styles.divider} />
          <Text style={typo.microLabel}>Total à encaisser</Text>
          <Text style={[typo.kpi, { fontSize: 36, marginVertical: SPACING.sm }]}>{formatFcfa(total)}</Text>
          <Button title={payment === 'credit' ? 'Enregistrer la vente à crédit' : 'Encaisser'} variant="accent" onPress={confirm} disabled={total <= 0 || !creditReady} />
          {!creditReady && <Text style={[typo.muted, { marginTop: SPACING.sm }]}>Choisis ou crée un client pour enregistrer une vente à crédit.</Text>}
          <View style={{ marginTop: SPACING.sm }}>
            <Button title="Vider le panier" variant="secondary" onPress={() => setCart([])} />
          </View>
        </Card>
      )}

      <BarcodeScanner visible={scanning} onScanned={onScanned} onClose={() => setScanning(false)} />
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
  divider: { height: 1, backgroundColor: palette.border, marginVertical: SPACING.lg },
  searchRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: palette.surface,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: SPACING.md,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.md, fontSize: 16, color: palette.text, fontFamily: typo.body.fontFamily },
  scanBtn: { width: 50, borderRadius: RADIUS.field, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: palette.border },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  priceInput: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    fontSize: 14,
    color: palette.text,
    fontFamily: typo.body.fontFamily,
  },
  qty: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
