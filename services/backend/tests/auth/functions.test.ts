import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = process.env.TEST_PROJECT_ID ?? 'demo-tastes';
const FUNCTIONS_HOST = process.env.TEST_FUNCTIONS_HOST ?? '127.0.0.1:5001';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_URL = `http://${FUNCTIONS_HOST}/${PROJECT_ID}/europe-west1`;
const FIRESTORE_EMULATOR_URL = `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_EMULATOR_URL = `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`;

interface CallableFailure {
  details?: Record<string, unknown>;
  message: string;
  status?: string;
}

let phoneSequence = 0;

function uniquePhone(): string {
  phoneSequence += 1;
  return `+90555${String(Date.now() + phoneSequence).slice(-7)}`;
}

function rateLimitId(phoneNumber: string): string {
  return createHash('sha256').update(`phone:${phoneNumber}`).digest('hex');
}

async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json() as { result?: T; error?: CallableFailure };

  if (!response.ok || payload.error) {
    throw payload.error ?? new Error(`Callable ${name} failed with HTTP ${response.status}`);
  }
  return payload.result as T;
}

async function expectReason(promise: Promise<unknown>, reason: string): Promise<CallableFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = error as CallableFailure;
    expect(failure.details?.reason).toBe(reason);
    return failure;
  }
  throw new Error(`Expected callable to fail with reason ${reason}`);
}

async function requestOtp(phoneNumber: string) {
  return callFunction<{
    challengeId: string;
    expiresAt: string;
    localCode: string;
    resendAvailableAt: string;
  }>('requestPhoneOtp', { phoneNumber });
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
});

beforeEach(async () => {
  await Promise.all([
    fetch(FIRESTORE_EMULATOR_URL, { method: 'DELETE' }),
    fetch(AUTH_EMULATOR_URL, { method: 'DELETE' }),
  ]);
});

describe('phone OTP callables', () => {
  it('uses unpredictable, independent challenges and enforces resend cooldown', async () => {
    const phoneNumber = uniquePhone();
    const first = await requestOtp(phoneNumber);

    expect(first.challengeId).not.toBe(createHash('sha256').update(phoneNumber).digest('hex'));
    await expectReason(requestOtp(phoneNumber), 'resend-too-soon');

    await getFirestore().collection('_otpRateLimits').doc(rateLimitId(phoneNumber)).update({
      nextAllowedAt: Timestamp.fromMillis(Date.now() - 1),
    });
    const second = await requestOtp(phoneNumber);
    expect(second.challengeId).not.toBe(first.challengeId);
  });

  it('rate-limits repeated sends to one phone number', async () => {
    const phoneNumber = uniquePhone();

    for (let request = 1; request <= 5; request += 1) {
      await requestOtp(phoneNumber);
      await getFirestore().collection('_otpRateLimits').doc(rateLimitId(phoneNumber)).update({
        nextAllowedAt: Timestamp.fromMillis(Date.now() - 1),
      });
    }

    await expectReason(requestOtp(phoneNumber), 'rate-limit-reached');
  });

  it('consumes a challenge after a successful verification and rejects replay', async () => {
    const challenge = await requestOtp(uniquePhone());
    const verified = await callFunction<{ customToken: string; isNewUser: boolean }>('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: challenge.localCode,
    });

    expect(verified.customToken).toBeTruthy();
    expect(verified.isNewUser).toBe(true);
    await expectReason(callFunction('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: '0000',
    }), 'challenge-not-found');
  });

  it('rejects expired challenges', async () => {
    const challenge = await requestOtp(uniquePhone());
    await getFirestore().collection('_otpChallenges').doc(challenge.challengeId).update({
      expiresAt: Timestamp.fromMillis(Date.now() - 1),
    });

    await expectReason(callFunction('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: challenge.localCode,
    }), 'code-expired');
  });

  it('locks a challenge after five incorrect attempts', async () => {
    const challenge = await requestOtp(uniquePhone());

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failure = await expectReason(callFunction('verifyPhoneOtp', {
        challengeId: challenge.challengeId,
        code: '0000',
      }), 'incorrect-code');
      expect(failure.details?.attemptsRemaining).toBe(5 - attempt);
    }

    await expectReason(callFunction('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: challenge.localCode,
    }), 'max-attempts-reached');
  });

  it('serializes concurrent checks so they cannot bypass the attempt counter', async () => {
    const challenge = await requestOtp(uniquePhone());
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => callFunction('verifyPhoneOtp', {
      challengeId: challenge.challengeId,
      code: '0000',
    })));
    const reasons = results.map((result) => result.status === 'rejected'
      ? (result.reason as CallableFailure).details?.reason
      : 'unexpected-success');
    const snapshot = await getFirestore().collection('_otpChallenges').doc(challenge.challengeId).get();
    const incorrectChecks = reasons.filter((reason) => reason === 'incorrect-code').length;

    expect(reasons).toContain('incorrect-code');
    expect(reasons.every((reason) => reason === 'incorrect-code' || reason === 'verification-in-progress')).toBe(true);
    expect(snapshot.get('failedAttempts')).toBe(incorrectChecks);
    expect(incorrectChecks).toBeLessThanOrEqual(5);
  });
});
