import {
  allowsNotification,
  isNotificationType,
  notificationCatalog,
} from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, firestoreDatabaseId } from '../../shared/firebase';
import { notificationPreferences } from '../../shared/notifications';
import { sendExpoPush } from '../../shared/push';

const triggerOptions = {
  document: 'users/{userId}/notifications/{notificationId}',
  database: firestoreDatabaseId,
  region: 'europe-west1',
  retry: false,
} as const;

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => typeof entry === 'string')
      .map(([key, entry]) => [key, entry as string]),
  );
}

/**
 * Delivers the catalog channels of every stored notification: push straight away, email through the
 * `_emailQueue` collection that the delivery worker drains (no provider is configured in this repo yet).
 */
export const pushUserNotification = onDocumentWritten(triggerOptions, async (event) => {
  const notification = event.data?.after;
  if (!notification?.exists) return;

  // Likes and follows deliberately reuse a stable notification document. Treat a refreshed
  // `createdAt` as a new delivery, while ignoring the push-status update made below.
  const previous = event.data?.before;
  if (previous?.exists) {
    const previousCreatedAt = previous.get('createdAt');
    const createdAt = notification.get('createdAt');
    if (previousCreatedAt?.isEqual?.(createdAt) ?? previousCreatedAt === createdAt) return;
  }
  const type = notification.get('type');
  if (!isNotificationType(type)) return;
  const definition = notificationCatalog[type];
  const recipientId = event.params.userId;

  const profile = await db.collection('users').doc(recipientId).get();
  if (!profile.exists) return;
  const preferences = notificationPreferences(profile);
  const title = String(notification.get('title') ?? 'Tastes');
  const body = String(notification.get('body') ?? '');

  if (allowsNotification(preferences, type, 'email')) {
    await db.collection('_emailQueue').doc(notification.id).set({
      recipientId,
      type,
      subject: title,
      body,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (!definition.channels.includes('push')) return;
  if (!allowsNotification(preferences, type, 'push')) {
    await notification.ref.update({
      pushStatus: 'suppressed',
      pushUpdatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const result = await sendExpoPush(recipientId, {
    title,
    body,
    data: {
      ...stringMap(notification.get('data')),
      notificationId: notification.id,
      type,
      targetType: String(notification.get('targetType') ?? ''),
      targetId: String(notification.get('targetId') ?? ''),
    },
  });
  await notification.ref.update({
    pushStatus: result.status,
    ...(result.error ? { pushError: result.error } : {}),
    pushUpdatedAt: FieldValue.serverTimestamp(),
  });
});
