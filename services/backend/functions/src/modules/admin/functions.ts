import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { notificationTypes, sendCampaignNotificationInputSchema } from '@tastes/contracts';
import { db } from '../../shared/firebase';
import { sendNotification, sendNotifications } from '../../shared/notifications';
import { callableOptions } from '../../shared/options';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

type StaffRole = 'admin' | 'moderator';

function requireStaff(request: CallableRequest<unknown>): { uid: string; role: StaffRole } {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const role = request.auth.token.role;
  if (role !== 'admin' && role !== 'moderator') {
    throw new HttpsError('permission-denied', 'A staff account is required.');
  }
  return { uid: request.auth.uid, role };
}

function requireAdmin(request: CallableRequest<unknown>): string {
  const staff = requireStaff(request);
  if (staff.role !== 'admin') {
    throw new HttpsError('permission-denied', 'An administrator account is required.');
  }
  return staff.uid;
}

const idSchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9._:-]+$/);
const reportIdInputSchema = z.object({ reportId: idSchema });
const contentTargetSchema = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('review'), targetId: idSchema }),
  z.object({ targetType: z.literal('comment'), targetId: idSchema, parentId: idSchema }),
]);
const contentActionInputSchema = contentTargetSchema.and(z.object({ reportId: idSchema }));
const editContentInputSchema = contentActionInputSchema.and(z.object({
  text: z.string().trim().min(1).max(2_000),
}));
const searchInputSchema = z.object({ query: z.string().trim().max(120).default('') });

const userActionInputSchema = z.object({
  userId: idSchema,
  reason: z.string().trim().min(2).max(500),
  suspendedUntil: z.string().datetime().nullable().optional(),
});
const venueStatusSchema = z.enum(['active', 'hidden', 'pending', 'merged', 'removed']);
const discoverTagSchema = z.enum(['trending', 'most-reviewed', 'new', 'for-you', 'hidden-gem']);
const venueCategorySchema = z.enum(['Cafe', 'Restaurant', 'Bar', 'Italian', 'Japanese', 'Georgian', 'Thai', 'American', 'Russian', 'Korean', 'Indian', 'Mexican', 'Chinese']);
const venueInputObjectSchema = z.object({
  venueId: idSchema.optional(),
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().min(2).max(300),
  category: venueCategorySchema,
  status: venueStatusSchema.default('active'),
  imageUrl: z.url().nullable().default(null),
  photoUrls: z.array(z.url()).max(12).default([]),
  priceLevel: z.number().int().min(1).max(4).nullable().default(null),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  googlePlaceId: z.string().trim().min(1).max(256).nullable().default(null),
  discoverTags: z.array(discoverTagSchema).max(5).default([]),
  phone: z.string().trim().min(1).max(40).nullable().default(null),
  website: z.string().trim().min(1).max(300).nullable().default(null),
  openingHours: z.array(z.object({
    day: z.string().trim().min(1).max(40),
    hours: z.string().trim().min(1).max(80),
  })).max(14).default([]),
  placeTags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  popularDishes: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    rating: z.number().min(0).max(5),
  })).max(20).default([]),
  featured: z.boolean().default(false),
  hotSpot: z.boolean().default(false),
});
const coordinatePairOptions = {
  message: 'Latitude and longitude must be provided together.',
};
const hasCoordinatePair = (input: { latitude: number | null; longitude: number | null }) => (
  (input.latitude === null) === (input.longitude === null)
);
const venueInputSchema = venueInputObjectSchema.refine(hasCoordinatePair, coordinatePairOptions);
const createVenueInputSchema = venueInputObjectSchema.omit({ venueId: true }).refine(hasCoordinatePair, coordinatePairOptions);
const updateVenueInputSchema = venueInputObjectSchema.extend({ venueId: idSchema }).refine(hasCoordinatePair, coordinatePairOptions);
const venueStatusInputSchema = z.object({ venueId: idSchema, status: venueStatusSchema });
const venueFlagsInputSchema = z.object({
  venueId: idSchema,
  featured: z.boolean(),
  hotSpot: z.boolean(),
});
const mergeVenuesInputSchema = z.object({ sourceVenueId: idSchema, targetVenueId: idSchema }).refine(
  (input) => input.sourceVenueId !== input.targetVenueId,
  'Choose two different venues.',
);

function contentReference(input: z.infer<typeof contentTargetSchema>) {
  return input.targetType === 'review'
    ? db.collection('reviews').doc(input.targetId)
    : db.collection('reviews').doc(input.parentId).collection('comments').doc(input.targetId);
}

