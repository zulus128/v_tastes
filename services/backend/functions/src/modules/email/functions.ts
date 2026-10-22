import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { requireUserId } from '../../shared/auth';
import {
  renderTransactionalEmail,
  sendTransactionalEmail,
  type TransactionalEmailKind,
} from '../../shared/email';
import { db, firestoreDatabaseId } from '../../shared/firebase';
import { enforceRateLimit } from '../../shared/mutations';
import { callableOptions } from '../../shared/options';

const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
const emailFrom = defineString('TRANSACTIONAL_EMAIL_FROM', {
  default: 'hello@tastesapp.com',
});
const emailSecrets =
  process.env.FUNCTIONS_EMULATOR === 'true' ? [] : [sendgridApiKey];

const requestSchema = z.object({
  kind: z.enum(['email-verification', 'password-reset']),
});

async function sendForUser(
  uid: string,
  kind: TransactionalEmailKind,
  eventId?: string,
) {
  const user = await getAuth().getUser(uid);
  if (!user.email) {
    throw new HttpsError(
      'failed-precondition',
      'An email address is required for this action.',
    );
  }
  const actionUrl =
    kind === 'email-verification'
      ? await getAuth().generateEmailVerificationLink(user.email)
      : kind === 'password-reset' || kind === 'password-changed'
        ? await getAuth().generatePasswordResetLink(user.email)
        : undefined;
  await sendTransactionalEmail({
    apiKey: sendgridApiKey.value(),
    from: emailFrom.value(),
    message: renderTransactionalEmail(kind, {
      ...(actionUrl ? { actionUrl } : {}),
      ...(user.displayName ? { displayName: user.displayName } : {}),
    }),
    to: user.email,
    ...(eventId ? { eventId } : {}),
  });
}

export const requestAccountEmail = onCall(
  { ...callableOptions, secrets: emailSecrets },
  async (request): Promise<{ sent: true }> => {
    const uid = requireUserId(request);
    const parsed = requestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Unsupported email type.');
    }
    await db.runTransaction(async (transaction) => {
      await enforceRateLimit(
        transaction,
        uid,
        `transactional-email-${parsed.data.kind}`,
        3,
        60 * 60 * 1000,
      );
    });
    await sendForUser(uid, parsed.data.kind);
    return { sent: true };
  },
);

export const sendWelcomeEmail = onDocumentCreated(
  {
    database: firestoreDatabaseId,
    document: 'users/{uid}',
    region: 'europe-west1',
    secrets: emailSecrets,
  },
  async (event) => {
    // User documents are created extensively by the emulator test suites. Avoid
    // contacting Auth/Secret Manager (and sending real mail) for fixture users.
    if (process.env.FUNCTIONS_EMULATOR === 'true') return;

    const delivery = db.collection('_emailDeliveries').doc(event.id);
    if ((await delivery.get()).exists) return;
    await sendForUser(event.params.uid, 'welcome', event.id);
    await delivery.set({
      kind: 'welcome',
      uid: event.params.uid,
      sentAt: FieldValue.serverTimestamp(),
    });
  },
);
