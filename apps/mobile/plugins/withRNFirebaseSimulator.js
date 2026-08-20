const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withRNFirebaseSimulator(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (!podfile.includes('$RNFirebaseDisableSPM = true')) {
        podfile = podfile.replace(
          'target \'Tastes\' do',
          '$RNFirebaseDisableSPM = true\n$RNFirebaseAsStaticFramework = true\n\ntarget \'Tastes\' do',
        );
      }

      podfile = podfile.replace(
        "'react-native-config',\n      '--json',",
        "'react-native-config',\n      '--exclude',\n      '@react-native-firebase/app',\n      '--exclude',\n      '@react-native-firebase/analytics',\n      '--json',",
      );

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
