module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        alias: {
          '@api': './src/api',
          '@components': './src/components',
          '@screens': './src/screens',
          '@store': './src/store',
          '@theme': './src/theme',
          '@hooks': './src/hooks',
          '@utils': './src/utils',
          '@navigation': './src/navigation',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
