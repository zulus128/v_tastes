import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { db } from '../../shared/firebase';
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
const venueInputSchema = z.object({
  venueId: idSchema.optional(),
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  address: z.string().trim().min(2).max(300),
  category: z.string().trim().min(2).max(80),
  status: venueStatusSchema.default('active'),
});
const createVenueInputSchema = venueInputSchema.omit({ venueId: true });
const updateVenueInputSchema = venueInputSchema.extend({ venueId: idSchema });
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

interface AdSenseReportResponse {
  headers?: Array<{ name?: string; currencyCode?: string }>;
  totals?: { cells?: Array<{ value?: string }> };
}

async function getAnalyticsMetrics() {
  const propertyId = process.env.GA4_PROPERTY_ID ?? '546866444';
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
            { dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }], metrics: [{ name: 'activeUsers' }] },
            { dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'activeUsers' }] },
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

async function getAdSenseMetrics() {
  const accountId = process.env.ADSENSE_ACCOUNT_ID?.replace(/^accounts\//, '');
  const clientId = process.env.ADSENSE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ADSENSE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.ADSENSE_OAUTH_REFRESH_TOKEN;
  if (!accountId || !clientId || !clientSecret || !refreshToken) {
    return {
      connected: false,
      estimatedEarnings: 0,
      impressions: 0,
      clicks: 0,
      currencyCode: null,
      error: 'AdSense is not configured.',
    };
  }

  try {
    const oauth = new OAuth2Client(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    const accessToken = await oauth.getAccessToken();
    if (!accessToken.token) throw new Error('AdSense access token is unavailable.');
    const url = new URL(`https://adsense.googleapis.com/v2/accounts/${encodeURIComponent(accountId)}/reports:generate`);
    url.searchParams.set('dateRange', 'LAST_30_DAYS');
    for (const metric of ['ESTIMATED_EARNINGS', 'IMPRESSIONS', 'CLICKS']) {
      url.searchParams.append('metrics', metric);
    }
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken.token}` } });
    if (!response.ok) throw new Error(`AdSense Management API returned ${response.status}.`);
    const data = await response.json() as AdSenseReportResponse;
    const values = new Map(data.headers?.map((header, index) => [
      header.name ?? '',
      data.totals?.cells?.[index]?.value ?? '0',
    ]) ?? []);
    const earningsHeader = data.headers?.find((header) => header.name === 'ESTIMATED_EARNINGS');
    return {
      connected: true,
      estimatedEarnings: Number(values.get('ESTIMATED_EARNINGS') ?? 0),
      impressions: Number(values.get('IMPRESSIONS') ?? 0),
      clicks: Number(values.get('CLICKS') ?? 0),
      currencyCode: earningsHeader?.currencyCode ?? null,
      error: null,
    };
  } catch (error) {
    console.warn('Unable to load AdSense metrics.', error);
    return {
      connected: false,
      estimatedEarnings: 0,
      impressions: 0,
      clicks: 0,
      currencyCode: null,
      error: 'AdSense access is not configured or the refresh token is invalid.',
    };
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

export const getAdminOverview = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const now = Date.now();
  const [users, reviews, reports, venues, users24h, users7d, users30d, analytics, reviewCities, adsense] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('reviews').count().get(),
    db.collection('reports').where('status', '==', 'pending').count().get(),
    db.collection('venues').where('status', '==', 'active').count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 7 * 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 30 * 86_400_000)).count().get(),
    getAnalyticsMetrics(),
    getReviewCities(),
    getAdSenseMetrics(),
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
    analytics,
    reviewCities,
    adsense,
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
  await Promise.all([
    db.collection('reports').doc(input.reportId).update({
      status: 'dismissed',
      resolvedBy: actorId,
      resolvedAt: FieldValue.serverTimestamp(),
    }),
    audit(actorId, 'dismiss-report', input.reportId),
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
    }));
});

export const upsertVenue = onCall(callableOptions, async (request) => {
  const actorId = requireAdmin(request);
  const input = parseInput(venueInputSchema, request.data);
  const reference = input.venueId
    ? db.collection('venues').doc(input.venueId)
    : db.collection('venues').doc();
  await reference.set({
    name: input.name,
    city: input.city,
    address: input.address,
    category: input.category,
    status: input.status,
    source: 'admin',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
    ...(input.venueId ? {} : { createdAt: FieldValue.serverTimestamp(), reviewCount: 0 }),
  }, { merge: true });
  await audit(actorId, input.venueId ? 'update-venue' : 'create-venue', reference.id);
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
  const reference = db.collection('venues').doc(input.venueId);
  const venue = await reference.get();
  if (!venue.exists) throw new HttpsError('not-found', 'The venue was not found.');
  await reference.update({
    name: input.name,
    city: input.city,
    address: input.address,
    category: input.category,
    status: input.status,
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
