import { TastesApiError } from '@tastes/firebase-client';
import { QueryClient } from '@tanstack/react-query';
import { captureException } from './observability';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry(failureCount, error) {
        if (error instanceof TastesApiError && !error.retryable) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
      onError(error) {
        captureException(error, { source: 'mutation' });
      },
    },
  },
});
