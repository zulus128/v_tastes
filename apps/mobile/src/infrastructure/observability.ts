import { trackAnalyticsEvent } from './analytics';
import { auth } from './firebase';

export type ObservabilityContext = Record<string, string | number | boolean | null | undefined>;

export interface ObservabilitySink {
  captureException: (error: unknown, context?: ObservabilityContext) => void;
  track: (event: string, context?: ObservabilityContext) => void;
}

const consoleSink: ObservabilitySink = {
  captureException(error, context) {
    if (!__DEV__) return;

    const retryable = (error as { retryable?: unknown } | null)?.retryable === true;
    if (retryable) {
      // React Query retries transient API failures. Keep them visible in the
      // development console without turning a brief network outage into a
      // React Native redbox before the retry has a chance to succeed.
      console.info('[tastes] retryable error', context, error);
      return;
    }

    console.error('[tastes]', context, error);
  },
  track(event, context) {
    if (__DEV__) console.info(`[tastes] ${event}`, context);
  },
};

let sink: ObservabilitySink = consoleSink;

export function configureObservability() {
  const endpoint = process.env.EXPO_PUBLIC_OBSERVABILITY_ENDPOINT;
  if (!endpoint) return;

  const send = (kind: 'exception' | 'event', payload: Record<string, unknown>) => {
    void (async () => {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind,
          platform: 'mobile',
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      });
      if (!response.ok) throw new Error(`Observability endpoint returned ${response.status}`);
    })().catch((error) => {
      if (__DEV__) console.error('[tastes] observability delivery failed', error);
    });
  };

  setObservabilitySink({
    captureException(error, context) {
      const candidate = error instanceof Error ? error : new Error(String(error));
      send('exception', {
        name: candidate.name,
        message: candidate.message,
        stack: candidate.stack,
        context,
      });
    },
    track(event, context) {
      send('event', { event, context });
    },
  });
}

export function setObservabilitySink(nextSink: ObservabilitySink) {
  sink = nextSink;
}

export function captureException(error: unknown, context?: ObservabilityContext) {
  sink.captureException(error, context);
}

export function track(event: string, context?: ObservabilityContext) {
  trackAnalyticsEvent(event, context);
  sink.track(event, context);
}
