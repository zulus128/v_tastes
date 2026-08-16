import {
  createGroupInputSchema,
  groupInputSchema,
  listNotificationsInputSchema,
  notificationInputSchema,
  reportCommentInputSchema,
  requestInputSchema,
  updateGroupMembersInputSchema,
  updateNotificationPreferencesInputSchema,
  profileExtrasInputSchema,
  type AppNotification,
  type AppRequest,
  type ProfileExtrasResult,
  type Page,
  type TastesGroup,
} from '@tastes/contracts';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { cursorDate, decodeCursor, encodeCursor } from '../../shared/pagination';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

const defaultPreferences = {
  enabled: true,
  push: true,
  email: true,
  sms: false,
};

function progress(value: number, target: number): number {
  return Math.min(1, value / target);
}

function reviewText(document: FirebaseFirestore.QueryDocumentSnapshot): string {
  const dishNames = Array.isArray(document.get('dishNames')) ? document.get('dishNames') : [];
  const dishReviews = Array.isArray(document.get('dishReviews')) ? document.get('dishReviews') : [];
  return [
    document.get('text'),
    ...dishNames,
    ...dishReviews.map((dish: unknown) =>
      dish && typeof dish === 'object' && 'title' in dish
        ? (dish as { title?: unknown }).title
        : '',
    ),
  ]
    .join(' ')
    .toLocaleLowerCase();
}

export const listNotifications = onCall(
  callableOptions,
  async (request): Promise<Page<AppNotification>> => {
    const uid = requireUserId(request);
    const input = parseInput(listNotificationsInputSchema, request.data ?? {});
    const cursor = decodeCursor(input.cursor);
    let notificationsQuery = db
      .collection('users')
      .doc(uid)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (cursor) {
      notificationsQuery = notificationsQuery.startAfter(Timestamp.fromDate(cursorDate(cursor.value)), cursor.id);
    }
    const snapshot = await notificationsQuery.limit(input.limit + 1).get();
    const pageDocs = snapshot.docs.slice(0, input.limit);
    const items = pageDocs.map(
      (doc) =>
        ({
          id: doc.id,
          kind: doc.get('kind'),
          title: doc.get('title'),
          body: doc.get('body'),
          targetType: doc.get('targetType') ?? null,
          targetId: doc.get('targetId') ?? null,
          unread: doc.get('unread') !== false,
          createdAt: timestampToIso(doc.get('createdAt')),
        }) as AppNotification,
    );
    return {
      items,
      nextCursor: snapshot.size > input.limit && pageDocs.length > 0
        ? encodeCursor({ id: pageDocs.at(-1)!.id, value: timestampToIso(pageDocs.at(-1)!.get('createdAt')) })
        : null,
    };
  },
);

export const markNotificationRead = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(notificationInputSchema, request.data);
  await db
    .collection('users')
    .doc(uid)
    .collection('notifications')
    .doc(input.notificationId)
    .set({ unread: false }, { merge: true });
  return { id: input.notificationId };
});

export const clearNotifications = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const notifications = db.collection('users').doc(uid).collection('notifications');
  let cleared = 0;
  while (true) {
    const docs = await notifications.limit(400).get();
    if (docs.empty) break;
    const batch = db.batch();
    docs.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    cleared += docs.size;
  }
  return { cleared };
});

export const listRequests = onCall(callableOptions, async (request): Promise<AppRequest[]> => {
  const uid = requireUserId(request);
  const snapshot = await db
    .collection('users')
    .doc(uid)
    .collection('requests')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(
    (doc) =>
      ({
        id: doc.id,
        kind: doc.get('kind'),
        title: doc.get('title'),
        body: doc.get('body'),
        senderName: doc.get('senderName'),
        targetId: doc.get('targetId'),
        createdAt: timestampToIso(doc.get('createdAt')),
      }) as AppRequest,
  );
});

