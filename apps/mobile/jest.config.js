const path = require('path');

module.exports = {
  preset: '@react-native/jest-preset',
  // Shared core files live outside this folder: resolve their imports from the app too.
  moduleDirectories: ['node_modules', path.resolve(__dirname, 'node_modules')],
  // Transform ESM-only packages shipped untranspiled in node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@shopify|zustand)/)',
  ],
};
