'use client';

import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import type { Alert } from '../lib/api';

// ------------------------------------------------------------------ atoms

export function Kpi({
  label,
  value,
  sub,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad';
  hint?: string;
}) {
  const color = tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-[#8A7600]' : tone === 'good' ? 'text-success' : 'text-background';
  return (
    <div className="kpi-card" title={hint}>
      <span className="kpi-label">{label}</span>
      <div className={`kpi-value ${color}`}>{value}</div>
      {sub && <p className="mt-1 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral'; children: React.ReactNode }) {
  const cls =
    tone === 'good'
      ? 'badge-healthy'
      : tone === 'warn'
        ? 'badge-watch'
        : tone === 'bad'
          ? 'badge-risk'
          : tone === 'info'
            ? 'badge-info'
            : 'badge-neutral';
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-base font-bold text-background">{title}</h2>
          {sub && <p className="text-xs text-text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-background">{title}</h1>
        {sub && <p className="text-sm text-text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mb-4 rounded-field border border-danger/30 bg-danger/5 px-3 py-2 text-sm font-medium text-danger">{error}</p>;
}

export function Loading({ what = 'Chargement…' }: { what?: string }) {
  return <p className="text-sm text-text-muted">{what}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="kpi-card text-sm text-text-muted">{children}</p>;
}

export function AlertRow({ alert }: { alert: Alert }) {
  const Icon = alert.severity === 'critical' ? AlertOctagon : alert.severity === 'warning' ? AlertTriangle : Info;
  const color = alert.severity === 'critical' ? 'text-danger' : alert.severity === 'warning' ? 'text-[#8A7600]' : 'text-text-muted';
  return (
    <div className="flex items-start gap-2 border-t border-border px-3 py-2 first:border-t-0">
      <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          <span className="sr-only">{alert.severity === 'critical' ? 'Critique : ' : alert.severity === 'warning' ? 'Attention : ' : 'Info : '}</span>
          {alert.title}
        </p>
        {alert.detail && <p className="text-xs text-text-muted">{alert.detail}</p>}
      </div>
    </div>
  );
}

export function AlertList({ alerts, empty = 'Aucune alerte — tout est nominal.' }: { alerts: Alert[]; empty?: string }) {
  if (alerts.length === 0) {
    return (
      <p className="kpi-card flex items-center gap-2 text-sm text-success">
        <CheckCircle2 size={16} /> {empty}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {alerts.map((a, i) => (
        <AlertRow key={`${a.kind}-${i}`} alert={a} />
      ))}
    </div>
  );
}

// Confirmation obligatoire avant toute action sensible (cahier Super Admin §15 / §19).
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  askReason,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  askReason?: boolean;
  onConfirm: (reason: string | null) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-card bg-surface p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="font-heading text-lg font-extrabold text-background">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-text-muted">{message}</p>
        {askReason && (
          <input className="field-input mb-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (tracé dans l’audit)" />
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-accent'}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim() || null);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
