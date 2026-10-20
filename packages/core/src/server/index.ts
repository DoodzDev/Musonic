/**
 * @file index.ts
 * @description Types of the Musonic Server native API (`/v1`) and its real-time events,
 *   generated from the server's Rust code (`apps/server`, `cargo test`; see ADR-018).
 *   Never edit `generated/` by hand.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */

export type { ServerInfo } from './generated/ServerInfo.ts';
export type { Event } from './generated/Event.ts';
export type { EventMessage } from './generated/EventMessage.ts';
export type { LikeItem } from './generated/LikeItem.ts';
export type { PlaylistAction } from './generated/PlaylistAction.ts';
export type { ImportState } from './generated/ImportState.ts';
export type { UserRef } from './generated/UserRef.ts';
