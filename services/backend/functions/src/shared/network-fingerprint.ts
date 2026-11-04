import { createHmac, randomBytes } from 'node:crypto';
import { db } from './firebase';

/** Private HMAC, never a raw IP or a public/dictionary-reversible IP digest. */
export async function networkFingerprint(
  ip: string | undefined,
): Promise<string | null> {
  if (!ip || ip === 'unknown') return null;
  const ref = db.collection('_riskConfig').doc('network');
  const key = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (typeof current.get('hmacKey') === 'string')
      return String(current.get('hmacKey'));
    const generated = randomBytes(32).toString('base64url');
    transaction.set(ref, { hmacKey: generated });
    return generated;
  });
  return createHmac('sha256', key).update(ip.trim()).digest('hex');
}
