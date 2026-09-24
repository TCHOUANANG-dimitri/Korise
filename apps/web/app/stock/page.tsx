'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Package, PackagePlus, Plus, TriangleAlert, X } from 'lucide-react';

import { useData } from '../../lib/useData';
import {
  addStockMovement,
  listProducts,
  syncProductsFromServer,
  ProductRow,
  StockMovementRow,
} from '../../lib/repo';
import { createProduct, updateProduct } from '../../lib/api';
import { formatFcfa } from '../../lib/format';
import { getSession } from '../../lib/session';

type MoveKind = 'restock' | 'adjustment';
type Form =
  | { mode: 'move'; kind: MoveKind; product: ProductRow }
  | { mode: 'create'; draft: ProductDraft }
  | { mode: 'edit'; draft: ProductDraft };
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

export default function StockPage() {
  const version = useData();
  const isOwner = getSession()?.role === 'owner';
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = () => void listProducts().then(setProducts);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const low = products.filter((p) => p.is_stockable !== false && p.quantity <= p.minimum_stock && p.is_active);

  const submitMove = async (product: ProductRow, kind: MoveKind, delta: number, reason: string | null) => {
    const row: StockMovementRow | null = await addStockMovement(product.id, kind, kind === 'restock' ? delta : -delta, reason);
    setForm(null);
    reload();
    if (row) {
      setFlash(kind === 'restock' ? `Entrée enregistrée (+${delta})` : `Ajustement enregistré (${-delta})`);
      window.setTimeout(() => setFlash(null), 4000);
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
    await syncProductsFromServer();
    reload();
  };

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-background">Stock</h1>
        <p className="text-sm text-text-muted">
          Entrées, ajustements et alertes de seuil — un mouvement de stock pousse un seul événement.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="kpi-card">
          <span className="kpi-label">Produits</span>
          <div className="kpi-value">{products.length}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Sous le seuil</span>
          <div className={`kpi-value ${low.length > 0 ? 'text-danger' : 'text-success'}`}>{low.length}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Alertes</span>
          <div className="kpi-value text-warning">{products.length > 0 ? ((low.length / products.length) * 100).toFixed(0) : 0}%</div>
        </div>
      </div>

      {low.length > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-field border border-warning/30 bg-warning/10 px-3 py-3 text-sm font-medium text-warning">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <span>
            {low.length} produit{low.length > 1 ? 's' : ''} sous le seuil minimum — penser à réapprovisionner.
          </span>
        </div>
      )}

      {flash && (
        <div className="mb-5 flex items-center gap-2 rounded-field bg-success px-3 py-3 text-sm font-medium text-white">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      <div className="space-y-3">
        {products.map((p) => {
          const isLow = p.is_stockable !== false && p.quantity <= p.minimum_stock && p.is_active;
          return (
            <div key={p.id} className="kpi-card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <strong className="truncate">{p.name}</strong>
                  {isLow && <span className="badge badge-danger">stock bas</span>}
                  {!p.is_active && <span className="badge">inactif</span>}
                  {p.is_stockable === false && <span className="badge">service</span>}
                  {p.category && <span className="badge badge-primary">{p.category}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-text-muted">
                  <span>stock <strong className="text-text">{p.quantity}</strong></span>
                  <span>seuil {p.minimum_stock}</span>
                  <span>vente {formatFcfa(p.selling_price)}</span>
                  {p.barcode && <span>code {p.barcode}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary !px-3 !py-2"
                  onClick={() => setForm({ mode: 'move', kind: 'restock', product: p })}
                >
                  <PackagePlus size={16} /> Entrée
                </button>
                <button
                  type="button"
                  className="btn-secondary !px-3 !py-2"
                  onClick={() => setForm({ mode: 'move', kind: 'adjustment', product: p })}
                >
                  <Package size={16} /> Ajuster
                </button>
                {isOwner && (
                  <button
                    type="button"
                    className="btn-secondary !px-3 !py-2"
                    onClick={() =>
                      setForm({
                        mode: 'edit',
                        draft: {
                          id: p.id,
                          name: p.name,
                          purchase_price: String(p.purchase_price ?? 0),
                          selling_price: String(p.selling_price),
                          minimum_stock: String(p.minimum_stock),
                          barcode: p.barcode ?? '',
                          category: p.category ?? '',
                          is_stockable: p.is_stockable !== false,
                        },
                      })
                    }
                  >
                    Modifier
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-text-muted">Aucun produit — ajoute ton premier produit ci-dessous.</p>
        )}
      </div>

      {isOwner && !form && (
        <div className="mt-6">
          <button type="button" className="btn-accent" onClick={() => setForm({ mode: 'create', draft: emptyDraft() })}>
            <Plus size={18} /> Nouveau produit
          </button>
        </div>
      )}

      {form?.mode === 'move' && (
        <MoveForm
          key={`${form.product.id}-${form.kind}`}
          product={form.product}
          kind={form.kind}
          onClose={() => setForm(null)}
          onSubmit={submitMove}
        />
      )}

      {form?.mode !== 'move' && form && (
        <ProductForm isOwner={isOwner} draft={form.draft} onClose={() => setForm(null)} onSubmit={submitProduct} />
      )}
    </>
  );
}

function MoveForm({
  product,
  kind,
  onClose,
  onSubmit,
}: {
  product: ProductRow;
  kind: MoveKind;
  onClose: () => void;
  onSubmit: (product: ProductRow, kind: MoveKind, delta: number, reason: string | null) => Promise<void>;
}) {
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const n = Math.round(Number(delta));
  const valid = Number.isFinite(n) && n > 0;

  return (
    <div className="mt-6 rounded-field border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">
          {kind === 'restock' ? 'Entrée de stock' : 'Ajustement'} — {product.name}
        </h2>
        <button type="button" className="text-text-muted hover:text-text" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      {kind === 'adjustment' && (
        <p className="mb-3 text-sm text-text-muted">Quantité négative : sortie/casse. Jamais bloqué, l&rsquo;écart se réconcilie au sync.</p>
      )}
      <label className="field-label" htmlFor="delta">Quantité</label>
      <input
        id="delta"
        className="field-input"
        inputMode="numeric"
        value={delta}
        onChange={(e) => setDelta(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="1"
      />
      <label className="mt-3 field-label" htmlFor="reason">Motif (optionnel)</label>
      <input id="reason" className="field-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'restock' ? 'ex. livraison fournisseur' : 'ex. casse, perte'} />
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary flex-1" disabled={busy || !valid} onClick={() => { setBusy(true); void onSubmit(product, kind, n, reason.trim() || null).finally(() => setBusy(false)); }}>
          {kind === 'restock' ? 'Enregistrer l’entrée' : 'Enregistrer l’ajustement'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}

function ProductForm({
  isOwner,
  draft,
  onClose,
  onSubmit,
}: {
  isOwner: boolean;
  draft: ProductDraft;
  onClose: () => void;
  onSubmit: (draft: ProductDraft) => Promise<void>;
}) {
  const isEdit = draft.id !== null;
  const [d, setD] = useState<ProductDraft>(draft);
  const [busy, setBusy] = useState(false);

  if (!isOwner) return null;

  const set = (field: keyof ProductDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="mt-6 rounded-field border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">{isEdit ? 'Modifier le produit' : 'Nouveau produit'}</h2>
        <button type="button" className="text-text-muted hover:text-text" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      <label className="field-label" htmlFor="pname">Nom</label>
      <input id="pname" className="field-input" value={d.name} onChange={set('name')} disabled={isEdit} placeholder="ex. Riz 5kg" />
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <label className="field-label" htmlFor="pprice">Prix achat</label>
          <input id="pprice" className="field-input" inputMode="numeric" value={d.purchase_price} onChange={set('purchase_price')} placeholder="0" />
        </div>
        <div>
          <label className="field-label" htmlFor="sprice">Prix vente</label>
          <input id="sprice" className="field-input" inputMode="numeric" value={d.selling_price} onChange={set('selling_price')} placeholder="0" />
        </div>
        <div>
          <label className="field-label" htmlFor="pthresh">Seuil</label>
          <input id="pthresh" className="field-input" inputMode="numeric" value={d.minimum_stock} onChange={set('minimum_stock')} placeholder="0" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="pbarcode">Code-barres</label>
          <input id="pbarcode" className="field-input" value={d.barcode} onChange={set('barcode')} placeholder="scanner ou saisir" />
        </div>
        <div>
          <label className="field-label" htmlFor="pcat">Catégorie</label>
          <input id="pcat" className="field-input" value={d.category} onChange={set('category')} placeholder="ex. Boissons" />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={d.is_stockable} onChange={(e) => setD((prev) => ({ ...prev, is_stockable: e.target.checked }))} />
        Produit stockable (décoché = service : la vente ne touche jamais au stock)
      </label>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-accent flex-1" disabled={busy || !d.name.trim()} onClick={() => { setBusy(true); void onSubmit(d).finally(() => setBusy(false)); }}>
          {isEdit ? 'Enregistrer' : 'Créer le produit'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
}