import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../shared/firebase';
import { sendNotification, sendNotifications } from '../../shared/notifications';

const scheduleOptions = { region: 'europe-west1', timeZone: 'UTC', maxInstances: 1 } as const;
const USER_PAGE_SIZE = 400;
const INACTIVITY_DAYS = 14;
const PROFILE_NUDGE_DAYS = 3;
const TRENDING_WINDOW_DAYS = 7;
const TRENDING_MIN_REVIEWS = 3;
const LEADERBOARD_SIZE = 10;
const DAY_MS = 24 * 60 * 60_000;

function monthName(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long' });
}

/** Walks every user document in pages so a schedule never holds the whole collection in memory. */
async function forEachUser(
  handle: (user: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>,
): Promise<void> {
  let lastId: string | null = null;
  do {
    let query = db.collection('users')
      .where('status', '==', 'active')
      .orderBy(FieldPath.documentId())
      .limit(USER_PAGE_SIZE);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) return;
    for (const user of snapshot.docs) await handle(user);
    lastId = snapshot.docs.at(-1)?.id ?? null;
  } while (lastId);
}

/** "Your recap is ready", on the 1st, for everyone whose recap was built. */
export const sendMonthlyRecapNotifications = onSchedule({
  ...scheduleOptions,
  schedule: '0 9 1 * *',
}, async () => {
  const month = monthName(new Date(Date.now() - DAY_MS));
  await forEachUser(async (user) => {
    const recap = await user.ref.collection('monthlyRecaps').doc('current').get();
    if (!recap.exists || recap.get('ready') !== true) return;
    await sendNotification({
      recipientId: user.id,
      type: 'recap-ready',
      eventKey: month,
      params: { month: String(recap.get('month') ?? month) },
      targetId: 'monthly',
    });
  });
});

/** The follow-up three days later for recaps nobody opened. */
export const sendMonthlyRecapReminders = onSchedule({
  ...scheduleOptions,
  schedule: '0 9 4 * *',
}, async () => {
  const month = monthName(new Date(Date.now() - 4 * DAY_MS));
  await forEachUser(async (user) => {
    const recap = await user.ref.collection('monthlyRecaps').doc('current').get();
    if (!recap.exists || recap.get('ready') !== true || recap.get('openedAt')) return;
    await sendNotification({
      recipientId: user.id,
      type: 'recap-reminder',
      eventKey: month,
      params: { month: String(recap.get('month') ?? month) },
      targetId: 'monthly',
    });
  });
});

/** Daily win-back and profile nudges. */
export const sendReminderNotifications = onSchedule({
  ...scheduleOptions,
  schedule: '0 10 * * *',
}, async () => {
  const now = Date.now();
  const inactiveBefore = Timestamp.fromMillis(now - INACTIVITY_DAYS * DAY_MS);
  const nudgeBefore = Timestamp.fromMillis(now - PROFILE_NUDGE_DAYS * DAY_MS);

  await forEachUser(async (user) => {
    const city = String(user.get('city') ?? '').trim();
    const lastSeenAt = user.get('lastSeenAt') as Timestamp | undefined;
    const lastReminderAt = user.get('lastInactiveReminderAt') as Timestamp | undefined;
    const dormant = lastSeenAt
      && lastSeenAt.toMillis() < inactiveBefore.toMillis()
      && (!lastReminderAt || lastReminderAt.toMillis() < now - INACTIVITY_DAYS * DAY_MS);
    if (dormant) {
      let openings = db.collection('venues')
        .where('status', '==', 'active')
        .where('createdAt', '>=', Timestamp.fromMillis(now - INACTIVITY_DAYS * DAY_MS));
      if (city) openings = openings.where('city', '==', city);
      const recentVenues = await openings.limit(20).get();
      if (recentVenues.size > 0) {
        await sendNotification({
          recipientId: user.id,
          type: 'inactive-reminder',
          eventKey: new Date(now).toISOString().slice(0, 10),
          params: { count: recentVenues.size, city: city || null },
        });
        await user.ref.update({ lastInactiveReminderAt: FieldValue.serverTimestamp() });
      }
    }

    const createdAt = user.get('createdAt') as Timestamp | undefined;
    const preferences = user.get('tastePreferences') as { favoriteDish?: unknown } | undefined;
    const incomplete = !preferences?.favoriteDish || !user.get('photoUrl');
    if (createdAt && createdAt.toMillis() < nudgeBefore.toMillis() && incomplete && !user.get('profileNudgedAt')) {
      await sendNotification({
        recipientId: user.id,
        type: 'profile-incomplete',
        eventKey: 'profile',
      });
      await user.ref.update({ profileNudgedAt: FieldValue.serverTimestamp() });
    }
  });
});

