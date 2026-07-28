import { createHash } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebase';

export function idempotentDocumentId(uid: string, operation: string, key: string): string {
  return createHash('sha256').update(`${uid}:${operation}:${key}`).digest('hex');
}

export async function enforceRateLimit(
  transaction: Transaction,
  uid: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = createHash('sha256').update(`${uid}:${action}:${bucket}`).digest('hex');
  const reference = db.collection('_contentRateLimits').doc(id);
  const snapshot = await transaction.get(reference);
  const count = Number(snapshot.get('count') ?? 0);

  if (count >= limit) {
    throw new HttpsError('resource-exhausted', 'Too many requests. Try again later.', {
      reason: 'content-rate-limit',
      retryAfter: new Date((bucket + 1) * windowMs).toISOString(),
    });
  }

  transaction.set(reference, {
    uid,
    action,
    count: FieldValue.increment(1),
    expiresAt: Timestamp.fromMillis((bucket + 2) * windowMs),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export function addXp(
  transaction: Transaction,
  userReference: DocumentReference,
  amount: number,
  current: { monthlyXp: number; xp: number },
): void {
  transaction.update(userReference, {
    xp: Math.max(0, current.xp + amount),
    monthlyXp: Math.max(0, current.monthlyXp + amount),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
