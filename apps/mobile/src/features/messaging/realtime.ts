import type { ChatMessage, ConversationParticipant, ConversationSummary } from '@tastes/contracts';
import {
  collection,
  doc,
  documentId,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { firestore } from '../../infrastructure/firebase';

const INBOX_LIMIT = 50;
const MESSAGE_LIMIT = 50;

type RealtimeState<T> = {
  data: T;
  error: Error | null;
  loading: boolean;
};

type ConversationDetails = {
  participant: ConversationParticipant | null;
  kind: 'direct' | 'activity' | 'group';
  activityId: string | null;
  title: string | null;
  imageUrl: string | null;
  lastMessageId: string | null;
  unreadCount: number;
  readByCount: number;
  someoneTyping: boolean;
};

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Realtime updates are unavailable.');
}

function toIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date(0).toISOString();
}

function participantFromProfile(userId: string, profile: DocumentData | undefined): ConversationParticipant {
  return {
    userId,
    displayName: typeof profile?.displayName === 'string' && profile.displayName.length > 0
      ? profile.displayName
      : 'Tastes user',
    username: typeof profile?.username === 'string' ? profile.username : null,
    photoUrl: typeof profile?.photoUrl === 'string' ? profile.photoUrl : null,
  };
}

function peerId(document: QueryDocumentSnapshot<DocumentData>, userId: string): string {
  const participantIds = document.data().participantIds;
  if (!Array.isArray(participantIds)) return '';
  return participantIds.find((value): value is string => typeof value === 'string' && value !== userId) ?? '';
}

