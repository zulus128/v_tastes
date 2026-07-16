process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.GCLOUD_PROJECT ??= 'demo-tastes';

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}

async function main() {
  const db = getFirestore();
  const venues = [
    { id: 'morimoto', name: 'Wasabi by Morimoto', city: 'Istanbul', status: 'active' },
    { id: 'demo-cafe', name: 'Tastes Demo Cafe', city: 'Istanbul', status: 'active' },
    { id: 'hidden-place', name: 'Hidden Test Venue', city: 'Istanbul', status: 'hidden' },
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

  console.log(`Seeded ${venues.length} venues into ${process.env.GCLOUD_PROJECT}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
