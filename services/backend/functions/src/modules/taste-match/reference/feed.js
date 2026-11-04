'use strict';

const { keyOf } = require('./utils');

class FeedBuilder {
  static buildFeed(organicPosts, recommendations) {
    const feed = [];
    const seenDishes = new Set();
    const seenVenues = new Set();
    const unknownDishVenues = new Set();
    const usedRecommendationIds = new Set();
    let next = 0;
    for (let i = 0; i < organicPosts.length; i++) {
      const post = organicPosts[i];
      feed.push({ type: 'organic', data: post });
      const venueId = post.venueId ?? post.restaurantId;
      if (venueId) {
        seenVenues.add(venueId);
        const dishIds = [
          post.canonicalDishId,
          ...(post.dishes || []).map((d) => d.canonicalDishId),
        ].filter(Boolean);
        if (!dishIds.length) unknownDishVenues.add(venueId);
        for (const id of dishIds) seenDishes.add(keyOf(id, venueId));
      }
      if (i < 1 || (i - 1) % 4 !== 0) continue;
      while (next < recommendations.length) {
        const rec = recommendations[next++];
        const venue = rec.venue.id;
        const duplicate =
          usedRecommendationIds.has(rec.id) ||
          unknownDishVenues.has(venue) ||
          (rec.kind === 'venue'
            ? seenVenues.has(venue)
            : seenDishes.has(keyOf(rec.canonicalDishId, venue)));
        if (duplicate) continue;
        feed.push({ type: 'recommendation', data: rec });
        usedRecommendationIds.add(rec.id);
        seenVenues.add(venue);
        if (rec.kind === 'dish')
          seenDishes.add(keyOf(rec.canonicalDishId, venue));
        else unknownDishVenues.add(venue);
        break;
      }
    }
    return feed;
  }
}

module.exports = { FeedBuilder };
