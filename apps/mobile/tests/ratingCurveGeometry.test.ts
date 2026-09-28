import { describe, expect, it } from 'vitest';
import {
  concentricRatingLayout,
  dishRatingArcHeight,
  dishRatingArcGeometry,
  isRatingArcTouch,
  ratingCurvePoint,
  ratingForCurveDrag,
  ratingForCurvePoint,
  ratingForCurveX,
  ratingForLinearPoint,
  ratingCircle,
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

  it('keeps the current rating when the handle is tapped without moving', () => {
    expect(ratingForCurveDrag(3, 0, 0)).toBeCloseTo(3, 8);
    expect(ratingForCurveDrag(3, 20, 0)).toBeGreaterThan(3);
  });

  it('only starts an empty-rating drag close to the visible arc', () => {
    const point = ratingCurvePoint(3);

    expect(isRatingArcTouch(point.x, point.y)).toBe(true);
    expect(isRatingArcTouch(point.x, point.y - 30)).toBe(false);
  });

  it('maps dish slider drag positions from 0.5 to 5 stars', () => {
    expect(ratingForLinearPoint(-20, 360)).toBe(0.5);
    expect(ratingForLinearPoint(40, 360)).toBe(1);
    expect(ratingForLinearPoint(180, 360)).toBe(3);
    expect(ratingForLinearPoint(380, 360)).toBe(5);
  });

  it('keeps the standalone dish arc aligned to the Figma canvas', () => {
    const geometry = dishRatingArcGeometry(402);
    const left = ratingCurvePoint(1, geometry);
    const middle = ratingCurvePoint(3, geometry);
    const right = ratingCurvePoint(5, geometry);

    expect(left.x).toBeCloseTo(39, 3);
    expect(left.y).toBeCloseTo(43, 3);
    expect(middle.x).toBeCloseTo(201, 3);
    expect(middle.y).toBeCloseTo(167, 3);
    expect(right.x).toBeCloseTo(363, 3);
    expect(right.y).toBeCloseTo(43, 3);
  });

  it('starts an empty dish drag at the rating under the finger', () => {
    const geometry = dishRatingArcGeometry(402);

    expect(
      ratingForCurveX(ratingCurvePoint(1, geometry).x, geometry),
    ).toBeCloseTo(1, 8);
    expect(
      ratingForCurveX(ratingCurvePoint(3, geometry).x, geometry),
    ).toBeCloseTo(3, 8);
    expect(
      ratingForCurveX(ratingCurvePoint(5, geometry).x, geometry),
    ).toBeCloseTo(5, 8);
  });

  it('scales the dish arc proportionally on narrower screens', () => {
    const geometry = dishRatingArcGeometry(201);
    const middle = ratingCurvePoint(3, geometry);

    expect(geometry.radius).toBeCloseTo(ratingCircle.radius / 2, 4);
    expect(middle.x).toBeCloseTo(100.5, 3);
    expect(middle.y).toBeCloseTo(83.5, 3);
    expect(dishRatingArcHeight(201)).toBe(99);
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
