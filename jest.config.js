module.exports = {
  preset: '@react-native/jest-preset',
  // Transform ESM-only packages shipped untranspiled in node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@shopify|zustand)/)',
  ],
};
