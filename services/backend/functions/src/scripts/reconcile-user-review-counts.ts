import { db, firestoreDatabaseId } from '../shared/firebase';
import {
  applyUserReviewCounts,
  findUserReviewCountMismatches,
} from '../shared/review-counts';

const apply = process.argv.includes('--apply');

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GCLOUD_PROJECT) {
    throw new Error(
      'Set GCLOUD_PROJECT (and FIRESTORE_DATABASE_ID) or FIRESTORE_EMULATOR_HOST before running.',
    );
  }

  const users = await db.collection('users').select().get();
  const mismatches = await findUserReviewCountMismatches(
    db,
    users.docs.map((user) => user.id),
  );

  for (const mismatch of mismatches) {
    process.stdout.write(
      `${mismatch.userId}: ${mismatch.previous} -> ${mismatch.actual}\n`,
    );
  }

  if (!apply) {
    process.stdout.write(
      `Dry run: ${mismatches.length} of ${users.size} users in ${firestoreDatabaseId} need an update. Re-run with --apply to write.\n`,
    );
    return;
  }

  await applyUserReviewCounts(db, mismatches);
  process.stdout.write(
    `Updated reviewCount on ${mismatches.length} users in ${firestoreDatabaseId}.\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
