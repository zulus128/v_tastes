import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { normalizeUsername, usernameClaimId } from '../shared/user-data';

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });

const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID ??
  (process.env.FIRESTORE_EMULATOR_HOST ? '(default)' : 'tastes-eu');
const db = firestoreDatabaseId === '(default)' ? getFirestore() : getFirestore(firestoreDatabaseId);
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const profiles = await db.collection('users').get();
  const usernameOwners = new Map<string, string>();
  const collisions: string[] = [];
  let piiProfiles = 0;

  for (const profile of profiles.docs) {
    const username = profile.get('username')
      ? String(profile.get('username')).trim().toLocaleLowerCase('en-US')
      : null;
    if (username) {
      const owner = usernameOwners.get(username);
      if (owner && owner !== profile.id) collisions.push(`${username}: ${owner}, ${profile.id}`);
      else usernameOwners.set(username, profile.id);
    }
    if (profile.get('email') || profile.get('phoneNumber')) piiProfiles += 1;
  }

  process.stdout.write(`Scanned ${profiles.size} profiles; ${piiProfiles} contain PII; ${collisions.length} username collisions.\n`);
  if (collisions.length > 0) {
    process.stdout.write(`Resolve duplicate usernames before applying:\n${collisions.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    process.stdout.write('Dry run only. Re-run with --apply to migrate PII and create username claims.\n');
    return;
  }
  for (const scannedProfile of profiles.docs) {
    // The initial scan is only for validation/progress. Re-read each profile
    // in a transaction so a concurrent username change cannot overwrite a
    // newer claim with stale snapshot data.
    await db.runTransaction(async (transaction) => {
      const profile = await transaction.get(scannedProfile.ref);
      if (!profile.exists) return;
      const email = profile.get('email') ?? null;
      const phoneNumber = profile.get('phoneNumber') ?? null;
      if (email || phoneNumber) {
        transaction.set(db.collection('_userPrivate').doc(profile.id), {
          uid: profile.id, email, phoneNumber, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.update(profile.ref, { email: FieldValue.delete(), phoneNumber: FieldValue.delete() });
      }
      const username = profile.get('username') ? normalizeUsername(String(profile.get('username'))) : null;
      if (!username) return;
      const claimRef = db.collection('_usernames').doc(usernameClaimId(username));
      const claim = await transaction.get(claimRef);
      // A live profile mutation owns a conflicting claim. Never replace it;
      // the migration can be safely re-run for this legacy profile later.
      if (claim.exists && claim.get('uid') !== profile.id) return;
      transaction.set(claimRef, { uid: profile.id, username, updatedAt: FieldValue.serverTimestamp() });
      if (profile.get('username') !== username) transaction.update(profile.ref, { username });
    });
  }
  process.stdout.write(`Migrated ${profiles.size} profiles.\n`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
