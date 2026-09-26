import { describe, expect, it } from 'vitest';
import {
  concentricRatingLayout,
  ratingCurvePoint,
  ratingForCurvePoint,
  ratingForLinearPoint,
  snapRating,
} from '../src/features/create-review/ratingCurveGeometry';

describe('rating curve geometry', () => {
  it.each([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])(
    'round-trips rating %s through the curve',
    (rating) => {
      const point = ratingCurvePoint(rating);
      expect(ratingForCurvePoint(point.x, point.y)).toBeCloseTo(rating, 8);
    },
  );

  it('clamps touches beyond both ends of the arc', () => {
    expect(ratingForCurvePoint(-100, 0)).toBe(1);
    expect(ratingForCurvePoint(500, 0)).toBe(5);
  });

  it('snaps the persisted rating to half-star steps', () => {
    expect(snapRating(1.24)).toBe(1);
    expect(snapRating(2.26)).toBe(2.5);
    expect(snapRating(4.9)).toBe(5);
  });

  it('keeps the visual drag rating continuous before persistence snaps it', () => {
    const rating = 2.37;
    const point = ratingCurvePoint(rating);
    const visualRating = ratingForCurvePoint(point.x, point.y);

    expect(visualRating).toBeCloseTo(rating, 8);
    expect(snapRating(visualRating)).toBe(2.5);
  });

  it('maps dish slider drag positions from 0.5 to 5 stars', () => {
    expect(ratingForLinearPoint(-20, 360)).toBe(0.5);
    expect(ratingForLinearPoint(40, 360)).toBe(1);
    expect(ratingForLinearPoint(180, 360)).toBe(3);
    expect(ratingForLinearPoint(380, 360)).toBe(5);
  });

  it('keeps a constant radial gap on wide screens', () => {
    const gap = 31;
    const layout = concentricRatingLayout(1_664, 770, 380, gap);

    expect(layout.outerRadius - layout.ratingArc.radius).toBe(gap);
    expect(layout.straightBottom).toBe(380);
    expect(layout.ratingArc.centerX).toBe(832);
    expect(layout.ratingArc.centerY).toBeCloseTo(
      layout.arcDepth - layout.outerRadius,
      8,
    );
  });

  it('moves the outer arc endpoints below the venue card', () => {
    const layout = concentricRatingLayout(1_344, 950, 480, 31);

    expect(layout.straightBottom).toBeGreaterThanOrEqual(480);
    expect(layout.straightBottom + layout.arcDepth).toBe(950);
  });

  it('keeps intermediate markers on the lower arc at the semicircle breakpoint', () => {
    const width = 895;
    const layout = concentricRatingLayout(width, 1_044, 0, 31);
    const left = ratingCurvePoint(1, layout.ratingArc);
    const middle = ratingCurvePoint(3, layout.ratingArc);
    const right = ratingCurvePoint(5, layout.ratingArc);

    expect(layout.arcDepth).toBe(width / 2);
    expect(middle.y).toBeGreaterThan(left.y);
    expect(middle.y).toBeGreaterThan(right.y);
    expect(middle.y).toBeCloseTo(
      layout.ratingArc.centerY + layout.ratingArc.radius,
      8,
    );
  });
});
