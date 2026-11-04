import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../../shared/firebase';
import { createHash } from 'node:crypto';
import { reviewRisk, type RiskReview } from './risk';

const fixtures = new Set(['seed', 'stress-image-scroll', 'test']);
function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : 0;
}
export async function queueReviewRisks(now = Date.now()) {
  const [snapshot, users] = await Promise.all([
    db.collection('reviews').where('status', '==', 'published').get(),
    db.collection('users').where('status', '==', 'active').get(),
  ]);
  const authors = new Map(
    users.docs
      .filter(
        (user) =>
          !fixtures.has(String(user.get('source') ?? '')) &&
          user.get('isTestAccount') !== true,
      )
      .map((user) => [user.id, user]),
  );
  const reviews: RiskReview[] = snapshot.docs
    .filter(
      (review) =>
        authors.has(String(review.get('authorId'))) &&
        (!fixtures.has(String(review.get('source') ?? '')) ||
          review.get('latestVisitSource') === 'user'),
    )
    .map((review) => ({
      id: review.id,
      authorId: String(review.get('authorId')),
      venueId: String(review.get('venueId')),
      text: String(review.get('text') ?? ''),
      createdAt:
        millis(review.get('latestVisitAt')) || millis(review.get('createdAt')),
    }))
    .filter(
      (review) =>
        review.createdAt > 0 &&
        review.createdAt <= now &&
        review.createdAt >= now - 30 * 86_400_000,
    );
  const ids = [...new Set(reviews.map((review) => review.authorId))];
  const privateUsers = ids.length
    ? await db.getAll(...ids.map((id) => db.collection('_userPrivate').doc(id)))
    : [];
  const hashes = new Map(
    privateUsers.map((user) => [user.id, user.get('signupNetworkHash')]),
  );
  const accounts = [...authors.values()].map((user) => ({
    id: user.id,
    createdAt: millis(user.get('createdAt')),
    networkHash:
      typeof hashes.get(user.id) === 'string'
        ? String(hashes.get(user.id))
        : null,
  }));
  let queued = 0;
  const riskReviewIds: string[] = [];
  for (const review of reviews) {
    const risk = reviewRisk(review, reviews, accounts);
    if (!risk.queue) continue;
    const contentVersion = createHash('sha256')
      .update(review.id)
      .update('\0')
      .update(review.text)
      .digest('hex');
    const reportRef = db
      .collection('reports')
      .doc(`risk-review-${contentVersion}`);
    const created = await db.runTransaction(async (transaction) => {
      const [report, current] = await Promise.all([
        transaction.get(reportRef),
        transaction.get(db.collection('reviews').doc(review.id)),
      ]);
      // Never reopen a staff decision or flag a review that has since been removed.
      if (current.get('status') !== 'published')
        return { created: false, pending: false };
      if (report.exists)
        return { created: false, pending: report.get('status') === 'pending' };
      transaction.create(reportRef, {
        source: 'risk-monitor',
        reporterId: '',
        reporterName: 'Spam risk check',
        targetType: 'review',
        targetId: review.id,
        reason: 'Possible coordinated or duplicate reviews',
        details: `Manual review required. No content has been hidden.\n${risk.reasons.join('\n')}`,
        riskScore: risk.score,
        contentPreview: review.text.slice(0, 280),
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
      return { created: true, pending: true };
    });
    if (created.created) queued += 1;
    if (created.pending) riskReviewIds.push(review.id);
  }
  await db
    .collection('_reviewRiskRuns')
    .doc(new Date(now).toISOString().slice(0, 13))
    .set({
      calculatedAt: Timestamp.fromMillis(now),
      reviewed: reviews.length,
      queued,
      mode: 'manual-review',
      algorithmVersion: 1,
    });
  return { reviewed: reviews.length, queued, riskReviewIds };
}
