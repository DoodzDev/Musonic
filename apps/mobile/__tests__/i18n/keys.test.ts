/**
 * @file keys.test.ts
 * @description French and English strings have exactly the same keys, and
 *   functions take the same number of arguments: a text missing in one
 *   language would show up as `undefined` on screen.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {t as fr} from '../../src/i18n/fr';
import {en} from '../../src/i18n/en';

/** Every leaf as `path:type` (functions with their arity). */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}:function/${value.length}`];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => shape(v, path ? `${path}.${key}` : key));
  }
  return [`${path}:${typeof value}`];
}

it('has the same keys in French and English', () => {
  const frKeys = new Set(shape(fr));
  const enKeys = new Set(shape(en));
  expect([...frKeys].filter(k => !enKeys.has(k))).toEqual([]);
  expect([...enKeys].filter(k => !frKeys.has(k))).toEqual([]);
});

it('has no empty text', () => {
  const empty = (dict: unknown) => shape(dict).filter(k => k.endsWith(':string')).filter(k => {
    const value = k.split(':')[0].split('.').reduce<any>((o, part) => o?.[part], dict);
    return String(value).trim() === '';
  });
  expect(empty(fr)).toEqual([]);
  expect(empty(en)).toEqual([]);
});
