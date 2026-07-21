import { createUserProfileInputSchema } from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

export const createUserProfile = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createUserProfileInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(userRef);
    const now = FieldValue.serverTimestamp();

    transaction.set(
      userRef,
      {
        uid,
        displayName: input.displayName,
        bio: input.bio ?? '',
        photoUrl: existing.exists ? existing.get('photoUrl') ?? null : null,
        status: 'active',
        createdAt: existing.exists ? existing.get('createdAt') : now,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  return { id: uid };
});
