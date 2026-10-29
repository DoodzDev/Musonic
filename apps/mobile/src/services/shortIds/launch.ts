/**
 * @file launch.ts
 * @description Imported first by `index.js`: converts the saved state to short
 *   ids (ADR-026) before any store loads it.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {convertAtLaunch} from './boot';

convertAtLaunch();
