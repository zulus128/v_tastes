import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './firebase';

/** Old links remain usable after a venue merge; malformed chains fail closed. */
export async function resolveVenue(venueId: string) {
  const visited = new Set<string>();
  for (let depth = 0; depth < 10; depth += 1) {
    if (visited.has(venueId)) break;
    visited.add(venueId);
    const venue = await db.collection('venues').doc(venueId).get();
    if (!venue.exists) break;
    if (venue.get('status') === 'active') return venue;
    const next: unknown = venue.get('mergedInto');
    if (
      venue.get('status') !== 'merged' ||
      typeof next !== 'string' ||
      !next ||
      next.includes('/')
    )
      break;
    venueId = next;
  }
  throw new HttpsError('not-found', 'The place was not found.');
}
