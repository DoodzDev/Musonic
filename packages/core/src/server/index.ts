/**
 * @file index.ts
 * @description Types of the Musonic Server native API (`/v1`) and its real-time events,
 *   generated from the server's Rust code (`apps/server`, `cargo test`; see ADR-018).
 *   Never edit `generated/` by hand.
 * @author DoodzProg
 * @version 1.5.0
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
export type { AdminStatus } from './generated/AdminStatus.ts';
export type { Live } from './generated/Live.ts';
export type { Measure } from './generated/Measure.ts';
export type { Measures } from './generated/Measures.ts';
export type { MeasuresRequest } from './generated/MeasuresRequest.ts';
export type { Disk } from './generated/Disk.ts';
export type { Library } from './generated/Library.ts';
export type { Folders } from './generated/Folders.ts';
export type { Playing } from './generated/Playing.ts';
export type { Imports } from './generated/Imports.ts';
export type { Alert } from './generated/Alert.ts';
export type { JournalEntry } from './generated/JournalEntry.ts';
export type { JournalPage } from './generated/JournalPage.ts';
export type { JournalQuery } from './generated/JournalQuery.ts';
export type { JournalSize } from './generated/JournalSize.ts';
export type { Releases } from './generated/Releases.ts';
export type { Release } from './generated/Release.ts';
export type { Backup } from './generated/Backup.ts';
export type { Blocked } from './generated/Blocked.ts';
export type { Device } from './generated/Device.ts';
export type { Devices } from './generated/Devices.ts';
export type { ImportJob } from './generated/ImportJob.ts';
export type { ImportList } from './generated/ImportList.ts';
export type { LibraryOverview } from './generated/LibraryOverview.ts';
export type { LogLine } from './generated/LogLine.ts';
export type { ProviderInfo } from './generated/ProviderInfo.ts';
export type { SettingValue } from './generated/SettingValue.ts';
export type { Settings } from './generated/Settings.ts';
export type { SignIn } from './generated/SignIn.ts';
export type { TrackDetail } from './generated/TrackDetail.ts';
export type { TrackFile } from './generated/TrackFile.ts';
export type { TrackPage } from './generated/TrackPage.ts';
export type { TrackRow } from './generated/TrackRow.ts';
export type { WebApp } from './generated/WebApp.ts';
export type { PlaylistImportRequest } from './generated/PlaylistImportRequest.ts';
export type { PlaylistPreview } from './generated/PlaylistPreview.ts';
export type { PlaylistImport } from './generated/PlaylistImport.ts';
export type { PlaylistImportTrack } from './generated/PlaylistImportTrack.ts';
export type { PlaylistImportDetail } from './generated/PlaylistImportDetail.ts';