function audit(actorId: string, action: string, subjectId: string, details: Record<string, unknown> = {}) {
  return db.collection('_adminAudit').add({
    actorId,
    action,
    subjectId,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

interface AnalyticsBatchResponse {
  reports?: Array<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }>;
}

async function getAnalyticsMetrics() {
  const propertyId = process.env.GA4_PROPERTY_ID ?? '550185288';
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const token = await auth.getAccessToken();
    if (!token) throw new Error('Google Analytics credentials are unavailable.');
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            { dateRanges: [{ startDate: 'today', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] },
            { dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error(`Analytics Data API returned ${response.status}.`);
    const data = await response.json() as AnalyticsBatchResponse;
    const value = (index: number) => Number(data.reports?.[index]?.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    return { connected: true, propertyId, dau: value(0), mau: value(1), error: null };
  } catch (error) {
    console.warn('Unable to load Google Analytics metrics.', error);
    return { connected: false, propertyId, dau: 0, mau: 0, error: 'Analytics access is not configured for the Functions service account.' };
  }
}

async function getReviewCities() {
  const snapshot = await db.collection('reviews').where('status', '==', 'published').limit(1_000).get();
  const counts = new Map<string, number>();
  for (const review of snapshot.docs) {
    const city = String(review.get('venueCity') ?? 'Unknown');
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/** Lets the reporter know their report was looked at, whatever the outcome was. */
async function notifyReportResolved(report: FirebaseFirestore.DocumentSnapshot): Promise<void> {
  if (!report.exists) return;
  await sendNotification({
    recipientId: String(report.get('reporterId') ?? ''),
    type: 'report-resolved',
    eventKey: report.id,
    targetId: report.id,
  });
}

/** Notifies everyone who saved a venue that something about it changed. */
async function notifySavedPlaceChange(venueId: string, venueName: string, change: string): Promise<void> {
  try {
    const savers = await db.collectionGroup('savedVenues').where('venueId', '==', venueId).limit(400).get();
    await sendNotifications(savers.docs
      .map((saved) => saved.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id))
      .map((recipientId) => ({
        recipientId,
        type: 'saved-place-changed' as const,
        eventKey: `${venueId}:${change}`,
        params: { place: venueName, text: change },
        targetId: venueId,
      })));
  } catch (error) {
    console.warn(`Unable to notify users about the venue change for ${venueId}.`, error);
  }
}

export const getAdminOverview = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const now = Date.now();
  const [
    users, reviews, reports, venues,
    users24h, users7d, users30d,
    activeUsers24h, activeUsers30d,
    reviews24h, reviews7d, reviews30d,
    analytics, reviewCities,
  ] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('reviews').count().get(),
    db.collection('reports').where('status', '==', 'pending').count().get(),
    db.collection('venues').where('status', '==', 'active').count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 7 * 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 30 * 86_400_000)).count().get(),
    db.collection('users').where('lastSeenAt', '>=', Timestamp.fromMillis(now - 86_400_000)).count().get(),
    db.collection('users').where('lastSeenAt', '>=', Timestamp.fromMillis(now - 30 * 86_400_000)).count().get(),
    db.collection('reviews').where('createdAt', '>=', Timestamp.fromMillis(now - 86_400_000)).count().get(),
    db.collection('reviews').where('createdAt', '>=', Timestamp.fromMillis(now - 7 * 86_400_000)).count().get(),
    db.collection('reviews').where('createdAt', '>=', Timestamp.fromMillis(now - 30 * 86_400_000)).count().get(),
    getAnalyticsMetrics(),
    getReviewCities(),
  ]);

  return {
    totalUsers: users.data().count,
    totalReviews: reviews.data().count,
    pendingReports: reports.data().count,
    activeVenues: venues.data().count,
    newUsers: {
      last24Hours: users24h.data().count,
      last7Days: users7d.data().count,
      last30Days: users30d.data().count,
    },
    newReviews: {
      last24Hours: reviews24h.data().count,
      last7Days: reviews7d.data().count,
      last30Days: reviews30d.data().count,
    },
    analytics: {
      ...analytics,
      // Standard GA4 reports can lag behind live usage. lastSeenAt is written by the
      // authenticated session path, so these operational DAU/MAU values update immediately.
      dau: activeUsers24h.data().count,
      mau: activeUsers30d.data().count,
    },
    reviewCities,
  };
});

