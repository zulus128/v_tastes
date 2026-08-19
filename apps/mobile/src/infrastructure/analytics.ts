import {
  getAnalytics,
  logEvent,
  logScreenView,
  setUserId,
  type Analytics,
} from '@react-native-firebase/analytics';

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

let client: Analytics | null = null;
let unavailable = false;

/**
 * Firebase Analytics ships as native code, so it is missing from any binary built before it was
 * added. Resolve it lazily and degrade to a no-op rather than crashing those older builds.
 */
function analytics(): Analytics | null {
  if (unavailable) return null;
  try {
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

export function trackScreenView(screenName: string) {
  const instance = analytics();
  if (!instance) return;
  logScreenView(instance, { screen_name: screenName, screen_class: screenName }).catch(swallow);
}

export function trackAnalyticsEvent(name: string, params?: AnalyticsParams) {
  const instance = analytics();
  if (!instance) return;
  try {
    logEvent(instance, name, params);
  } catch (error) {
    swallow(error);
  }
}

export function identifyAnalyticsUser(userId: string | null) {
  const instance = analytics();
  if (!instance) return;
  setUserId(instance, userId).catch(swallow);
}
