/**
 * @file DashboardPage.tsx
 * @description Home of the console. For now the server's state from `/health`; the full
 *   dashboard (figures, disk, activity, now playing) comes with lot C2.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';

interface Health {
  version: string;
  scan?: { last?: { files: number; duration_ms: number } };
  imports?: { pending: number; running: number; failed: number; done: number };
  providers: string[];
}

export function DashboardPage() {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    fetch('/health').then((r) => r.json()).then(setH).catch(() => setH(null));
  }, []);
  return (
    <>
      <div className="head"><div><h1>Tableau de bord</h1><p className="sub">Le tableau de bord complet arrive avec la tranche C2.</p></div></div>
      <div className="grid g4">
        <div className="card stat"><b>{h?.scan?.last?.files ?? '…'}</b><span>fichiers de musique</span></div>
        <div className="card stat"><b>{h?.imports?.done ?? '…'}</b><span>titres importés</span></div>
        <div className="card stat"><b>{h?.providers.length ?? '…'}</b><span>fournisseurs</span></div>
        <div className="card stat"><b>{h?.version ?? '…'}</b><span>version du serveur</span></div>
      </div>
      <div className="card mt">
        <div className="spread"><h2 style={{ margin: 0 }}>Comptes</h2><Link className="btn sm" to="/accounts">Gérer</Link></div>
        <p className="muted small">Invitez quelqu'un, réglez ses droits, envoyez un lien de réinitialisation.</p>
      </div>
    </>
  );
}
