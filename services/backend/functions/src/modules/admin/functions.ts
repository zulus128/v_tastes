import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';
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
const venueStatusSchema = z.enum(['active', 'hidden', 'pending', 'merged']);
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
  const [users, reviews, reports, venues, users24h, users7d, users30d, analytics, reviewCities] = await Promise.all([
    db.collection('users').count().get(),
    db.collection('reviews').where('status', '==', 'published').count().get(),
    db.collection('reports').where('status', '==', 'pending').count().get(),
    db.collection('venues').where('status', '==', 'active').count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 7 * 86_400_000)).count().get(),
    db.collection('users').where('createdAt', '>=', Timestamp.fromMillis(now - 30 * 86_400_000)).count().get(),
    getAnalyticsMetrics(),
    getReviewCities(),
  ]);

  return {
    totalUsers: users.data().count,
    publishedReviews: reviews.data().count,
    pendingReports: reports.data().count,
    activeVenues: venues.data().count,
    newUsers: {
      last24Hours: users24h.data().count,
      last7Days: users7d.data().count,
      last30Days: users30d.data().count,
    },
    analytics,
    reviewCities,
    adsense: {
      connected: false,
      estimatedEarnings: 0,
      impressions: 0,
      clicks: 0,
      error: 'Connect an AdSense OAuth client and publisher account to enable revenue metrics.',
    },
  };
});

export const getReportedContent = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const snapshot = await db.collection('reports')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map((document) => ({
    id: document.id,
    reporterId: String(document.get('reporterId') ?? ''),
    reporterName: String(document.get('reporterName') ?? 'Tastes user'),
    reason: String(document.get('reason') ?? 'Other'),
    details: String(document.get('details') ?? ''),
    targetType: String(document.get('targetType') ?? 'review'),
    targetId: String(document.get('targetId') ?? ''),
    parentId: document.get('parentId') ? String(document.get('parentId')) : null,
    contentPreview: String(document.get('contentPreview') ?? ''),
    status: String(document.get('status') ?? 'pending'),
    createdAt: timestampToIso(document.get('createdAt')),
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
  await reference.update({ text: input.text, moderatedAt: FieldValue.serverTimestamp(), moderatedBy: actorId });
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
    const candidates = await db.collection('users').limit(200).get();
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

async function updateUserStatus(
  request: CallableRequest<unknown>,
  status: 'active' | 'suspended' | 'banned',
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
    audit(actorId, `user-${status}`, input.userId, { reason: input.reason }),
  ]);
  return { id: input.userId, status };
}

export const suspendUser = onCall(callableOptions, (request) => updateUserStatus(request, 'suspended'));
export const banUser = onCall(callableOptions, (request) => updateUserStatus(request, 'banned'));
export const unbanUser = onCall(callableOptions, (request) => updateUserStatus(request, 'active'));
export const reinstateUser = onCall(callableOptions, (request) => updateUserStatus(request, 'active'));

export const searchAdminVenues = onCall(callableOptions, async (request) => {
  requireStaff(request);
  const input = parseInput(searchInputSchema, request.data);
  const query = input.query.toLowerCase();
  const snapshot = await db.collection('venues').limit(200).get();
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
  const reviews = await db.collection('reviews').where('venueId', '==', source.id).limit(400).get();
  const batch = db.batch();
  for (const review of reviews.docs) {
    batch.update(review.ref, { venueId: target.id, venueName: targetVenue.get('name'), updatedAt: FieldValue.serverTimestamp() });
  }
  batch.update(source, { status: 'merged', mergedInto: target.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId });
  await batch.commit();
  await audit(actorId, 'merge-venues', source.id, { targetVenueId: target.id, movedReviews: reviews.size });
  return { id: source.id, targetVenueId: target.id, movedReviews: reviews.size };
});
