import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { TastesApiError } from '@tastes/firebase-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
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
  throttleTime: 5_000,
});

const OFFLINE_QUERY_ROOTS = new Set(['feed', 'comments', 'leaderboard']);

export function shouldPersistQuery(query: Query): boolean {
  return typeof query.queryKey[0] === 'string' && OFFLINE_QUERY_ROOTS.has(query.queryKey[0]);
}

if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => subscription.remove();
  });
  onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }));
}
