import { writeFileSync } from 'node:fs';
import { db, firestoreDatabaseId } from '../shared/firebase';

const apply = process.argv.includes('--apply');
const backup = process.argv
  .find((arg) => arg.startsWith('--backup='))
  ?.slice(9);

function scrub(value: unknown, venuePhotos: Set<string>): unknown {
  if (Array.isArray(value))
    return value.map((item) => scrub(item, venuePhotos));
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return value;
  const record = value as Record<string, unknown>;
  // A storage path denotes an actual upload, which this migration must preserve.
  if (record.photoPath || record.thumbnailPath) return value;
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, entry]) =>
      (key === 'photoUrl' || key === 'thumbnailUrl') &&
      typeof entry === 'string' &&
      venuePhotos.has(entry)
        ? []
        : [[key, scrub(entry, venuePhotos)]],
    ),
  );
}

async function main() {
  if (
    process.env.GCLOUD_PROJECT !== 'tastes-934e6' ||
    firestoreDatabaseId !== 'tastes-eu' ||
    process.env.FIRESTORE_EMULATOR_HOST
  )
    throw new Error(
      'Explicit production project tastes-934e6 / tastes-eu required.',
    );
  if (apply && !backup)
    throw new Error('--apply requires --backup=/absolute/path.json');
  const reviews = await db
    .collection('reviews')
    .where('source', '==', 'seed')
    .get();
  const updates: Array<{
    path: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }> = [];
  const venues = new Map<string, Set<string>>();
  for (const review of reviews.docs) {
    const venueId = String(review.get('venueId') ?? '');
    if (!venues.has(venueId)) {
      const venue = await db.doc(`venues/${venueId}`).get();
      venues.set(
        venueId,
        new Set(
          [
            venue.get('imageUrl'),
            ...(Array.isArray(venue.get('photoUrls'))
              ? venue.get('photoUrls')
              : []),
          ].filter((value): value is string => typeof value === 'string'),
        ),
      );
    }
    const photos = venues.get(venueId)!;
    if (!photos.size) continue;
    const visits = await review.ref.collection('visits').get();
    for (const document of [review, ...visits.docs]) {
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const field of ['dishReviews', 'visits']) {
        const value = document.get(field);
        if (!Array.isArray(value)) continue;
        const cleaned = scrub(value, photos);
        if (JSON.stringify(cleaned) === JSON.stringify(value)) continue;
        before[field] = value;
        after[field] = cleaned;
      }
      if (Object.keys(after).length)
        updates.push({ path: document.ref.path, before, after });
    }
  }
  console.log(
    JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      seedReviews: reviews.size,
      documentsToClean: updates.length,
    }),
  );
  if (!apply) return;
  writeFileSync(backup!, JSON.stringify(updates, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  for (const update of updates) {
    await db.runTransaction(async (transaction) => {
      const ref = db.doc(update.path);
      const current = await transaction.get(ref);
      for (const [field, value] of Object.entries(update.before)) {
        if (JSON.stringify(current.get(field)) !== JSON.stringify(value))
          throw new Error(`Concurrent change at ${update.path}; no overwrite.`);
      }
      transaction.update(ref, update.after);
    });
  }
  console.log(
    JSON.stringify({ cleanedDocuments: updates.length, backupWritten: true }),
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
