const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Shared core of the monorepo, imported through the Babel alias `@musonic/core/...`.
  watchFolders: [path.resolve(__dirname, '../../packages/core')],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
