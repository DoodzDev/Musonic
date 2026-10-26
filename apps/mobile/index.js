/**
 * @file index.js
 * @description Application entry point. Registers the React Native app and the
 *   RNTP headless playback service that keeps audio running in the background,
 *   and the task Android Auto uses to start the player while the app is closed.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import TrackPlayer from './src/services/player';
import {PlaybackService} from './src/services/PlaybackService';
import {setupPlayer} from './src/services/setupPlayer';

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
// Android Auto connects while Musonic is closed: start the player without a screen (ADR-015).
AppRegistry.registerHeadlessTask('MusonicAutoStart', () => setupPlayer);
