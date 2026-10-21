import {
  createGroupInputSchema,
  updateGroupInputSchema,
} from '@tastes/contracts';
import { describe, expect, it } from 'vitest';

describe('createGroupInputSchema', () => {
  it('allows a group with one invited member', () => {
    expect(
      createGroupInputSchema.safeParse({
        name: 'Dinner club',
        memberIds: ['friend-1'],
      }).success,
    ).toBe(true);
  });

  it('requires at least one invited member', () => {
    expect(
      createGroupInputSchema.safeParse({
        name: 'Dinner club',
        memberIds: [],
      }).success,
    ).toBe(false);
  });
});

describe('updateGroupInputSchema', () => {
  it('validates an edited group name', () => {
    expect(
      updateGroupInputSchema.safeParse({
        groupId: 'group-1',
        name: 'Friday dinner club',
      }).success,
    ).toBe(true);
  });
});
