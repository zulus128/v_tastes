import {
  createTastesApi,
  type TastesApi,
  type TastesApiError,
} from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { auth, functions } from '../infrastructure/firebase';
import { captureException, track } from '../infrastructure/observability';
import { queryClient, queryPersister } from '../infrastructure/query';
import { authenticatedPhase } from './model';

export type SessionState =
  | { status: 'booting'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'onboarding'; user: User }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; user: User; error: TastesApiError };

interface SessionContextValue {
  state: SessionState;
  api: TastesApi;
  refresh: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: 'booting', user: null });

  const logout = useCallback(async () => {
    queryClient.clear();
    await queryPersister.removeClient();
    await signOut(auth);
    setState({ status: 'anonymous', user: null });
  }, []);

  const api = useMemo(() => createTastesApi(functions, {
    onUnauthenticated: logout,
    onError: (error, operation) => captureException(error, {
      source: 'api',
      operation,
      code: error.code,
    }),
  }), [logout]);

  const loadStatus = useCallback(async (user: User) => {
    try {
      const result = await api.getSessionStatus();
      if (result.data.profileExists && !result.data.onboardingComplete) {
        const legacyComplete = await AsyncStorage.getItem(`tastes:post-signup-onboarding:${user.uid}`);
        if (legacyComplete === 'complete') {
          await api.completeOnboarding({ version: 1 });
          await AsyncStorage.removeItem(`tastes:post-signup-onboarding:${user.uid}`);
          setState({ status: 'authenticated', user });
          return;
        }
      }
      setState({
        status: authenticatedPhase(result.data.onboardingComplete),
        user,
      });
    } catch (error) {
      if ((error as TastesApiError).code !== 'unauthenticated') {
        setState({ status: 'error', user, error: error as TastesApiError });
      }
    }
  }, [api]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (!user) {
      queryClient.clear();
      void queryPersister.removeClient();
      setState({ status: 'anonymous', user: null });
      return;
    }
    setState({ status: 'booting', user: null });
    void loadStatus(user);
  }), [loadStatus]);

  const refresh = useCallback(async () => {
    if (auth.currentUser) await loadStatus(auth.currentUser);
  }, [loadStatus]);

  const completeOnboarding = useCallback(async () => {
    if (!auth.currentUser) return;
    await api.completeOnboarding({ version: 1 });
    track('onboarding_completed', { version: 1 });
    setState({ status: 'authenticated', user: auth.currentUser });
  }, [api]);

  const value = useMemo(
    () => ({ state, api, refresh, completeOnboarding, logout }),
    [api, completeOnboarding, logout, refresh, state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}

export function useTastesApi(): TastesApi {
  return useSession().api;
}

export function useAuthenticatedUserId(): string {
  const { state } = useSession();
  if (state.status !== 'authenticated') {
    throw new Error('An authenticated session is required.');
  }
  return state.user.uid;
}
