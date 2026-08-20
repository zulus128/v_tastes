import type { Analytics } from '@react-native-firebase/analytics';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

type AnalyticsModule = {
  getAnalytics: () => Analytics;
  logEvent: (instance: Analytics, name: string, params?: AnalyticsParams) => Promise<void>;
  setUserId: (instance: Analytics, userId: string | null) => Promise<void>;
};

let client: Analytics | null = null;
let unavailable = process.env.EXPO_PUBLIC_SIMULATOR_BUILD === 'true';

/**
 * Firebase Analytics ships as native code, so it is missing from any binary built before it was
 * added. Resolve it lazily and degrade to a no-op rather than crashing those older builds.
 */
function analytics(): Analytics | null {
  if (unavailable) return null;
  try {
    // The simulator binary intentionally excludes Firebase native modules. Keep this import
    // lazy so merely loading the JS bundle does not ask for a missing native TurboModule.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAnalytics } = require('@react-native-firebase/analytics') as AnalyticsModule;
    client ??= getAnalytics();
    return client;
  } catch (error) {
    unavailable = true;
    if (__DEV__) console.warn('[tastes] Firebase Analytics is unavailable, rebuild the native app.', error);
    return null;
  }
}

function swallow(error: unknown) {
  if (__DEV__) console.warn('[tastes] analytics delivery failed', error);
}

export function trackAnalyticsEvent(name: string, params?: AnalyticsParams) {
  const instance = analytics();
  if (!instance) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logEvent } = require('@react-native-firebase/analytics') as AnalyticsModule;
    logEvent(instance, name, params);
  } catch (error) {
    swallow(error);
  }
}

export function identifyAnalyticsUser(userId: string | null) {
  const instance = analytics();
  if (!instance) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setUserId } = require('@react-native-firebase/analytics') as AnalyticsModule;
  setUserId(instance, userId).catch(swallow);
}
