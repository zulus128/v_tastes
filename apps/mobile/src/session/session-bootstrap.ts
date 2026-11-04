import { normalizeApiError } from '@tastes/firebase-client';

/** Retry account bootstrap once after refreshing expired startup credentials. */
export async function runSessionBootstrap<T>(
  operation: () => Promise<T>,
  refreshCredentials: () => Promise<void>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (normalizeApiError(error).code !== 'unauthenticated') throw error;
    await refreshCredentials();
    return operation();
  }
}
