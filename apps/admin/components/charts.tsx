'use client';

import { useState } from 'react';
import { Table2 } from 'lucide-react';

import type { SeriesPoint } from '../lib/api';

// Graphiques volontairement simples (cahier Super Admin §17) : lignes pour l'évolution, barres pour la
// comparaison, funnel en barres horizontales. Une seule série par graphique et un seul axe ; l'orange
// Korise porte la série, la grille reste neutre ; chaque graphique a une vue tableau et des
// infobulles au survol (identité jamais portée par la couleur seule).

const ACCENT = '#F85602';
const GRID = '#E4E7EC';
const MUTED = '#6B7280';

export function ChartCard({
  title,
  sub,
  table,
  children,
}: {
  title: string;
  sub?: string;
  table?: { head: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="kpi-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-sm font-bold text-background">{title}</h3>
          {sub && <p className="text-xs text-text-muted">{sub}</p>}
        </div>
        {table && (
          <button type="button" className="rounded-field p-1.5 text-text-muted hover:bg-[#F3F4F6]" onClick={() => setAsTable((v) => !v)} title="Basculer graphique / tableau">
            <Table2 size={16} />
          </button>
        )}
      </div>
      {asTable && table ? (
        <div className="max-h-56 overflow-auto rounded-field border border-border">
          <table className="data-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({ data, unit = '' }: { data: SeriesPoint[]; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 150;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const n = Math.max(1, data.length - 1);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / n;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        role="img"
        aria-label="Courbe d’évolution"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * n);
          setHover(Math.min(Math.max(i, 0), data.length - 1));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.date} x={x(i)} y={H - 5} textAnchor="middle" fontSize={9} fill={MUTED}>
              {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
            </text>
          ) : null,
        )}
        <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={4} fill={ACCENT} stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-field bg-background px-2 py-1 text-xs text-white shadow"
          style={{ left: `${Math.min(80, Math.max(0, (x(hover) / W) * 100 - 8))}%` }}
        >
          {data[hover].date.slice(8, 10)}/{data[hover].date.slice(5, 7)} — <strong>{data[hover].value}</strong>
          {unit}
        </div>
      )}
    </div>
  );
}

export function ColumnChart({ data }: { data: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 130;
  const pad = { l: 28, r: 8, t: 8, b: 20 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Erreurs par heure" onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={MUTED}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (H - pad.t - pad.b) * (d.value / max));
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <rect x={pad.l + i * bw + 2} y={H - pad.b - h} width={Math.max(2, bw - 4)} height={h} rx={3} fill={ACCENT} />
              {i % 4 === 0 && (
                <text x={pad.l + i * bw + bw / 2} y={H - 5} textAnchor="middle" fontSize={9} fill={MUTED}>
                  {d.date}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-field bg-background px-2 py-1 text-xs text-white shadow">
          {data[hover].date} — <strong>{data[hover].value}</strong> erreur(s)
        </div>
      )}
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  display: string;
  sub?: string;
  muted?: boolean;
}

// Barres horizontales : comparaison de fonctionnalités, funnel d'activation.
export function BarRows({ rows, max }: { rows: BarRow[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} title={`${r.label} — ${r.display}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={r.muted ? 'text-text-muted' : 'font-medium'}>{r.label}</span>
            <span className="shrink-0 font-semibold">
              {r.display}
              {r.sub && <span className="ml-1 text-xs font-normal text-text-muted">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#F3F4F6]">
            <div className="h-full rounded-full" style={{ width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%`, background: r.muted ? '#D1D5DB' : ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  );
}
