/**
 * @file journal.ts
 * @description The server's journal as the console shows it: the sentence of each coded line
 *   (in the console's language), its icon, the filters of the « Activité » page.
 * @author DoodzProg
 * @version 0.2.0
 * @license CC-BY-NC-4.0
 */

import type { IconName } from '@musonic/icons';
import type { JournalEntry } from '@musonic/core';
import { bytes } from './format.ts';
import { t } from './i18n/index.ts';

/** Families of codes, as the server filters them (prefixes or whole codes). */
export const KINDS = {
  all: '',
  login: 'login',
  accounts: 'account,invite,reset,password,key',
  imports: 'import,playlist',
  server: 'server,backup,provider,settings,library,caches,webapp',
  problems: 'login.fail,login.blocked,login.suspended,import.failed,backup.failed,provider.expired',
} as const;
export type Kind = keyof typeof KINDS;

const PROBLEMS = new Set(KINDS.problems.split(','));

/** Something that went wrong (shown with a warning icon). */
export function isProblem(e: JournalEntry): boolean {
  return PROBLEMS.has(e.code);
}

/** The sentence of a line. */
export function describe(e: JournalEntry): string {
  let d = e.detail ?? '';
  let target = e.target ?? '';
  if (e.code === 'backup.done' || e.code === 'settings.journal' || e.code === 'caches.cleared') d = bytes(Number(d));
  if (e.code === 'settings.quota') d = d === '0' ? t.journal.unlimited : bytes(Number(d));
  if (e.code === 'settings.changed') {
    d = settingValue(target, d);
    target = t.settings.names[target] ?? target;
  }
  const text = t.journal.codes[e.code];
  return text ? text(e.user ?? '', target, d) : t.journal.unknown(e.code);
}

/** A server setting's value as people read it ("MP3 320", "6 heures", "activé"). */
export function settingValue(key: string, value: string): string {
  if (value === 'true') return t.journal.on;
  if (value === 'false') return t.journal.off;
  if (key === 'import_quality') return t.imports.qualities[value] ?? value;
  if (key === 'scan_interval_minutes') return t.library.every[Number(value)] ?? t.library.everyMinutes(Number(value));
  if (key === 'backup_days') return Number(value) ? t.settings.days(Number(value)) : t.settings.keepOff;
  return value;
}

export function icon(e: JournalEntry): IconName {
  if (isProblem(e)) return 'alert-triangle';
  const family = e.code.split('.')[0];
  switch (family) {
    case 'login':
      return 'person';
    case 'account':
    case 'invite':
      return 'person';
    case 'key':
      return 'phone';
    case 'password':
    case 'reset':
      return 'lock';
    case 'import':
      return 'download';
    case 'backup':
      return 'check';
    case 'provider':
      return 'cloud';
    case 'settings':
      return 'faders';
    case 'library':
      return 'library';
    case 'webapp':
      return 'globe';
    case 'playlist':
      return 'playlist';
    default:
      return 'computer';
  }
}
