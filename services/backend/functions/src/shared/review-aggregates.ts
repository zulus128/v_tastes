import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/** Re-read each aggregate and its source reviews together, so repairs cannot
 * overwrite a concurrent review publication, edit, visit or deletion. */
export async function reconcileReviewAggregates(db: Firestore, apply = false) {
  const [venues, users] = await Promise.all([
    db.collection('venues').select().get(),
    db.collection('users').select().get(),
  ]);
  const entities = [
    ...venues.docs.map((doc) => ({
      ref: doc.ref,
      field: 'venueId',
      venue: true,
    })),
    ...users.docs.map((doc) => ({
      ref: doc.ref,
      field: 'authorId',
      venue: false,
    })),
  ];
  const repairs: {
    path: string;
    before: Record<string, number>;
    after: Record<string, number>;
  }[] = [];
  for (let offset = 0; offset < entities.length; offset += 10) {
    const results = await Promise.all(
      entities.slice(offset, offset + 10).map((entity) =>
        db.runTransaction(async (transaction) => {
          const [document, published] = await Promise.all([
            transaction.get(entity.ref),
            transaction.get(
              db
                .collection('reviews')
                .where(entity.field, '==', entity.ref.id)
                .where('status', '==', 'published'),
            ),
          ]);
          if (!document.exists) return null;
          const before: Record<string, number> = {
            reviewCount: Number(document.get('reviewCount') ?? 0),
          };
          const after: Record<string, number> = { reviewCount: published.size };
          if (entity.venue) {
            before.rating = Number(document.get('rating') ?? 0);
            after.rating = published.size
              ? published.docs.reduce(
                  (sum, review) => sum + Number(review.get('rating')),
                  0,
                ) / published.size
              : 0;
          }
          if (
            Object.keys(after).every(
              (key) =>
                Number.isFinite(after[key]) &&
                Math.abs(before[key]! - after[key]!) < 1e-9,
            )
          )
            return null;
          if (Object.values(after).some((value) => !Number.isFinite(value)))
            throw new Error(
              `Invalid published rating for ${entity.ref.path}; no repair applied to this entity.`,
            );
          const repair = { path: entity.ref.path, before, after };
          if (apply) {
            transaction.update(entity.ref, {
              ...after,
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.create(db.collection('_reviewAggregateRepairs').doc(), {
              ...repair,
              repairedAt: FieldValue.serverTimestamp(),
            });
          }
          return repair;
        }),
      ),
    );
    repairs.push(
      ...results.filter(
        (result): result is NonNullable<typeof result> => result !== null,
      ),
    );
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    checkedVenues: venues.size,
    checkedUsers: users.size,
    repairs,
  };
}