export const respondToRequest = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(requestInputSchema, request.data);
  const ref = db.collection('users').doc(uid).collection('requests').doc(input.requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Request not found.');
  const now = FieldValue.serverTimestamp();
  await ref.update({ status: input.response, respondedAt: now });
  if (input.response === 'accepted' && snap.get('kind') === 'group') {
    const groupId = String(snap.get('targetId'));
    const groupRef = db.collection('groups').doc(groupId);
    const conversationRef = db.collection('conversations').doc(groupId);
    await db.runTransaction(async (transaction) => {
      const [group, conversation] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(conversationRef),
      ]);
      if (!group.exists || !conversation.exists) return;
      transaction.update(groupRef, {
        memberIds: FieldValue.arrayUnion(uid),
        invitedMemberIds: FieldValue.arrayRemove(uid),
        updatedAt: now,
      });
      transaction.update(
        conversationRef,
        'participantIds', FieldValue.arrayUnion(uid),
        new FieldPath('invitationStatuses', uid), 'accepted',
        new FieldPath('unreadCounts', uid), 0,
        'updatedAt', now,
      );
    });
  } else if (input.response === 'declined' && snap.get('kind') === 'group') {
    const groupId = String(snap.get('targetId'));
    await Promise.all([
      db.collection('groups').doc(groupId).set({ invitedMemberIds: FieldValue.arrayRemove(uid), updatedAt: now }, { merge: true }),
      db.collection('conversations').doc(groupId).update(
        new FieldPath('invitationStatuses', uid), 'declined',
        'participantIds', FieldValue.arrayRemove(uid),
        'updatedAt', now,
      ),
    ]);
  }
  if (snap.get('kind') === 'activity') {
    const activityId = String(snap.get('targetId'));
    const activityRef = db.collection('activities').doc(activityId);
    const conversationRef = db.collection('conversations').doc(activityId);
    await db.runTransaction(async (transaction) => {
      const [activity, conversation] = await Promise.all([
        transaction.get(activityRef),
        transaction.get(conversationRef),
      ]);
      if (!activity.exists || !conversation.exists) return;
      transaction.update(
        activityRef,
        new FieldPath('invitationStatuses', uid),
        input.response,
        'updatedAt',
        now,
      );
      transaction.update(
        conversationRef,
        new FieldPath('invitationStatuses', uid),
        input.response,
        'updatedAt',
        now,
      );
      if (input.response === 'declined') {
        transaction.update(activityRef, 'participantIds', FieldValue.arrayRemove(uid));
        transaction.update(
          conversationRef,
          'participantIds',
          FieldValue.arrayRemove(uid),
          new FieldPath('unreadCounts', uid),
          FieldValue.delete(),
        );
      }
    });
  }
  return { id: input.requestId };
});

