import { followUserInputSchema, importContactsInputSchema, removeFollowerInputSchema, type ImportContactsResult } from '@tastes/contracts';
import { getAuth, type UserIdentifier, type UserRecord } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit } from '../../shared/mutations';
import { queueNotification } from '../../shared/notifications';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

const MAX_FOLLOWING = 500;

/** Contact identifiers are only ever stored hashed, so an invite can be matched without keeping the address. */
export function contactInviteId(identifier: string): string {
  return createHash('sha256').update(identifier.trim().toLocaleLowerCase()).digest('hex');
}

export const importContacts = onCall(callableOptions, async (request): Promise<ImportContactsResult> => {
  const uid = requireUserId(request);
  const input = parseInput(importContactsInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (transaction) => {
    const profile = await transaction.get(userRef);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    await enforceRateLimit(transaction, uid, 'import-contacts', 5, 60 * 60_000);
    transaction.update(userRef, {
      contactsImportedAt: FieldValue.serverTimestamp(),
      contactsImportedCount: input.phoneNumbers.length + input.emails.length,
    });
  });

  const identifiers: UserIdentifier[] = [
    ...[...new Set(input.phoneNumbers)].map((phoneNumber) => ({ phoneNumber } as const)),
    ...[...new Set(input.emails.map((email) => email.toLocaleLowerCase()))].map((email) => ({ email } as const)),
  ];
  const records: UserRecord[] = [];
  for (let index = 0; index < identifiers.length; index += 100) {
    const result = await getAuth().getUsers(identifiers.slice(index, index + 100));
    records.push(...result.users);
  }
  const matchedIds = [...new Set(records.map((record) => record.uid).filter((id) => id !== uid))];
  const matchedIdentifiers = new Set(records.flatMap((record) => [
    record.phoneNumber ?? '',
    record.email?.toLocaleLowerCase() ?? '',
  ].filter(Boolean)));
  const invitedIdentifiers = [
    ...new Set([
      ...input.phoneNumbers,
      ...input.emails.map((email) => email.toLocaleLowerCase()),
    ]),
  ].filter((identifier) => !matchedIdentifiers.has(identifier)).slice(0, 500);
  for (let index = 0; index < invitedIdentifiers.length; index += 400) {
    const batch = db.batch();
    for (const identifier of invitedIdentifiers.slice(index, index + 400)) {
      batch.set(db.collection('_contactInvites').doc(contactInviteId(identifier)), {
        inviterIds: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }
  if (matchedIds.length === 0) {
    return { matches: [], importedCount: identifiers.length };
  }
  const [profiles, following] = await Promise.all([
    db.getAll(...matchedIds.map((id) => db.collection('users').doc(id))),
    db.getAll(...matchedIds.map((id) => userRef.collection('following').doc(id))),
  ]);
  const followingIds = new Set(following.filter((document) => document.exists).map((document) => document.id));
  return {
    matches: profiles.filter((profile) => profile.exists && profile.get('status') === 'active').map((profile) => ({
      userId: profile.id,
      displayName: String(profile.get('displayName') ?? 'Tastes user'),
      username: profile.get('username') ? String(profile.get('username')) : null,
      photoUrl: profile.get('photoUrl') ? String(profile.get('photoUrl')) : null,
      following: followingIds.has(profile.id),
    })),
    importedCount: identifiers.length,
  };
});

export const followUser = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(followUserInputSchema, request.data);
  if (uid === input.targetUserId) {
    throw new HttpsError('failed-precondition', 'You cannot follow yourself.');
  }

  const userRef = db.collection('users').doc(uid);
  const targetRef = db.collection('users').doc(input.targetUserId);
  const followingRef = userRef.collection('following').doc(input.targetUserId);
  const followerRef = targetRef.collection('followers').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, target, following, targetFollowsUser, userIsFollowedByTarget] = await Promise.all([
      transaction.get(userRef),
      transaction.get(targetRef),
      transaction.get(followingRef),
      transaction.get(targetRef.collection('following').doc(uid)),
      transaction.get(userRef.collection('followers').doc(input.targetUserId)),
    ]);
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!target.exists || target.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The user was not found.');
    }
    if (following.exists) return { following: true };
    if (Number(user.get('followingCount') ?? 0) >= MAX_FOLLOWING) {
      throw new HttpsError('resource-exhausted', 'The following limit has been reached.');
    }

    await enforceRateLimit(transaction, uid, 'follow', 60, 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.create(followingRef, { userId: input.targetUserId, createdAt: now });
    transaction.create(followerRef, { userId: uid, createdAt: now });
    transaction.update(userRef, { followingCount: FieldValue.increment(1), updatedAt: now });
    transaction.update(targetRef, { followerCount: FieldValue.increment(1), updatedAt: now });
    const mutualFollow = targetFollowsUser.exists && userIsFollowedByTarget.exists;
    queueNotification(transaction, {
      recipientId: input.targetUserId,
      type: mutualFollow ? 'follow-back' : 'follow-new',
      eventKey: `${uid}:${mutualFollow ? 'follow-back' : 'follow-new'}`,
      actorId: uid,
      actorName: String(user.get('displayName') ?? 'Someone'),
      targetId: uid,
    });
    return { following: true };
  });
});

export const unfollowUser = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(followUserInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const targetRef = db.collection('users').doc(input.targetUserId);
  const followingRef = userRef.collection('following').doc(input.targetUserId);
  const followerRef = targetRef.collection('followers').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, target, following] = await Promise.all([
      transaction.get(userRef),
      transaction.get(targetRef),
      transaction.get(followingRef),
    ]);
    if (!following.exists) return { following: false };

    await enforceRateLimit(transaction, uid, 'follow', 60, 60_000);
    transaction.delete(followingRef);
    transaction.delete(followerRef);
    if (user.exists) {
      transaction.update(userRef, {
        followingCount: Math.max(0, Number(user.get('followingCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (target.exists) {
      transaction.update(targetRef, {
        followerCount: Math.max(0, Number(target.get('followerCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { following: false };
  });
});

export const removeFollower = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(removeFollowerInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const followerRef = db.collection('users').doc(input.followerUserId);
  const incomingRef = userRef.collection('followers').doc(input.followerUserId);
  const outgoingRef = followerRef.collection('following').doc(uid);

  return db.runTransaction(async (transaction) => {
    const [user, follower, incoming] = await Promise.all([
      transaction.get(userRef),
      transaction.get(followerRef),
      transaction.get(incomingRef),
    ]);
    if (!incoming.exists) return { following: false };

    await enforceRateLimit(transaction, uid, 'remove-follower', 60, 60_000);
    transaction.delete(incomingRef);
    transaction.delete(outgoingRef);
    if (user.exists) {
      transaction.update(userRef, {
        followerCount: Math.max(0, Number(user.get('followerCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (follower.exists) {
      transaction.update(followerRef, {
        followingCount: Math.max(0, Number(follower.get('followingCount') ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { following: false };
  });
});
