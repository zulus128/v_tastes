process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.GCLOUD_PROJECT ??= 'demo-tastes';

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}

async function main() {
  const db = getFirestore();
  const venues = [
    {
      id: 'morimoto',
      name: 'Wasabi by Morimoto',
      city: 'Istanbul',
      address: 'Zorlu Center, Beşiktaş',
      category: 'Japanese',
      imageKey: 'sushi',
      photoKeys: ['sushi', 'restaurant', 'lounge'],
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
      imageKey: 'restaurant',
      photoKeys: ['restaurant', 'lounge', 'restaurant'],
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
      imageKey: 'lounge',
      photoKeys: ['lounge', 'restaurant', 'lounge'],
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
      imageKey: 'cafe',
      photoKeys: ['cafe', 'restaurant', 'cafe'],
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
      imageKey: 'tacos',
      photoKeys: ['tacos', 'restaurant', 'tacos'],
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
      imageKey: 'cafe',
      photoKeys: ['cafe', 'lounge', 'cafe'],
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
      imageKey: 'restaurant',
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
      avatarKey: 'kristin',
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
      avatarKey: 'cameron',
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
      avatarKey: 'wade',
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
      avatarKey: 'cameron',
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
      avatarKey: 'kristin',
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
      avatarKey: 'wade',
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
      avatarKey: 'kristin',
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
      avatarKey: 'cameron',
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
          photoUrl: null,
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
    { id: 'comment-1', reviewId: 'discover-review-gemini', authorId: 'discover-kristin', text: 'Adding this to my list.' },
    { id: 'comment-2', reviewId: 'discover-review-gemini', authorId: 'discover-wade', text: 'The Tuesday special is excellent.' },
    { id: 'comment-3', reviewId: 'discover-review-morimoto', authorId: 'discover-cameron', text: 'Counter seats are the move.' },
  ];
  await Promise.all(commentSeeds.map((comment, index) => {
    const author = usersById.get(comment.authorId);
    if (!author) throw new Error(`Invalid discover comment fixture ${comment.id}.`);
    return db.collection('reviews').doc(comment.reviewId).collection('comments').doc(comment.id).set({
      authorId: comment.authorId,
      authorDisplayName: author.displayName,
      text: comment.text,
      status: 'published',
      source: 'seed',
      createdAt: Timestamp.fromMillis(Date.now() - (index + 1) * 30 * 60 * 1_000),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));

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

  console.log(
    `Seeded ${venues.length} venues, ${users.length} users, ${reviewSeeds.length} reviews, ${commentSeeds.length} comments, ${favouriteFolderSeeds.length} favourite folders, and ${savedVenueSeeds.length} saved venues per local profile in ${process.env.GCLOUD_PROJECT}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
