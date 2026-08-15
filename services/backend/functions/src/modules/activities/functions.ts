import {
  createActivityInputSchema,
  respondToActivityInvitationInputSchema,
} from '@tastes/contracts';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit, idempotentDocumentId } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';

const ACTIVITY_RATE_LIMIT = 20;
const ACTIVITY_RATE_WINDOW_MS = 60 * 60_000;
const MAX_CANDIDATES = 100;

export const listActivityCandidates = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const userRef = db.collection('users').doc(uid);
  const user = await userRef.get();
  if (!user.exists || user.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }

  const following = await userRef.collection('following').limit(MAX_CANDIDATES).get();
  if (following.empty) return [];
  const candidateIds = following.docs.map((document) => document.id);
  const [reverseEdges, profiles] = await Promise.all([
    db.getAll(...candidateIds.map((id) => db.collection('users').doc(id).collection('following').doc(uid))),
    db.getAll(...candidateIds.map((id) => db.collection('users').doc(id))),
  ]);
  const mutualIds = new Set(reverseEdges.filter((document) => document.exists).map((document) => document.ref.parent.parent?.id));

  return profiles.flatMap((profile) => {
    if (!profile.exists || profile.get('status') !== 'active' || !mutualIds.has(profile.id)) return [];
    return [{
      userId: profile.id,
      displayName: String(profile.get('displayName') ?? 'Tastes user'),
      username: profile.get('username') ? String(profile.get('username')) : null,
      photoUrl: profile.get('photoUrl') ? String(profile.get('photoUrl')) : null,
    }];
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
});

export const createActivity = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createActivityInputSchema, request.data);
  if (input.memberIds.includes(uid)) {
    throw new HttpsError('invalid-argument', 'You are already the activity organizer.');
  }
  const startsAt = new Date(input.startsAt);

  const activityRef = db.collection('activities').doc(
    idempotentDocumentId(uid, 'create-activity', input.idempotencyKey),
  );
  const conversationRef = db.collection('conversations').doc(activityRef.id);
  const userRef = db.collection('users').doc(uid);
  const venueRef = db.collection('venues').doc(input.venueId);

  await db.runTransaction(async (transaction) => {
    const [existing, existingConversation, user, venue, ...memberData] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(conversationRef),
      transaction.get(userRef),
      transaction.get(venueRef),
      ...input.memberIds.flatMap((memberId) => [
        transaction.get(db.collection('users').doc(memberId)),
        transaction.get(userRef.collection('following').doc(memberId)),
        transaction.get(db.collection('users').doc(memberId).collection('following').doc(uid)),
      ]),
    ]);
    if (existing.exists) {
      if (!existingConversation.exists) {
        const rawParticipantIds: unknown = existing.get('participantIds');
        const participantIds: string[] = Array.isArray(rawParticipantIds)
          ? rawParticipantIds.filter((participantId: unknown): participantId is string => (
            typeof participantId === 'string' && participantId.length > 0
          ))
          : [uid];
        const now = FieldValue.serverTimestamp();
        transaction.create(conversationRef, {
          kind: 'activity',
          activityId: activityRef.id,
          organizerId: String(existing.get('organizerId') ?? uid),
          title: String(existing.get('venueName') ?? 'Activity'),
          imageUrl: existing.get('imageUrl') ? String(existing.get('imageUrl')) : null,
          participantIds,
          invitationStatuses: Object.fromEntries(participantIds.map((participantId) => [
            participantId,
            participantId === String(existing.get('organizerId') ?? uid) ? 'accepted' : 'pending',
          ])),
          unreadCounts: Object.fromEntries(participantIds.map((participantId) => [participantId, 0])),
          lastReadAt: {},
          lastReadMessageIds: {},
          typing: {},
          lastMessage: {
            id: `${activityRef.id}-created`,
            senderId: String(existing.get('organizerId') ?? uid),
            text: 'Activity created',
            createdAt: now,
          },
          messageCount: 0,
          status: 'active',
          createdAt: existing.get('createdAt') ?? now,
          updatedAt: now,
        });
      }
      return;
    }
    if (startsAt.getTime() < Date.now() + 5 * 60_000) {
      throw new HttpsError('failed-precondition', 'Choose a time at least five minutes from now.');
    }
    if (!user.exists || user.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!venue.exists || venue.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The place was not found.');
    }
    for (let index = 0; index < input.memberIds.length; index += 1) {
      const profile = memberData[index * 3];
      const forward = memberData[index * 3 + 1];
      const reverse = memberData[index * 3 + 2];
      if (!profile?.exists || profile.get('status') !== 'active') {
        throw new HttpsError('not-found', 'One of the selected members was not found.');
      }
      if (!forward?.exists || !reverse?.exists) {
        throw new HttpsError('permission-denied', 'Activities can only include mutual followers.');
      }
    }

    await enforceRateLimit(transaction, uid, 'create-activity', ACTIVITY_RATE_LIMIT, ACTIVITY_RATE_WINDOW_MS);
    transaction.create(activityRef, {
      organizerId: uid,
      participantIds: [uid, ...input.memberIds],
      invitationStatuses: {
        [uid]: 'accepted',
        ...Object.fromEntries(input.memberIds.map((memberId) => [memberId, 'pending'])),
      },
      venueId: venue.id,
      venueName: String(venue.get('name') ?? ''),
      imageUrl: venue.get('imageUrl') ? String(venue.get('imageUrl')) : null,
      startsAt: Timestamp.fromDate(startsAt),
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const now = FieldValue.serverTimestamp();
    const participantIds = [uid, ...input.memberIds];
    transaction.create(conversationRef, {
      kind: 'activity',
      activityId: activityRef.id,
      organizerId: uid,
      title: String(venue.get('name') ?? ''),
      imageUrl: venue.get('imageUrl') ? String(venue.get('imageUrl')) : null,
      participantIds,
      invitationStatuses: {
        [uid]: 'accepted',
        ...Object.fromEntries(input.memberIds.map((memberId) => [memberId, 'pending'])),
      },
      unreadCounts: Object.fromEntries(participantIds.map((participantId) => [participantId, 0])),
      lastReadAt: {},
      lastReadMessageIds: {},
      typing: {},
      lastMessage: {
        id: `${activityRef.id}-created`,
        senderId: uid,
        text: 'Activity created',
        createdAt: now,
      },
      messageCount: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });

  return { id: activityRef.id };
});