export const getReportedContent = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const snapshot = await db.collection('reports')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return Promise.all(snapshot.docs.map(async (document) => {
    const targetType = String(document.get('targetType') ?? document.get('contentType') ?? 'review') === 'comment'
      ? 'comment'
      : 'review';
    const targetId = String(document.get('targetId') ?? document.get('contentId') ?? document.get('reviewId') ?? '');
    const parentId = targetType === 'comment'
      ? String(document.get('parentId') ?? document.get('reviewId') ?? '') || null
      : null;
    let contentPreview = String(document.get('contentPreview') ?? '');
    if (!contentPreview && targetId) {
      const reference = targetType === 'review'
        ? db.collection('reviews').doc(targetId)
        : db.collection('reviews').doc(parentId ?? '').collection('comments').doc(targetId);
      const content = await reference.get();
      contentPreview = String(content.get('text') ?? '').slice(0, 280);
    }
    return {
      id: document.id,
      reporterId: String(document.get('reporterId') ?? ''),
      reporterName: String(document.get('reporterName') ?? 'Tastes user'),
      reason: String(document.get('reason') ?? 'Other'),
      details: String(document.get('details') ?? ''),
      targetType,
      targetId,
      parentId,
      contentPreview,
      status: String(document.get('status') ?? 'pending'),
      createdAt: timestampToIso(document.get('createdAt')),
    };
  }));
});

export const dismissReport = onCall(callableOptions, async (request) => {
  const actorId = requireStaff(request).uid;
  const input = parseInput(reportIdInputSchema, request.data);
  const report = await db.collection('reports').doc(input.reportId).get();
  await Promise.all([
    report.ref.update({
      status: 'dismissed',
      resolvedBy: actorId,
      resolvedAt: FieldValue.serverTimestamp(),
    }),
    audit(actorId, 'dismiss-report', input.reportId),
    notifyReportResolved(report),
  ]);
  return { id: input.reportId };
});

export const deleteContent = onCall(callableOptions, async (request) => {
  const actorId = requireStaff(request).uid;
  const input = parseInput(contentActionInputSchema, request.data);
  const reference = contentReference(input);
  await db.runTransaction(async (transaction) => {
    const [content, report] = await Promise.all([
      transaction.get(reference),
      transaction.get(db.collection('reports').doc(input.reportId)),
    ]);
    if (!content.exists) throw new HttpsError('not-found', 'The reported content was not found.');
    transaction.update(reference, { status: 'deleted', moderatedAt: FieldValue.serverTimestamp(), moderatedBy: actorId });
    if (report.exists) transaction.update(report.ref, { status: 'actioned', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actorId });
  });
  await audit(actorId, 'delete-content', input.targetId, { targetType: input.targetType });
  const [content, report] = await Promise.all([
    reference.get(),
    db.collection('reports').doc(input.reportId).get(),
  ]);
  await Promise.all([
    sendNotification({
      recipientId: String(content.get('authorId') ?? ''),
      type: 'content-removed',
      eventKey: input.targetId,
      params: { place: String(content.get('venueName') ?? 'a place') },
      targetId: input.targetId,
    }),
    notifyReportResolved(report),
  ]);
  return { id: input.targetId };
});

export const editContent = onCall(callableOptions, async (request) => {
  const actorId = requireStaff(request).uid;
  const input = parseInput(editContentInputSchema, request.data);
  const reference = contentReference(input);
  await db.runTransaction(async (transaction) => {
    const report = await transaction.get(db.collection('reports').doc(input.reportId));
    transaction.update(reference, { text: input.text, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: actorId });
    if (report.exists) transaction.update(report.ref, { status: 'actioned', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: actorId });
  });
  await audit(actorId, 'edit-content', input.targetId, { targetType: input.targetType });
  await notifyReportResolved(await db.collection('reports').doc(input.reportId).get());
  return { id: input.targetId };
});

