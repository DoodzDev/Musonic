/**
 * @file SoonPage.tsx
 * @description Page of a console section not built yet (see RMP-005 § 13).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

export function SoonPage({ title, lot }: { title: string; lot: string }) {
  return (
    <>
      <div className="head"><div><h1>{title}</h1><p className="sub">Arrive avec la tranche {lot} de la console.</p></div></div>
      <div className="card empty">Cette partie n'est pas encore construite.</div>
    </>
  );
}
