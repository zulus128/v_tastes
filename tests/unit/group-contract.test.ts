import { createGroupInputSchema } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('createGroupInputSchema', () => {
  it('allows a group with one invited member', () => {
    expect(createGroupInputSchema.safeParse({
      name: 'Dinner club',
      memberIds: ['friend-1'],
    }).success).toBe(true);
  });

  it('requires at least one invited member', () => {
    expect(createGroupInputSchema.safeParse({
      name: 'Dinner club',
      memberIds: [],
    }).success).toBe(false);
  });
});
