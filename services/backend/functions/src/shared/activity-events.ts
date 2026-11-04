import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { db } from './firebase';

export type ActivityKind =
  | 'follow-created'
  | 'follow-removed'
  | 'review-created'
  | 'review-edited'
  | 'review-deleted'
  | 'review-visited'
  | 'reaction-added'
  | 'reaction-removed'
  | 'comment-reaction-added'
  | 'comment-reaction-removed'
  | 'comment-added'
  | 'comment-removed';

/** Called only after idempotency/state checks, inside the mutation transaction. */
export function recordActivityEvent(
  transaction: Transaction,
  kind: ActivityKind,
  actorId: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
): void {
  transaction.create(db.collection('_activityEvents').doc(), {
    kind,
    actorId,
    targetId,
    ...metadata,
    createdAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  });
}
