import { createHash } from 'node:crypto';
import {
  createConversationInputSchema,
  getMessagesInputSchema,
  listConversationsInputSchema,
  markConversationReadInputSchema,
  registerPushTokenInputSchema,
  sendMessageInputSchema,
  unregisterPushTokenInputSchema,
} from '@tastes/contracts';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Query } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db, firestoreDatabaseId } from '../../shared/firebase';
import { enforceRateLimit, idempotentDocumentId } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import { cursorDate, decodeCursor, encodeCursor } from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

const MESSAGE_RATE_LIMIT = 60;
const MESSAGE_RATE_WINDOW_MS = 60_000;
const CONVERSATION_RATE_LIMIT = 20;
const CONVERSATION_RATE_WINDOW_MS = 60 * 60_000;
const MAX_PUSH_TOKENS = 100;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushTicket {
  status?: unknown;
  message?: unknown;
  details?: { error?: unknown };
}

function directConversationId(firstUserId: string, secondUserId: string): string {
  const participantIds = [firstUserId, secondUserId].sort();
  return createHash('sha256').update(`direct:${participantIds[0]}\0${participantIds[1]}`).digest('hex');
}

function pushTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function unreadCount(document: DocumentSnapshot, uid: string): number {
  const counts = document.get('unreadCounts');
  if (!counts || typeof counts !== 'object') return 0;
  return Math.max(0, Number((counts as Record<string, unknown>)[uid] ?? 0));
}

function lastMessage(document: DocumentSnapshot) {
  const value = document.get('lastMessage');
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  return {
    id: String(message.id ?? ''),
    senderId: String(message.senderId ?? ''),
    text: String(message.text ?? ''),
    createdAt: timestampToIso(message.createdAt),
  };
}

async function requireActiveProfile(uid: string) {
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists || profile.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }
  return profile;
}

function requireParticipant(conversation: DocumentSnapshot, uid: string): string[] {
  const participantIds = conversation.get('participantIds');
  if (!conversation.exists || !Array.isArray(participantIds) || !participantIds.includes(uid)) {
    throw new HttpsError('not-found', 'The conversation was not found.');
  }
  return participantIds.filter((value): value is string => typeof value === 'string');
}

export const createConversation = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createConversationInputSchema, request.data);
  if (uid === input.targetUserId) {
    throw new HttpsError('failed-precondition', 'You cannot start a conversation with yourself.');
  }

  const participantIds = [uid, input.targetUserId].sort();
  const conversationRef = db.collection('conversations').doc(directConversationId(uid, input.targetUserId));
  const userRef = db.collection('users').doc(uid);
  const targetRef = db.collection('users').doc(input.targetUserId);
  const userFollowsTarget = userRef.collection('following').doc(input.targetUserId);
  const targetFollowsUser = targetRef.collection('following').doc(uid);

  await db.runTransaction(async (transaction) => {
    const [user, target, forwardEdge, reverseEdge, existingConversation] = await Promise.all([
      transaction.get(userRef),
      transaction.get(targetRef),
      transaction.get(userFollowsTarget),
      transaction.get(targetFollowsUser),
      transaction.get(conversationRef),
    ]);
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!target.exists || target.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The user was not found.');
    }
    if (!forwardEdge.exists || !reverseEdge.exists) {
      throw new HttpsError('permission-denied', 'Conversations require a mutual follow.', {
        reason: 'mutual-follow-required',
      });
    }
    if (existingConversation.exists) return;

    await enforceRateLimit(
      transaction,
      uid,
      'create-conversation',
      CONVERSATION_RATE_LIMIT,
      CONVERSATION_RATE_WINDOW_MS,
    );
    const now = FieldValue.serverTimestamp();
    transaction.create(conversationRef, {
      kind: 'direct',
      participantIds,
      unreadCounts: Object.fromEntries(participantIds.map((participantId) => [participantId, 0])),
      lastReadAt: {},
      lastMessage: null,
      messageCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });

  return { id: conversationRef.id };
});