export const searchUsers = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const input = parseInput(searchInputSchema, request.data);
  const query = input.query.toLowerCase();
  let profiles;
  if (!query) {
    profiles = await db.collection('users').orderBy('createdAt', 'desc').limit(50).get();
  } else {
    const candidates = await db.collection('users').limit(1_000).get();
    profiles = {
      docs: candidates.docs.filter((profile) => [
        profile.id,
        String(profile.get('username') ?? ''),
        String(profile.get('displayName') ?? ''),
        String(profile.get('email') ?? ''),
        String(profile.get('phoneNumber') ?? ''),
      ].some((value) => value.toLowerCase().includes(query))).slice(0, 50),
    };
  }

  return profiles.docs.map((profile) => ({
    id: profile.id,
    displayName: String(profile.get('displayName') ?? 'Tastes user'),
    username: profile.get('username') ? String(profile.get('username')) : null,
    email: profile.get('email') ? String(profile.get('email')) : null,
    phoneNumber: profile.get('phoneNumber') ? String(profile.get('phoneNumber')) : null,
    status: String(profile.get('status') ?? 'active'),
    createdAt: timestampToIso(profile.get('createdAt')),
  }));
});

export const getUserHistory = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const input = parseInput(z.object({ userId: idSchema }), request.data);
  const userReference = db.collection('users').doc(input.userId);
  const [profile, reviews, reports, actions] = await Promise.all([
    userReference.get(),
    db.collection('reviews').where('authorId', '==', input.userId).limit(25).get(),
    db.collection('reports').where('reporterId', '==', input.userId).limit(25).get(),
    db.collection('_adminAudit').where('subjectId', '==', input.userId).limit(25).get(),
  ]);
  if (!profile.exists) throw new HttpsError('not-found', 'The user was not found.');
  const byNewest = <T extends { createdAt: string }>(items: T[]) => items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    user: {
      id: profile.id,
      displayName: String(profile.get('displayName') ?? 'Tastes user'),
      username: profile.get('username') ? String(profile.get('username')) : null,
      email: profile.get('email') ? String(profile.get('email')) : null,
      phoneNumber: profile.get('phoneNumber') ? String(profile.get('phoneNumber')) : null,
      status: String(profile.get('status') ?? 'active'),
      createdAt: timestampToIso(profile.get('createdAt')),
      moderationReason: profile.get('moderationReason') ? String(profile.get('moderationReason')) : null,
      suspendedUntil: profile.get('suspendedUntil') ? timestampToIso(profile.get('suspendedUntil')) : null,
    },
    reviews: byNewest(reviews.docs.map((review) => ({
      id: review.id,
      text: String(review.get('text') ?? '').slice(0, 240),
      status: String(review.get('status') ?? 'published'),
      venueName: String(review.get('venueName') ?? 'Unknown venue'),
      createdAt: timestampToIso(review.get('createdAt')),
    }))),
    reports: byNewest(reports.docs.map((report) => ({
      id: report.id,
      reason: String(report.get('reason') ?? 'Other'),
      status: String(report.get('status') ?? 'pending'),
      createdAt: timestampToIso(report.get('createdAt')),
    }))),
    actions: byNewest(actions.docs.map((action) => ({
      id: action.id,
      action: String(action.get('action') ?? 'account-action'),
      details: action.get('details') as Record<string, unknown> | undefined ?? {},
      createdAt: timestampToIso(action.get('createdAt')),
    }))),
  };
});

