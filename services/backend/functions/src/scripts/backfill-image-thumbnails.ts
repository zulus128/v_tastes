import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, firestoreDatabaseId } from '../shared/firebase';

const apply = process.argv.includes('--apply');
const projectId =
  process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;

if (apply && projectId !== 'tastes-934e6') {
  throw new Error(
    'Thumbnail backfill can only modify the tastes-934e6 project.',
  );
}

const bucket = getStorage().bucket(
  process.env.FIREBASE_STORAGE_BUCKET ??
    (projectId ? `${projectId}.firebasestorage.app` : undefined),
);

async function saveThumbnail(path: string, bytes: Buffer) {
  const file = bucket.file(path);
  const token = randomUUID();
  await file.save(bytes, {
    resumable: false,
    metadata: {
      cacheControl: 'public,max-age=31536000,immutable',
      contentType: 'image/jpeg',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return getDownloadURL(file);
}

async function backfillVenues() {
  const snapshot = await db.collection('venues').get();
  let candidates = 0;
  let updated = 0;
  for (const venue of snapshot.docs) {
    const imageUrl = venue.get('imageUrl');
    const photoUrls = Array.isArray(venue.get('photoUrls'))
      ? (venue.get('photoUrls') as unknown[]).filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const originalUrl =
      photoUrls[0] ?? (typeof imageUrl === 'string' ? imageUrl : null);
    if (!originalUrl || String(imageUrl).includes('-thumbnail.')) continue;
    candidates += 1;
    if (!apply) continue;
    const response = await fetch(originalUrl);
    if (!response.ok) throw new Error(`Could not download venue ${venue.id}.`);
    const thumbnail = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize({
        width: 384,
        height: 384,
        fit: 'cover',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    const thumbnailUrl = await saveThumbnail(
      `venue-images/${venue.id}/backfill-cover-thumbnail.jpg`,
      thumbnail,
    );
    await venue.ref.update({
      imageUrl: thumbnailUrl,
      photoUrls: photoUrls.length ? photoUrls : [originalUrl],
    });
    updated += 1;
  }
  return { candidates, updated };
}

async function backfillReviews() {
  const snapshot = await db.collection('reviews').get();
  let candidates = 0;
  let updated = 0;
  for (const review of snapshot.docs) {
    const dishes = Array.isArray(review.get('dishReviews'))
      ? (review.get('dishReviews') as Array<Record<string, unknown>>)
      : [];
    let changed = false;
    const nextDishes = [];
    for (const dish of dishes) {
      const photoPath =
        typeof dish.photoPath === 'string' ? dish.photoPath : undefined;
      if (!photoPath || typeof dish.thumbnailPath === 'string') {
        nextDishes.push(dish);
        continue;
      }
      candidates += 1;
      if (!apply) {
        nextDishes.push(dish);
        continue;
      }
      const [bytes] = await bucket.file(photoPath).download();
      const thumbnail = await sharp(bytes)
        .rotate()
        .resize({ width: 360, height: 360, fit: 'cover' })
        .jpeg({ quality: 68, mozjpeg: true })
        .toBuffer();
      const thumbnailPath = `${photoPath}-thumbnail`;
      const thumbnailUrl = await saveThumbnail(thumbnailPath, thumbnail);
      nextDishes.push({ ...dish, thumbnailPath, thumbnailUrl });
      changed = true;
    }
    if (changed) {
      await review.ref.update({ dishReviews: nextDishes });
      updated += 1;
    }
  }
  return { candidates, updated };
}

async function backfillProfiles() {
  const snapshot = await db.collection('users').get();
  let candidates = 0;
  let updated = 0;
  for (const profile of snapshot.docs) {
    const photoPath = profile.get('photoPath');
    if (
      typeof photoPath !== 'string' ||
      typeof profile.get('photoThumbnailPath') === 'string'
    )
      continue;
    candidates += 1;
    if (!apply) continue;
    const [bytes] = await bucket.file(photoPath).download();
    const thumbnail = await sharp(bytes)
      .rotate()
      .resize({ width: 320, height: 320, fit: 'cover' })
      .jpeg({ quality: 68, mozjpeg: true })
      .toBuffer();
    const photoThumbnailPath = `${photoPath}-thumbnail`;
    const photoUrl = await saveThumbnail(photoThumbnailPath, thumbnail);
    await profile.ref.update({ photoThumbnailPath, photoUrl });
    updated += 1;
  }
  return { candidates, updated };
}

async function main() {
  const [venues, reviews, profiles] = await Promise.all([
    backfillVenues(),
    backfillReviews(),
    backfillProfiles(),
  ]);
  process.stdout.write(
    `${apply ? 'Applied' : 'Dry run'} thumbnail backfill in ${firestoreDatabaseId}: ${JSON.stringify({ venues, reviews, profiles })}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
