'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, ScanBarcode, Search, ShoppingCart, Trash2, UserPlus } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  addCustomer,
  addSale,
  getCustomerById,
  listCustomers,
  listProducts,
  CustomerRow,
  ProductRow,
} from '../../lib/repo';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PaymentMethod } from '../../lib/config';
import { formatFcfa } from '../../lib/format';
import Receipt, { ReceiptData } from '../components/Receipt';

interface CartLine {
  product: ProductRow;
  qty: number;
}

export default function SalePage() {
  const version = useData();
  const searchRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState(false);

  // Vente à crédit : recherche d'un client existant ou création à la volée.
  const [customerQuery, setCustomerQuery] = useState('');
  const [chosenCustomer, setChosenCustomer] = useState<CustomerRow | null>(null);
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  useEffect(() => {
    let alive = true;
    void listProducts().then((p) => alive && setProducts(p));
    void listCustomers().then((c) => alive && setCustomers(c));
    return () => {
      alive = false;
    };
  }, [version]);

  const total = cart.reduce((a, l) => a + l.product.selling_price * l.qty, 0);
  const itemCount = cart.reduce((a, l) => a + l.qty, 0);

  const addToCart = (product: ProductRow, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { product, qty }];
    });
    setReceipt(null);
  };

  const changeQty = (productId: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase() === q ||
        (p.category ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  // Une douchette USB "tape" le code puis Entrée : si le texte correspond exactement à un
  // code-barres, on ajoute directement le produit au panier (cahier : scanner un produit).
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const byCode = products.find((p) => (p.barcode ?? '').toLowerCase() === q);
    const single = filtered.length === 1 ? filtered[0] : null;
    const target = byCode ?? single;
    if (target) {
      addToCart(target);
      setSearch('');
    }
  };

  const query = customerQuery.trim().toLowerCase();
  const matches = query ? customers.filter((c) => c.full_name.toLowerCase().includes(query)) : customers;
  const suggestNew = query !== '' && !matches.some((c) => c.full_name.toLowerCase() === query);
  const creditReady = payment !== 'credit' || !!chosenCustomer || customerQuery.trim() !== '';

  const confirm = async () => {
    if (cart.length === 0 || total <= 0 || busy) return;
    setBusy(true);
    try {
      let customerId: string | null = null;
      let customerName: string | null = null;
      if (payment === 'credit') {
        if (chosenCustomer) {
          customerId = chosenCustomer.id;
          customerName = chosenCustomer.full_name;
        } else {
          const created = await addCustomer(customerQuery.trim(), newCustomerPhone.trim() || null);
          if (!created) return;
          setCustomers((prev) => [...prev, created]);
          customerId = created.id;
          customerName = created.full_name;
        }
      }
      const saleIds: string[] = [];
      for (const line of cart) {
        const sale = await addSale(line.product.id, line.qty, line.product.selling_price, payment, customerId);
        if (sale) saleIds.push(sale.id);
      }
      if (customerId && !customerName) customerName = (await getCustomerById(customerId))?.full_name ?? null;
      setReceipt({
        lines: cart.map((l) => ({ productName: l.product.name, quantity: l.qty, unitPrice: l.product.selling_price })),
        total,
        paymentMethod: payment,
        customerName,
        saleIds,
      });
      setCart([]);
      setChosenCustomer(null);
      setCustomerQuery('');
      setNewCustomerPhone('');
      setPayment('cash');
      searchRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-background">Vente rapide</h1>
        <p className="text-sm text-text-muted">
          Touchez les produits pour remplir le panier : une seule validation met à jour ventes, caisse et stock.
        </p>
      </div>

      {receipt && (
        <div className="mb-5">
          <h2 className="mb-2 font-heading text-base font-bold text-background">Vente enregistrée</h2>
          <Receipt data={receipt} onDone={() => setReceipt(null)} />
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          ref={searchRef}
          className="field-input pl-9 pr-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Rechercher un produit ou scanner un code-barres…"
          autoFocus
        />
        <ScanBarcode size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {filtered.map((p) => {
          const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              className={`kpi-card text-left transition hover:border-accent ${inCart > 0 ? 'border-accent' : ''}`}
              onClick={() => addToCart(p)}
            >
              <strong className="block text-sm">{p.name}</strong>
              <div className="mt-1 font-heading text-lg font-bold text-success">{formatFcfa(p.selling_price)}</div>
              <div className="mt-1 text-xs text-text-muted">
                {p.is_stockable === false ? 'service' : `stock ${p.quantity} · seuil ${p.minimum_stock}`}
              </div>
              {inCart > 0 && <span className="badge badge-primary mt-2">{inCart} au panier</span>}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <p className="text-sm text-text-muted">
          {products.length === 0
            ? 'Aucun produit disponible — ajoute des produits depuis l’écran Stock.'
            : 'Aucun produit ne correspond à la recherche.'}
        </p>
      )}

      {cart.length > 0 && (
        <div className="kpi-card mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-bold text-background">
            <ShoppingCart size={18} /> Panier — {itemCount} article{itemCount > 1 ? 's' : ''}
          </h2>

          <div className="mb-4 divide-y divide-border">
            {cart.map((l) => (
              <div key={l.product.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{l.product.name}</strong>
                  <span className="text-xs text-text-muted">{formatFcfa(l.product.selling_price)} l’unité</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-field border border-border" onClick={() => changeQty(l.product.id, -1)}>
                    <Minus size={16} />
                  </button>
                  <strong className="w-6 text-center">{l.qty}</strong>
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-field border border-border" onClick={() => changeQty(l.product.id, 1)}>
                    <Plus size={16} />
                  </button>
                  <span className="w-24 text-right font-semibold">{formatFcfa(l.product.selling_price * l.qty)}</span>
                  <button type="button" className="text-danger" onClick={() => changeQty(l.product.id, -l.qty)} title="Retirer">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="field-label">Paiement</p>
          <div className="mb-3 inline-flex flex-wrap overflow-hidden rounded-field border border-border">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                className={`px-3 py-2 text-sm font-semibold ${payment === m ? 'bg-background text-white' : 'text-text-muted'}`}
                onClick={() => setPayment(m)}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>

          {payment === 'credit' && (
            <div className="mb-3 rounded-field border border-border bg-[#FAFAFA] p-3">
              <p className="field-label">Client (qui doit le montant ?)</p>
              <input
                className="field-input mb-2"
                value={chosenCustomer ? chosenCustomer.full_name : customerQuery}
                disabled={!!chosenCustomer}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setChosenCustomer(null);
                }}
                placeholder="Rechercher ou taper un nom…"
              />
              {chosenCustomer ? (
                <div className="flex items-center justify-between gap-2 rounded-field bg-surface px-3 py-2">
                  <div>
                    <strong className="block text-sm">{chosenCustomer.full_name}</strong>
                    {chosenCustomer.phone && <span className="text-xs text-text-muted">{chosenCustomer.phone}</span>}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => {
                      setChosenCustomer(null);
                      setCustomerQuery('');
                    }}
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <>
                  {query !== '' && matches.length > 0 && (
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {matches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center justify-between rounded-field bg-surface px-3 py-2 text-left text-sm hover:bg-[#F3F4F6]"
                          onClick={() => setChosenCustomer(c)}
                        >
                          <span className="font-medium">{c.full_name}</span>
                          {c.phone && <span className="text-xs text-text-muted">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {suggestNew && (
                    <div className="mt-2 rounded-field border border-dashed border-border bg-surface p-2.5">
                      <p className="text-sm font-semibold">Nouveau client : {customerQuery.trim()}</p>
                      <input
                        className="field-input mt-2 !py-1.5 text-sm"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                        placeholder="Téléphone (optionnel)"
                        inputMode="tel"
                      />
                    </div>
                  )}
                  {query === '' && customers.length > 0 && (
                    <p className="text-xs text-text-muted">
                      Tape un nom pour chercher un client existant, ou un nouveau nom pour créer le client à la volée.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <p className="field-label">Total à encaisser</p>
          <p className="mb-4 font-heading text-3xl font-extrabold">{formatFcfa(total)}</p>

          <button type="button" className="btn-accent w-full" onClick={() => void confirm()} disabled={busy || total <= 0 || !creditReady}>
            {payment === 'credit' ? 'Enregistrer la vente à crédit' : 'Encaisser'}
          </button>
          {payment === 'credit' && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
              <UserPlus size={14} /> Rien n’entre en caisse : le montant devient une dette du client, visible sur l’écran Crédits.
            </p>
          )}
          <button type="button" className="mt-2 w-full text-xs font-semibold text-text-muted hover:text-danger" onClick={() => setCart([])}>
            Vider le panier
          </button>
        </div>
      )}
    </>
  );
}