async function updateUserStatus(
  request: CallableRequest<unknown>,
  status: 'active' | 'suspended' | 'banned',
  action: 'suspend' | 'ban' | 'unban' | 'reinstate',
) {
  const actorId = requireStaff(request).uid;
  const input = parseInput(userActionInputSchema, request.data);
  const disabled = status !== 'active';
  await Promise.all([
    db.collection('users').doc(input.userId).set({
      status,
      moderationReason: input.reason,
      suspendedUntil: status === 'suspended' && input.suspendedUntil
        ? Timestamp.fromDate(new Date(input.suspendedUntil))
        : null,
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    getAuth().updateUser(input.userId, { disabled }),
    audit(actorId, `user-${action}`, input.userId, { reason: input.reason, suspendedUntil: input.suspendedUntil ?? null }),
    ...(disabled ? [sendNotification({
      recipientId: input.userId,
      type: 'account-restricted' as const,
      eventKey: `${action}:${new Date().toISOString().slice(0, 10)}`,
      params: { text: input.reason },
      targetId: input.userId,
    })] : []),
  ]);
  return { id: input.userId, status };
}

export const suspendUser = onCall(callableOptions, (request) => updateUserStatus(request, 'suspended', 'suspend'));
export const banUser = onCall(callableOptions, (request) => updateUserStatus(request, 'banned', 'ban'));
export const unbanUser = onCall(callableOptions, (request) => updateUserStatus(request, 'active', 'unban'));
export const reinstateUser = onCall(callableOptions, (request) => updateUserStatus(request, 'active', 'reinstate'));

export const reinstateExpiredSuspensions = onSchedule({
  region: 'europe-west1',
  schedule: 'every 30 minutes',
  timeZone: 'UTC',
  maxInstances: 1,
}, async () => {
  while (true) {
    const expired = await db.collection('users')
      .where('status', '==', 'suspended')
      .where('suspendedUntil', '<=', Timestamp.now())
      .limit(400)
      .get();
    if (expired.empty) return;
    await Promise.all(expired.docs.map(async (profile) => {
      try { await getAuth().updateUser(profile.id, { disabled: false }); }
      catch (error) { console.warn(`Unable to re-enable expired suspension for ${profile.id}.`, error); }
    }));
    const batch = db.batch();
    for (const profile of expired.docs) {
      batch.update(profile.ref, {
        status: 'active',
        suspendedUntil: null,
        moderationReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
});

export const searchAdminVenues = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const input = parseInput(searchInputSchema, request.data);
  const query = input.query.toLowerCase();
  const snapshot = await db.collection('venues').limit(1_000).get();
  return snapshot.docs
    .filter((venue) => venue.get('status') !== 'removed')
    .filter((venue) => !query || [venue.id, venue.get('name'), venue.get('city'), venue.get('category')]
      .some((value) => String(value ?? '').toLowerCase().includes(query)))
    .slice(0, 100)
    .map((venue) => ({
      id: venue.id,
      name: String(venue.get('name') ?? ''),
      city: String(venue.get('city') ?? ''),
      address: String(venue.get('address') ?? ''),
      category: String(venue.get('category') ?? ''),
      status: String(venue.get('status') ?? 'pending'),
      featured: Boolean(venue.get('featured')),
      hotSpot: Boolean(venue.get('hotSpot')),
      reviewCount: Number(venue.get('reviewCount') ?? 0),
      imageUrl: venue.get('imageUrl') ? String(venue.get('imageUrl')) : null,
      photoUrls: Array.isArray(venue.get('photoUrls'))
        ? (venue.get('photoUrls') as unknown[]).filter((value): value is string => typeof value === 'string')
        : [],
      priceLevel: venue.get('priceLevel') == null ? null : Number(venue.get('priceLevel')),
      latitude: venue.get('latitude') == null ? null : Number(venue.get('latitude')),
      longitude: venue.get('longitude') == null ? null : Number(venue.get('longitude')),
      googlePlaceId: venue.get('googlePlaceId') ? String(venue.get('googlePlaceId')) : null,
      discoverTags: Array.isArray(venue.get('discoverTags'))
        ? (venue.get('discoverTags') as unknown[]).filter((value): value is z.infer<typeof discoverTagSchema> => discoverTagSchema.safeParse(value).success)
        : [],
      phone: venue.get('phone') ? String(venue.get('phone')) : null,
      website: venue.get('website') ? String(venue.get('website')) : null,
      openingHours: Array.isArray(venue.get('openingHours'))
        ? (venue.get('openingHours') as unknown[]).flatMap((value) => {
          if (!value || typeof value !== 'object') return [];
          const item = value as { day?: unknown; hours?: unknown };
          return typeof item.day === 'string' && typeof item.hours === 'string'
            ? [{ day: item.day, hours: item.hours }]
            : [];
        })
        : [],
      placeTags: Array.isArray(venue.get('placeTags'))
        ? (venue.get('placeTags') as unknown[]).filter((value): value is string => typeof value === 'string')
        : [],
      popularDishes: Array.isArray(venue.get('popularDishes'))
        ? (venue.get('popularDishes') as unknown[]).flatMap((value) => {
          if (!value || typeof value !== 'object') return [];
          const item = value as { name?: unknown; rating?: unknown };
          return typeof item.name === 'string' && typeof item.rating === 'number'
            ? [{ name: item.name, rating: item.rating }]
            : [];
        })
        : [],
    }));
});

export const upsertVenue = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(venueInputSchema, request.data);
  const { venueId, ...venueData } = input;
  const reference = venueId
    ? db.collection('venues').doc(venueId)
    : db.collection('venues').doc();
  const existing = await reference.get();
  await reference.set({
    ...venueData,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
    ...(existing.exists ? {} : {
      source: 'admin',
      createdAt: FieldValue.serverTimestamp(),
      rating: 0,
      reviewCount: 0,
    }),
  }, { merge: true });
  await audit(actorId, existing.exists ? 'update-venue' : 'create-venue', reference.id);
  return { id: reference.id };
});

export const createVenue = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(createVenueInputSchema, request.data);
  const reference = db.collection('venues').doc();
  await reference.create({
    ...input,
    source: 'admin',
    rating: 0,
    reviewCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
  });
  await audit(actorId, 'create-venue', reference.id);
  return { id: reference.id };
});

