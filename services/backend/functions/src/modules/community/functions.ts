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
  defaultNotificationPreferences,
  isNotificationType,
  notificationCatalog,
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
import { notificationPreferences, sendNotification, sendNotifications } from '../../shared/notifications';
import { computeRewards, levelForXp, storedRewardProgress } from '../../shared/rewards';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';
import { enforceRateLimit } from '../../shared/mutations';


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
    const items = pageDocs.map((doc) => {
      const type = doc.get('type');
      const definition = isNotificationType(type) ? notificationCatalog[type] : null;
      return {
        id: doc.id,
        type: definition?.type ?? null,
        kind: doc.get('kind') ?? definition?.kind ?? 'system',
        group: definition?.group ?? null,
        category: definition?.category ?? null,
        title: doc.get('title'),
        body: doc.get('body'),
        actorId: doc.get('actorId') ?? null,
        actorName: doc.get('actorName') ?? null,
        targetType: doc.get('targetType') ?? definition?.targetType ?? null,
        targetId: doc.get('targetId') ?? null,
        unread: doc.get('unread') !== false,
        createdAt: timestampToIso(doc.get('createdAt')),
      } as AppNotification;
    });
    return {
      items,
      nextCursor: snapshot.size > input.limit && pageDocs.length > 0
        ? encodeCursor({ id: pageDocs.at(-1)!.id, value: timestampToIso(pageDocs.at(-1)!.get('createdAt')) })
        : null,
    };
  },
);

export const getUnreadNotificationCount = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const notifications = db.collection('users').doc(uid).collection('notifications');
  const [allNotifications, readNotifications] = await Promise.all([
    notifications.count().get(),
    notifications.where('unread', '==', false).count().get(),
  ]);
  return {
    // Legacy notification rows did not always persist `unread: true`. Counting
    // every row except explicitly read ones keeps the badge consistent with
    // listNotifications, which treats a missing value as unread.
    count: Math.max(0, allNotifications.data().count - readNotifications.data().count),
  };
});

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
  const activityRequests = snapshot.docs.filter((doc) => doc.get('kind') === 'activity');
  const activities = activityRequests.length > 0
    ? await db.getAll(...activityRequests.map((doc) => db.collection('activities').doc(String(doc.get('targetId')))))
    : [];
  const pendingActivityIds = new Set(activities.flatMap((activity) => {
    const statuses: unknown = activity.get('invitationStatuses');
    return activity.exists
      && statuses
      && typeof statuses === 'object'
      && (statuses as Record<string, unknown>)[uid] === 'pending'
      ? [activity.id]
      : [];
  }));
  return snapshot.docs.filter((doc) => (
    doc.get('kind') !== 'activity' || pendingActivityIds.has(String(doc.get('targetId')))
  )).map(
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
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Request not found.');
    if (snap.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'This request has already been answered.', {
        reason: 'request-already-answered',
      });
    }
    const kind = String(snap.get('kind'));
    const targetId = String(snap.get('targetId'));
    const targetRef = kind === 'group'
      ? db.collection('groups').doc(targetId)
      : db.collection('activities').doc(targetId);
    const conversationRef = db.collection('conversations').doc(targetId);
    const [target, conversation] = await Promise.all([
      transaction.get(targetRef),
      transaction.get(conversationRef),
    ]);
    if (!target.exists || !conversation.exists || target.get('status') !== 'active' || conversation.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The invitation target is no longer available.');
    }
    const invitationStatus = conversation.get(`invitationStatuses.${uid}`);
    if (invitationStatus !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invitation is no longer pending.', {
        reason: 'invitation-not-pending',
      });
    }
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, { status: input.response, respondedAt: now });
    if (kind === 'group') {
      transaction.update(targetRef, {
        memberIds: input.response === 'accepted' ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
        invitedMemberIds: FieldValue.arrayRemove(uid),
        updatedAt: now,
      });
    } else {
      transaction.update(targetRef,
        new FieldPath('invitationStatuses', uid), input.response,
        'participantIds', input.response === 'accepted' ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
        'updatedAt', now,
      );
    }
    transaction.update(conversationRef,
      new FieldPath('invitationStatuses', uid), input.response,
      'participantIds', input.response === 'accepted' ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
      new FieldPath('unreadCounts', uid), input.response === 'accepted' ? 0 : FieldValue.delete(),
      'updatedAt', now,
    );
  });
  return { id: input.requestId };
});

