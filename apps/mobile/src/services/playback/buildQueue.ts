/**
 * @file buildQueue.ts
 * @description The pure playback rules (ADR-009) now live in the shared core,
 *   so the web player follows exactly the same rules; this file keeps the
 *   mobile imports unchanged.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
export * from '@musonic/core/playback';
