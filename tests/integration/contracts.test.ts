import {
  createReviewInputSchema,
  createUserProfileInputSchema,
  reactToReviewInputSchema,
  requestPhoneOtpInputSchema,
  verifyPhoneOtpInputSchema,
} from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('public API contracts', () => {
  it('accepts a valid review', () => {
    expect(createReviewInputSchema.parse({
      venueId: 'demo-cafe',
      rating: 5,
      text: 'Great place',
    })).toEqual({ venueId: 'demo-cafe', rating: 5, text: 'Great place' });
  });

  it('rejects protected or malformed input', () => {
    expect(createReviewInputSchema.safeParse({
      authorId: 'someone-else',
      venueId: 'demo-cafe',
      rating: 100,
      text: '',
    }).success).toBe(false);
  });

  it('normalizes profile and reaction commands', () => {
    expect(createUserProfileInputSchema.parse({ displayName: '  Demo User  ' }).displayName).toBe('Demo User');
    expect(reactToReviewInputSchema.parse({ reviewId: 'review-1', reaction: 'like' })).toEqual({
      reviewId: 'review-1',
      reaction: 'like',
    });
  });

  it('accepts an E.164 phone number and a 4-digit OTP code', () => {
    expect(requestPhoneOtpInputSchema.parse({ phoneNumber: ' +905551234567 ' })).toEqual({
      phoneNumber: '+905551234567',
    });
    expect(verifyPhoneOtpInputSchema.parse({
      challengeId: 'challenge-1234567890',
      code: '1332',
    })).toEqual({ challengeId: 'challenge-1234567890', code: '1332' });
  });

  it('rejects local phone formats and OTP codes of the wrong length', () => {
    expect(requestPhoneOtpInputSchema.safeParse({ phoneNumber: '05551234567' }).success).toBe(false);
    expect(verifyPhoneOtpInputSchema.safeParse({
      challengeId: 'challenge-1234567890',
      code: '123456',
    }).success).toBe(false);
  });
});
