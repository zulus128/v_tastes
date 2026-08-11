import { getAuth } from 'firebase-admin/auth';
import { error as logError, info as logInfo } from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';

const MAX_BODY_BYTES = 16_384;
const MAX_TEXT_LENGTH = 4_000;
const MAX_CONTEXT_FIELDS = 30;

type Scalar = string | number | boolean | null;

function trimText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, maxLength);
}

function sanitizeContext(value: unknown): Record<string, Scalar> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const context: Record<string, Scalar> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_CONTEXT_FIELDS)) {
    if (item === null || typeof item === 'number' || typeof item === 'boolean') {
      context[key.slice(0, 80)] = item;
    } else if (typeof item === 'string') {
      context[key.slice(0, 80)] = item.slice(0, 500);
    }
  }
  return context;
}

export const ingestMobileTelemetry = onRequest(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    maxInstances: 5,
    timeoutSeconds: 10,
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const contentLength = Number(request.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      response.status(413).json({ error: 'payload-too-large' });
      return;
    }

    const authorization = request.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      response.status(401).json({ error: 'authentication-required' });
      return;
    }

    let uid: string;
    try {
      uid = (await getAuth().verifyIdToken(authorization.slice('Bearer '.length))).uid;
    } catch {
      response.status(401).json({ error: 'invalid-token' });
      return;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const kind = body?.kind;
    if (kind !== 'exception' && kind !== 'event') {
      response.status(400).json({ error: 'invalid-kind' });
      return;
    }

    const common = {
      telemetrySource: 'mobile',
      uid,
      clientTimestamp: trimText(body?.timestamp, 80),
      context: sanitizeContext(body?.context),
    };

    if (kind === 'exception') {
      logError('mobile_exception', {
        ...common,
        errorName: trimText(body?.name, 160),
        errorMessage: trimText(body?.message),
        stack: trimText(body?.stack, 8_000),
      });
    } else {
      const event = trimText(body?.event, 160);
      if (!event) {
        response.status(400).json({ error: 'invalid-event' });
        return;
      }
      logInfo('mobile_event', { ...common, event });
    }

    response.status(202).json({ accepted: true });
  },
);
