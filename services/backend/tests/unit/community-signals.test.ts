import { describe, expect, it } from 'vitest';
import {
  calculateCommunitySignals,
  type CommunityUser,
} from '../../functions/src/modules/discover/community';
import { DAY_MS } from '../../functions/src/modules/discover/signals';

const now = Date.UTC(2026, 10, 4);
const user = (
  id: string,
  overrides: Partial<CommunityUser> = {},
): CommunityUser => ({
  id,
  status: 'active',
  createdAt: now - 60 * DAY_MS,
  displayName: id,
  username: `${id}.user`,
  city: 'Monaco',
  followerCount: 0,
  ...overrides,
});
const review = {
  id: 'review',
  authorId: 'author',
  city: 'Monaco',
  status: 'published',
  text: 'Detailed food review with enough useful text to qualify for discovery.',
  hasPhoto: false,
  createdAt: now - DAY_MS,
};
const base = () => ({
  now,
  users: [user('author'), user('reader'), user('other')],
  reviews: [review],
  follows: [],
  engagement: [],
  events: [],
});
describe('community discovery shadow scores', () => {
  it('weights unique meaningful commenters above likes and excludes self activity', () => {
    const result = calculateCommunitySignals({
      ...base(),
      engagement: [
        { reviewId: 'review', actorId: 'author', kind: 'like', createdAt: now },
        { reviewId: 'review', actorId: 'reader', kind: 'like', createdAt: now },
        {
          reviewId: 'review',
          actorId: 'other',
          kind: 'comment',
          createdAt: now,
          text: 'Helpful detail about the food and service.',
        },
        {
          reviewId: 'review',
          actorId: 'other',
          kind: 'comment',
          createdAt: now,
          text: 'A second comment must not boost the same person twice.',
        },
        {
          reviewId: 'review',
          actorId: 'reader',
          kind: 'comment',
          createdAt: now,
          text: '👍👍!!!',
        },
      ],
    });
    expect(result.reviewScores[0]).toMatchObject({
      uniqueLikes7d: 1,
      uniqueCommenters7d: 1,
      recentEngagement: 2,
      score: 3,
    });
  });
  it('excludes inactive, fixture, suspicious and new accounts and old engagement', () => {
    const result = calculateCommunitySignals({
      ...base(),
      users: [
        user('author'),
        user('banned', { status: 'banned' }),
        user('seed', { source: 'seed' }),
        user('risk', { suspicious: true }),
        user('new', { createdAt: now - DAY_MS }),
        user('old'),
      ],
      engagement: ['banned', 'seed', 'risk', 'new', 'old'].map((actorId) => ({
        reviewId: 'review',
        actorId,
        kind: 'like',
        createdAt: actorId === 'old' ? now - 8 * DAY_MS : now,
      })),
    });
    expect(result.reviewScores[0]?.score).toBe(0);
  });
  it('does not turn old likes or follows into new growth after removal and re-addition', () => {
    const result = calculateCommunitySignals({
      ...base(),
      follows: [{ actorId: 'reader', targetId: 'author', createdAt: now }],
      engagement: [
        { actorId: 'reader', reviewId: 'review', kind: 'like', createdAt: now },
      ],
      events: [
        {
          kind: 'follow-removed',
          actorId: 'reader',
          targetId: 'author',
          createdAt: now,
          originalCreatedAt: now - 20 * DAY_MS,
        },
        {
          kind: 'reaction-removed',
          actorId: 'reader',
          targetId: 'review',
          createdAt: now,
          originalCreatedAt: now - 20 * DAY_MS,
        },
      ],
    });
    expect(result.peopleScores[0]?.uniqueFollowers7d).toBe(0);
    expect(result.reviewScores[0]?.uniqueLikes7d).toBe(0);
  });
  it('deduplicates follow edges and requires a complete profile with recent quality activity', () => {
    const result = calculateCommunitySignals({
      ...base(),
      users: [...base().users, user('empty', { username: '' })],
      follows: [
        { actorId: 'reader', targetId: 'author', createdAt: now },
        { actorId: 'reader', targetId: 'author', createdAt: now },
        { actorId: 'other', targetId: 'author', createdAt: now },
      ],
    });
    expect(result.peopleScores).toEqual([
      expect.objectContaining({ userId: 'author', uniqueFollowers7d: 2 }),
    ]);
  });
  it('ignores repeated follow/unfollow cycles and empty or moderated reviews', () => {
    const result = calculateCommunitySignals({
      ...base(),
      reviews: [
        review,
        { ...review, id: 'empty', text: '' },
        { ...review, id: 'hidden', status: 'hidden' },
      ],
      follows: [{ actorId: 'reader', targetId: 'author', createdAt: now }],
      events: [1, 2].map(() => ({
        kind: 'follow-created',
        actorId: 'reader',
        targetId: 'author',
        createdAt: now,
      })),
    });
    expect(result.peopleScores[0]?.uniqueFollowers7d).toBe(0);
    expect(result.reviewScores.map((item) => item.reviewId)).toEqual([
      'review',
    ]);
  });
});
