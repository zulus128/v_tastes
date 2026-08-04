import { createActivityInputSchema } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

const validInput = {
  idempotencyKey: 'activity-test-key-1234567890',
  memberIds: ['friend-1'],
  startsAt: '2026-08-05T18:30:00.000Z',
  venueId: 'venue-1',
};

describe('createActivityInputSchema', () => {
  it('accepts a valid activity', () => {
    expect(createActivityInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('requires at least one member', () => {
    expect(createActivityInputSchema.safeParse({ ...validInput, memberIds: [] }).success).toBe(false);
  });

  it('rejects duplicate members', () => {
    expect(createActivityInputSchema.safeParse({
      ...validInput,
      memberIds: ['friend-1', 'friend-1'],
    }).success).toBe(false);
  });

  it('requires an ISO datetime', () => {
    expect(createActivityInputSchema.safeParse({ ...validInput, startsAt: 'tomorrow' }).success).toBe(false);
  });
});