export const listConversations = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(listConversationsInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  await requireActiveProfile(uid);

  let query: Query = db.collection('conversations')
    .where('participantIds', 'array-contains', uid)
    .where('status', '==', 'active')
    .orderBy('updatedAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    query = query.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
  }

  const snapshot = await query.limit(input.limit + 1).get();
  const pageDocuments = snapshot.docs.slice(0, input.limit);
  const otherUserIds = pageDocuments.map((document) => {
    const participantIds = requireParticipant(document, uid);
    return participantIds.find((participantId) => participantId !== uid) ?? '';
  });
  const profileSnapshots = otherUserIds.length > 0
    ? await db.getAll(...otherUserIds.map((userId) => db.collection('users').doc(userId)))
    : [];
  const profiles = new Map(profileSnapshots.map((profile) => [profile.id, profile]));
  const last = pageDocuments.at(-1);

  return {
    items: pageDocuments.map((document, index) => {
      const participantIds = requireParticipant(document, uid);
      const otherUserId = otherUserIds[index] ?? '';
      const profile = profiles.get(otherUserId);
      return {
        id: document.id,
        participantIds,
        otherParticipant: {
          userId: otherUserId,
          displayName: String(profile?.get('displayName') ?? ''),
          username: profile?.get('username') ? String(profile.get('username')) : null,
          photoUrl: profile?.get('photoUrl') ? String(profile.get('photoUrl')) : null,
        },
        lastMessage: lastMessage(document),
        unreadCount: unreadCount(document, uid),
        createdAt: timestampToIso(document.get('createdAt')),
        updatedAt: timestampToIso(document.get('updatedAt')),
      };
    }),
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('updatedAt')) })
      : null,
  };
});

export const getMessages = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(getMessagesInputSchema, request.data);
  const cursor = decodeCursor(input.cursor);
  const conversationRef = db.collection('conversations').doc(input.conversationId);
  const conversation = await conversationRef.get();
  requireParticipant(conversation, uid);

  let query = conversationRef.collection('messages')
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    query = query.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
  }
  const snapshot = await query.limit(input.limit + 1).get();
  const pageDocuments = snapshot.docs.slice(0, input.limit);
  const last = pageDocuments.at(-1);

  return {
    items: pageDocuments.map((document) => ({
      id: document.id,
      conversationId: input.conversationId,
      senderId: String(document.get('senderId')),
      recipientId: String(document.get('recipientId')),
      text: String(document.get('text')),
      createdAt: timestampToIso(document.get('createdAt')),
    })),
    nextCursor: snapshot.size > input.limit && last
      ? encodeCursor({ id: last.id, value: timestampToIso(last.get('createdAt')) })
      : null,
  };
});

export const sendMessage = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(sendMessageInputSchema, request.data);
  const conversationRef = db.collection('conversations').doc(input.conversationId);
  const messageRef = conversationRef.collection('messages').doc(
    idempotentDocumentId(uid, `message:${input.conversationId}`, input.idempotencyKey),
  );

  await db.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    const participantIds = requireParticipant(conversation, uid);
    if (conversation.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'The conversation is not active.');
    }
    const recipientId = participantIds.find((participantId) => participantId !== uid);
    if (!recipientId) throw new HttpsError('internal', 'The conversation participants are invalid.');

    const userRef = db.collection('users').doc(uid);
    const recipientRef = db.collection('users').doc(recipientId);
    const [user, recipient, forwardEdge, reverseEdge, existingMessage] = await Promise.all([
      transaction.get(userRef),
      transaction.get(recipientRef),
      transaction.get(userRef.collection('following').doc(recipientId)),
      transaction.get(recipientRef.collection('following').doc(uid)),
      transaction.get(messageRef),
    ]);
    if (existingMessage.exists) return;
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!recipient.exists || recipient.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The recipient was not found.');
    }
    if (!forwardEdge.exists || !reverseEdge.exists) {
      throw new HttpsError('permission-denied', 'Conversations require a mutual follow.', {
        reason: 'mutual-follow-required',
      });
    }

    await enforceRateLimit(transaction, uid, 'send-message', MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS);
    const now = FieldValue.serverTimestamp();
    transaction.create(messageRef, {
      conversationId: conversationRef.id,
      senderId: uid,
      recipientId,
      text: input.text,
      type: 'text',
      status: 'sent',
      createdAt: now,
    });
    transaction.update(
      conversationRef,
      new FieldPath('unreadCounts', recipientId), FieldValue.increment(1),
      'lastMessage', {
        id: messageRef.id,
        senderId: uid,
        text: input.text,
        createdAt: now,
      },
      'messageCount', FieldValue.increment(1),
      'updatedAt', now,
    );
    const notificationRef = db.collection('notifications').doc(
      idempotentDocumentId(recipientId, 'message-notification', messageRef.id),
    );
    transaction.create(notificationRef, {
      recipientId,
      actorId: uid,
      actorDisplayName: String(user.get('displayName') ?? 'Someone'),
      type: 'message',
      conversationId: conversationRef.id,
      messageId: messageRef.id,
      preview: input.text.slice(0, 160),
      readAt: null,
      pushStatus: 'pending',
      createdAt: now,
    });
  });

  return { id: messageRef.id };
});