export const updateVenue = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(updateVenueInputSchema, request.data);
  const { venueId, ...venueData } = input;
  const reference = db.collection('venues').doc(venueId);
  const venue = await reference.get();
  if (!venue.exists) throw new HttpsError('not-found', 'The venue was not found.');
  await reference.update({
    ...venueData,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
  });
  await audit(actorId, 'update-venue', reference.id);
  return { id: reference.id };
});

export const setVenueStatus = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(venueStatusInputSchema, request.data);
  await db.collection('venues').doc(input.venueId).update({
    status: input.status,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
  });
  await audit(actorId, 'set-venue-status', input.venueId, { status: input.status });
  if (input.status !== 'active') {
    const venue = await db.collection('venues').doc(input.venueId).get();
    await notifySavedPlaceChange(
      input.venueId,
      String(venue.get('name') ?? 'A saved place'),
      input.status === 'removed' ? 'It has closed permanently' : 'It is temporarily unavailable',
    );
  }
  return { id: input.venueId };
});

export const setVenueFlags = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(venueFlagsInputSchema, request.data);
  await db.collection('venues').doc(input.venueId).update({
    featured: input.featured,
    hotSpot: input.hotSpot,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
  });
  await audit(actorId, 'set-venue-flags', input.venueId, { featured: input.featured, hotSpot: input.hotSpot });
  return { id: input.venueId };
});

export const mergeVenues = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(mergeVenuesInputSchema, request.data);
  const source = db.collection('venues').doc(input.sourceVenueId);
  const target = db.collection('venues').doc(input.targetVenueId);
  const [sourceVenue, targetVenue] = await Promise.all([source.get(), target.get()]);
  if (!sourceVenue.exists || !targetVenue.exists) {
    throw new HttpsError('not-found', 'Both venues must exist before merging.');
  }
  let movedReviews = 0;
  while (true) {
    const reviews = await db.collection('reviews').where('venueId', '==', source.id).limit(400).get();
    if (reviews.empty) break;
    const batch = db.batch();
    for (const review of reviews.docs) {
      batch.update(review.ref, { venueId: target.id, venueName: targetVenue.get('name'), updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    movedReviews += reviews.size;
  }
  await Promise.all([
    source.update({ status: 'merged', mergedInto: target.id, reviewCount: 0, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId }),
    movedReviews > 0 ? target.update({ reviewCount: FieldValue.increment(movedReviews), updatedAt: FieldValue.serverTimestamp() }) : Promise.resolve(),
  ]);
  await audit(actorId, 'merge-venues', source.id, { targetVenueId: target.id, movedReviews });
  return { id: source.id, targetVenueId: target.id, movedReviews };
});

/**
 * Sends one of the promotional catalog entries to an audience: a whole city, or everyone when no
 * city is given. Staff only, and always subject to the recipient's promotions preference.
 */
export const sendCampaignNotification = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(sendCampaignNotificationInputSchema, request.data);
  if (!notificationTypes.includes(input.type)) {
    throw new HttpsError('invalid-argument', 'Unknown notification type.');
  }
  const venue = input.venueId ? await db.collection('venues').doc(input.venueId).get() : null;
  if (input.venueId && !venue?.exists) throw new HttpsError('not-found', 'The venue was not found.');

  let query = db.collection('users').where('status', '==', 'active');
  if (input.city) query = query.where('city', '==', input.city);
  const audience = await query.limit(400).get();
  const eventKey = `${input.type}:${input.city ?? 'all'}:${input.venueId ?? input.feature ?? input.offer ?? ''}`;
  const sent = await sendNotifications(audience.docs.map((profile) => ({
    recipientId: profile.id,
    type: input.type,
    eventKey,
    params: {
      city: input.city ?? null,
      place: venue ? String(venue.get('name')) : null,
      feature: input.feature ?? null,
      offer: input.offer ?? null,
      text: input.text ?? null,
    },
    targetId: input.venueId ?? null,
  })));
  await audit(actorId, 'send-campaign', eventKey, { type: input.type, recipients: sent });
  return { type: input.type, recipients: sent };
});
