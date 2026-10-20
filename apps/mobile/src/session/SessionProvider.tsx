import {
  createTastesApi,
  type TastesApi,
  type TastesApiError,
} from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  defaultNotificationPreferences,
  type CompleteOnboardingInput,
  type PlaceDetails,
  type ProfileExtrasResult,
  type TastesAiAnswer,
  type TastesGroup,
} from '@tastes/contracts';
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
  visualAudit: boolean;
  minimumSupportedIosBuild: number;
  refresh: () => Promise<void>;
  completeOnboarding: (
    input?: Partial<Omit<CompleteOnboardingInput, 'version'>>,
  ) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function visualAuditData(operation: string): unknown {
  switch (operation) {
    case 'getDiscoverFeed':
      return {
        hero: null,
        topReviewer: null,
        trending: [
          {
            id: 'visual-audit-venue',
            name: 'Gemini750 Restaurant',
            city: 'Istanbul',
            address: '38 Beauchamp Place',
            category: 'Restaurant',
            status: 'active',
            priceLevel: 2,
            rating: 4.8,
            reviewCount: 24,
            distanceKm: 1.2,
            discoverTags: ['trending'],
          },
        ],
        newSpots: [],
        mostReviewed: [],
        forYou: [],
        hiddenGems: [],
        popularReviews: [],
      };
    case 'getDiscoverPeople':
      return { trending: [], new: [], suggested: [] };
    case 'searchPeople':
      return [];
    case 'searchVenues':
      return { items: [], externalResultsAvailable: false };
    case 'getFeed':
    case 'getFriendFeed':
    case 'getPlaceReviews':
    case 'listConversations':
    case 'getMessages':
    case 'getLeaderboard':
      return { items: [], nextCursor: null };
    case 'getVenues':
      return {
        items: [
          {
            id: 'visual-audit-venue',
            name: 'Gemini750 Restaurant',
            city: 'Istanbul',
            address: '38 Beauchamp Place',
            category: 'Restaurant',
            status: 'active',
            priceLevel: 2,
            rating: 4.8,
            reviewCount: 24,
            distanceKm: 1.2,
            latitude: 41.0422,
            longitude: 29.0083,
            discoverTags: ['trending'],
          },
          {
            id: 'visual-audit-cafe',
            name: 'Bosphorus Coffee House',
            city: 'Istanbul',
            address: '12 Bebek Caddesi',
            category: 'Cafe',
            status: 'active',
            priceLevel: 1,
            rating: 4.6,
            reviewCount: 18,
            distanceKm: 2.4,
            latitude: 41.0764,
            longitude: 29.0436,
            discoverTags: ['new'],
          },
        ],
        nextCursor: null,
      };
    case 'getComments':
      return {
        review: {
          id: 'visual-audit-review',
          authorId: 'visual-audit-author',
          authorDisplayName: 'Cameron Williamson',
          authorUsername: 'cameronw',
          authorPhotoUrl: null,
          venueId: 'visual-audit-venue',
          venueName: 'Gemini750 Restaurant',
          venueCity: 'Istanbul',
          rating: 4.5,
          text: "The hand-cut tagliolini is unreal — go on a Tuesday for the chef's special.",
          tags: ['quick-bites'],
          dishReviews: [
            { id: 'dish-1', title: 'Tagliolini', rating: 4.9 },
            { id: 'dish-2', title: 'Tiramisu', rating: 4.7 },
          ],
          status: 'published',
          commentCount: 3,
          reactionCount: 94,
          reacted: true,
          createdAt: '2026-10-14T12:00:00.000Z',
        },
        items: [
          {
            id: 'comment-1',
            reviewId: 'visual-audit-review',
            authorId: 'comment-author-1',
            authorDisplayName: 'Wade Warren',
            authorPhotoUrl: null,
            parentCommentId: null,
            reactionCount: 8,
            replyCount: 1,
            reacted: true,
            text: 'That pasta really is worth the trip.',
            createdAt: '2026-10-15T10:30:00.000Z',
          },
          {
            id: 'comment-2',
            reviewId: 'visual-audit-review',
            authorId: 'comment-author-2',
            authorDisplayName: 'Jane Cooper',
            authorPhotoUrl: null,
            parentCommentId: null,
            reactionCount: 0,
            replyCount: 0,
            reacted: false,
            text: 'Adding this to my list!',
            createdAt: '2026-10-15T09:00:00.000Z',
          },
        ],
        nextCursor: null,
      };
    case 'listNotifications':
      return {
        items: [
          {
            id: 'notification-1',
            type: null,
            kind: 'comment',
            group: 'likesComments',
            category: null,
            title: 'Wade Warren commented on your review',
            body: 'commented on your review',
            actorId: 'comment-author-1',
            actorName: 'Wade Warren',
            actorPhotoUrl: null,
            targetType: 'comments',
            targetId: 'visual-audit-review',
            unread: true,
            createdAt: '2026-10-20T10:30:00.000Z',
          },
          {
            id: 'notification-2',
            type: null,
            kind: 'follow',
            group: 'follows',
            category: null,
            title: 'Jane Cooper followed you',
            body: 'started following you',
            actorId: 'comment-author-2',
            actorName: 'Jane Cooper',
            actorPhotoUrl: null,
            targetType: 'profile',
            targetId: 'comment-author-2',
            unread: false,
            createdAt: '2026-10-19T08:00:00.000Z',
          },
        ],
        nextCursor: null,
      };
    case 'getPlace':
    case 'getVenue':
      return {
        venue: {
          id: 'visual-audit-venue',
          name: 'Gemini',
          address: '38 Beauchamp Place',
          city: 'London',
          category: 'Restaurant',
          status: 'active',
          priceLevel: 2,
          rating: 4.8,
          reviewCount: 24,
          distanceKm: 1.2,
        },
        phone: '+44 20 7589 2020',
        website: 'https://example.com',
        chips: [],
        photoUrls: [],
        photoCount: 0,
        openingHours: [],
        popularDishes: [
          { name: 'Salmon nigiri', rating: 4.9 },
          { name: 'Spicy tuna roll', rating: 4.7 },
        ],
      } satisfies PlaceDetails;
    case 'getProfileExtras':
      return {
        blocked: false,
        followers: [],
        following: [],
        level: 3,
        xp: 240,
        notificationPreferences: defaultNotificationPreferences,
      } satisfies ProfileExtrasResult;
    case 'getGroup':
      return {
        id: 'visual-audit-group',
        name: 'Tastes group',
        adminId: 'visual-audit-user',
        members: [
          {
            userId: 'visual-audit-user',
            displayName: 'Alex Morgan',
            username: 'alex.morgan',
            photoUrl: null,
            admin: true,
          },
        ],
        pendingMembers: [],
        createdAt: '2026-09-01T12:00:00.000Z',
      } satisfies TastesGroup;
    case 'importContacts':
      return { matches: [] };
    case 'listRequests':
    case 'listActivityCandidates':
      return [];
    case 'getUnreadNotificationCount':
      return { count: 0 };
    case 'getFavourites':
      return { folders: [], places: [], nextCursor: null };
    case 'getMonthlyRecap':
      return { ready: false };
    case 'askTastesAi':
      return {
        id: 'visual-audit-answer',
        text: 'Try Gemini for a polished dinner, or explore one of the nearby favourites below.',
        followUps: ['Show me something casual', 'Find a nearby option'],
        places: [
          {
            id: 'visual-audit-venue',
            name: 'Gemini',
            description: 'Modern European dining in Knightsbridge.',
            rating: 4.8,
            price: '$$$',
            cuisine: 'European',
            distanceKm: 1.2,
          },
        ],
      } satisfies TastesAiAnswer;
    default:
      return { id: 'visual-audit-id', active: false, reactionCount: 0 };
  }
}

