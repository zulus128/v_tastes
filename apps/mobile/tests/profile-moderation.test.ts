import { reportUserInputSchema } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('profile moderation contract', () => {
  it('accepts a reason and optional details for another user', () => {
    expect(
      reportUserInputSchema.parse({
        idempotencyKey: 'profile-report-12345678',
        targetUserId: 'discover-kristin',
        reason: 'Harassment',
        details: 'Repeated unwanted contact.',
      }),
    ).toEqual({
      idempotencyKey: 'profile-report-12345678',
      targetUserId: 'discover-kristin',
      reason: 'Harassment',
      details: 'Repeated unwanted contact.',
    });
  });

  it('rejects invalid report reasons and oversized details', () => {
    expect(() =>
      reportUserInputSchema.parse({
        idempotencyKey: 'profile-report-12345678',
        targetUserId: 'discover-kristin',
        reason: 'Anything',
      }),
    ).toThrow();
    expect(() =>
      reportUserInputSchema.parse({
        idempotencyKey: 'profile-report-12345678',
        targetUserId: 'discover-kristin',
        reason: 'Something else',
        details: 'x'.repeat(301),
      }),
    ).toThrow();
  });
});
