// Expo default Metro config, with one resolver adjustment.
//
// axios ships its entry through an "exports"/field map whose native resolution
// lands on the raw source (`axios/index.js`), which imports Node core modules
// (`http`, `https`, `http2`, …) that do not exist in React Native, so bundling
// fails. axios also ships a self-contained browser build with no Node-adapter
// code; at runtime axios selects the XHR adapter on React Native anyway. We
// redirect the bare `axios` specifier to that browser build so Metro never
// pulls the Node adapters into the graph.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const axiosBrowser = path.resolve(
  __dirname,
  'node_modules/axios/dist/browser/axios.cjs'
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'axios') {
    return { type: 'sourceFile', filePath: axiosBrowser };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
