import { db } from '../shared/firebase';
import { reconcileReviewAggregates } from '../shared/review-aggregates';

if (!process.env.GCLOUD_PROJECT && !process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('Set GCLOUD_PROJECT or FIRESTORE_EMULATOR_HOST explicitly.');
reconcileReviewAggregates(db, process.argv.includes('--apply'))
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
