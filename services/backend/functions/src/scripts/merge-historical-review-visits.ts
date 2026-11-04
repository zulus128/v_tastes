import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  Timestamp,
  FieldValue,
  type DocumentSnapshot,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { db, firestoreDatabaseId } from '../shared/firebase';
import { idempotentDocumentId } from '../shared/mutations';
import {
  mergeHistoricalReviews,
  type HistoricalReview,
} from '../modules/reviews/merge-history';
import { timestampToIso } from '../shared/serialization';

const fixtureSources = new Set(['seed', 'stress-image-scroll']);
function encode(value: unknown): unknown {
  if (value instanceof Timestamp)
    return {
      __firestoreType: 'Timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  if (Buffer.isBuffer(value))
    return { __firestoreType: 'Bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if ('path' in value && 'firestore' in value)
      return {
        __firestoreType: 'Reference',
        path: (value as DocumentReference).path,
      };
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encode(entry)]),
    );
  }
  return value;
}
async function subtree(
  document: DocumentSnapshot,
): Promise<DocumentSnapshot[]> {
  const children = await Promise.all(
    (await document.ref.listCollections()).map(async (collection) => {
      const snapshot = await collection.get();
      return (await Promise.all(snapshot.docs.map(subtree))).flat();
    }),
  );
  return [document, ...children.flat()];
}
function historical(document: DocumentSnapshot): HistoricalReview {
  return {
    ...document.data(),
    id: document.id,
    authorId: String(document.get('authorId')),
    venueId: String(document.get('venueId')),
    createdAt: timestampToIso(document.get('createdAt')),
    rating: Number(document.get('rating')),
    text: String(document.get('text')),
    dishReviews: document.get('dishReviews') ?? [],
  };
}

