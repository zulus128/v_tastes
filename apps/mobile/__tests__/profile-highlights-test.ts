import type { FeedItem, Venue } from '@tastes/contracts';
import type { ProfileData } from '../src/features/profile/api';
import { buildTasteHighlights } from '../src/features/profile/profileHighlights';

const profile: ProfileData = {
  bio: '',
  city: 'Monaco',
  displayName: 'Alex Morgan',
  favoriteCuisines: ['Thai'],
  favoriteDish: 'Sushi',
  favoriteVenueId: 'venue-1',
  followerCount: 0,
  followingCount: 0,
  photoPath: null,
  photoUrl: null,
  reviewCount: 3,
  username: 'alex',
  xp: 0,
};

function review(id: string, venueId: string, tags: FeedItem['tags']): FeedItem {
  return { id, venueId, tags, authorId: 'alex', authorDisplayName: 'Alex', venueName: venueId, rating: 5, text: 'Great', dishReviews: [], status: 'published', commentCount: 0, reactionCount: 0, createdAt: '2026-09-15T00:00:00.000Z' };
}

function venue(id: string, category: string): Venue {
  return { id, name: id, city: 'Monaco', status: 'active', address: 'Monaco', category };
}

describe('buildTasteHighlights', () => {
  it('derives cuisine and vibe from the profile reviews', () => {
    const result = buildTasteHighlights({
      favoritePlaceName: 'Gemini 750',
      profile,
      reviews: [review('1', 'venue-1', ['casual']), review('2', 'venue-2', ['casual']), review('3', 'venue-3', ['date-night'])],
      venues: [venue('venue-1', 'Italian'), venue('venue-2', 'Italian'), venue('venue-3', 'Japanese')],
    });

    expect(result.map(({ value }) => value)).toEqual(['Italian', 'Casual', 'Sushi', 'Gemini 750']);
    expect(result.map(({ meta }) => meta)).toEqual(['2 reviews', '2 reviews', 'From onboarding', 'From onboarding']);
  });

  it('falls back to onboarding preferences when reviews have no cuisine or vibe', () => {
    const result = buildTasteHighlights({ favoritePlaceName: null, profile, reviews: [], venues: [] });
    expect(result[0]).toMatchObject({ value: 'Thai', meta: '0 reviews' });
    expect(result[1]).toMatchObject({ value: 'Not Set', meta: '0 reviews' });
  });
});
