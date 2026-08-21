import { FieldValue } from 'firebase-admin/firestore';
import { db, firestoreDatabaseId } from '../shared/firebase';
import { userSearchTokens } from '../modules/users/search';

async function main(): Promise<void> {
  const snapshot = await db.collection('users').get();
  let updated = 0;
  for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
    const batch = db.batch();
    for (const profile of snapshot.docs.slice(offset, offset + 400)) {
      batch.update(profile.ref, {
        searchTokens: userSearchTokens(
          String(profile.get('displayName') ?? ''),
          profile.get('username') ? String(profile.get('username')) : null,
        ),
        searchIndexUpdatedAt: FieldValue.serverTimestamp(),
      });
      updated += 1;
    }
    await batch.commit();
  }
  process.stdout.write(`Updated search index for ${updated} users in ${firestoreDatabaseId}.\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
