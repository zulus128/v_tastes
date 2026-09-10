import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

type ExpoConfigWithAutolinking = ExpoConfig & {
  autolinking?: {
    exclude?: string[];
  };
};

export default function configureExpo({ config }: ConfigContext): ExpoConfig {
  const baseConfig = config as ExpoConfigWithAutolinking;
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  const otaRevision = process.env.EXPO_PUBLIC_OTA_REVISION?.trim() || '0';
  const simulatorBuild = process.env.EXPO_PUBLIC_SIMULATOR_BUILD === 'true';
  const plugins = simulatorBuild
    ? appJson.expo.plugins?.filter((plugin) => {
        const name = Array.isArray(plugin) ? plugin[0] : plugin;
        return name !== '@react-native-firebase/app' && name !== '@react-native-firebase/analytics';
      }).concat('./plugins/withRNFirebaseSimulator')
    : appJson.expo.plugins;
  return {
    ...config,
    ...appJson.expo,
    plugins,
    autolinking: simulatorBuild
      ? {
          ...(baseConfig.autolinking ?? {}),
          exclude: ['@react-native-firebase/app', '@react-native-firebase/analytics'],
        }
      : baseConfig.autolinking,
    android: {
      ...appJson.expo.android,
      ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    },
    extra: {
      ...appJson.expo.extra,
      otaRevision,
    },
  } as ExpoConfigWithAutolinking;
}
