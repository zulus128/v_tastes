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

export function setObservabilitySink(nextSink: ObservabilitySink) {
  sink = nextSink;
}

export function captureException(error: unknown, context?: ObservabilityContext) {
  sink.captureException(error, context);
}

export function track(event: string, context?: ObservabilityContext) {
  sink.track(event, context);
}
