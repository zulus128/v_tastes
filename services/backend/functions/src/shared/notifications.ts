import { createHash } from 'node:crypto';
import {
  allowsNotification,
  defaultNotificationPreferences,
  notificationCatalog,
  renderNotificationCopy,
  type NotificationChannel,
  type NotificationCopyParams,
  type NotificationPreferences,
  type NotificationType,
} from '@tastes/contracts';
import {
  FieldValue,
  type DocumentSnapshot,
  type Transaction,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { db } from './firebase';

export interface NotificationRequest {
  recipientId: string;
  type: NotificationType;
  /** Stable per-event key so the same event never lands twice. */
  eventKey: string;
  actorId?: string | null;
  actorName?: string | null;
  targetId?: string | null;
  params?: NotificationCopyParams;
  /** Extra payload forwarded to the push notification. */
  data?: Record<string, string>;
}

const NOTIFICATION_FAN_OUT_LIMIT = 400;
const BATCH_WRITE_LIMIT = 400;

export function notificationDocumentId(request: NotificationRequest): string {
  return createHash('sha256')
    .update(`${request.recipientId}:${request.type}:${request.eventKey}`)
    .digest('hex');
}

export function notificationPreferences(profile: DocumentSnapshot | undefined): NotificationPreferences {
  const stored = profile?.get('notificationPreferences');
  if (!stored || typeof stored !== 'object') return defaultNotificationPreferences;
  const value = stored as Partial<NotificationPreferences>;
  return {
    ...defaultNotificationPreferences,
    ...value,
    categories: {
      ...defaultNotificationPreferences.categories,
      ...(value.categories ?? {}),
    },
  };
}

function notificationDocument(request: NotificationRequest) {
  const definition = notificationCatalog[request.type];
  const { title, body } = renderNotificationCopy(request.type, {
    actor: request.actorName ?? null,
    ...request.params,
  });
  return {
    type: request.type,
    kind: definition.kind,
    group: definition.group,
    category: definition.category,
    channels: [...definition.channels],
    title,
    body,
    actorId: request.actorId ?? null,
    actorName: request.actorName ?? null,
    targetType: definition.targetType,
    targetId: request.targetId ?? null,
    data: request.data ?? {},
    unread: true,
    pushStatus: definition.channels.includes('push') ? 'pending' : 'skipped',
    createdAt: FieldValue.serverTimestamp(),
  };
}

function notificationReference(request: NotificationRequest) {
  return db
    .collection('users')
    .doc(request.recipientId)
    .collection('notifications')
    .doc(notificationDocumentId(request));
}

/** Queues a notification inside an existing transaction. Never notifies the actor about their own action. */
export function queueNotification(transaction: Transaction, request: NotificationRequest): void {
  if (!request.recipientId || request.recipientId === request.actorId) return;
  transaction.set(notificationReference(request), notificationDocument(request), { merge: true });
}

export function queueNotificationInBatch(batch: WriteBatch, request: NotificationRequest): void {
  if (!request.recipientId || request.recipientId === request.actorId) return;
  batch.set(notificationReference(request), notificationDocument(request), { merge: true });
}

/** Sends a single notification outside a transaction. Failures never break the caller. */
export async function sendNotification(request: NotificationRequest): Promise<void> {
  if (!request.recipientId || request.recipientId === request.actorId) return;
  try {
    await notificationReference(request).set(notificationDocument(request), { merge: true });
  } catch (error) {
    console.warn(`Unable to store the ${request.type} notification for ${request.recipientId}.`, error);
  }
}

/** Fans a notification out to many recipients in chunked batches. */
export async function sendNotifications(requests: NotificationRequest[]): Promise<number> {
  const pending = requests
    .filter((request) => request.recipientId && request.recipientId !== request.actorId)
    .slice(0, NOTIFICATION_FAN_OUT_LIMIT);
  let written = 0;
  for (let index = 0; index < pending.length; index += BATCH_WRITE_LIMIT) {
    const chunk = pending.slice(index, index + BATCH_WRITE_LIMIT);
    const batch = db.batch();
    chunk.forEach((request) => queueNotificationInBatch(batch, request));
    try {
      await batch.commit();
      written += chunk.length;
    } catch (error) {
      console.warn(`Unable to fan out ${chunk.length} ${chunk[0]?.type} notifications.`, error);
    }
  }
  return written;
}

export async function notificationAllowed(
  recipientId: string,
  type: NotificationType,
  channel: NotificationChannel,
): Promise<boolean> {
  const profile = await db.collection('users').doc(recipientId).get();
  if (!profile.exists) return false;
  return allowsNotification(notificationPreferences(profile), type, channel);
}

/** Recipients that follow the given user, capped at the fan-out limit. */
export async function followerIds(userId: string, limit = NOTIFICATION_FAN_OUT_LIMIT): Promise<string[]> {
  const followers = await db.collection('users').doc(userId).collection('followers').limit(limit).get();
  return followers.docs.map((follower) => follower.id);
}
