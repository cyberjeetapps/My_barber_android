// withAutoVerify.js
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAutoVerify(config) {
  return withAndroidManifest(config, (config) => {
    const mainActivity = config.modResults.manifest.application[0].activity?.find(
      activity => activity.$['android:name'] === '.MainActivity'
    );
    
    if (mainActivity && mainActivity['intent-filter']) {
      mainActivity['intent-filter'].forEach((filter) => {
        // Only set autoVerify for intent filters that contain VIEW actions with HTTP/HTTPS data
        const hasViewAction = filter.action?.some(
          action => action.$['android:name'] === 'android.intent.action.VIEW'
        );
        
        const hasHttpData = filter.data?.some(
          data => data.$['android:scheme'] === 'https' || data.$['android:scheme'] === 'http'
        );

        if (hasViewAction && hasHttpData) {
          filter.$ = {
            ...filter.$,    
            'android:autoVerify': 'true'
          };
        }
      });
    }

    return config;
  });
};