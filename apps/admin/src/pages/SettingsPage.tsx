/**
 * @file SettingsPage.tsx
 * @description Settings and maintenance. For now the console's language; the server's
 *   settings, backups, logs and the hosted web client come with lot C7.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { LANGS, lang, setLang, t, type Lang } from '../i18n/index.ts';
import { Seg } from '../components/ui.tsx';

export function SettingsPage() {
  return (
    <>
      <div className="head"><div><h1>{t.settings.title}</h1></div></div>
      <div className="grid g2">
        <div className="card">
          <h2>{t.settings.language}</h2>
          <Seg<Lang> value={lang} options={(Object.keys(LANGS) as Lang[]).map((l) => [l, LANGS[l].name])} onChange={setLang} />
          <p className="muted small mt-s">{t.settings.languageHelp}</p>
        </div>
        <div className="card empty">{t.settings.more}</div>
      </div>
    </>
  );
}
