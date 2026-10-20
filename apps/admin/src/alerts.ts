/**
 * @file alerts.ts
 * @description The sentences of the server's alerts (it sends their kind and figures only).
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import type { Alert } from '@musonic/core';
import { bytes, relative } from './format.ts';
import { t } from './i18n/index.ts';

/** Title and detail of an alert. */
export function alertText(a: Alert): [string, string] {
  const x = t.alerts;
  switch (a.kind) {
    case 'credentials':
      return [x.credentials(a.provider ?? '?'), x.credentialsDetail];
    case 'imports':
      return [x.imports(a.count ?? 0), x.importsDetail];
    case 'disk':
      return [x.disk, x.diskDetail(bytes(a.freeBytes ?? 0))];
    case 'backup':
      return [x.backup, `${x.backupDetail}${a.since ? ` (${relative(a.since)})` : ''}`];
    case 'update':
      return [x.update(a.version ?? ''), x.updateDetail(a.current ?? '')];
    default:
      return [a.kind, ''];
  }
}
