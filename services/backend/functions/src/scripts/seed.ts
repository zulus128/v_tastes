const seedRemote = process.env.SEED_REMOTE === 'true';

if (seedRemote) {
  if (process.env.GCLOUD_PROJECT !== 'tastes-934e6') {
    throw new Error('Remote seeding is only allowed for the tastes-934e6 test project.');
  }

  process.env.FIRESTORE_DATABASE_ID ??= 'tastes-eu';
  delete process.env.FIRESTORE_EMULATOR_HOST;
} else {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
  process.env.GCLOUD_PROJECT ??= 'demo-tastes';
}

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.GCLOUD_PROJECT,
    storageBucket: seedRemote ? 'tastes-934e6.firebasestorage.app' : 'demo-tastes.appspot.com',
  });
}

const seedMedia = {
  venues: {
    sushi: 'apps/mobile/assets/discover/sushi.jpg',
    restaurant: 'apps/mobile/assets/discover/restaurant.png',
    lounge: 'apps/mobile/assets/discover/lounge.png',
    tacos: 'apps/mobile/assets/discover/tacos.jpg',
    cafe: 'apps/mobile/assets/discover/cafe.png',
  },
  avatars: {
    kristin: 'apps/mobile/assets/discover/avatar-kristin.png',
    cameron: 'apps/mobile/assets/discover/avatar-cameron.jpg',
    wade: 'apps/mobile/assets/discover/avatar-wade.png',
  },
} as const;

