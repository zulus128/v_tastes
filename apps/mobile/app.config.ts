import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

export default function configureExpo({ config }: ConfigContext): ExpoConfig {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    },
  } as ExpoConfig;
}