export const createGroup = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createGroupInputSchema, request.data);
  const ref = db.collection('groups').doc();
  const invitedIds = [...new Set(input.memberIds)].filter((id) => id !== uid);
  let ownerName = 'Tastes user';
  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(uid);
    const [owner, ...memberData] = await Promise.all([
      transaction.get(userRef),
      ...invitedIds.flatMap((memberId) => [
        transaction.get(db.collection('users').doc(memberId)),
        transaction.get(userRef.collection('following').doc(memberId)),
        transaction.get(db.collection('users').doc(memberId).collection('following').doc(uid)),
      ]),
    ]);
    if (!owner.exists || owner.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    ownerName = String(owner.get('displayName') ?? 'Tastes user');
    for (let index = 0; index < invitedIds.length; index += 1) {
      const profile = memberData[index * 3];
      const forward = memberData[index * 3 + 1];
      const reverse = memberData[index * 3 + 2];
      if (!profile?.exists || profile.get('status') !== 'active') {
        throw new HttpsError('not-found', 'One of the selected group members was not found.');
      }
      if (!forward?.exists || !reverse?.exists) {
        throw new HttpsError('permission-denied', 'Groups can only include mutual followers.', {
          reason: 'mutual-follow-required',
        });
      }
    }
    await enforceRateLimit(transaction, uid, 'create-group', 10, 60 * 60_000);
    const now = FieldValue.serverTimestamp();
    const invitationStatuses = { [uid]: 'accepted', ...Object.fromEntries(invitedIds.map((id) => [id, 'pending'])) };
    transaction.create(ref, {
      name: input.name, adminId: uid, memberIds: [uid], invitedMemberIds: invitedIds,
      conversationId: ref.id, status: 'active', createdAt: now, updatedAt: now,
    });
    transaction.create(db.collection('conversations').doc(ref.id), {
      kind: 'group', groupId: ref.id, title: input.name, organizerId: uid,
      participantIds: [uid], invitationStatuses, unreadCounts: { [uid]: 0 },
      lastReadAt: {}, lastReadMessageIds: {}, typing: {},
      lastMessage: { id: `${ref.id}-created`, senderId: uid, text: 'Group created', createdAt: now },
      messageCount: 0, status: 'active', createdAt: now, updatedAt: now,
    });
    for (const memberId of invitedIds) {
      transaction.set(db.collection('users').doc(memberId).collection('requests').doc(`group-${ref.id}`), {
        kind: 'group', title: input.name, body: `${ownerName} invited you to a group.`,
        senderName: ownerName, senderId: uid, targetId: ref.id, status: 'pending', createdAt: now,
      });
    }
  });
  await sendNotifications(invitedIds.map((memberId) => ({
    recipientId: memberId,
    type: 'group-added' as const,
    eventKey: ref.id,
    actorId: uid,
    actorName: ownerName,
    params: { group: input.name },
    targetId: ref.id,
  })));
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
  const invitedMemberIds = (group.get('invitedMemberIds') ?? []) as string[];
  const profileIds = [...new Set([...memberIds, ...invitedMemberIds])];
  const profiles = profileIds.length
    ? await db.getAll(...profileIds.map((id) => db.collection('users').doc(id)))
    : [];
  const memberFromProfile = (profile: FirebaseFirestore.DocumentSnapshot) => ({
    userId: profile.id,
    displayName: String(profile.get('displayName') ?? 'Tastes user'),
    username: profile.get('username') ? String(profile.get('username')) : null,
    photoUrl: profile.get('photoUrl') ? String(profile.get('photoUrl')) : null,
    admin: profile.id === group.get('adminId'),
  });
  return {
    id: group.id,
    name: String(group.get('name')),
    adminId: String(group.get('adminId')),
    createdAt: timestampToIso(group.get('createdAt')),
    members: profiles.filter((profile) => memberIds.includes(profile.id)).map(memberFromProfile),
    pendingMembers: profiles.filter((profile) => invitedMemberIds.includes(profile.id)).map(memberFromProfile),
  };
});

