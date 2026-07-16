import { onCall } from 'firebase-functions/v2/https';
import { callableOptions } from '../../shared/options';

export const healthCheck = onCall(callableOptions, async () => ({
  status: 'ok' as const,
  service: 'tastes-backend' as const,
  timestamp: new Date().toISOString(),
}));