function summaryFromDocument(
  document: QueryDocumentSnapshot<DocumentData>,
  userId: string,
  participant: ConversationParticipant | null,
): ConversationSummary {
  const data = document.data();
  const participantIds = Array.isArray(data.participantIds)
    ? data.participantIds.filter((value): value is string => typeof value === 'string')
    : [];
  const rawLastMessage = data.lastMessage && typeof data.lastMessage === 'object'
    ? data.lastMessage as Record<string, unknown>
    : null;
  const rawUnreadCounts = data.unreadCounts && typeof data.unreadCounts === 'object'
    ? data.unreadCounts as Record<string, unknown>
    : {};
  return {
    id: document.id,
    kind: data.kind === 'activity' || data.kind === 'group' ? data.kind : 'direct',
    participantIds,
    otherParticipant: participant,
    activityId: data.kind === 'activity' ? String(data.activityId ?? document.id) : null,
    title: data.kind === 'activity' || data.kind === 'group'
      ? String(data.title ?? (data.kind === 'activity' ? 'Activity' : 'Group'))
      : null,
    imageUrl: (data.kind === 'activity' || data.kind === 'group') && typeof data.imageUrl === 'string' ? data.imageUrl : null,
    organizerId: data.kind === 'activity' && typeof data.organizerId === 'string' ? data.organizerId : null,
    invitationStatus: data.kind === 'activity'
      ? data.invitationStatuses?.[userId] === 'pending'
        ? 'pending'
        : data.invitationStatuses?.[userId] === 'declined'
          ? 'declined'
          : 'accepted'
      : null,
    lastMessage: rawLastMessage ? {
      id: String(rawLastMessage.id ?? ''),
      senderId: String(rawLastMessage.senderId ?? ''),
      text: String(rawLastMessage.text ?? ''),
      createdAt: toIso(rawLastMessage.createdAt),
    } : null,
    unreadCount: Math.max(0, Number(rawUnreadCounts[userId] ?? 0)),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function useConversationInbox(userId: string): RealtimeState<ConversationSummary[]> {
  const [state, setState] = useState<RealtimeState<ConversationSummary[]>>({
    data: [],
    error: null,
    loading: true,
  });
  const profileCache = useRef(new Map<string, ConversationParticipant>());

  useEffect(() => {
    let active = true;
    const inboxQuery = query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', userId),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(INBOX_LIMIT),
    );
    const unsubscribe = onSnapshot(inboxQuery, (snapshot) => {
      void Promise.all(snapshot.docs.map(async (conversation) => {
        if (conversation.data().kind === 'activity' || conversation.data().kind === 'group') {
          return summaryFromDocument(conversation, userId, null);
        }
        const otherUserId = peerId(conversation, userId);
        let participant = profileCache.current.get(otherUserId);
        if (!participant) {
          const profile = otherUserId
            ? await getDoc(doc(firestore, 'users', otherUserId))
            : null;
          participant = participantFromProfile(otherUserId, profile?.data());
          profileCache.current.set(otherUserId, participant);
        }
        return summaryFromDocument(conversation, userId, participant);
      })).then((items) => {
        if (active) setState({ data: items, error: null, loading: false });
      }).catch((error: unknown) => {
        if (active) setState((current) => ({ ...current, error: asError(error), loading: false }));
      });
    }, (error) => {
      if (active) setState((current) => ({ ...current, error: asError(error), loading: false }));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  return state;
}

export function useUnreadConversationCount(userId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const inboxQuery = query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', userId),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(INBOX_LIMIT),
    );
    return onSnapshot(inboxQuery, (snapshot) => {
      setCount(snapshot.docs.reduce((total, conversation) => {
        const unreadCounts = conversation.data().unreadCounts;
        const unread = unreadCounts && typeof unreadCounts === 'object'
          ? Number((unreadCounts as Record<string, unknown>)[userId] ?? 0)
          : 0;
        return total + Math.max(0, unread);
      }, 0));
    }, () => setCount(0));
  }, [userId]);

  return count;
}

export function useConversationMessages(
  conversationId: string,
  userId: string,
): RealtimeState<ChatMessage[]> {
  const [state, setState] = useState<RealtimeState<ChatMessage[]>>({
    data: [],
    error: null,
    loading: true,
  });

  useEffect(() => {
    const messagesQuery = query(
      collection(firestore, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(MESSAGE_LIMIT),
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      setState({
        data: snapshot.docs.map((message) => {
          const data = message.data();
          return {
            id: message.id,
            conversationId,
            senderId: String(data.senderId ?? ''),
            recipientId: String(data.recipientId ?? ''),
            recipientIds: Array.isArray(data.recipientIds)
              ? data.recipientIds.filter((value): value is string => typeof value === 'string')
              : [String(data.recipientId ?? '')].filter(Boolean),
            text: String(data.text ?? ''),
            createdAt: toIso(data.createdAt),
          };
        }),
        error: null,
        loading: false,
      });
    }, (error) => setState((current) => ({ ...current, error: asError(error), loading: false })));
  }, [conversationId, userId]);

  return state;
}

export function subscribeConversationDetails(
  conversationId: string,
  userId: string,
  listener: (details: ConversationDetails) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let profileUnsubscribe: Unsubscribe | undefined;
  const conversationUnsubscribe = onSnapshot(
    doc(firestore, 'conversations', conversationId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error('This conversation is no longer available.'));
        return;
      }
      const data = snapshot.data();
      const participantIds = Array.isArray(data.participantIds)
        ? data.participantIds.filter((value): value is string => typeof value === 'string')
        : [];
      const otherUserId = participantIds.find((value) => typeof value === 'string' && value !== userId);
      const lastMessage = data.lastMessage && typeof data.lastMessage === 'object'
        ? data.lastMessage as Record<string, unknown>
        : null;
      const unreadCounts = data.unreadCounts && typeof data.unreadCounts === 'object'
        ? data.unreadCounts as Record<string, unknown>
        : {};
      const readMessageIds = data.lastReadMessageIds && typeof data.lastReadMessageIds === 'object'
        ? data.lastReadMessageIds as Record<string, unknown>
        : {};
      const typing = data.typing && typeof data.typing === 'object'
        ? data.typing as Record<string, unknown>
        : {};
      const lastMessageId = lastMessage ? String(lastMessage.id ?? '') : null;
      const base = {
        kind: data.kind === 'activity' || data.kind === 'group' ? data.kind as 'activity' | 'group' : 'direct' as const,
        activityId: data.kind === 'activity' ? String(data.activityId ?? conversationId) : null,
        title: data.kind === 'activity' || data.kind === 'group'
          ? String(data.title ?? (data.kind === 'activity' ? 'Activity' : 'Group'))
          : null,
        imageUrl: (data.kind === 'activity' || data.kind === 'group') && typeof data.imageUrl === 'string' ? data.imageUrl : null,
        lastMessageId,
        unreadCount: Math.max(0, Number(unreadCounts[userId] ?? 0)),
        readByCount: lastMessageId
          ? participantIds.filter((id) => id !== userId && readMessageIds[id] === lastMessageId).length
          : 0,
        someoneTyping: Object.entries(typing).some(([id, value]) => {
          if (id === userId || !value || typeof value !== 'object' || !('toMillis' in value)) return false;
          return (value as { toMillis: () => number }).toMillis() > Date.now() - 10_000;
        }),
      };
      profileUnsubscribe?.();
      if (base.kind !== 'direct' || typeof otherUserId !== 'string' || otherUserId.length === 0) {
        listener({ ...base, participant: null });
        return;
      }
      profileUnsubscribe = onSnapshot(doc(firestore, 'users', otherUserId), (profile) => {
        listener({ ...base, participant: participantFromProfile(otherUserId, profile.data()) });
      }, (error) => onError(asError(error)));
    },
    (error) => onError(asError(error)),
  );
  return () => {
    profileUnsubscribe?.();
    conversationUnsubscribe();
  };
}