export const updateGroupMembers = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(updateGroupMembersInputSchema, request.data);
  const ref = db.collection('groups').doc(input.groupId);
  let invitedIds: string[] = [];
  let ownerName = 'Tastes user';
  let groupName = 'Group';
  await db.runTransaction(async (transaction) => {
    const ownerRef = db.collection('users').doc(uid);
    const [group, owner] = await Promise.all([transaction.get(ref), transaction.get(ownerRef)]);
    if (!group.exists || group.get('status') !== 'active' || group.get('adminId') !== uid) {
      throw new HttpsError('permission-denied', 'Only the active group admin can edit members.');
    }
    if (!owner.exists || owner.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    ownerName = String(owner.get('displayName') ?? 'Tastes user');
    groupName = String(group.get('name') ?? 'Group');
    const previousIds = Array.isArray(group.get('memberIds')) ? group.get('memberIds') as string[] : [uid];
    const selectedIds = [...new Set([uid, ...input.memberIds])];
    const retainedIds = selectedIds.filter((id) => previousIds.includes(id));
    invitedIds = selectedIds.filter((id) => !previousIds.includes(id));
    const memberData = await Promise.all(invitedIds.flatMap((memberId) => [
      transaction.get(db.collection('users').doc(memberId)),
      transaction.get(ownerRef.collection('following').doc(memberId)),
      transaction.get(db.collection('users').doc(memberId).collection('following').doc(uid)),
    ]));
    for (let index = 0; index < invitedIds.length; index += 1) {
      if (!memberData[index * 3]?.exists || memberData[index * 3]?.get('status') !== 'active') {
        throw new HttpsError('not-found', 'One of the selected group members was not found.');
      }
      if (!memberData[index * 3 + 1]?.exists || !memberData[index * 3 + 2]?.exists) {
        throw new HttpsError('permission-denied', 'Groups can only include mutual followers.', {
          reason: 'mutual-follow-required',
        });
      }
    }
    await enforceRateLimit(transaction, uid, 'update-group-members', 20, 60 * 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, {
      memberIds: retainedIds,
      ...(invitedIds.length > 0 ? { invitedMemberIds: FieldValue.arrayUnion(...invitedIds) } : {}),
      updatedAt: now,
    });
    const conversationRef = db.collection('conversations').doc(ref.id);
    transaction.update(conversationRef, { participantIds: retainedIds, updatedAt: now });
    for (const invitedId of invitedIds) {
      transaction.update(conversationRef, new FieldPath('invitationStatuses', invitedId), 'pending');
      transaction.set(db.collection('users').doc(invitedId).collection('requests').doc(`group-${ref.id}`), {
        kind: 'group', title: groupName, body: `${ownerName} invited you to a group.`,
        senderName: ownerName, senderId: uid, targetId: ref.id, status: 'pending', createdAt: now,
      });
    }
  });
  await sendNotifications(invitedIds.map((invitedId) => ({
    recipientId: invitedId,
    type: 'group-added' as const,
    eventKey: ref.id,
    actorId: uid,
    actorName: ownerName,
    params: { group: groupName },
    targetId: ref.id,
  })));
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
    const [profile, followers, following, viewerFollowing] = await Promise.all([
      userRef.get(),
      userRef.collection('followers').limit(100).get(),
      userRef.collection('following').limit(100).get(),
      db.collection('users').doc(viewerId).collection('following').get(),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    const storedRewards = profile.get('rewardProgressDirty') === true
      ? null
      : storedRewardProgress(profile.get('rewardProgress'));
    const rewards = storedRewards ?? await computeRewards(profileId);
    if (!storedRewards) {
      await userRef.set({
        rewardProgress: rewards,
        rewardProgressDirty: false,
        rewardProgressUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
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
      level: levelForXp(xp),
      xp,
      notificationPreferences: notificationPreferences(profile),
      rewards,
    };
  },
);

export const updateNotificationPreferences = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(updateNotificationPreferencesInputSchema, request.data);
  const preferences = {
    enabled: input.enabled,
    push: input.push,
    email: input.email,
    sms: input.sms,
    categories: {
      ...defaultNotificationPreferences.categories,
      ...(input.categories ?? {}),
    },
  };
  await db.collection('users').doc(uid).set({ notificationPreferences: preferences }, { merge: true });
  return preferences;
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
  await sendNotification({
    recipientId: uid,
    type: 'report-received',
    eventKey: ref.id,
    targetId: ref.id,
  });
  return { id: ref.id };
});