export const createGroup = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createGroupInputSchema, request.data);
  const ref = db.collection('groups').doc();
  const memberIds = [...new Set([uid, ...input.memberIds])];
  const profiles = await db.getAll(...memberIds.map((id) => db.collection('users').doc(id)));
  if (profiles.some((profile) => !profile.exists || profile.get('status') !== 'active')) {
    throw new HttpsError('not-found', 'One of the selected group members was not found.');
  }
  const now = FieldValue.serverTimestamp();
  const invitationStatuses = Object.fromEntries(memberIds.map((id) => [id, id === uid ? 'accepted' : 'pending']));
  const batch = db.batch();
  batch.create(ref, {
    name: input.name,
    adminId: uid,
    memberIds: [uid],
    invitedMemberIds: memberIds.filter((id) => id !== uid),
    conversationId: ref.id,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  batch.create(db.collection('conversations').doc(ref.id), {
    kind: 'group',
    groupId: ref.id,
    title: input.name,
    organizerId: uid,
    participantIds: [uid],
    invitationStatuses,
    unreadCounts: { [uid]: 0 },
    lastReadAt: {},
    lastReadMessageIds: {},
    typing: {},
    lastMessage: {
      id: `${ref.id}-created`,
      senderId: uid,
      text: 'Group created',
      createdAt: now,
    },
    messageCount: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  for (const memberId of memberIds.filter((id) => id !== uid)) {
    batch.set(db.collection('users').doc(memberId).collection('requests').doc(`group-${ref.id}`), {
      kind: 'group',
      title: input.name,
      body: `${String(profiles.find((profile) => profile.id === uid)?.get('displayName') ?? 'Someone')} invited you to a group.`,
      senderName: String(profiles.find((profile) => profile.id === uid)?.get('displayName') ?? 'Tastes user'),
      senderId: uid,
      targetId: ref.id,
      status: 'pending',
      createdAt: now,
    });
  }
  await batch.commit();
  return { id: ref.id };
});

export const getGroup = onCall(callableOptions, async (request): Promise<TastesGroup> => {
  const uid = requireUserId(request);
  const input = parseInput(groupInputSchema, request.data);
  const group = await db.collection('groups').doc(input.groupId).get();
  if (!group.exists) throw new HttpsError('not-found', 'Group not found.');
  const memberIds = (group.get('memberIds') ?? []) as string[];
  if (!memberIds.includes(uid) || group.get('status') !== 'active')
    throw new HttpsError('not-found', 'Group not found.');
  const profiles = memberIds.length
    ? await db.getAll(...memberIds.map((id) => db.collection('users').doc(id)))
    : [];
  return {
    id: group.id,
    name: String(group.get('name')),
    adminId: String(group.get('adminId')),
    createdAt: timestampToIso(group.get('createdAt')),
    members: profiles.map((profile) => ({
      userId: profile.id,
      displayName: String(profile.get('displayName') ?? 'Tastes user'),
      username: profile.get('username') ? String(profile.get('username')) : null,
      photoUrl: profile.get('photoUrl') ? String(profile.get('photoUrl')) : null,
      admin: profile.id === group.get('adminId'),
    })),
  };
});

export const updateGroupMembers = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(updateGroupMembersInputSchema, request.data);
  const ref = db.collection('groups').doc(input.groupId);
  const group = await ref.get();
  if (!group.exists || group.get('adminId') !== uid)
    throw new HttpsError('permission-denied', 'Only the group admin can edit members.');
  const previousIds = Array.isArray(group.get('memberIds')) ? group.get('memberIds') as string[] : [uid];
  const selectedIds = [...new Set([uid, ...input.memberIds])];
  const retainedIds = selectedIds.filter((id) => previousIds.includes(id));
  const invitedIds = selectedIds.filter((id) => !previousIds.includes(id));
  const profiles = invitedIds.length > 0
    ? await db.getAll(...invitedIds.map((id) => db.collection('users').doc(id)))
    : [];
  if (profiles.some((profile) => !profile.exists || profile.get('status') !== 'active')) {
    throw new HttpsError('not-found', 'One of the selected group members was not found.');
  }
  const owner = await db.collection('users').doc(uid).get();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.update(ref, {
    memberIds: retainedIds,
    ...(invitedIds.length > 0 ? { invitedMemberIds: FieldValue.arrayUnion(...invitedIds) } : {}),
    updatedAt: now,
  });
  const conversationRef = db.collection('conversations').doc(ref.id);
  batch.update(conversationRef, { participantIds: retainedIds, updatedAt: now });
  for (const invitedId of invitedIds) {
    batch.update(conversationRef, new FieldPath('invitationStatuses', invitedId), 'pending');
    batch.set(db.collection('users').doc(invitedId).collection('requests').doc(`group-${ref.id}`), {
      kind: 'group',
      title: String(group.get('name') ?? 'Group'),
      body: `${String(owner.get('displayName') ?? 'Someone')} invited you to a group.`,
      senderName: String(owner.get('displayName') ?? 'Tastes user'),
      senderId: uid,
      targetId: ref.id,
      status: 'pending',
      createdAt: now,
    });
  }
  await batch.commit();
  return { id: ref.id };
});

export const leaveGroup = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(groupInputSchema, request.data);
  const ref = db.collection('groups').doc(input.groupId);
  const group = await ref.get();
  if (!group.exists) throw new HttpsError('not-found', 'Group not found.');
  if (group.get('adminId') === uid)
    await Promise.all([
      ref.update({ status: 'deleted', updatedAt: FieldValue.serverTimestamp() }),
      db.collection('conversations').doc(ref.id).update({ status: 'deleted', updatedAt: FieldValue.serverTimestamp() }),
    ]);
  else
    await Promise.all([
      ref.update({ memberIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() }),
      db.collection('conversations').doc(ref.id).update({ participantIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() }),
    ]);
  return { id: ref.id };
});