function seedDownloadToken(path: string): string {
  const hex = createHash('sha256').update(`tastes-seed-media:${path}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableSeedKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function directConversationId(firstUserId: string, secondUserId: string): string {
  const participantIds = [firstUserId, secondUserId].sort();
  return createHash('sha256').update(`direct:${participantIds[0]}\0${participantIds[1]}`).digest('hex');
}

async function uploadSeedMediaGroup(
  group: 'venues' | 'avatars',
  assets: Record<string, string>,
): Promise<Record<string, string>> {
  const workspaceRoot = resolve(__dirname, '../../../../..');
  const bucket = getStorage().bucket();
  const entries = await Promise.all(Object.entries(assets).map(async ([key, assetPath]) => {
    const extension = extname(assetPath);
    const file = bucket.file(`seed-media/${group}/${key}${extension}`);
    const downloadToken = seedDownloadToken(`${group}/${key}${extension}`);
    await file.save(await readFile(resolve(workspaceRoot, assetPath)), {
      resumable: false,
      metadata: {
        contentType: extension === '.jpg' ? 'image/jpeg' : 'image/png',
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });
    const downloadUrl = seedRemote
      ? await getDownloadURL(file)
      : `http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${downloadToken}`;
    return [key, downloadUrl] as const;
  }));
  return Object.fromEntries(entries);
}

async function main() {
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID ?? '(default)';
  const db =
    firestoreDatabaseId === '(default)'
      ? getFirestore()
      : getFirestore(firestoreDatabaseId);
  const [venueMedia, avatarMedia] = await Promise.all([
    uploadSeedMediaGroup('venues', seedMedia.venues),
    uploadSeedMediaGroup('avatars', seedMedia.avatars),
  ]);
  const venues = [
    {
      id: 'morimoto',
      name: 'Wasabi by Morimoto',
      city: 'Istanbul',
      address: 'Zorlu Center, Beşiktaş',
      category: 'Japanese',
      imageUrl: venueMedia.sushi,
      photoUrls: [venueMedia.sushi, venueMedia.restaurant, venueMedia.lounge],
      photoCount: 24,
      placeTags: ['Japanese 🍣', '$$$', '1.8 km'],
      phone: '+90 212 555 01 32',
      website: 'wasabimorimoto.com',
      openingHours: [
        { day: 'Monday', hours: '12 PM – 11 PM' },
        { day: 'Tuesday', hours: '12 PM – 11 PM' },
        { day: 'Wednesday', hours: '12 PM – 11 PM' },
        { day: 'Thursday', hours: '12 PM – 11 PM' },
        { day: 'Friday', hours: '12 PM – 12 AM' },
        { day: 'Saturday', hours: '12 PM – 12 AM' },
        { day: 'Sunday', hours: '12 PM – 11 PM' },
      ],
      popularDishes: [{ name: 'Omakase', rating: 5 }, { name: 'Salmon nigiri', rating: 4.8 }, { name: 'Spicy tuna roll', rating: 4.6 }],
      priceLevel: 3,
      distanceKm: 1.8,
      rating: 4.7,
      reviewCount: 512,
      latitude: 41.0674,
      longitude: 29.0176,
      discoverTags: ['trending', 'most-reviewed', 'for-you'],
      status: 'active',
    },
    {
      id: 'joes-shanghai',
      name: "Joe's Shanghai Soup Dumpling Restaurant",
      city: 'Istanbul',
      address: 'Teşvikiye Cd. 41, Şişli',
      category: 'Chinese',
      imageUrl: venueMedia.restaurant,
      photoUrls: [venueMedia.restaurant, venueMedia.lounge, venueMedia.restaurant],
      photoCount: 24,
      placeTags: ['Chinese 🥟', '$$', '0.9 km'],
      phone: '+90 212 555 03 12',
      website: 'joesshanghai.com',
      openingHours: [
        { day: 'Monday', hours: '10 AM – 6 PM' },
        { day: 'Tuesday', hours: '10 AM – 6 PM' },
        { day: 'Wednesday', hours: '10 AM – 6 PM' },
        { day: 'Thursday', hours: '10 AM – 6 PM' },
        { day: 'Friday', hours: '10 AM – 8 PM' },
        { day: 'Saturday', hours: '10 AM – 8 PM' },
        { day: 'Sunday', hours: '10 AM – 6 PM' },
      ],
      popularDishes: [{ name: 'Pork soup dumplings', rating: 4.9 }, { name: 'Crab dumplings', rating: 4.8 }, { name: 'Scallion pancakes', rating: 4.5 }],
      priceLevel: 2,
      distanceKm: 0.9,
      rating: 4.5,
      reviewCount: 821,
      latitude: 41.0511,
      longitude: 28.9927,
      discoverTags: ['new', 'most-reviewed'],
      status: 'active',
    },
    {
      id: 'gemini-750',
      name: 'Gemini750 Restaurant',
      city: 'Istanbul',
      address: 'Karaköy, Beyoğlu',
      category: 'Italian',
      imageUrl: venueMedia.lounge,
      photoUrls: [venueMedia.lounge, venueMedia.restaurant, venueMedia.lounge],
      photoCount: 18,
      placeTags: ['Italian 🇮🇹', '$$', '1.2 km'],
      phone: '+90 212 555 07 50',
      website: 'gemini750.com',
      openingHours: [{ day: 'Daily', hours: '12 PM – 11 PM' }],
      popularDishes: [{ name: 'Tagliolini', rating: 4.9 }, { name: 'Tiramisu', rating: 4.7 }],
      priceLevel: 2,
      distanceKm: 1.2,
      rating: 4.4,
      reviewCount: 389,
      latitude: 41.0245,
      longitude: 28.9768,
      discoverTags: ['trending', 'new', 'for-you'],
      status: 'active',
    },
    {
      id: 'coffee-bar-760',
      name: 'Coffee Bar 760',
      city: 'Istanbul',
      address: 'Moda Cd. 18, Kadıköy',
      category: 'Cafe',
      imageUrl: venueMedia.cafe,
      photoUrls: [venueMedia.cafe, venueMedia.restaurant, venueMedia.cafe],
      photoCount: 16,
      placeTags: ['Cafe ☕', '$', '0.4 km'],
      phone: '+90 216 555 07 60',
      website: 'coffeebar760.com',
      openingHours: [{ day: 'Daily', hours: '8 AM – 8 PM' }],
      popularDishes: [{ name: 'Matcha latte', rating: 4.7 }, { name: 'Filter coffee', rating: 4.5 }],
      priceLevel: 1,
      distanceKm: 0.4,
      rating: 4.2,
      reviewCount: 92,
      latitude: 40.9864,
      longitude: 29.0252,
      discoverTags: ['new', 'hidden-gem'],
      status: 'active',
    },
    {
      id: 'tacos-la-brea',
      name: 'Tacos La Brea',
      city: 'Istanbul',
      address: 'Akarsu Ykş. 11, Cihangir',
      category: 'Mexican',
      imageUrl: venueMedia.tacos,
      photoUrls: [venueMedia.tacos, venueMedia.restaurant, venueMedia.tacos],
      photoCount: 20,
      placeTags: ['Mexican 🌮', '$', '2.1 km'],
      phone: '+90 212 555 11 42',
      website: 'tacoslabrea.com',
      openingHours: [{ day: 'Daily', hours: '12 PM – 11 PM' }],
      popularDishes: [{ name: 'Birria tacos', rating: 4.9 }, { name: 'Elote', rating: 4.6 }],
      priceLevel: 1,
      distanceKm: 2.1,
      rating: 4.6,
      reviewCount: 240,
      latitude: 41.0328,
      longitude: 28.9841,
      discoverTags: ['trending', 'hidden-gem'],
      status: 'active',
    },
    {
      id: 'demo-cafe',
      name: 'Tastes Demo Cafe',
      city: 'Istanbul',
      address: 'Bağdat Cd. 72, Kadıköy',
      category: 'Cafe',
      imageUrl: venueMedia.cafe,
      photoUrls: [venueMedia.cafe, venueMedia.lounge, venueMedia.cafe],
      photoCount: 12,
      placeTags: ['Cafe ☕', '$', '3.4 km'],
      phone: '+90 216 555 72 00',
      website: 'tastes-demo.cafe',
      openingHours: [{ day: 'Daily', hours: '8 AM – 7 PM' }],
      popularDishes: [{ name: 'Brunch plate', rating: 4.5 }, { name: 'Cold brew', rating: 4.4 }],
      priceLevel: 1,
      distanceKm: 3.4,
      rating: 4.1,
      reviewCount: 48,
      latitude: 40.9638,
      longitude: 29.0631,
      discoverTags: ['for-you'],
      status: 'active',
    },
    {
      id: 'hidden-place',
      name: 'Hidden Test Venue',
      city: 'Istanbul',
      address: 'Seed-only moderation fixture',
      category: 'Test',
      imageUrl: venueMedia.restaurant,
      priceLevel: 1,
      distanceKm: 0,
      rating: 5,
      reviewCount: 1,
      latitude: 41.0082,
      longitude: 28.9784,
      discoverTags: [],
      status: 'hidden',
    },
  ];

  await Promise.all(
    venues.map(({ id, ...venue }) =>
      db.collection('venues').doc(id).set(
        {
          ...venue,
          imageKey: FieldValue.delete(),
          photoKeys: FieldValue.delete(),
          source: 'seed',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );

  const users = [
    {
      id: 'leader-jane',
      displayName: 'Jane Cooper',
      username: 'nickname2321',
      city: 'Istanbul',
      monthlyXp: 482,
      xp: 2_840,
    },
    {
      id: 'leader-alex',
      displayName: 'Alex Morgan',
      username: 'alexm',
      city: 'Istanbul',
      monthlyXp: 432,
      xp: 3_110,
    },
    {
      id: 'leader-maria',
      displayName: 'Maria Kaine',
      username: 'mariaa2',
      city: 'Istanbul',
      monthlyXp: 422,
      xp: 2_570,
    },
    {
      id: 'leader-noah',
      displayName: 'Noah Williams',
      username: 'noahw',
      city: 'Istanbul',
      monthlyXp: 235,
      xp: 1_980,
    },
    {
      id: 'leader-sofia',
      displayName: 'Sofia Miller',
      username: 'sofiam',
      city: 'Istanbul',
      monthlyXp: 125,
      xp: 1_620,
    },
    {
      id: 'leader-liam',
      displayName: 'Liam Davis',
      username: 'liamd',
      city: 'Istanbul',
      monthlyXp: 95,
      xp: 1_410,
    },
    {
      id: 'leader-emma',
      displayName: 'Emma Wilson',
      username: 'emmaw',
      city: 'Istanbul',
      monthlyXp: 93,
      xp: 1_280,
    },
    {
      id: 'discover-kristin',
      displayName: 'Kristin Watson',
      username: 'kristinw',
      photoUrl: avatarMedia.kristin,
      city: 'Istanbul',
      bio: 'Tacos, BBQ and neighborhood gems.',
      favoriteCuisines: ['Tacos', 'BBQ'],
      weeklyFollowerGrowth: 412,
      followerCount: 2_840,
      reviewCount: 128,
      monthlyXp: 82,
      xp: 1_180,
    },
    {
      id: 'discover-cameron',
      displayName: 'Cameron Williamson',
      username: 'cameronw',
      photoUrl: avatarMedia.cameron,
      city: 'Istanbul',
      bio: 'Italian food and handmade pasta.',
      favoriteCuisines: ['Italian', 'Pasta'],
      weeklyFollowerGrowth: 318,
      followerCount: 2_410,
      reviewCount: 96,
      monthlyXp: 78,
      xp: 1_090,
    },
    {
      id: 'discover-wade',
      displayName: 'Wade Warren',
      username: 'wadew',
      photoUrl: avatarMedia.wade,
      city: 'Istanbul',
      bio: 'Sushi, ramen and late-night eats.',
      favoriteCuisines: ['Sushi', 'Ramen'],
      weeklyFollowerGrowth: 206,
      followerCount: 1_870,
      reviewCount: 84,
      monthlyXp: 74,
      xp: 980,
    },
    {
      id: 'discover-luke',
      displayName: 'Luke Cooper',
      username: 'lukec',
      photoUrl: avatarMedia.cameron,
      city: 'Istanbul',
      bio: 'Coffee and brunch hunter.',
      favoriteCuisines: ['Coffee', 'Brunch'],
      weeklyFollowerGrowth: 96,
      followerCount: 530,
      reviewCount: 22,
      monthlyXp: 68,
      xp: 870,
    },
    {
      id: 'discover-brooklyn',
      displayName: 'Brooklyn Simmons',
      username: 'brooklyns',
      photoUrl: avatarMedia.kristin,
      city: 'Istanbul',
      bio: 'Steak, wine and date-night spots.',
      favoriteCuisines: ['Steak', 'Wine'],
      weeklyFollowerGrowth: 74,
      followerCount: 420,
      reviewCount: 18,
      monthlyXp: 62,
      xp: 790,
    },
    {
      id: 'discover-martin',
      displayName: 'Martin Baena',
      username: 'martinb',
      photoUrl: avatarMedia.wade,
      city: 'Istanbul',
      bio: 'Vegan bakeries and natural wine.',
      favoriteCuisines: ['Vegan', 'Bakery'],
      weeklyFollowerGrowth: 51,
      followerCount: 310,
      reviewCount: 14,
      monthlyXp: 58,
      xp: 720,
    },
    {
      id: 'discover-devon',
      displayName: 'Devon Lane',
      username: 'devonl',
      photoUrl: avatarMedia.kristin,
      city: 'Istanbul',
      bio: 'Coffee, matcha and quiet corners.',
      favoriteCuisines: ['Coffee', 'Desserts'],
      weeklyFollowerGrowth: 45,
      followerCount: 290,
      reviewCount: 31,
      monthlyXp: 54,
      xp: 690,
    },
    {
      id: 'phone_ND8NpcfJMs4TlHoGzE9o7G4JO_XRzXis4G56p5AF',
      displayName: 'Ty',
      username: 'yy',
      photoUrl: avatarMedia.cameron,
      city: 'Istanbul',
      bio: 'Local test account',
      favoriteCuisines: ['Italian', 'Japanese', 'Mexican'],
      weeklyFollowerGrowth: 12,
      followerCount: 132,
      reviewCount: 16,
      monthlyXp: 12,
      xp: 820,
    },
  ];

  await Promise.all(
    users.map(({ id, ...user }) =>
      db.collection('users').doc(id).set(
        {
          ...user,
          uid: id,
          photoUrl: 'photoUrl' in user ? user.photoUrl : null,
          avatarKey: FieldValue.delete(),
          status: 'active',
          source: 'seed',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );

  const seededUserIds = new Set(users.map((user) => user.id));
  const localProfiles = await db.collection('users').where('status', '==', 'active').get();
  const hydratedProfiles = localProfiles.docs.filter((profile) => !seededUserIds.has(profile.id));

  await Promise.all(
    hydratedProfiles.map((profile) =>
      profile.ref.set(
        {
          monthlyXp: Math.max(Number(profile.get('monthlyXp') ?? 0), 12),
          xp: Math.max(Number(profile.get('xp') ?? 0), 820),
          city: profile.get('city') || 'Istanbul',
          followingCount: Math.max(Number(profile.get('followingCount') ?? 0), 3),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );

  const reviewSeeds = [
    {
      id: 'discover-review-gemini',
      authorId: 'discover-cameron',
      venueId: 'gemini-750',
      rating: 4.5,
      text: "The hand-cut tagliolini is unreal — go on a Tuesday for the chef's special.",
      reactionCount: 94,
      commentCount: 8,
      hoursAgo: 2,
    },
    {
      id: 'discover-review-coffee',
      authorId: 'discover-devon',
      venueId: 'coffee-bar-760',
      rating: 4,
      text: "Tucked-away matcha spot with the smoothest pull I've had in months.",
      reactionCount: 67,
      commentCount: 5,
      hoursAgo: 4,
    },
    {
      id: 'discover-review-dumplings',
      authorId: 'discover-wade',
      venueId: 'joes-shanghai',
      rating: 5,
      text: 'Sixteen folds, perfect every time. Order the pork and crab together.',
      reactionCount: 128,
      commentCount: 14,
      hoursAgo: 6,
    },
    {
      id: 'discover-review-morimoto',
      authorId: 'discover-kristin',
      venueId: 'morimoto',
      rating: 4.8,
      text: 'The omakase is worth it. Sit at the counter and let the chef choose.',
      reactionCount: 156,
      commentCount: 21,
      hoursAgo: 12,
    },
    {
      id: 'discover-review-tacos',
      authorId: 'discover-luke',
      venueId: 'tacos-la-brea',
      rating: 4.6,
      text: 'Birria tacos, crispy edges, rich consommé. One of my favorite quick dinners.',
      reactionCount: 82,
      commentCount: 9,
      hoursAgo: 20,
    },
    {
      id: 'discover-review-demo-cafe',
      authorId: 'discover-brooklyn',
      venueId: 'demo-cafe',
      rating: 4.2,
      text: 'A reliable brunch spot with great filter coffee and plenty of room.',
      reactionCount: 38,
      commentCount: 3,
      hoursAgo: 30,
    },
  ];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  await Promise.all(reviewSeeds.map((review) => {
    const author = usersById.get(review.authorId);
    const venue = venuesById.get(review.venueId);
    if (!author || !venue) throw new Error(`Invalid discover review fixture ${review.id}.`);
    const createdAt = Timestamp.fromMillis(Date.now() - review.hoursAgo * 60 * 60 * 1_000);
    return db.collection('reviews').doc(review.id).set({
      authorId: review.authorId,
      authorDisplayName: author.displayName,
      venueId: review.venueId,
      venueName: venue.name,
      venueCity: venue.city,
      rating: review.rating,
      text: review.text,
      status: 'published',
      reactionCount: review.reactionCount,
      commentCount: review.commentCount,
      source: 'seed',
      createdAt,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));

  const localTestProfileIds = [
    'phone_ND8NpcfJMs4TlHoGzE9o7G4JO_XRzXis4G56p5AF',
    ...hydratedProfiles.map((profile) => profile.id),
  ];
  const followedUserIds = ['discover-kristin', 'discover-cameron', 'discover-wade'];
  const localProfileSnapshots = await db.getAll(
    ...localTestProfileIds.map((profileId) => db.collection('users').doc(profileId)),
  );
  const localProfilesById = new Map(localProfileSnapshots.map((profile) => [profile.id, profile]));
  const localReviewTemplates = [
    { venueId: 'morimoto', rating: 4.9, text: 'Counter seats, flawless nigiri, and a genuinely memorable omakase. I would come back for the salmon alone.', tags: ['Great food'], hoursAgo: 26 },
    { venueId: 'gemini-750', rating: 4.6, text: 'Beautiful room and excellent handmade pasta. The tiramisu was the best finish to the evening.', tags: ['Date night'], hoursAgo: 86 },
    { venueId: 'tacos-la-brea', rating: 4.8, text: 'Crispy birria, rich consommé and fast service. An easy recommendation for a casual dinner.', tags: ['Hidden gem'], hoursAgo: 170 },
    { venueId: 'coffee-bar-760', rating: 4.2, text: 'Quiet enough to work, friendly baristas and a very good matcha latte.', tags: ['Work friendly'], hoursAgo: 240 },
    { venueId: 'joes-shanghai', rating: 4.5, text: 'The soup dumplings arrived piping hot and every basket disappeared immediately.', tags: ['Worth the wait'], hoursAgo: 360 },
    { venueId: 'demo-cafe', rating: 4.1, text: 'A dependable brunch with plenty of space for a group and a solid cold brew.', tags: ['Brunch'], hoursAgo: 520 },
  ];
  await Promise.all(localTestProfileIds.flatMap((profileId) => {
    const profile = localProfilesById.get(profileId);
    const authorDisplayName = String(profile?.get('displayName') ?? 'Tastes tester');
    return localReviewTemplates.map((review, index) => {
      const venue = venuesById.get(review.venueId);
      if (!venue) throw new Error(`Invalid local review fixture ${review.venueId}.`);
      const reviewId = `seed-own-${stableSeedKey(profileId)}-${index + 1}`;
      return db.collection('reviews').doc(reviewId).set({
        authorId: profileId,
        authorDisplayName,
        venueId: review.venueId,
        venueName: venue.name,
        venueCity: venue.city,
        rating: review.rating,
        text: review.text,
        tags: review.tags,
        dishReviews: index < 3 ? [{
          id: `dish-${index + 1}`,
          title: index === 0 ? 'Salmon nigiri' : index === 1 ? 'Tiramisu' : 'Birria tacos',
          rating: review.rating,
          photoPath: null,
        }] : [],
        status: 'published',
        reactionCount: 8 + index * 3,
        commentCount: index === 0 ? 2 : index % 2,
        source: 'seed',
        createdAt: Timestamp.fromMillis(Date.now() - review.hoursAgo * 60 * 60 * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }));
  const recapNow = new Date();
  const recapPrevious = new Date(recapNow.getFullYear(), recapNow.getMonth() - 1, 1);
  const recapSeed = {
    month: recapNow.toLocaleDateString('en-US', { month: 'long' }),
    previousMonth: recapPrevious.toLocaleDateString('en-US', { month: 'long' }),
    ready: true,
    placesVisited: 15,
    previousPlacesVisited: 11,
    areasExplored: 3,
    previousAreasExplored: 2,
    reviewsWritten: 9,
    previousReviewsWritten: 11,
    followersGained: 132,
    favoriteArea: 'Belgravia',
    topPlaces: ['morimoto', 'gemini-750', 'joes-shanghai', 'tacos-la-brea', 'coffee-bar-760'].map((venueId) => {
      const venue = venuesById.get(venueId);
      if (!venue) throw new Error(`Invalid recap venue fixture ${venueId}.`);
      return { venueId, name: venue.name, address: venue.address, rating: venue.rating, imageUrl: venue.imageUrl, area: venue.address.split(',').at(-1)?.trim() ?? venue.city };
    }),
    topDishes: [
      { name: 'Grilled Salmon with Lemon', rating: 5, imageUrl: venueMedia.sushi },
      { name: 'Sushi Roll', rating: 4.6, imageUrl: venueMedia.restaurant },
      { name: 'Tiramisu', rating: 4.2, imageUrl: venueMedia.lounge },
    ],
    source: 'seed',
    updatedAt: FieldValue.serverTimestamp(),
  };
  await Promise.all(localTestProfileIds.map((profileId) =>
    db.collection('users').doc(profileId).collection('monthlyRecaps').doc('current').set(recapSeed, { merge: true }),
  ));
  await Promise.all(localTestProfileIds.map(async (profileId) => {
    const seededFollowing = await db.collection('users').doc(profileId)
      .collection('following').where('source', '==', 'seed').get();
    await Promise.all(seededFollowing.docs.map((document) => document.ref.delete()));
  }));
  await Promise.all(localTestProfileIds.flatMap((profileId) =>
    followedUserIds.map((followedUserId) =>
      db.collection('users').doc(profileId).collection('following').doc(followedUserId).set({
        userId: followedUserId,
        source: 'seed',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ),
  ));
  await Promise.all(localTestProfileIds.flatMap((profileId) =>
    followedUserIds.map((followedUserId) =>
      db.collection('users').doc(followedUserId).collection('following').doc(profileId).set({
        userId: profileId,
        source: 'seed',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ),
  ));
  await Promise.all(localTestProfileIds.map((profileId) =>
    db.collection('users').doc(profileId).set({
      followingCount: followedUserIds.length,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ));

  const favouriteFolderSeeds = [
    { id: 'date-spots', name: 'Date spots' },
    { id: 'bars', name: 'Bars' },
    { id: 'cafes', name: 'Cafés' },
  ];
  const savedVenueSeeds = [
    { venueId: 'gemini-750', folderIds: ['date-spots'] },
    { venueId: 'morimoto', folderIds: ['date-spots'] },
    { venueId: 'joes-shanghai', folderIds: ['date-spots'] },
    { venueId: 'coffee-bar-760', folderIds: ['cafes'] },
    { venueId: 'tacos-la-brea', folderIds: [] },
  ];
  await Promise.all(localTestProfileIds.map(async (profileId) => {
    const userRef = db.collection('users').doc(profileId);
    const [seededFolders, seededSavedVenues] = await Promise.all([
      userRef.collection('folders').where('source', '==', 'seed').get(),
      userRef.collection('savedVenues').where('source', '==', 'seed').get(),
    ]);
    await Promise.all([
      ...seededFolders.docs.map((document) => document.ref.delete()),
      ...seededSavedVenues.docs.map((document) => document.ref.delete()),
    ]);
    await Promise.all([
      ...favouriteFolderSeeds.map((folder, index) =>
        userRef.collection('folders').doc(folder.id).set({
          name: folder.name,
          normalizedName: folder.name.toLocaleLowerCase('en-US'),
          source: 'seed',
          createdAt: Timestamp.fromMillis(Date.now() - (favouriteFolderSeeds.length - index) * 1_000),
          updatedAt: FieldValue.serverTimestamp(),
        })),
      ...savedVenueSeeds.map((saved, index) =>
        userRef.collection('savedVenues').doc(saved.venueId).set({
          ...saved,
          source: 'seed',
          createdAt: Timestamp.fromMillis(Date.now() - index * 60_000),
          updatedAt: FieldValue.serverTimestamp(),
        })),
    ]);
  }));

  const commentSeeds = [
    { id: 'comment-1', reviewId: 'discover-review-gemini', authorId: 'discover-kristin', parentCommentId: null, reactionCount: 2, replyCount: 1, text: 'Adding this to my list.' },
    { id: 'comment-1-reply', reviewId: 'discover-review-gemini', authorId: 'discover-wade', parentCommentId: 'comment-1', reactionCount: 1, replyCount: 0, text: 'Book the terrace if the weather is good.' },
    { id: 'comment-2', reviewId: 'discover-review-gemini', authorId: 'discover-wade', parentCommentId: null, reactionCount: 3, replyCount: 0, text: 'The Tuesday special is excellent.' },
    { id: 'comment-3', reviewId: 'discover-review-morimoto', authorId: 'discover-cameron', parentCommentId: null, reactionCount: 1, replyCount: 0, text: 'Counter seats are the move.' },
  ];
  await Promise.all(commentSeeds.map((comment, index) => {
    const author = usersById.get(comment.authorId);
    if (!author) throw new Error(`Invalid discover comment fixture ${comment.id}.`);
    return db.collection('reviews').doc(comment.reviewId).collection('comments').doc(comment.id).set({
      authorId: comment.authorId,
      authorDisplayName: author.displayName,
      parentCommentId: comment.parentCommentId,
      reactionCount: comment.reactionCount,
      replyCount: comment.replyCount,
      text: comment.text,
      status: 'published',
      source: 'seed',
      createdAt: Timestamp.fromMillis(Date.now() - (index + 1) * 30 * 60 * 1_000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));

  const commentReactionSeeds: Array<[reviewId: string, commentId: string, userId: string]> = [
    ['discover-review-gemini', 'comment-1', 'discover-cameron'],
    ['discover-review-gemini', 'comment-1', 'discover-wade'],
    ['discover-review-gemini', 'comment-1-reply', 'discover-kristin'],
    ['discover-review-gemini', 'comment-2', 'discover-kristin'],
    ['discover-review-gemini', 'comment-2', 'discover-cameron'],
    ['discover-review-gemini', 'comment-2', 'discover-brooklyn'],
    ['discover-review-morimoto', 'comment-3', 'discover-kristin'],
  ];
  await Promise.all(commentReactionSeeds.map(([reviewId, commentId, userId]) =>
    db.collection('reviews').doc(reviewId).collection('comments').doc(commentId).collection('reactions').doc(userId).set({
      userId,
      reaction: 'like',
      source: 'seed',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ));

  const reactionSeeds: Array<[reviewId: string, userId: string]> = [
    ['discover-review-gemini', 'discover-kristin'],
    ['discover-review-gemini', 'discover-wade'],
    ['discover-review-morimoto', 'discover-cameron'],
    ['discover-review-tacos', 'discover-brooklyn'],
  ];
  await Promise.all(reviewSeeds.map(async ({ id }) => {
    const seededReactions = await db.collection('reviews').doc(id)
      .collection('reactions').where('source', '==', 'seed').get();
    await Promise.all(seededReactions.docs.map((document) => document.ref.delete()));
  }));
  await Promise.all(reactionSeeds.map(([reviewId, userId]) =>
    db.collection('reviews').doc(reviewId).collection('reactions').doc(userId).set({
      userId,
      reaction: 'like',
      source: 'seed',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ));

  const notificationSeeds = [
    { id: 'new-comment', kind: 'comment', title: 'Kristin commented on your review', body: '“Adding this to my list.”', targetType: 'comments', targetId: 'discover-review-gemini', unread: true, minutesAgo: 12 },
    { id: 'new-follower', kind: 'follow', title: 'Cameron started following you', body: 'You share a taste for handmade pasta.', targetType: 'profile', targetId: 'discover-cameron', unread: true, minutesAgo: 48 },
    { id: 'activity-invite', kind: 'invite', title: 'Dinner plan invitation', body: 'Wade invited you to Friday night dinner.', targetType: 'activity', targetId: 'seed-friday-dinner', unread: false, minutesAgo: 180 },
    { id: 'monthly-recap', kind: 'reward', title: 'Your monthly recap is ready', body: 'See the places and flavours that made your month.', targetType: 'recap', targetId: 'monthly', unread: false, minutesAgo: 1_440 },
    { id: 'badge-city-explorer', kind: 'reward', title: 'City Explorer unlocked', body: 'You reviewed places in five different areas.', targetType: 'recap', targetId: 'monthly', unread: true, minutesAgo: 2_880 },
    { id: 'badge-tiramisu', kind: 'reward', title: 'Tiramisu Connaisseur unlocked', body: 'Your dessert hunt earned a new badge.', targetType: 'recap', targetId: 'monthly', unread: false, minutesAgo: 4_320 },
    { id: 'weekend-pick', kind: 'system', title: 'Devon shared a weekend pick', body: 'A hidden café that matches your taste is waiting.', targetType: 'profile', targetId: 'discover-devon', unread: false, minutesAgo: 5_760 },
  ] as const;
  const requestSeeds = [
    { id: 'weekend-foodies-invite', kind: 'group', title: 'Weekend Foodies', body: 'Kristin invited you to join the group.', senderName: 'Kristin Watson', targetId: 'weekend-foodies' },
    { id: 'friday-dinner-invite', kind: 'activity', title: 'Friday night dinner', body: 'Wade invited you to a shared activity.', senderName: 'Wade Warren', targetId: 'seed-friday-dinner' },
  ] as const;

  await db.collection('groups').doc('weekend-foodies').set({
    name: 'Weekend Foodies',
    adminId: 'discover-kristin',
    memberIds: ['discover-kristin', 'discover-cameron', 'discover-wade'],
    status: 'active',
    source: 'seed',
    createdAt: Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1_000),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const activityParticipantIds = ['discover-wade', 'discover-kristin', ...localTestProfileIds];
  const activityStatuses = Object.fromEntries(activityParticipantIds.map((profileId) => [
    profileId,
    profileId === 'discover-wade' || profileId === 'discover-kristin' ? 'accepted' : 'pending',
  ]));
  const activityStartsAt = Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1_000);
  const activityCreatedAt = Timestamp.fromMillis(Date.now() - 3 * 60 * 60 * 1_000);
  const activityLastMessageAt = Timestamp.fromMillis(Date.now() - 42 * 60 * 1_000);
  await db.collection('activities').doc('seed-friday-dinner').set({
    organizerId: 'discover-wade',
    participantIds: activityParticipantIds,
    invitationStatuses: activityStatuses,
    venueId: 'morimoto',
    venueName: venuesById.get('morimoto')?.name ?? 'Wasabi by Morimoto',
    imageUrl: venueMedia.sushi,
    startsAt: activityStartsAt,
    status: 'active',
    source: 'seed',
    createdAt: activityCreatedAt,
    updatedAt: activityLastMessageAt,
  }, { merge: true });
  await db.collection('conversations').doc('seed-friday-dinner').set({
    kind: 'activity',
    activityId: 'seed-friday-dinner',
    organizerId: 'discover-wade',
    title: 'Friday night dinner',
    imageUrl: venueMedia.sushi,
    participantIds: activityParticipantIds,
    invitationStatuses: activityStatuses,
    unreadCounts: Object.fromEntries(activityParticipantIds.map((profileId) => [profileId, localTestProfileIds.includes(profileId) ? 2 : 0])),
    lastReadAt: {},
    lastMessage: { id: 'activity-message-3', senderId: 'discover-wade', text: 'I booked the counter for 8:00. See you Friday!', createdAt: activityLastMessageAt },
    messageCount: 3,
    status: 'active',
    source: 'seed',
    createdAt: activityCreatedAt,
    updatedAt: activityLastMessageAt,
  }, { merge: true });
  const activityMessages = [
    { id: 'activity-message-1', senderId: 'discover-wade', text: 'How does sushi on Friday sound?', minutesAgo: 170 },
    { id: 'activity-message-2', senderId: 'discover-kristin', text: 'Perfect. I am in!', minutesAgo: 95 },
    { id: 'activity-message-3', senderId: 'discover-wade', text: 'I booked the counter for 8:00. See you Friday!', minutesAgo: 42 },
  ];
  await Promise.all(activityMessages.map((message) =>
    db.collection('conversations').doc('seed-friday-dinner').collection('messages').doc(message.id).set({
      conversationId: 'seed-friday-dinner',
      senderId: message.senderId,
      recipientId: '',
      recipientIds: activityParticipantIds.filter((profileId) => profileId !== message.senderId),
      text: message.text,
      type: 'text',
      status: 'sent',
      source: 'seed',
      createdAt: Timestamp.fromMillis(Date.now() - message.minutesAgo * 60_000),
    }, { merge: true }),
  ));

  const directConversationSeeds = [
    { peerId: 'discover-kristin', texts: ['That taco place was a great call.', 'Glad you liked it! Try the elote next time.', 'Saved it for Saturday 🌮'], hoursAgo: 1, unread: 1 },
    { peerId: 'discover-cameron', texts: ['Have you tried the new pasta menu?', 'Not yet — is the tagliolini still there?', 'Yes, and it is even better now.'], hoursAgo: 5, unread: 2 },
    { peerId: 'discover-wade', texts: ['The omakase photos look incredible.', 'It was worth every course.', 'Let us go again next month.'], hoursAgo: 28, unread: 0 },
  ];
  await Promise.all(localTestProfileIds.flatMap((profileId) => directConversationSeeds.flatMap((conversation) => {
    const conversationId = directConversationId(profileId, conversation.peerId);
    const participantIds = [profileId, conversation.peerId].sort();
    const messageTimes = conversation.texts.map((_, index) => Timestamp.fromMillis(
      Date.now() - conversation.hoursAgo * 60 * 60 * 1_000 - (conversation.texts.length - index - 1) * 18 * 60_000,
    ));
    const messages = conversation.texts.map((text, index) => {
      const senderId = index % 2 === 0 ? conversation.peerId : profileId;
      const recipientId = senderId === profileId ? conversation.peerId : profileId;
      return {
        id: `seed-message-${index + 1}`,
        senderId,
        recipientId,
        recipientIds: [recipientId],
        text,
        createdAt: messageTimes[index],
      };
    });
    const lastMessage = messages.at(-1);
    if (!lastMessage) throw new Error('Direct message fixture cannot be empty.');
    return [
      db.collection('conversations').doc(conversationId).set({
        kind: 'direct',
        participantIds,
        unreadCounts: { [profileId]: conversation.unread, [conversation.peerId]: 0 },
        lastReadAt: {},
        lastMessage: { id: lastMessage.id, senderId: lastMessage.senderId, text: lastMessage.text, createdAt: lastMessage.createdAt },
        messageCount: messages.length,
        status: 'active',
        source: 'seed',
        createdAt: messageTimes[0],
        updatedAt: lastMessage.createdAt,
      }, { merge: true }),
      ...messages.map((message) => db.collection('conversations').doc(conversationId).collection('messages').doc(message.id).set({
        conversationId,
        ...message,
        type: 'text',
        status: 'sent',
        source: 'seed',
      }, { merge: true })),
    ];
  })));

  await Promise.all(localTestProfileIds.flatMap((profileId) => {
    const ownReviewId = `seed-own-${stableSeedKey(profileId)}-1`;
    const authorName = String(localProfilesById.get(profileId)?.get('displayName') ?? 'Tastes tester');
    return [
      db.collection('reviews').doc(ownReviewId).collection('comments').doc('seed-kristin-comment').set({ authorId: 'discover-kristin', authorDisplayName: 'Kristin Watson', text: 'This convinced me to book the counter.', status: 'published', source: 'seed', createdAt: Timestamp.fromMillis(Date.now() - 70 * 60_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection('reviews').doc(ownReviewId).collection('comments').doc('seed-author-reply').set({ authorId: profileId, authorDisplayName: authorName, text: 'Do it — the chef makes the whole evening special.', status: 'published', source: 'seed', createdAt: Timestamp.fromMillis(Date.now() - 55 * 60_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection('reviews').doc(ownReviewId).collection('reactions').doc('discover-kristin').set({ userId: 'discover-kristin', reaction: 'like', source: 'seed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ];
  }));

  await Promise.all([
    db.collection('reports').doc('seed-pending-review-report').set({ reporterId: 'discover-kristin', reporterName: 'Kristin Watson', contentType: 'review', contentId: 'discover-review-demo-cafe', reviewId: 'discover-review-demo-cafe', reason: 'Spam', details: 'Seed fixture for moderation testing.', status: 'pending', source: 'seed', createdAt: Timestamp.fromMillis(Date.now() - 6 * 60 * 60 * 1_000) }, { merge: true }),
    db.collection('reports').doc('seed-pending-comment-report').set({ reporterId: 'discover-wade', reporterName: 'Wade Warren', contentType: 'comment', contentId: 'comment-1', reviewId: 'discover-review-gemini', reason: 'Inappropriate', details: 'Seed fixture for moderation testing.', status: 'pending', source: 'seed', createdAt: Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1_000) }, { merge: true }),
  ]);

  await Promise.all(localTestProfileIds.flatMap((profileId) => {
    const userRef = db.collection('users').doc(profileId);
    return [
      ...notificationSeeds.map((notification) => userRef.collection('notifications').doc(notification.id).set({
        ...notification,
        source: 'seed',
        createdAt: Timestamp.fromMillis(Date.now() - notification.minutesAgo * 60_000),
      }, { merge: true })),
      ...requestSeeds.map((request) => userRef.collection('requests').doc(request.id).set({
        ...request,
        status: 'pending',
        source: 'seed',
        createdAt: Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1_000),
      }, { merge: true })),
      ...followedUserIds.map((followerId) => userRef.collection('followers').doc(followerId).set({
        userId: followerId,
        source: 'seed',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true })),
    ];
  }));

  await Promise.all(localTestProfileIds.map(async (profileId) => {
    const [profileReviews, conversations, notifications, requests, folders, savedVenues] = await Promise.all([
      db.collection('reviews').where('authorId', '==', profileId).where('status', '==', 'published').get(),
      db.collection('conversations').where('participantIds', 'array-contains', profileId).where('status', '==', 'active').get(),
      db.collection('users').doc(profileId).collection('notifications').get(),
      db.collection('users').doc(profileId).collection('requests').where('status', '==', 'pending').get(),
      db.collection('users').doc(profileId).collection('folders').get(),
      db.collection('users').doc(profileId).collection('savedVenues').get(),
    ]);
    if (profileReviews.size < localReviewTemplates.length || conversations.size < directConversationSeeds.length + 1 || notifications.empty || requests.empty || folders.empty || savedVenues.empty) {
      throw new Error(`Seed verification failed for local profile ${profileId}.`);
    }
  }));

  console.log(
    `Seeded ${venues.length} venues, ${users.length} users, ${reviewSeeds.length} public reviews, ${localReviewTemplates.length} personal reviews, ${commentSeeds.length} public comments, ${directConversationSeeds.length} direct chats, 1 activity chat, notifications, requests, groups, reports, ${favouriteFolderSeeds.length} favourite folders, and ${savedVenueSeeds.length} saved venues per local profile in ${process.env.GCLOUD_PROJECT}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
