export type ObservabilityContext = Record<string, string | number | boolean | null | undefined>;

export interface ObservabilitySink {
  captureException: (error: unknown, context?: ObservabilityContext) => void;
  track: (event: string, context?: ObservabilityContext) => void;
}

const consoleSink: ObservabilitySink = {
  captureException(error, context) {
    if (__DEV__) console.error('[tastes]', context, error);
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
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        platform: 'mobile',
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    }).catch((error) => {
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
  sink.track(event, context);
}
