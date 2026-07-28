import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';

export const resetMonthlyXp = onSchedule({
  schedule: '0 0 1 * *',
  timeZone: 'UTC',
  region: 'europe-west1',
}, async () => {
  let lastId: string | null = null;

  do {
    let query = db.collection('users').orderBy(FieldPath.documentId()).limit(400);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    for (const user of snapshot.docs) {
      batch.update(user.ref, {
        monthlyXp: 0,
        monthlyXpResetAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    lastId = snapshot.docs.at(-1)?.id ?? null;
  } while (lastId);
});
