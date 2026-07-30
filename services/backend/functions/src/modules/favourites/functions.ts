import {
  createFolderInputSchema,
  deleteFolderInputSchema,
  renameFolderInputSchema,
  saveVenueInputSchema,
  unsaveVenueInputSchema,
} from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import type { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit, idempotentDocumentId } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';
import { timestampToIso } from '../../shared/serialization';
import { parseInput } from '../../shared/validation';

const MAX_FOLDERS = 20;
const MAX_SAVED_VENUES = 500;

async function requireActiveProfile(uid: string) {
  const profile = await db.collection('users').doc(uid).get();
  if (!profile.exists || profile.get('status') !== 'active') {
    throw new HttpsError('failed-precondition', 'An active user profile is required.');
  }
  return profile;
}

export const getFavourites = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  await requireActiveProfile(uid);
  const userRef = db.collection('users').doc(uid);
  const [foldersSnapshot, savedSnapshot] = await Promise.all([
    userRef.collection('folders').orderBy('createdAt', 'asc').get(),
    userRef.collection('savedVenues').orderBy('createdAt', 'desc').get(),
  ]);
  const venueRefs = savedSnapshot.docs.map((document) =>
    db.collection('venues').doc(String(document.get('venueId') ?? document.id)));
  const venueSnapshots = venueRefs.length > 0 ? await db.getAll(...venueRefs) : [];
  const venuesById = new Map(venueSnapshots.map((venue) => [venue.id, venue]));
  const folderCounts = new Map<string, number>();

  const places = savedSnapshot.docs.flatMap((document) => {
    const venueId = String(document.get('venueId') ?? document.id);
    const venue = venuesById.get(venueId);
    if (!venue?.exists || venue.get('status') !== 'active') return [];
    const folderIds = Array.isArray(document.get('folderIds'))
      ? (document.get('folderIds') as unknown[]).filter((value): value is string => typeof value === 'string')
      : [];
    folderIds.forEach((folderId) => folderCounts.set(folderId, (folderCounts.get(folderId) ?? 0) + 1));
    return [{
      venueId,
      folderIds,
      savedAt: timestampToIso(document.get('createdAt')),
      name: String(venue.get('name') ?? ''),
      city: String(venue.get('city') ?? ''),
      address: String(venue.get('address') ?? ''),
      category: String(venue.get('category') ?? ''),
      priceLevel: Number(venue.get('priceLevel') ?? 1),
      distanceKm: Number(venue.get('distanceKm') ?? 0),
      rating: Number(venue.get('rating') ?? 0),
      reviewCount: Number(venue.get('reviewCount') ?? 0),
    }];
  });

  return {
    folders: foldersSnapshot.docs.map((document) => ({
      id: document.id,
      name: String(document.get('name') ?? ''),
      placeCount: folderCounts.get(document.id) ?? 0,
      createdAt: timestampToIso(document.get('createdAt')),
    })),
    places,
  };
});

export const createFolder = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(createFolderInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const folderRef = userRef.collection('folders').doc(
    idempotentDocumentId(uid, 'favourite-folder', input.idempotencyKey),
  );

  await db.runTransaction(async (transaction) => {
    const [profile, existingFolder, folders] = await Promise.all([
      transaction.get(userRef),
      transaction.get(folderRef),
      transaction.get(userRef.collection('folders')),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (existingFolder.exists) return;
    if (folders.size >= MAX_FOLDERS) {
      throw new HttpsError('resource-exhausted', 'The folder limit has been reached.');
    }
    await enforceRateLimit(transaction, uid, 'favourite-folder', 30, 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.create(folderRef, {
      name: input.name,
      normalizedName: input.name.toLocaleLowerCase('en-US'),
      source: 'user',
      createdAt: now,
      updatedAt: now,
    });
  });

  return { id: folderRef.id };
});

export const renameFolder = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(renameFolderInputSchema, request.data);
  const folderRef = db.collection('users').doc(uid).collection('folders').doc(input.folderId);
  const folder = await folderRef.get();
  if (!folder.exists) throw new HttpsError('not-found', 'The folder was not found.');
  await folderRef.update({
    name: input.name,
    normalizedName: input.name.toLocaleLowerCase('en-US'),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: folderRef.id };
});

export const deleteFolder = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(deleteFolderInputSchema, request.data);
  const userRef = db.collection('users').doc(uid);
  const folderRef = userRef.collection('folders').doc(input.folderId);
  const [folder, savedPlaces] = await Promise.all([
    folderRef.get(),
    userRef.collection('savedVenues').where('folderIds', 'array-contains', input.folderId).get(),
  ]);
  if (!folder.exists) throw new HttpsError('not-found', 'The folder was not found.');
  const batch = db.batch();
  batch.delete(folderRef);
  savedPlaces.docs.forEach((document) => batch.update(document.ref, {
    folderIds: FieldValue.arrayRemove(input.folderId),
    updatedAt: FieldValue.serverTimestamp(),
  }));
  await batch.commit();
  return { id: input.folderId };
});

export const saveVenue = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(saveVenueInputSchema, request.data);
  const uniqueFolderIds = [...new Set(input.folderIds)];
  const userRef = db.collection('users').doc(uid);
  const venueRef = db.collection('venues').doc(input.venueId);
  const savedRef = userRef.collection('savedVenues').doc(input.venueId);
  const folderRefs = uniqueFolderIds.map((folderId) => userRef.collection('folders').doc(folderId));

  await db.runTransaction(async (transaction) => {
    const [profile, venue, saved, ...folders] = await Promise.all([
      transaction.get(userRef),
      transaction.get(venueRef),
      transaction.get(savedRef),
      ...folderRefs.map((folderRef) => transaction.get(folderRef)),
    ]);
    if (!profile.exists || profile.get('status') !== 'active') {
      throw new HttpsError('failed-precondition', 'An active user profile is required.');
    }
    if (!venue.exists || venue.get('status') !== 'active') {
      throw new HttpsError('not-found', 'The venue was not found.');
    }
    if (folders.some((folder) => !folder.exists)) {
      throw new HttpsError('not-found', 'One of the folders was not found.');
    }
    if (!saved.exists) {
      const savedPlaces = await transaction.get(userRef.collection('savedVenues'));
      if (savedPlaces.size >= MAX_SAVED_VENUES) {
        throw new HttpsError('resource-exhausted', 'The saved places limit has been reached.');
      }
    }
    await enforceRateLimit(transaction, uid, 'save-venue', 120, 60_000);
    const now = FieldValue.serverTimestamp();
    transaction.set(savedRef, {
      venueId: input.venueId,
      folderIds: uniqueFolderIds,
      createdAt: saved.exists ? saved.get('createdAt') as Timestamp : now,
      updatedAt: now,
    }, { merge: true });
  });

  return { saved: true, folderIds: uniqueFolderIds };
});

export const unsaveVenue = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request);
  const input = parseInput(unsaveVenueInputSchema, request.data);
  await db.collection('users').doc(uid).collection('savedVenues').doc(input.venueId).delete();
  return { saved: false, folderIds: [] };
});
