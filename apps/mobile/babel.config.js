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
          // Shared core of the monorepo (dependency-free modules only).
          '@musonic/core/releases': '../../packages/core/src/releases/releases.ts',
          '@musonic/core/home': '../../packages/core/src/home/home.ts',
          '@musonic/core/playback': '../../packages/core/src/playback/buildQueue.ts',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