export const respondToActivityInvitation = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(respondToActivityInvitationInputSchema, request.data);
  const activityRef = db.collection('activities').doc(input.activityId);
  const conversationRef = db.collection('conversations').doc(input.activityId);

  await db.runTransaction(async (transaction) => {
    const [activity, conversation] = await Promise.all([
      transaction.get(activityRef),
      transaction.get(conversationRef),
    ]);
    if (!activity.exists || !conversation.exists) {
      throw new HttpsError('not-found', 'The activity invitation was not found.');
    }
    if (activity.get('organizerId') === uid) {
      throw new HttpsError('failed-precondition', 'The organizer is already taking part.');
    }
    const statuses = activity.get('invitationStatuses');
    const currentStatus = statuses && typeof statuses === 'object'
      ? (statuses as Record<string, unknown>)[uid]
      : undefined;
    if (currentStatus === input.response) return;
    if (currentStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invitation is no longer pending.');
    }

    const now = FieldValue.serverTimestamp();
    if (input.response === 'declined') {
      transaction.update(
        activityRef,
        new FieldPath('invitationStatuses', uid), input.response,
        'participantIds', FieldValue.arrayRemove(uid),
        'updatedAt', now,
      );
      transaction.update(
        conversationRef,
        new FieldPath('invitationStatuses', uid), input.response,
        'participantIds', FieldValue.arrayRemove(uid),
        new FieldPath('unreadCounts', uid), FieldValue.delete(),
        new FieldPath('lastReadAt', uid), FieldValue.delete(),
        new FieldPath('lastReadMessageIds', uid), FieldValue.delete(),
        new FieldPath('typing', uid), FieldValue.delete(),
        'updatedAt', now,
      );
    } else {
      transaction.update(
        activityRef,
        new FieldPath('invitationStatuses', uid), input.response,
        'updatedAt', now,
      );
      transaction.update(
        conversationRef,
        new FieldPath('invitationStatuses', uid), input.response,
        'updatedAt', now,
      );
    }
  });

  return { id: input.activityId };
});