export const markConversationRead = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(markConversationReadInputSchema, request.data);
  const conversationRef = db.collection('conversations').doc(input.conversationId);

  await db.runTransaction(async (transaction) => {
    const conversation = await transaction.get(conversationRef);
    requireParticipant(conversation, uid);
    const currentLastMessage = lastMessage(conversation);
    if (currentLastMessage?.id !== input.throughMessageId) {
      throw new HttpsError('failed-precondition', 'New messages are available. Refresh before marking the conversation read.', {
        reason: 'new-messages-available',
      });
    }
    const now = FieldValue.serverTimestamp();
    transaction.update(
      conversationRef,
      new FieldPath('unreadCounts', uid), 0,
      new FieldPath('lastReadAt', uid), now,
    );
  });

  return { conversationId: input.conversationId, unreadCount: 0 as const };
});

export const registerPushToken = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(registerPushTokenInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const tokenId = pushTokenId(input.token);
  const tokenRef = userRef.collection('pushTokens').doc(tokenId);
  const registryRef = db.collection('_pushTokens').doc(tokenId);

  await db.runTransaction(async (transaction) => {
    const [profile, registry, existing] = await Promise.all([
      transaction.get(userRef),
      transaction.get(registryRef),
      transaction.get(tokenRef),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    const previousOwnerId = registry.exists ? String(registry.get('uid') ?? '') : '';
    if (previousOwnerId && previousOwnerId !== uid) {
      transaction.delete(db.collection('users').doc(previousOwnerId).collection('pushTokens').doc(tokenId));
    }
    const now = FieldValue.serverTimestamp();
    transaction.set(tokenRef, {
      token: input.token,
      platform: input.platform,
      provider: 'expo',
      active: true,
      createdAt: existing.exists ? existing.get('createdAt') : now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(registryRef, { uid, updatedAt: now });
  });
  return { registered: true };
});

export const unregisterPushToken = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(unregisterPushTokenInputSchema, request.data);
  const tokenId = pushTokenId(input.token);
  const tokenRef = db.collection('users').doc(uid).collection('pushTokens').doc(tokenId);
  const registryRef = db.collection('_pushTokens').doc(tokenId);
  await db.runTransaction(async (transaction) => {
    const registry = await transaction.get(registryRef);
    transaction.delete(tokenRef);
    if (registry.exists && registry.get('uid') === uid) transaction.delete(registryRef);
  });
  return { registered: false };
});

function ticketList(payload: unknown): ExpoPushTicket[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data as ExpoPushTicket[] : data ? [data as ExpoPushTicket] : [];
}

export const pushMessageNotification = onDocumentCreated({
  document: 'notifications/{notificationId}',
  database: firestoreDatabaseId,
  region: 'europe-west1',
  retry: false,
}, async (event) => {
  const notification = event.data;
  if (!notification || notification.get('type') !== 'message') return;
  const recipientId = String(notification.get('recipientId') ?? '');
  if (!recipientId) return;

  const tokens = await db.collection('users').doc(recipientId).collection('pushTokens')
    .where('active', '==', true)
    .limit(MAX_PUSH_TOKENS)
    .get();
  if (tokens.empty) {
    await notification.ref.update({ pushStatus: 'no-tokens', pushUpdatedAt: FieldValue.serverTimestamp() });
    return;
  }

  const messages = tokens.docs.map((token) => ({
    to: String(token.get('token')),
    sound: 'default',
    title: 'Tastes',
    body: 'You have a new message.',
    data: {
      type: 'message',
      conversationId: String(notification.get('conversationId') ?? ''),
      messageId: String(notification.get('messageId') ?? ''),
    },
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(`Expo Push API returned HTTP ${response.status}.`);
    const tickets = ticketList(payload);
    const batch = db.batch();
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        const token = tokens.docs[index];
        if (token) batch.update(token.ref, { active: false, updatedAt: FieldValue.serverTimestamp() });
      }
    });
    batch.update(notification.ref, {
      pushStatus: tickets.some((ticket) => ticket.status === 'error') ? 'partial' : 'sent',
      pushUpdatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    await notification.ref.update({
      pushStatus: 'failed',
      pushError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown push error.',
      pushUpdatedAt: FieldValue.serverTimestamp(),
    });
  }
});
