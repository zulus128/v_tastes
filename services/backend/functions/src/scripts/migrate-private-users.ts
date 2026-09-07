import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });

const db = getFirestore();
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
  for (let offset = 0; offset < profiles.docs.length; offset += 200) {
    const batch = db.batch();
    for (const profile of profiles.docs.slice(offset, offset + 200)) {
      const email = profile.get('email') ?? null;
      const phoneNumber = profile.get('phoneNumber') ?? null;
      if (email || phoneNumber) {
        batch.set(db.collection('_userPrivate').doc(profile.id), {
          uid: profile.id, email, phoneNumber, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.update(profile.ref, { email: FieldValue.delete(), phoneNumber: FieldValue.delete() });
      }
      const username = profile.get('username')
        ? String(profile.get('username')).trim().toLocaleLowerCase('en-US')
        : null;
      if (username) {
        batch.set(db.collection('_usernames').doc(username), {
          uid: profile.id, username, updatedAt: FieldValue.serverTimestamp(),
        });
        if (profile.get('username') !== username) batch.update(profile.ref, { username });
      }
    }
    await batch.commit();
  }
  process.stdout.write(`Migrated ${profiles.size} profiles.\n`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
