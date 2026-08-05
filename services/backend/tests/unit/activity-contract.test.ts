import {
  createActivityInputSchema,
  respondToActivityInvitationInputSchema,
} from '@tastes/contracts';
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

describe('respondToActivityInvitationInputSchema', () => {
  it.each(['accepted', 'declined'] as const)('accepts the %s response', (response) => {
    expect(respondToActivityInvitationInputSchema.safeParse({
      activityId: 'activity-1',
      response,
    }).success).toBe(true);
  });

  it('rejects unsupported invitation responses', () => {
    expect(respondToActivityInvitationInputSchema.safeParse({
      activityId: 'activity-1',
      response: 'maybe',
    }).success).toBe(false);
  });
});
