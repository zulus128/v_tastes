import { db, firestoreDatabaseId } from '../shared/firebase';
import { calculateDiscoveryShadow } from '../modules/discover/schedules';

async function main() {
  if (
    process.env.GCLOUD_PROJECT !== 'tastes-934e6' ||
    firestoreDatabaseId !== 'tastes-eu' ||
    process.env.FIRESTORE_EMULATOR_HOST
  )
    throw new Error(
      'Set the explicit production project and database before running the shadow calculation.',
    );
  const configuration = await db
    .collection('configuration')
    .doc('discovery')
    .get();
  if (configuration.get('mode') === 'enabled')
    throw new Error('This command is only for shadow-mode validation.');
  console.log(JSON.stringify(await calculateDiscoveryShadow()));
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
