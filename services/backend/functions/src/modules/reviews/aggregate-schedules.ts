import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../shared/firebase';
import { reconcileReviewAggregates } from '../../shared/review-aggregates';

export const reconcileReviewCounters = onSchedule(
  {
    schedule: '20 3 * * *',
    timeZone: 'UTC',
    region: 'europe-west1',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const result = await reconcileReviewAggregates(db, true);
    await db.collection('_aggregateReconciliationRuns').doc().set({
      mode: result.mode,
      checkedVenues: result.checkedVenues,
      checkedUsers: result.checkedUsers,
      repaired: result.repairs.length,
      calculatedAt: FieldValue.serverTimestamp(),
    });
  },
);