/** Saved places that picked up momentum this week. */
export const sendTrendingSavedPlaceNotifications = onSchedule({
  ...scheduleOptions,
  schedule: '0 11 * * 1',
}, async () => {
  const since = Timestamp.fromMillis(Date.now() - TRENDING_WINDOW_DAYS * DAY_MS);
  const recentReviews = await db.collection('reviews')
    .where('status', '==', 'published')
    .where('createdAt', '>=', since)
    .limit(1_000)
    .get();

  const counts = new Map<string, number>();
  for (const review of recentReviews.docs) {
    const venueId = String(review.get('venueId') ?? '');
    if (venueId) counts.set(venueId, (counts.get(venueId) ?? 0) + 1);
  }
  const trending = [...counts.entries()]
    .filter(([, count]) => count >= TRENDING_MIN_REVIEWS)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([venueId]) => venueId);
  if (trending.length === 0) return;

  const week = new Date().toISOString().slice(0, 10);
  const venues = await db.getAll(...trending.map((venueId) => db.collection('venues').doc(venueId)));
  for (const venue of venues) {
    if (!venue.exists || venue.get('status') !== 'active') continue;
    const savers = await db.collectionGroup('savedVenues').where('venueId', '==', venue.id).limit(400).get();
    await sendNotifications(savers.docs
      .map((saved) => saved.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id))
      .map((recipientId) => ({
        recipientId,
        type: 'saved-place-trending' as const,
        eventKey: `${venue.id}:${week}`,
        params: { place: String(venue.get('name') ?? 'A saved place'), city: String(venue.get('city') ?? '') },
        targetId: venue.id,
      })));
  }
});

interface Standing {
  userId: string;
  displayName: string;
  rank: number;
}

async function cityStandings(city: string): Promise<Standing[]> {
  const snapshot = await db.collection('users')
    .where('status', '==', 'active')
    .where('city', '==', city)
    .orderBy('monthlyXp', 'desc')
    .limit(LEADERBOARD_SIZE)
    .get();
  return snapshot.docs.map((profile, index) => ({
    userId: profile.id,
    displayName: String(profile.get('displayName') ?? 'Someone'),
    rank: index + 1,
  }));
}

async function activeCities(): Promise<string[]> {
  const snapshot = await db.collection('venues').where('status', '==', 'active').limit(1_000).get();
  return [...new Set(snapshot.docs.map((venue) => String(venue.get('city') ?? '').trim()).filter(Boolean))].slice(0, 50);
}

/**
 * Diffs the daily top ten of every city against yesterday's snapshot so overtakes and friends
 * entering the leaderboard can be announced.
 */
export const refreshLeaderboardStandings = onSchedule({
  ...scheduleOptions,
  schedule: '0 12 * * *',
}, async () => {
  for (const city of await activeCities()) {
    const snapshotRef = db.collection('_leaderboardSnapshots').doc(encodeURIComponent(city));
    const [previousSnapshot, standings] = await Promise.all([snapshotRef.get(), cityStandings(city)]);
    if (standings.length === 0) continue;
    const previous = new Map(
      ((previousSnapshot.get('standings') ?? []) as Standing[]).map((entry) => [entry.userId, entry.rank]),
    );
    const day = new Date().toISOString().slice(0, 10);

    for (const standing of standings) {
      const previousRank = previous.get(standing.userId);
      if (previousRank !== undefined && standing.rank > previousRank) {
        const overtaker = standings.find((entry) => entry.rank === previousRank);
        if (overtaker) {
          await sendNotification({
            recipientId: standing.userId,
            type: 'leaderboard-overtaken',
            eventKey: `${city}:${day}`,
            actorId: overtaker.userId,
            actorName: overtaker.displayName,
            params: { rank: standing.rank, city },
          });
        }
      }
      if (previousRank === undefined) {
        const followers = await db.collection('users').doc(standing.userId).collection('followers').limit(400).get();
        await sendNotifications(followers.docs.map((follower) => ({
          recipientId: follower.id,
          type: 'friend-leaderboard' as const,
          eventKey: `${standing.userId}:${city}:${day}`,
          actorId: standing.userId,
          actorName: standing.displayName,
          params: { rank: standing.rank, city },
        })));
      }
    }

    await snapshotRef.set({ city, standings, updatedAt: FieldValue.serverTimestamp() });
  }
});
