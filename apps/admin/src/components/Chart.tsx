/**
 * @file Chart.tsx
 * @description Charts of the « Données » page, in plain SVG: stacked columns (traffic) or a
 *   line (processor, memory, disk). One scale per chart, a legend from two series, a tooltip
 *   on hover, and the same figures as a table.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n/index.ts';

export interface Series {
  label: string;
  color: string;
  /** One per bucket, `null` when nothing was measured. */
  values: (number | null)[];
}

interface Props {
  title: string;
  aside?: ReactNode;
  kind: 'bars' | 'line';
  /** Axis labels, one per bucket. */
  labels: string[];
  /** Full labels, for the tooltip and the table. */
  titles: string[];
  series: Series[];
  format: (v: number) => string;
  /** Fixed top of the scale (100 for a percentage). */
  max?: number;
  height?: number;
  /** Across the whole grid. */
  wide?: boolean;
  /** To reach it from a link (`#id`). */
  id?: string;
}

const LEFT = 56, RIGHT = 8, TOP = 10, BOTTOM = 24;

/** 1, 2 or 5 times a power of ten, at least `v` (its half stays a round number). */
function nice(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** A column with its top corners rounded (4 px, less when it is lower). */
function column(x: number, y: number, w: number, h: number, round: boolean): string {
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Chart({ title, aside, kind, labels, titles, series, format, max, height = 200, wide, id }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const peak = kind === 'bars' ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const top = max ?? nice(peak);
  const plotW = width - LEFT - RIGHT, plotH = height - TOP - BOTTOM;
  const band = plotW / Math.max(n, 1);
  const barW = Math.max(1, Math.min(24, band * 0.7));
  const y = (v: number) => TOP + plotH - (v / top) * plotH;
  const cx = (i: number) => LEFT + band * i + band / 2;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 56))));
  const empty = totals.every((v, i) => v === 0 && series.every((s) => s.values[i] == null));

  return (
    <div id={id} className={'card chart anchor' + (wide ? ' wide' : '')}>
      <div className="spread">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="row">
          {aside}
          <button type="button" className="btn ghost sm" aria-pressed={table} onClick={() => setTable(!table)}>
            {table ? t.data.asChart : t.data.asTable}
          </button>
        </div>
      </div>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
      {table ? (
        <div className="chart-table">
          <table>
            <thead>
              <tr><th>{t.data.when}</th>{series.map((s) => <th key={s.label}>{s.label}</th>)}{kind === 'bars' && series.length > 1 && <th>{t.data.total}</th>}</tr>
            </thead>
            <tbody>
              {titles.map((label, i) => (
                <tr key={i}>
                  <td>{label}</td>
                  {series.map((s) => <td key={s.label}>{s.values[i] == null ? '—' : format(s.values[i])}</td>)}
                  {kind === 'bars' && series.length > 1 && <td>{format(totals[i])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="chart-box" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={height} role="img" aria-label={title}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={LEFT} x2={width - RIGHT} y1={y(top * f)} y2={y(top * f)} className={f === 0 ? 'axis' : 'grid'} />
                <text x={LEFT - 8} y={y(top * f)} dy="0.32em" textAnchor="end">{format(top * f)}</text>
              </g>
            ))}
            {labels.map((l, i) => (i % every === 0 ? <text key={i} x={cx(i)} y={height - 6} textAnchor="middle">{l}</text> : null))}
            {hover !== null && <line className="crosshair" x1={cx(hover)} x2={cx(hover)} y1={TOP} y2={TOP + plotH} />}
            {kind === 'bars'
              ? labels.map((_, i) => {
                  const values = series.map((s) => s.values[i] ?? 0);
                  const last = values.reduce((k, v, j) => (v > 0 ? j : k), -1);
                  let base = 0;
                  return values.map((v, j) => {
                    if (v <= 0) return null;
                    // A 2 px gap of the surface above the segment below.
                    const bottom = y(base) - (base > 0 ? 2 : 0), upper = y(base + v);
                    const h = Math.max(1, bottom - upper);
                    base += v;
                    return <path key={`${i}-${j}`} d={column(cx(i) - barW / 2, bottom - h, barW, h, j === last)} fill={series[j].color} opacity={hover === null || hover === i ? 1 : 0.55} />;
                  });
                })
              : series.map((s) => {
                  let d = '';
                  s.values.forEach((v, i) => {
                    if (v == null) return;
                    d += `${d && s.values[i - 1] != null ? 'L' : 'M'}${cx(i)},${y(v)}`;
                  });
                  // A measure alone (no neighbour to join) is a dot, else it would not show.
                  const alone = s.values.map((v, i) => v != null && s.values[i - 1] == null && s.values[i + 1] == null);
                  return (
                    <g key={s.label}>
                      <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {alone.map((a, i) => (a ? <circle key={i} cx={cx(i)} cy={y(s.values[i] ?? 0)} r={3} fill={s.color} /> : null))}
                    </g>
                  );
                })}
            {kind === 'line' && hover !== null &&
              series.map((s) => (s.values[hover] == null ? null : <circle key={s.label} cx={cx(hover)} cy={y(s.values[hover])} r={4} fill={s.color} className="marker" />))}
            {labels.map((_, i) => (
              <rect key={i} x={LEFT + band * i} y={TOP} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            ))}
          </svg>
          {empty && <div className="chart-empty">{t.data.noMeasure}</div>}
          {hover !== null && (
            <div className="chart-tip" style={{ left: Math.min(Math.max(cx(hover), 90), width - 90) }}>
              <b>{titles[hover]}</b>
              {series.map((s) => (
                <div key={s.label}><i style={{ background: s.color }} />{s.label}<span>{s.values[hover] == null ? '—' : format(s.values[hover])}</span></div>
              ))}
              {kind === 'bars' && series.length > 1 && <div className="tip-total">{t.data.total}<span>{format(totals[hover])}</span></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
