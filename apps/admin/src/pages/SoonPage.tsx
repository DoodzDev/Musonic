/**
 * @file SoonPage.tsx
 * @description Page of a console section not built yet (see RMP-005 § 13).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { t } from '../i18n/index.ts';

export function SoonPage({ title, lot }: { title: string; lot?: string }) {
  return (
    <>
      <div className="head"><div><h1>{title}</h1><p className="sub">{lot ? t.common.soon(lot) : t.common.later}</p></div></div>
      <div className="card empty">{t.common.notBuilt}</div>
    </>
  );
}
