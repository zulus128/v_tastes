import { db, firestoreDatabaseId } from '../shared/firebase';
import { selectSeedDishPhotoUrl } from './seed-dish-photos';

const apply = process.argv.includes('--apply');
const expectedProjectId = 'tastes-934e6';
const expectedDatabaseId = 'tastes-eu';

function assertProductionTarget(): void {
  if (process.env.GCLOUD_PROJECT !== expectedProjectId) {
    throw new Error(
      `Set GCLOUD_PROJECT=${expectedProjectId} before running this migration.`,
    );
  }
  if (
    process.env.FIRESTORE_DATABASE_ID !== expectedDatabaseId ||
    firestoreDatabaseId !== expectedDatabaseId
  ) {
    throw new Error(
      `Set FIRESTORE_DATABASE_ID=${expectedDatabaseId} before running this migration.`,
    );
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'This migration must not run against a Firestore emulator.',
    );
  }
}

function hasPhoto(dish: Record<string, unknown>): boolean {
  return ['photoUrl', 'photoPath', 'thumbnailUrl', 'thumbnailPath'].some(
    (field) => typeof dish[field] === 'string' && dish[field].length > 0,
  );
}

async function main(): Promise<void> {
  assertProductionTarget();

  const reviews = await db
    .collection('reviews')
    .where('source', '==', 'seed')
    .get();
  const venueCache = new Map<
    string,
    Promise<FirebaseFirestore.DocumentSnapshot>
  >();
  const updates: Array<{
    id: string;
    dishReviews: Array<Record<string, unknown>>;
    addedPhotos: number;
  }> = [];

  for (const review of reviews.docs) {
    const dishes = Array.isArray(review.get('dishReviews'))
      ? (review.get('dishReviews') as Array<Record<string, unknown>>)
      : [];
    if (dishes.length === 0 || dishes.every(hasPhoto)) continue;

    const venueId = review.get('venueId');
    if (typeof venueId !== 'string') continue;
    const venuePromise =
      venueCache.get(venueId) ?? db.collection('venues').doc(venueId).get();
    venueCache.set(venueId, venuePromise);
    const venue = await venuePromise;
    if (!venue.exists) continue;

    let addedPhotos = 0;
    const dishReviews = dishes.map((dish, index) => {
      if (hasPhoto(dish)) return dish;
      const photoUrl = selectSeedDishPhotoUrl(
        venue.get('imageUrl'),
        venue.get('photoUrls'),
        index,
      );
      if (!photoUrl) return dish;
      addedPhotos += 1;
      const nextDish: Record<string, unknown> = { ...dish, photoUrl };
      if (nextDish.photoPath === null) delete nextDish.photoPath;
      return nextDish;
    });
    if (addedPhotos > 0) {
      updates.push({ id: review.id, dishReviews, addedPhotos });
    }
  }

  for (const update of updates) {
    process.stdout.write(`${update.id}: +${update.addedPhotos} dish photos\n`);
  }

  if (!apply) {
    const photoCount = updates.reduce(
      (total, update) => total + update.addedPhotos,
      0,
    );
    process.stdout.write(
      `Dry run: ${photoCount} dishes in ${updates.length} seed reviews need photos. Re-run with --apply to write.\n`,
    );
    return;
  }

  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = db.batch();
    for (const update of updates.slice(offset, offset + 400)) {
      batch.update(db.collection('reviews').doc(update.id), {
        dishReviews: update.dishReviews,
      });
    }
    await batch.commit();
  }

  process.stdout.write(
    `Updated dish photos on ${updates.length} seed reviews in ${firestoreDatabaseId}.\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
