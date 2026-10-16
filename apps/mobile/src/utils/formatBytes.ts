/**
 * @file formatBytes.ts
 * @description Storage size as shown to the user (`49,4 Mo`, `1,2 Go`).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

export function formatBytes(bytes: number): string {
  const units = [
    [1024 * 1024 * 1024, 'Go'],
    [1024 * 1024, 'Mo'],
  ] as const;
  for (const [size, unit] of units) {
    if (bytes >= size) return `${(bytes / size).toFixed(1).replace('.', ',')} ${unit}`;
  }
  return `${Math.round(bytes / 1024)} Ko`;
}
