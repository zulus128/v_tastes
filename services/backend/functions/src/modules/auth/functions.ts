import {
  requestPhoneOtpInputSchema,
  verifyPhoneOtpInputSchema,
} from '@tastes/contracts';
import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';
import { createOtpProvider } from './otp-provider';

const RESEND_COOLDOWN_MS = 30_000;
const OTP_TTL_MS = 10 * 60_000;
const MAX_CHECK_ATTEMPTS = 5;

function challengeIdFor(phoneNumber: string): string {
  return createHash('sha256').update(phoneNumber).digest('hex');
}

function userIdFor(phoneNumber: string): string {
  return `phone_${createHash('sha256').update(phoneNumber).digest('base64url').slice(0, 40)}`;
}

function emulatorCustomToken(uid: string): string {
  const now = Math.floor(Date.now() / 1_000);
  const serviceAccount = 'firebase-adminsdk@demo-tastes.iam.gserviceaccount.com';
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  return [
    encode({ alg: 'none', typ: 'JWT' }),
    encode({
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      exp: now + 3_600,
      iat: now,
      iss: serviceAccount,
      sub: serviceAccount,
      uid,
    }),
    '',
  ].join('.');
}

async function createSignInToken(uid: string): Promise<string> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return emulatorCustomToken(uid);
  }

  return getAuth().createCustomToken(uid);
}

async function ensurePhoneUser(phoneNumber: string): Promise<{ uid: string; isNewUser: boolean }> {
  try {
    const existing = await getAuth().getUserByPhoneNumber(phoneNumber);
    return { uid: existing.uid, isNewUser: false };
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') {
      throw error;
    }
  }

  const user = await getAuth().createUser({
    uid: userIdFor(phoneNumber),
    phoneNumber,
  });
  return { uid: user.uid, isNewUser: true };
}

export const requestPhoneOtp = onCall(callableOptions, async (request) => {
  const input = parseInput(requestPhoneOtpInputSchema, request.data);
  const challengeId = challengeIdFor(input.phoneNumber);
  const challengeRef = db.collection('_otpChallenges').doc(challengeId);
  const now = Date.now();
  const existing = await challengeRef.get();
  const existingResendAt = existing.get('resendAvailableAt') as Timestamp | undefined;

  if (existing.exists && existingResendAt && existingResendAt.toMillis() > now) {
    throw new HttpsError('resource-exhausted', 'Please wait before requesting another code.', {
      reason: 'resend-too-soon',
      resendAvailableAt: existingResendAt.toDate().toISOString(),
    });
  }

  const provider = createOtpProvider();
  const verification = await provider.startVerification(input.phoneNumber);
  const resendAvailableAt = new Date(now + RESEND_COOLDOWN_MS);
  const expiresAt = new Date(now + OTP_TTL_MS);

  await challengeRef.set({
    phoneNumber: input.phoneNumber,
    providerReference: verification.providerReference,
    status: 'pending',
    failedAttempts: 0,
    resendAvailableAt: Timestamp.fromDate(resendAvailableAt),
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    challengeId,
    resendAvailableAt: resendAvailableAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...(verification.localCode ? { localCode: verification.localCode } : {}),
  };
});

export const verifyPhoneOtp = onCall(callableOptions, async (request) => {
  const input = parseInput(verifyPhoneOtpInputSchema, request.data);
  const challengeRef = db.collection('_otpChallenges').doc(input.challengeId);
  const challenge = await challengeRef.get();

  if (!challenge.exists) {
    throw new HttpsError('not-found', 'The verification request was not found.', {
      reason: 'challenge-not-found',
    });
  }

  const expiresAt = challenge.get('expiresAt') as Timestamp;
  if (expiresAt.toMillis() <= Date.now()) {
    await challengeRef.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
    throw new HttpsError('failed-precondition', 'The verification code has expired.', {
      reason: 'code-expired',
    });
  }

  const failedAttempts = Number(challenge.get('failedAttempts') ?? 0);
  if (failedAttempts >= MAX_CHECK_ATTEMPTS) {
    throw new HttpsError('resource-exhausted', 'Too many incorrect verification attempts.', {
      reason: 'max-attempts-reached',
    });
  }

  const phoneNumber = String(challenge.get('phoneNumber'));
  const status = String(challenge.get('status'));

  if (status !== 'verified') {
    const provider = createOtpProvider();
    const check = await provider.checkVerification({
      phoneNumber,
      code: input.code,
      providerReference: String(challenge.get('providerReference')),
    });

    if (check !== 'approved') {
      const nextAttemptCount = failedAttempts + 1;
      await challengeRef.update({
        failedAttempts: FieldValue.increment(1),
        status: nextAttemptCount >= MAX_CHECK_ATTEMPTS ? 'max-attempts-reached' : 'pending',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('invalid-argument', 'The verification code is incorrect.', {
        reason: 'incorrect-code',
        attemptsRemaining: Math.max(0, MAX_CHECK_ATTEMPTS - nextAttemptCount),
      });
    }

    await challengeRef.update({ status: 'verified', updatedAt: FieldValue.serverTimestamp() });
  }

  const { uid, isNewUser } = await ensurePhoneUser(phoneNumber);
  const customToken = await createSignInToken(uid);

  return { customToken, isNewUser };
});
