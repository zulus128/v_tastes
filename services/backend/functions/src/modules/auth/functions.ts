import {
  requestPhoneOtpInputSchema,
  verifyPhoneOtpInputSchema,
} from '@tastes/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firebase';
import { callableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';
import { createOtpProvider } from './otp-provider';

const RESEND_COOLDOWN_MS = 30_000;
const OTP_TTL_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;
const MAX_PHONE_REQUESTS_PER_WINDOW = 5;
const MAX_IP_REQUESTS_PER_WINDOW = 20;
const MAX_CHECK_ATTEMPTS = 5;

interface RateLimitState {
  count: number;
  windowStartedAt: Timestamp;
  nextAllowedAt?: Timestamp;
}

function rateLimitId(scope: 'phone' | 'ip', value: string): string {
  return createHash('sha256').update(`${scope}:${value}`).digest('hex');
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

  try {
    const user = await getAuth().createUser({
      uid: userIdFor(phoneNumber),
      phoneNumber,
    });
    return { uid: user.uid, isNewUser: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/uid-already-exists' && code !== 'auth/phone-number-already-exists') {
      throw error;
    }
    const existing = await getAuth().getUserByPhoneNumber(phoneNumber);
    return { uid: existing.uid, isNewUser: false };
  }
}

function nextRateLimitState(
  state: RateLimitState | undefined,
  now: number,
  maxRequests: number,
  cooldownMs = 0,
): { count: number; windowStartedAt: Timestamp; nextAllowedAt?: Timestamp } {
  if (state?.nextAllowedAt && state.nextAllowedAt.toMillis() > now) {
    throw new HttpsError('resource-exhausted', 'Please wait before requesting another code.', {
      reason: 'resend-too-soon',
      resendAvailableAt: state.nextAllowedAt.toDate().toISOString(),
    });
  }

  const currentWindowStartedAt = state?.windowStartedAt?.toMillis();
  const inCurrentWindow = currentWindowStartedAt !== undefined
    && currentWindowStartedAt + RATE_LIMIT_WINDOW_MS > now;
  const count = inCurrentWindow ? state?.count ?? 0 : 0;

  if (count >= maxRequests) {
    throw new HttpsError('resource-exhausted', 'Too many verification requests. Try again later.', {
      reason: 'rate-limit-reached',
      retryAt: new Date((currentWindowStartedAt ?? now) + RATE_LIMIT_WINDOW_MS).toISOString(),
    });
  }

  return {
    count: count + 1,
    windowStartedAt: Timestamp.fromMillis(inCurrentWindow ? currentWindowStartedAt : now),
    ...(cooldownMs > 0 ? { nextAllowedAt: Timestamp.fromMillis(now + cooldownMs) } : {}),
  };
}

async function reserveOtpRequest(phoneNumber: string, ipAddress: string, now: number): Promise<void> {
  const phoneRef = db.collection('_otpRateLimits').doc(rateLimitId('phone', phoneNumber));
  const ipRef = db.collection('_otpRateLimits').doc(rateLimitId('ip', ipAddress));

  await db.runTransaction(async (transaction) => {
    const [phoneSnapshot, ipSnapshot] = await Promise.all([
      transaction.get(phoneRef),
      transaction.get(ipRef),
    ]);
    const phoneState = phoneSnapshot.exists ? phoneSnapshot.data() as RateLimitState : undefined;
    const ipState = ipSnapshot.exists ? ipSnapshot.data() as RateLimitState : undefined;
    const expiresAt = Timestamp.fromMillis(now + RATE_LIMIT_RETENTION_MS);

    transaction.set(phoneRef, {
      ...nextRateLimitState(phoneState, now, MAX_PHONE_REQUESTS_PER_WINDOW, RESEND_COOLDOWN_MS),
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(ipRef, {
      ...nextRateLimitState(ipState, now, MAX_IP_REQUESTS_PER_WINDOW),
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export const requestPhoneOtp = onCall(callableOptions, async (request) => {
  const input = parseInput(requestPhoneOtpInputSchema, request.data);
  const challengeRef = db.collection('_otpChallenges').doc();
  const now = Date.now();
  const ipAddress = request.rawRequest.ip || 'unknown';

  await reserveOtpRequest(input.phoneNumber, ipAddress, now);

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
    challengeId: challengeRef.id,
    resendAvailableAt: resendAvailableAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...(verification.localCode ? { localCode: verification.localCode } : {}),
  };
});

export const verifyPhoneOtp = onCall(callableOptions, async (request) => {
  const input = parseInput(verifyPhoneOtpInputSchema, request.data);
  const challengeRef = db.collection('_otpChallenges').doc(input.challengeId);
  const verificationId = randomUUID();

  const challengeData = await db.runTransaction(async (transaction) => {
    const challenge = await transaction.get(challengeRef);

    if (!challenge.exists) {
      throw new HttpsError('not-found', 'The verification request was not found.', {
        reason: 'challenge-not-found',
      });
    }

    const expiresAt = challenge.get('expiresAt') as Timestamp;
    if (expiresAt.toMillis() <= Date.now()) {
      transaction.update(challengeRef, {
        status: 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'The verification code has expired.', {
        reason: 'code-expired',
      });
    }

    const failedAttempts = Number(challenge.get('failedAttempts') ?? 0);
    if (failedAttempts >= MAX_CHECK_ATTEMPTS || challenge.get('status') === 'max-attempts-reached') {
      throw new HttpsError('resource-exhausted', 'Too many incorrect verification attempts.', {
        reason: 'max-attempts-reached',
      });
    }

    if (challenge.get('status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'This verification request is already being processed.', {
        reason: 'verification-in-progress',
      });
    }

    transaction.update(challengeRef, {
      status: 'verifying',
      verificationId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      phoneNumber: String(challenge.get('phoneNumber')),
      providerReference: String(challenge.get('providerReference')),
    };
  });

  const provider = createOtpProvider();
  let check: Awaited<ReturnType<typeof provider.checkVerification>>;
  try {
    check = await provider.checkVerification({
      ...challengeData,
      code: input.code,
    });
  } catch (error) {
    await challengeRef.update({
      status: 'pending',
      verificationId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }

  if (check !== 'approved') {
    const attemptsRemaining = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(challengeRef);
      if (!current.exists || current.get('verificationId') !== verificationId) {
        throw new HttpsError('failed-precondition', 'The verification request changed while processing.');
      }

      const nextAttemptCount = Number(current.get('failedAttempts') ?? 0) + 1;
      transaction.update(challengeRef, {
        failedAttempts: nextAttemptCount,
        status: nextAttemptCount >= MAX_CHECK_ATTEMPTS ? 'max-attempts-reached' : 'pending',
        verificationId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return Math.max(0, MAX_CHECK_ATTEMPTS - nextAttemptCount);
    });

    throw new HttpsError('invalid-argument', 'The verification code is incorrect.', {
      reason: 'incorrect-code',
      attemptsRemaining,
    });
  }

  const { uid, isNewUser } = await ensurePhoneUser(challengeData.phoneNumber);
  const customToken = await createSignInToken(uid);

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(challengeRef);
    if (!current.exists || current.get('verificationId') !== verificationId) {
      throw new HttpsError('failed-precondition', 'The verification request changed while processing.');
    }
    transaction.delete(challengeRef);
  });

  return { customToken, isNewUser };
});
