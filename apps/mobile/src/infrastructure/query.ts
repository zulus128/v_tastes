import AsyncStorage from '@react-native-async-storage/async-storage';
import { TastesApiError } from '@tastes/firebase-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { captureException } from './observability';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      networkMode: 'offlineFirst',
      retry(failureCount, error) {
        if (error instanceof TastesApiError && !error.retryable) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      networkMode: 'online',
      retry: false,
      onError(error) {
        captureException(error, { source: 'mutation' });
      },
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'tastes:query-cache:v1',
  throttleTime: 1_000,
});
