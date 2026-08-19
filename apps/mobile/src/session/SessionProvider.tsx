import {
  createTastesApi,
  type TastesApi,
  type TastesApiError,
} from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CompleteOnboardingInput } from '@tastes/contracts';
import type { User } from 'firebase/auth';
import { deleteUser, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { identifyAnalyticsUser } from '../infrastructure/analytics';
import { auth, functions } from '../infrastructure/firebase';
import { captureException, track } from '../infrastructure/observability';
import {
  syncPushNotifications,
  unregisterPushNotifications,
} from '../infrastructure/pushNotifications';
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
  completeOnboarding: (input?: Partial<Omit<CompleteOnboardingInput, 'version'>>) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ status: 'booting', user: null });

  const clearLocalSession = useCallback(async () => {
    queryClient.clear();
    await queryPersister.removeClient();
    await signOut(auth);
    setState({ status: 'anonymous', user: null });
  }, []);

  const api = useMemo(() => createTastesApi(functions, {
    onUnauthenticated: clearLocalSession,
    onError: (error, operation) => {
      // A conversation can disappear while a stale deep link or cached route is
      // still open. The chat screen renders this as an ordinary empty/error
      // state, so do not turn the expected 404 into a React Native redbox.
      if (
        error.code === 'not-found'
        && (operation === 'getMessages' || operation === 'setTypingStatus' || operation === 'markConversationRead')
      ) return;
      // Marking a conversation read is best-effort and reruns automatically
      // whenever the conversation listener fires again. A stale "through"
      // message id (new messages just arrived) or a retryable backend hiccup
      // resolves itself on the next attempt, so it should not redbox either.
      if (
        operation === 'markConversationRead'
        && (error.code === 'failed-precondition' || error.retryable)
      ) return;
      captureException(error, {
        source: 'api',
        operation,
        code: error.code,
      });
    },
  }), [clearLocalSession]);

  const logout = useCallback(async () => {
    try {
      await unregisterPushNotifications(api);
    } catch (error) {
      captureException(error, { source: 'push', operation: 'unregisterPushToken' });
    } finally {
      await clearLocalSession();
    }
  }, [api, clearLocalSession]);

  const deleteAccount = useCallback(async () => {
    try {
      await unregisterPushNotifications(api);
    } catch (error) {
      captureException(error, { source: 'push', operation: 'unregisterPushToken' });
    }
    try {
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
    } catch (error) {
      captureException(error, { source: 'auth', operation: 'deleteUser' });
    } finally {
      await clearLocalSession();
    }
  }, [api, clearLocalSession]);

  const loadStatus = useCallback(async (user: User) => {
    try {
      const result = await api.getSessionStatus();
      if (result.data.profileExists) {
        void syncPushNotifications(api).catch((error) => {
          captureException(error, { source: 'push', operation: 'registerPushToken' });
        });
      }
      if (result.data.profileExists && !result.data.onboardingComplete) {
        const legacyComplete = await AsyncStorage.getItem(`tastes:post-signup-onboarding:${user.uid}`);
        if (legacyComplete === 'complete') {
          await api.completeOnboarding({ version: 1, invitedContactCount: 0, appearance: 'system' });
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
    identifyAnalyticsUser(user?.uid ?? null);
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

  const completeOnboarding = useCallback(async (input: Partial<Omit<CompleteOnboardingInput, 'version'>> = {}) => {
    if (!auth.currentUser) return;
    await api.completeOnboarding({ version: 1, invitedContactCount: 0, appearance: 'system', ...input });
    track('onboarding_completed', { version: 1 });
    setState({ status: 'authenticated', user: auth.currentUser });
  }, [api]);

  const value = useMemo(
    () => ({ state, api, refresh, completeOnboarding, logout, deleteAccount }),
    [api, completeOnboarding, deleteAccount, logout, refresh, state],
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
