export type RatingRangeThumb = 'min' | 'max';

export const RATING_RANGE_MAX = 5;
export const RATING_RANGE_THUMB_SIZE = 22;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function ratingPosition(value: number, width: number) {
  const radius = RATING_RANGE_THUMB_SIZE / 2;
  const travel = Math.max(0, width - RATING_RANGE_THUMB_SIZE);
  return (
    radius + (clamp(value, 0, RATING_RANGE_MAX) / RATING_RANGE_MAX) * travel
  );
}

export function ratingAtPosition(position: number, width: number) {
  const radius = RATING_RANGE_THUMB_SIZE / 2;
  const travel = Math.max(0, width - RATING_RANGE_THUMB_SIZE);
  if (!travel) return 0;
  const progress = clamp((position - radius) / travel, 0, 1);
  return Math.round(progress * RATING_RANGE_MAX * 10) / 10;
}

export function nearestRatingThumb(
  position: number,
  width: number,
  range: [number, number],
): RatingRangeThumb {
  return Math.abs(position - ratingPosition(range[0], width)) <=
    Math.abs(position - ratingPosition(range[1], width))
    ? 'min'
    : 'max';
}

export function moveRatingThumb(
  range: [number, number],
  thumb: RatingRangeThumb,
  position: number,
  width: number,
): [number, number] {
  const next = ratingAtPosition(position, width);
  return thumb === 'min'
    ? [Math.min(next, range[1]), range[1]]
    : [range[0], Math.max(next, range[0])];
}
