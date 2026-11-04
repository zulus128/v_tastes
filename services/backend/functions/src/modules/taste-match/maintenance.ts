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
  // Capture the revision before loading aliases: concurrent approvals may make
  // this pass newer, but must never make an older partial pass look complete.
  const catalogState = await database
    .collection('_tasteMaintenance')
    .doc('catalog')
    .get();
  const [snapshot, catalog] = await Promise.all([
    query.get(),
    loadDishCatalog(database),
  ]);
  const catalogRevision = Number(catalogState.get('revision') ?? 0);
  const targetCatalogRevision =
    typeof cursor === 'string' && cursor
      ? Number(state.get('targetCatalogRevision') ?? catalogRevision)
      : catalogRevision;
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
      targetCatalogRevision: complete ? null : targetCatalogRevision,
      ...(complete
        ? {
            lastCompleteAt: FieldValue.serverTimestamp(),
            completedCatalogRevision: targetCatalogRevision,
          }
        : {}),
    },
    { merge: true },
  );
  return { processed: snapshot.size, complete };
}
/** New reviews use the retryable trigger; full repair is daily or after catalogue changes. */
export async function maintainTasteEvidenceIfNeeded(database: Firestore) {
  const [state, catalog] = await Promise.all([
    database.collection('_tasteMaintenance').doc('backfill').get(),
    database.collection('_tasteMaintenance').doc('catalog').get(),
  ]);
  const lastCompleteAt = state.get('lastCompleteAt');
  const completedAt =
    lastCompleteAt && typeof lastCompleteAt.toMillis === 'function'
      ? lastCompleteAt.toMillis()
      : 0;
  if (
    !state.get('cursor') &&
    state.get('completedCatalogRevision') ===
      Number(catalog.get('revision') ?? 0) &&
    Date.now() - completedAt < 24 * 60 * 60 * 1000
  ) {
    return { processed: 0, complete: true };
  }
  return rebuildTasteEvidence(database);
}

export const maintainTasteEvidence = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'europe-west1',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    await maintainTasteEvidenceIfNeeded(db);
  },
);
