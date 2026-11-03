import type { Firestore } from 'firebase-admin/firestore';

export interface ReviewCountMismatch {
  userId: string;
  previous: number;
  actual: number;
}

/**
 * Compares each user's stored `reviewCount` with their published reviews.
 * The profile header shows the stored counter, so drift (seeded demo values,
 * missed decrements) makes it disagree with the visible review list.
 * Takes the Firestore instance so the seed script can pass its own app.
 */
export async function findUserReviewCountMismatches(
  db: Firestore,
  userIds: readonly string[],
): Promise<ReviewCountMismatch[]> {
  const mismatches: ReviewCountMismatch[] = [];
  for (let offset = 0; offset < userIds.length; offset += 20) {
    const results = await Promise.all(
      userIds.slice(offset, offset + 20).map(async (userId) => {
        const [user, published] = await Promise.all([
          db.collection('users').doc(userId).get(),
          db
            .collection('reviews')
            .where('authorId', '==', userId)
            .where('status', '==', 'published')
            .count()
            .get(),
        ]);
        return {
          userId,
          previous: Number(user.get('reviewCount') ?? 0),
          actual: published.data().count,
        };
      }),
    );
    mismatches.push(
      ...results.filter(({ previous, actual }) => previous !== actual),
    );
  }
  return mismatches;
}

export async function applyUserReviewCounts(
  db: Firestore,
  mismatches: readonly ReviewCountMismatch[],
): Promise<void> {
  for (let offset = 0; offset < mismatches.length; offset += 400) {
    const batch = db.batch();
    for (const mismatch of mismatches.slice(offset, offset + 400)) {
      batch.update(db.collection('users').doc(mismatch.userId), {
        reviewCount: mismatch.actual,
      });
    }
    await batch.commit();
  }
}
