import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { db, firestoreDatabaseId } from '../shared/firebase';
import { reviewRatingPatch } from '../modules/reviews/rating-normalization';

function encode(value: unknown): unknown {
  if (value instanceof Timestamp)
    return {
      __firestoreType: 'Timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  if (Buffer.isBuffer(value))
    return { __firestoreType: 'Bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(encode);
  if (
    value &&
    typeof value === 'object' &&
    'path' in value &&
    'firestore' in value
  )
    return { __firestoreType: 'Reference', path: value.path };
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encode(entry)]),
    );
  return value;
}
async function main() {
  if (
    process.env.GCLOUD_PROJECT !== 'tastes-934e6' ||
    firestoreDatabaseId !== 'tastes-eu' ||
    process.env.FIRESTORE_EMULATOR_HOST
  )
    throw new Error(
      'Explicit production project tastes-934e6 and database tastes-eu are required.',
    );
  const directory = process.env.REVIEW_MIGRATION_BACKUP_DIR;
  if (!directory)
    throw new Error('Set REVIEW_MIGRATION_BACKUP_DIR before running.');
  const apply = process.argv.includes('--apply');
  const reviews = await db
    .collection('reviews')
    .where('status', 'in', ['published', 'hidden'])
    .get();
  const documents: DocumentSnapshot[] = [...reviews.docs];
  const revised = reviews.docs.filter(
    (review) => Number(review.get('visitCount') ?? 1) > 1,
  );
  for (let offset = 0; offset < revised.length; offset += 20) {
    const visits = await Promise.all(
      revised
        .slice(offset, offset + 20)
        .map((review) => review.ref.collection('visits').get()),
    );
    documents.push(...visits.flatMap((snapshot) => snapshot.docs));
  }
  const plans = documents.flatMap((document) => {
    try {
      const patch = reviewRatingPatch(document.data()!);
      return Object.keys(patch).length ? [{ document, patch }] : [];
    } catch (error) {
      throw new Error(
        `Cannot normalize ${document.ref.path}: ${String(error)}`,
      );
    }
  });
  const affectedVenueIds = [
    ...new Set(
      plans
        .filter((plan) => plan.document.ref.parent.id === 'reviews')
        .map((plan) => String(plan.document.get('venueId'))),
    ),
  ];
  const venues = affectedVenueIds.length
    ? await db.getAll(
        ...affectedVenueIds.map((id) => db.collection('venues').doc(id)),
      )
    : [];
  if (venues.some((venue) => !venue.exists))
    throw new Error('An affected venue is missing. No ratings changed.');
  if (!plans.length) {
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        reviewed: reviews.size,
        changes: 0,
      }),
    );
    return;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const backupPath = resolve(
    directory,
    `half-star-ratings-${Date.now()}-${apply ? 'apply' : 'dry-run'}.json`,
  );
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        project: 'tastes-934e6',
        database: 'tastes-eu',
        createdAt: new Date().toISOString(),
        documents: [...plans.map((plan) => plan.document), ...venues].map(
          (document) => ({
            path: document.ref.path,
            updateTime: encode(document.updateTime),
            data: encode(document.data()),
          }),
        ),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      reviewed: reviews.size,
      changes: plans.length,
      affectedVenues: venues.length,
      backup: backupPath,
    }),
  );
  if (!apply) return;
  for (let offset = 0; offset < plans.length; offset += 150) {
    const batch = db.batch();
    for (const { document, patch } of plans.slice(offset, offset + 150)) {
      // Refuse to overwrite a review that changed after its durable backup.
      batch.update(
        document.ref,
        {
          ...patch,
          ratingNormalizationVersion: 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { lastUpdateTime: document.updateTime! },
      );
    }
    await batch.commit();
  }
  for (const venue of venues) {
    await db.runTransaction(async (transaction) => {
      const published = await transaction.get(
        db
          .collection('reviews')
          .where('venueId', '==', venue.id)
          .where('status', '==', 'published'),
      );
      await transaction.get(venue.ref);
      const total = published.docs.reduce(
        (sum, review) => sum + Number(review.get('rating')),
        0,
      );
      transaction.update(venue.ref, {
        rating: published.size ? total / published.size : 0,
        reviewCount: published.size,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  console.log(
    `Normalized ${plans.length} documents and recalculated ${venues.length} venue averages. Archived merged-review source records remain unchanged.`,
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
