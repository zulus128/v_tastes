import { db } from '../shared/firebase';
import { rebuildTasteEvidence } from '../modules/taste-match/maintenance';

async function main() {
  if (!process.argv.includes('--apply')) {
    const count = await db.collection('reviews').count().get();
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        reviewCount: count.data().count,
        operation:
          'Build private dish-recommendation retrieval index; original reviews are unchanged.',
      }),
    );
    return;
  }
  let processed = 0;
  for (let i = 0; i < 1000; i++) {
    const result = await rebuildTasteEvidence(db, 300);
    processed += result.processed;
    if (result.complete) {
      console.log(JSON.stringify({ processed, complete: true }));
      return;
    }
  }
  throw new Error('Backfill paused at safety limit; rerun to resume.');
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
