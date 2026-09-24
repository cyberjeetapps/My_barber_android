const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add this resolver configuration
config.resolver.assetExts.push(
  'db', // for database files
  'mp3', // for audio files
  'ttf', // for fonts
  'obj', // for 3D objects
  'png',
  'jpg'
);

config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

// Enable symlinks support
config.resolver.unstable_enableSymlinks = true;

// Add this transformer configuration
config.transformer = {
  ...config.transformer,
  minifierConfig: {
    keep_classnames: true,
    keep_fnames: true,
    mangle: {
      keep_classnames: true,
      keep_fnames: true,
    },
  },
};

module.exports = config;