export const getProfileExtras = onCall(
  callableOptions,
  async (request): Promise<ProfileExtrasResult> => {
    const viewerId = requireUserId(request);
    const input = parseInput(profileExtrasInputSchema, request.data ?? {});
    const profileId = input.targetUserId ?? viewerId;
    const userRef = db.collection('users').doc(profileId);
    const [profile, followers, following, viewerFollowing, reviews] = await Promise.all([
      userRef.get(),
      userRef.collection('followers').limit(100).get(),
      userRef.collection('following').limit(100).get(),
      db.collection('users').doc(viewerId).collection('following').get(),
      db
        .collection('reviews')
        .where('authorId', '==', profileId)
        .where('status', '==', 'published')
        .limit(200)
        .get(),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }

    const followerProfiles = followers.size
      ? await db.getAll(
          ...followers.docs.map((document) => db.collection('users').doc(document.id)),
        )
      : [];
    const followingProfiles = following.size
      ? await db.getAll(
          ...following.docs.map((document) => db.collection('users').doc(document.id)),
        )
      : [];
    const viewerFollowingIds = new Set(viewerFollowing.docs.map((document) => document.id));
    const venueIds = [
      ...new Set(reviews.docs.map((review) => String(review.get('venueId') ?? '')).filter(Boolean)),
    ];
    const venueSnapshots = venueIds.length
      ? await db.getAll(...venueIds.map((venueId) => db.collection('venues').doc(venueId)))
      : [];
    const venues = new Map(venueSnapshots.map((venue) => [venue.id, venue]));

    const burgerVenues = new Set<string>();
    const matchaCafes = new Set<string>();
    const exploredAreas = new Set<string>();
    let foundTiramisu = false;
    reviews.docs.forEach((review) => {
      const venueId = String(review.get('venueId') ?? '');
      const venue = venues.get(venueId);
      const category = String(venue?.get('category') ?? '').toLocaleLowerCase();
      const name = String(venue?.get('name') ?? '').toLocaleLowerCase();
      const searchable = reviewText(review);
      if (category.includes('burger') || name.includes('burger') || searchable.includes('burger')) {
        burgerVenues.add(venueId);
      }
      if (category.includes('cafe') && searchable.includes('matcha')) matchaCafes.add(venueId);
      if (searchable.includes('tiramisu')) foundTiramisu = true;
      const address = String(venue?.get('address') ?? '');
      const area = (address.split(',').at(-1) || venue?.get('city') || '')
        .toString()
        .trim()
        .toLocaleLowerCase();
      if (area) exploredAreas.add(area);
    });

    const xp = Math.max(0, Number(profile.get('xp') ?? 0));
    return {
      followers: followerProfiles.map((follower) => ({
        userId: follower.id,
        displayName: String(follower.get('displayName') ?? 'Tastes user'),
        username: follower.get('username') ? String(follower.get('username')) : null,
        photoUrl: follower.get('photoUrl') ? String(follower.get('photoUrl')) : null,
        following: viewerFollowingIds.has(follower.id),
      })),
      following: followingProfiles.map((followed) => ({
        userId: followed.id,
        displayName: String(followed.get('displayName') ?? 'Tastes user'),
        username: followed.get('username') ? String(followed.get('username')) : null,
        photoUrl: followed.get('photoUrl') ? String(followed.get('photoUrl')) : null,
        following: viewerFollowingIds.has(followed.id),
      })),
      level: Math.max(1, Math.floor(xp / 250) + 1),
      xp,
      notificationPreferences: {
        ...defaultPreferences,
        ...(profile.get('notificationPreferences') ?? {}),
      },
      rewards: [
        {
          id: 'burger',
          name: 'Burger Lover',
          description: 'Review 10 burger places',
          progress: progress(burgerVenues.size, 10),
          completed: burgerVenues.size >= 10,
          xp: 150,
        },
        {
          id: 'tiramisu',
          name: 'Tiramisu Connaisseur',
          description: 'Find the perfect tiramisu',
          progress: foundTiramisu ? 1 : 0,
          completed: foundTiramisu,
          xp: 100,
        },
        {
          id: 'matcha',
          name: 'Matcha Hunter',
          description: 'Try matcha in 5 cafés',
          progress: progress(matchaCafes.size, 5),
          completed: matchaCafes.size >= 5,
          xp: 100,
        },
        {
          id: 'city',
          name: 'City Explorer',
          description: 'Review places in 5 areas',
          progress: progress(exploredAreas.size, 5),
          completed: exploredAreas.size >= 5,
          xp: 150,
        },
      ],
    };
  },
);

export const updateNotificationPreferences = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(updateNotificationPreferencesInputSchema, request.data);
  await db.collection('users').doc(uid).set({ notificationPreferences: input }, { merge: true });
  return input;
});

export const reportComment = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(reportCommentInputSchema, request.data);
  const [profile, review, comment] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('reviews').doc(input.reviewId).get(),
    db.collection('reviews').doc(input.reviewId).collection('comments').doc(input.commentId).get(),
  ]);
  if (!profile.exists || profile.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }
  if (
    !review.exists ||
    review.get('status') !== 'published' ||
    !comment.exists ||
    comment.get('status') !== 'published'
  ) {
    throw new HttpsError('not-found', 'The comment was not found.');
  }
  const ref = db.collection('reports').doc(`comment-${uid}-${input.idempotencyKey}`);
  await ref.set(
    {
      reporterId: uid,
      reporterName: String(profile.get('displayName') ?? 'Tastes user'),
      targetType: 'comment',
      targetId: input.commentId,
      parentId: input.reviewId,
      reason: input.reason,
      details: input.details ?? null,
      contentPreview: String(comment.get('text') ?? '').slice(0, 280),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { id: ref.id };
});
