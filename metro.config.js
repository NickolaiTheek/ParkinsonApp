const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure resolver exists
config.resolver = config.resolver || {};

// Specifically override 'ws', 'stream', 'events', 'crypto', 'http', 'https', and 'net' to point to an empty module
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  'ws': require.resolve('./empty-module.js'),
  'stream': require.resolve('./empty-module.js'),
  'events': require.resolve('./empty-module.js'),
  'crypto': require.resolve('./empty-module.js'),
  'http': require.resolve('./empty-module.js'),
  'https': require.resolve('./empty-module.js'),
  'net': require.resolve('./empty-module.js'),
  'tls': require.resolve('./empty-module.js'),
  'url': require.resolve('./empty-module.js'),
  'zlib': require.resolve('./empty-module.js'),
};

module.exports = config; 