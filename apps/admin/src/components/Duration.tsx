/**
 * @file Duration.tsx
 * @description How long a link stays valid: quick choices, or a number and a unit.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useState } from 'react';
import { date, UNITS, type Unit } from '../format.ts';
import { Seg } from './ui.tsx';

const QUICK: [string, string, number][] = [
  ['1h', '1 h', 3600],
  ['24h', '24 h', 86400],
  ['7j', '7 j', 7 * 86400],
  ['30j', '30 j', 30 * 86400],
  ['custom', 'Personnalisé', 0],
];

export function Duration({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const [choice, setChoice] = useState(QUICK.find((q) => q[2] === seconds)?.[0] ?? 'custom');
  const [amount, setAmount] = useState(7);
  const [unit, setUnit] = useState<Unit>('jours');
  // Read once: the end date follows the chosen length.
  const [now] = useState(() => Date.now() / 1000);
  const pick = (c: string) => {
    setChoice(c);
    const q = QUICK.find((x) => x[0] === c);
    if (q && q[2]) onChange(q[2]);
    else onChange(amount * UNITS[unit]);
  };
  return (
    <>
      <Seg value={choice} options={QUICK.map(([v, l]) => [v, l])} onChange={pick} />
      {choice === 'custom' && (
        <div className="row mt-s">
          <input className="input" type="number" min={1} value={amount} style={{ width: 90 }} onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setAmount(n); onChange(n * UNITS[unit]); }} />
          <select className="input" style={{ width: 140 }} value={unit} onChange={(e) => { const u = e.target.value as Unit; setUnit(u); onChange(amount * UNITS[u]); }}>
            {Object.keys(UNITS).map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      )}
      <p className="muted small" style={{ margin: '8px 0 0' }}>Jusqu'au {date(now + seconds)}. Entre une minute et un an.</p>
    </>
  );
}
