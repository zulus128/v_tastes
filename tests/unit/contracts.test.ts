import {
  completeOnboardingInputSchema,
  createConversationInputSchema,
  createReviewInputSchema,
  createUserProfileInputSchema,
  getCommentsInputSchema,
  getFeedInputSchema,
  getLeaderboardInputSchema,
  getMessagesInputSchema,
  listConversationsInputSchema,
  markConversationReadInputSchema,
  reactToReviewInputSchema,
  registerPushTokenInputSchema,
  requestPhoneOtpInputSchema,
  sendMessageInputSchema,
  verifyPhoneOtpInputSchema,
} from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('public API contracts', () => {
  it('accepts a valid review', () => {
    expect(createReviewInputSchema.parse({
      idempotencyKey: 'review-command-0001',
      venueId: 'demo-cafe',
      rating: 5,
      text: 'Great place',
      tags: ['casual', 'date-night'],
      dishReviews: [{
        id: 'dish-command-0001',
        title: 'Soup dumplings',
        rating: 4.5,
        photoPath: 'review-images/user-1/review-command-0001/dish-command-0001',
      }],
    })).toEqual({
      idempotencyKey: 'review-command-0001',
      venueId: 'demo-cafe',
      rating: 5,
      text: 'Great place',
      tags: ['casual', 'date-night'],
      dishReviews: [{
        id: 'dish-command-0001',
        title: 'Soup dumplings',
        rating: 4.5,
        photoPath: 'review-images/user-1/review-command-0001/dish-command-0001',
      }],
    });
  });

  it('rejects protected or malformed input', () => {
    expect(createReviewInputSchema.safeParse({
      authorId: 'someone-else',
      venueId: 'demo-cafe',
      rating: 100,
      text: '',
    }).success).toBe(false);
    expect(createReviewInputSchema.safeParse({
      idempotencyKey: 'review-command-0001',
      venueId: 'demo-cafe',
      rating: 5,
      text: 'Great place',
      dishReviews: [{ id: 'dish-1', title: '', rating: 6, photoPath: 'someone-else/photo.jpg' }],
    }).success).toBe(false);
  });

  it('normalizes profile and reaction commands', () => {
    expect(createUserProfileInputSchema.parse({ displayName: '  Demo User  ' }).displayName).toBe('Demo User');
    expect(reactToReviewInputSchema.parse({
      idempotencyKey: 'reaction-command-001',
      reviewId: 'review-1',
      reaction: 'like',
    })).toEqual({
      idempotencyKey: 'reaction-command-001',
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

  it('normalizes and bounds cursor pagination inputs', () => {
    expect(getFeedInputSchema.parse({ scope: 'friends' })).toEqual({
      scope: 'friends',
      limit: 20,
    });
    expect(getCommentsInputSchema.parse({ reviewId: 'review-1', cursor: 'cursor', limit: 50 })).toEqual({
      reviewId: 'review-1',
      cursor: 'cursor',
      limit: 50,
    });
    expect(getLeaderboardInputSchema.safeParse({ period: 'month', limit: 51 }).success).toBe(false);
    expect(completeOnboardingInputSchema.safeParse({ version: 0 }).success).toBe(false);
  });

  it('validates messaging commands and Expo push tokens', () => {
    expect(createConversationInputSchema.parse({ targetUserId: 'user-2' })).toEqual({ targetUserId: 'user-2' });
    expect(sendMessageInputSchema.parse({
      conversationId: 'conversation-1',
      idempotencyKey: 'message-command-001',
      text: '  Hello  ',
    })).toEqual({
      conversationId: 'conversation-1',
      idempotencyKey: 'message-command-001',
      text: 'Hello',
    });
    expect(getMessagesInputSchema.parse({ conversationId: 'conversation-1' })).toEqual({
      conversationId: 'conversation-1',
      limit: 20,
    });
    expect(listConversationsInputSchema.parse({ limit: 50 })).toEqual({ limit: 50 });
    expect(markConversationReadInputSchema.parse({
      conversationId: 'conversation-1',
      throughMessageId: 'message-1',
    })).toEqual({ conversationId: 'conversation-1', throughMessageId: 'message-1' });
    expect(registerPushTokenInputSchema.safeParse({
      token: 'ExpoPushToken[abcdefghijklmnopqrstuv]',
      platform: 'android',
    }).success).toBe(true);
    expect(registerPushTokenInputSchema.safeParse({
      token: 'not-a-push-token',
      platform: 'android',
    }).success).toBe(false);
  });
});
