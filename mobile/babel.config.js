module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4 requires the worklets plugin, and it MUST be
    // listed last.
    plugins: ['react-native-worklets/plugin'],
  };
};
