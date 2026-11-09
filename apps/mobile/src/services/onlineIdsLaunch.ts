/**
 * @file onlineIdsLaunch.ts
 * @description Imported first by `index.js`: saved Deezer ids are converted
 *   before any store loads them (see `onlineIdsMigration.ts`).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {convertOnlineIdsAtLaunch} from './onlineIdsMigration';

convertOnlineIdsAtLaunch();
