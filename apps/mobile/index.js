/**
 * @file index.js
 * @description Application entry point. Registers the React Native app and the
 *   RNTP headless playback service that keeps audio running in the background.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import TrackPlayer from 'react-native-track-player';
import {PlaybackService} from './src/services/PlaybackService';

AppRegistry.registerComponent(appName, () => App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
