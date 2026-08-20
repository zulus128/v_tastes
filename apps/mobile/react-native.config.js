/* global module, process */
const simulatorBuild = process.env.EXPO_PUBLIC_SIMULATOR_BUILD === 'true';

module.exports = {
  dependencies: simulatorBuild
    ? {
        '@react-native-firebase/app': { platforms: { ios: null, android: null } },
        '@react-native-firebase/analytics': { platforms: { ios: null, android: null } },
      }
    : {},
};
