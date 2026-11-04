import {
  FieldPath,
  FieldValue,
  type Firestore,
} from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';
import { loadDishCatalog } from './catalog';
import { refreshTasteReviewProjection } from './projection';

/** Resumable index repair; does not rewrite or invent original review ratings. */
export async function rebuildTasteEvidence(
  database: Firestore,
  limit = 300,
): Promise<{ processed: number; complete: boolean }> {
  const ref = database.collection('_tasteMaintenance').doc('backfill'),
    state = await ref.get();
  let query = database
    .collection('reviews')
    .orderBy(FieldPath.documentId())
    .limit(limit);
  const cursor = state.get('cursor');
  if (typeof cursor === 'string' && cursor) query = query.startAfter(cursor);
  const [snapshot, catalog] = await Promise.all([
    query.get(),
    loadDishCatalog(database),
  ]);
  for (let i = 0; i < snapshot.docs.length; i += 10)
    await Promise.all(
      snapshot.docs
        .slice(i, i + 10)
        .map((d) => refreshTasteReviewProjection(database, d.id, catalog)),
    );
  const complete = snapshot.size < limit;
  await ref.set(
    {
      cursor: complete ? null : snapshot.docs.at(-1)!.id,
      updatedAt: FieldValue.serverTimestamp(),
      ...(complete ? { lastCompleteAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
  return { processed: snapshot.size, complete };
}
export const maintainTasteEvidence = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    await rebuildTasteEvidence(db);
  },
);
