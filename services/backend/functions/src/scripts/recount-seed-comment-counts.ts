import { db, firestoreDatabaseId } from '../shared/firebase';

const apply = process.argv.includes('--apply');
const expectedProjectId = 'tastes-934e6';
const expectedDatabaseId = 'tastes-eu';

function assertProductionTarget(): void {
  if (process.env.GCLOUD_PROJECT !== expectedProjectId) {
    throw new Error(`Set GCLOUD_PROJECT=${expectedProjectId} before running this migration.`);
  }
  if (process.env.FIRESTORE_DATABASE_ID !== expectedDatabaseId || firestoreDatabaseId !== expectedDatabaseId) {
    throw new Error(`Set FIRESTORE_DATABASE_ID=${expectedDatabaseId} before running this migration.`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('This migration must not run against a Firestore emulator.');
  }
}

async function main(): Promise<void> {
  assertProductionTarget();

  const reviews = await db.collection('reviews')
    .where('source', 'in', ['seed', 'stress-image-scroll'])
    .get();
  const mismatches: Array<{ id: string; previous: number; actual: number }> = [];

  for (let offset = 0; offset < reviews.docs.length; offset += 20) {
    const results = await Promise.all(reviews.docs.slice(offset, offset + 20).map(async (review) => {
      const comments = await review.ref.collection('comments')
        .where('status', '==', 'published')
        .count()
        .get();
      return {
        id: review.id,
        previous: Number(review.get('commentCount') ?? 0),
        actual: comments.data().count,
      };
    }));
    mismatches.push(...results.filter(({ previous, actual }) => previous !== actual));
  }

  for (const mismatch of mismatches) {
    process.stdout.write(`${mismatch.id}: ${mismatch.previous} -> ${mismatch.actual}\n`);
  }

  if (!apply) {
    process.stdout.write(`Dry run: ${mismatches.length} of ${reviews.size} seed reviews need an update. Re-run with --apply to write.\n`);
    return;
  }

  for (let offset = 0; offset < mismatches.length; offset += 400) {
    const batch = db.batch();
    for (const mismatch of mismatches.slice(offset, offset + 400)) {
      batch.update(db.collection('reviews').doc(mismatch.id), { commentCount: mismatch.actual });
    }
    await batch.commit();
  }

  process.stdout.write(`Updated commentCount on ${mismatches.length} seed reviews in ${firestoreDatabaseId}.\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