function createVisualAuditApi(api: TastesApi): TastesApi {
  return new Proxy(api, {
    get(target, property, receiver) {
      const operation = Reflect.get(target, property, receiver);
      if (typeof operation !== 'function') return operation;
      return async () => ({ data: visualAuditData(String(property)) });
    },
  });
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({
    status: 'booting',
    user: null,
  });
  const [minimumSupportedIosBuild, setMinimumSupportedIosBuild] = useState(0);

  const clearLocalSession = useCallback(async () => {
    queryClient.clear();
    await queryPersister.removeClient();
    await signOut(auth);
    setMinimumSupportedIosBuild(0);
    setState({ status: 'anonymous', user: null });
  }, []);

  const api = useMemo(
    () =>
      createTastesApi(functions, {
        onUnauthenticated: clearLocalSession,
        onError: (error, operation) => {
          // A conversation can disappear while a stale deep link or cached route is
          // still open. The chat screen renders this as an ordinary empty/error
          // state, so do not turn the expected 404 into a React Native redbox.
          if (
            error.code === 'not-found' &&
            (operation === 'getMessages' ||
              operation === 'setTypingStatus' ||
              operation === 'markConversationRead')
          )
            return;
          // Marking a conversation read is best-effort and reruns automatically
          // whenever the conversation listener fires again. A stale "through"
          // message id (new messages just arrived) or a retryable backend hiccup
          // resolves itself on the next attempt, so it should not redbox either.
          if (
            operation === 'markConversationRead' &&
            (error.code === 'failed-precondition' || error.retryable)
          )
            return;
          captureException(error, {
            source: 'api',
            operation,
            code: error.code,
          });
        },
      }),
    [clearLocalSession],
  );

  const logout = useCallback(async () => {
    try {
      await unregisterPushNotifications(api);
    } catch (error) {
      captureException(error, {
        source: 'push',
        operation: 'unregisterPushToken',
      });
    } finally {
      await clearLocalSession();
    }
  }, [api, clearLocalSession]);

  const deleteAccount = useCallback(async () => {
    try {
      await unregisterPushNotifications(api);
    } catch (error) {
      captureException(error, {
        source: 'push',
        operation: 'unregisterPushToken',
      });
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

  const loadStatus = useCallback(
    async (user: User) => {
      try {
        const result = await api.getSessionStatus();
        setMinimumSupportedIosBuild(
          Math.max(0, Number(result.data.minimumSupportedIosBuild ?? 0)),
        );
        if (result.data.profileExists) {
          void syncPushNotifications(api, {
            requestPermission: result.data.onboardingComplete,
          }).catch((error) => {
            captureException(error, {
              source: 'push',
              operation: 'registerPushToken',
            });
          });
        }
        if (result.data.profileExists && !result.data.onboardingComplete) {
          const legacyComplete = await AsyncStorage.getItem(
            `tastes:post-signup-onboarding:${user.uid}`,
          );
          if (legacyComplete === 'complete') {
            await api.completeOnboarding({
              version: 1,
              invitedContactCount: 0,
              appearance: 'system',
            });
            await AsyncStorage.removeItem(
              `tastes:post-signup-onboarding:${user.uid}`,
            );
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
    },
    [api],
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        identifyAnalyticsUser(user?.uid ?? null);
        if (!user) {
          queryClient.clear();
          void queryPersister.removeClient();
          setMinimumSupportedIosBuild(0);
          setState({ status: 'anonymous', user: null });
          return;
        }
        setState({ status: 'booting', user: null });
        void loadStatus(user);
      }),
    [loadStatus],
  );

  const refresh = useCallback(async () => {
    if (auth.currentUser) await loadStatus(auth.currentUser);
  }, [loadStatus]);

  const completeOnboarding = useCallback(
    async (input: Partial<Omit<CompleteOnboardingInput, 'version'>> = {}) => {
      if (!auth.currentUser) return;
      await api.completeOnboarding({
        version: 1,
        invitedContactCount: 0,
        appearance: 'system',
        ...input,
      });
      track('onboarding_completed', { version: 1 });
      setState({ status: 'authenticated', user: auth.currentUser });
    },
    [api],
  );

  const value = useMemo(
    () => ({
      state,
      api,
      visualAudit: false,
      minimumSupportedIosBuild,
      refresh,
      completeOnboarding,
      logout,
      deleteAccount,
    }),
    [
      api,
      completeOnboarding,
      deleteAccount,
      logout,
      minimumSupportedIosBuild,
      refresh,
      state,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/**
 * Supplies a deterministic signed-in identity to development previews while
 * preserving the real API and session actions from the surrounding provider.
 */
export function SessionStateOverrideProvider({
  children,
  visualAudit = false,
  user,
}: PropsWithChildren<{ user: User; visualAudit?: boolean }>) {
  const session = useSession();
  const api = useMemo(
    () => (visualAudit ? createVisualAuditApi(session.api) : session.api),
    [session.api, visualAudit],
  );
  const value = useMemo<SessionContextValue>(
    () => ({
      ...session,
      api,
      visualAudit,
      completeOnboarding: visualAudit
        ? async () => undefined
        : session.completeOnboarding,
      deleteAccount: visualAudit
        ? async () => undefined
        : session.deleteAccount,
      logout: visualAudit ? async () => undefined : session.logout,
      refresh: visualAudit ? async () => undefined : session.refresh,
      state: { status: 'authenticated', user },
    }),
    [api, session, user, visualAudit],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error('useSession must be used inside SessionProvider.');
  return value;
}

export function useTastesApi(): TastesApi {
  return useSession().api;
}

export function useIsVisualAudit(): boolean {
  return useSession().visualAudit;
}

export function useAuthenticatedUserId(): string {
  const { state } = useSession();
  if (state.status !== 'authenticated') {
    throw new Error('An authenticated session is required.');
  }
  return state.user.uid;
}
