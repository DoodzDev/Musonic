/**
 * @file index.ts
 * @description Types of the Musonic Server native API (`/v1`) and its real-time events,
 *   generated from the server's Rust code (`apps/server`, `cargo test`; see ADR-018).
 *   Never edit `generated/` by hand.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */

export type { ServerInfo } from './generated/ServerInfo.ts';
export type { Event } from './generated/Event.ts';
export type { EventMessage } from './generated/EventMessage.ts';
export type { LikeItem } from './generated/LikeItem.ts';
export type { PlaylistAction } from './generated/PlaylistAction.ts';
export type { ImportState } from './generated/ImportState.ts';
export type { UserRef } from './generated/UserRef.ts';
export type { Account } from './generated/Account.ts';
export type { AccountDetail } from './generated/AccountDetail.ts';
export type { AccountChanges } from './generated/AccountChanges.ts';
export type { Limits } from './generated/Limits.ts';
export type { Invitation } from './generated/Invitation.ts';
export type { InvitationRequest } from './generated/InvitationRequest.ts';
export type { PasswordReset } from './generated/PasswordReset.ts';
export type { ResetRequest } from './generated/ResetRequest.ts';
export type { LinkInfo } from './generated/LinkInfo.ts';
export type { LinkState } from './generated/LinkState.ts';
