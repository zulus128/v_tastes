import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';
import { sendNotifications } from '../../shared/notifications';

const SEASON_SIZE = 25;

/** Closes the season for every city by telling its top players where they landed. */
async function announceSeasonResults(): Promise<void> {
  const month = new Date(Date.now() - 24 * 60 * 60_000).toLocaleDateString('en-US', { month: 'long' });
  const cities = await db.collection('venues').where('status', '==', 'active').limit(1_000).get();
  const cityNames = [...new Set(cities.docs.map((venue) => String(venue.get('city') ?? '').trim()).filter(Boolean))].slice(0, 50);
  for (const city of cityNames) {
    const standings = await db.collection('users')
      .where('status', '==', 'active')
      .where('city', '==', city)
      .orderBy('monthlyXp', 'desc')
      .limit(SEASON_SIZE)
      .get();
    await sendNotifications(standings.docs
      .filter((profile) => Number(profile.get('monthlyXp') ?? 0) > 0)
      .map((profile, index) => ({
        recipientId: profile.id,
        type: 'season-results' as const,
        eventKey: `${city}:${month}`,
        params: { month, city, rank: index + 1 },
      })));
  }
}

export const resetMonthlyXp = onSchedule({
  schedule: '0 0 1 * *',
  timeZone: 'UTC',
  region: 'europe-west1',
}, async () => {
  await announceSeasonResults();

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