export async function mergeHistoricalReviewVisits(options: {
  apply: boolean;
  backupDirectory: string | undefined;
  allowTestEmulator?: boolean;
}) {
  const { apply, backupDirectory } = options;
  const testEmulator =
    options.allowTestEmulator &&
    process.env.GCLOUD_PROJECT === 'demo-tastes-test' &&
    !!process.env.FIRESTORE_EMULATOR_HOST &&
    firestoreDatabaseId === '(default)';
  if (
    !testEmulator &&
    (process.env.GCLOUD_PROJECT !== 'tastes-934e6' ||
      firestoreDatabaseId !== 'tastes-eu' ||
      process.env.FIRESTORE_EMULATOR_HOST)
  )
    throw new Error(
      'This migration requires production tastes-934e6 / tastes-eu explicitly.',
    );
  if (!backupDirectory)
    throw new Error(
      'Set REVIEW_MIGRATION_BACKUP_DIR to a private local backup directory.',
    );
  const snapshot = await db
    .collection('reviews')
    .where('status', '==', 'published')
    .get();
  const byOwner = new Map<string, DocumentSnapshot[]>();
  for (const review of snapshot.docs) {
    const key = `${review.get('authorId')}|${review.get('venueId')}`;
    byOwner.set(key, [...(byOwner.get(key) ?? []), review]);
  }
  // The approved scope is the 29 groups containing non-fixture reviews.
  // Fixture-only stress/seed groups remain outside this migration.
  const groups = [...byOwner.values()].filter(
    (reviews) =>
      reviews.length > 1 &&
      reviews.some((review) => !fixtureSources.has(review.get('source'))),
  );
  const plans = [];
  for (const reviews of groups) {
    const merged = mergeHistoricalReviews(reviews.map(historical));
    const documents = (await Promise.all(reviews.map(subtree))).flat();
    const canonical = reviews.find(
      (review) => review.id === merged.canonicalId,
    )!;
    const copies = new Map<string, DocumentSnapshot>();
    for (const document of documents) {
      const source = reviews.find((review) =>
        document.ref.path.startsWith(`${review.ref.path}/`),
      );
      if (!source || source.id === canonical.id) continue;
      const relative = document.ref.path.slice(source.ref.path.length + 1);
      // Existing visit subcollection IDs and idempotency records must not be
      // coalesced: the complete original subtree remains on the archived alias.
      if (
        !relative.startsWith('comments/') &&
        !relative.startsWith('reactions/')
      )
        continue;
      const path = `${canonical.ref.path}/${relative}`;
      const original = documents.find((doc) => doc.ref.path === path);
      if (
        relative.startsWith('reactions/') &&
        relative.split('/').length === 2
      ) {
        if (!original && !copies.has(path)) copies.set(path, document);
      } else {
        if (original || copies.has(path))
          throw new Error(`Comment ID collision: ${path}. No data changed.`);
        copies.set(path, document);
      }
    }
    const finalChildren = [
      ...documents.filter((doc) =>
        doc.ref.path.startsWith(`${canonical.ref.path}/`),
      ),
      ...copies.values(),
    ];
    const reactionIds = new Set(
      finalChildren
        .filter(
          (doc) =>
            /\/reactions\/[^/]+$/.test(doc.ref.path) &&
            doc.ref.path.split('/').length === 4,
        )
        .map((doc) => doc.id),
    );
    const legacyReactionCount = reviews.reduce((sum, review) => {
      const storedReactions = documents.filter(
        (doc) =>
          doc.ref.path.startsWith(`${review.ref.path}/reactions/`) &&
          doc.ref.path.split('/').length === 4,
      ).length;
      return (
        sum +
        Math.max(0, Number(review.get('reactionCount') ?? 0) - storedReactions)
      );
    }, 0);
    const comments = finalChildren.filter(
      (doc) =>
        doc.ref.path.split('/').length === 4 &&
        doc.ref.parent.id === 'comments' &&
        doc.get('status') === 'published',
    );
    if (copies.size + reviews.length + 4 > 450)
      throw new Error(
        `Group ${canonical.id} exceeds transaction write budget.`,
      );
    plans.push({
      reviews,
      documents,
      canonical,
      copies,
      merged,
      reactionCount: reactionIds.size + legacyReactionCount,
      legacyReactionCount,
      commentCount: comments.length,
    });
  }
  const counterRefs = [
    ...new Set(
      groups.flatMap((reviews) => [
        `users/${reviews[0]!.get('authorId')}`,
        `venues/${reviews[0]!.get('venueId')}`,
        `reviewOwnership/${idempotentDocumentId(String(reviews[0]!.get('authorId')), 'review-owner', String(reviews[0]!.get('venueId')))}`,
      ]),
    ),
  ].map((path) => db.doc(path));
  const counters = counterRefs.length ? await db.getAll(...counterRefs) : [];
  const allDocuments = [
    ...plans.flatMap((plan) => plan.documents),
    ...counters,
  ];
  const path = resolve(
    backupDirectory,
    `review-visits-${Date.now()}-${apply ? 'apply' : 'dry-run'}.json`,
  );
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    JSON.stringify(
      {
        project: process.env.GCLOUD_PROJECT,
        database: firestoreDatabaseId,
        createdAt: new Date().toISOString(),
        documents: allDocuments.map((doc) => ({
          path: doc.ref.path,
          exists: doc.exists,
          updateTime: encode(doc.updateTime),
          data: encode(doc.data()),
        })),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        groups: plans.length,
        sourceReviews: groups.reduce((sum, group) => sum + group.length, 0),
        backup: path,
        plans: plans.map((plan) => ({
          canonical: plan.canonical.id,
          reviews: plan.reviews.length,
          visits: plan.merged.patch.visitCount,
          comments: plan.commentCount,
          likes: plan.reactionCount,
          legacyLikes: plan.legacyReactionCount,
        })),
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  for (const plan of plans) {
    await db.runTransaction(async (transaction) => {
      const authorId = String(plan.canonical.get('authorId'));
      const venueId = String(plan.canonical.get('venueId'));
      const userRef = db.collection('users').doc(authorId);
      const venueRef = db.collection('venues').doc(venueId);
      const ownershipRef = db
        .collection('reviewOwnership')
        .doc(idempotentDocumentId(authorId, 'review-owner', venueId));
      const [fresh, user, venueReviews] = await Promise.all([
        transaction.getAll(...plan.documents.map((doc) => doc.ref)),
        transaction.get(userRef),
        transaction.get(
          db
            .collection('reviews')
            .where('venueId', '==', venueId)
            .where('status', '==', 'published'),
        ),
      ]);
      // A concurrent edit/comment/like changes the parent review; abort rather
      // than migrate a version different from the durable backup.
      fresh.forEach((doc, index) => {
        if (!doc.updateTime?.isEqual(plan.documents[index]!.updateTime!))
          throw new Error(
            `Data changed since backup: ${doc.ref.path}. Run the migration again.`,
          );
      });
      const currentGroup = venueReviews.docs.filter(
        (doc) => doc.get('authorId') === authorId,
      );
      if (
        currentGroup.length !== plan.reviews.length ||
        currentGroup.some(
          (doc) => !plan.reviews.some((source) => source.id === doc.id),
        )
      )
        throw new Error('The review group changed since preflight. Run again.');
      const removed = new Set(
        plan.reviews
          .filter((review) => review.id !== plan.canonical.id)
          .map((review) => review.id),
      );
      const remaining = venueReviews.docs.filter(
        (review) => !removed.has(review.id),
      );
      const rating =
        remaining.reduce(
          (sum, review) =>
            sum +
            (review.id === plan.canonical.id
              ? plan.merged.patch.rating
              : Number(review.get('rating'))),
          0,
        ) / remaining.length;
      for (const [target, document] of plan.copies)
        transaction.create(db.doc(target), document.data()!);
      transaction.update(plan.canonical.ref, {
        ...plan.merged.patch,
        commentCount: plan.commentCount,
        reactionCount: plan.reactionCount,
        legacyReactionCount: plan.legacyReactionCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const review of plan.reviews) {
        if (review.id === plan.canonical.id) continue;
        transaction.update(review.ref, {
          status: 'deleted',
          mergedIntoReviewId: plan.canonical.id,
          mergedAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.set(ownershipRef, {
        authorId,
        venueId,
        reviewId: plan.canonical.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (user.exists)
        transaction.update(userRef, {
          reviewCount: Math.max(
            0,
            Number(user.get('reviewCount') ?? 0) - removed.size,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        });
      transaction.update(venueRef, {
        reviewCount: remaining.length,
        rating,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    console.log(
      `Merged ${plan.reviews.length} reviews into ${plan.canonical.id}.`,
    );
  }
}
if (require.main === module)
  void mergeHistoricalReviewVisits({
    apply: process.argv.includes('--apply'),
    backupDirectory: process.env.REVIEW_MIGRATION_BACKUP_DIR,
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
