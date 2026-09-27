export const ratingCircle = {
  centerX: 169,
  centerY: -36.8226,
  radius: 167.8226,
} as const;

export interface RatingArcGeometry {
  centerX: number;
  centerY: number;
  leftAngle: number;
  radius: number;
  rightAngle: number;
}

export interface ConcentricRatingLayout {
  arcDepth: number;
  outerRadius: number;
  ratingArc: RatingArcGeometry;
  straightBottom: number;
}

const minimumRating = 1;
const maximumRating = 5;
const ratingStep = 0.5;
const defaultRatingArc: RatingArcGeometry = {
  ...ratingCircle,
  leftAngle: Math.atan2(7 - ratingCircle.centerY, 7 - ratingCircle.centerX),
  rightAngle: Math.atan2(7 - ratingCircle.centerY, 331 - ratingCircle.centerX),
};

/**
 * Rating arc used by the standalone Add Dish sheet in the 402pt Figma canvas.
 * It is the review arc translated 32pt right and 36pt down, then scaled to the
 * actual sheet width so the endpoints and deepest point keep their proportions.
 */
export function dishRatingArcGeometry(width: number): RatingArcGeometry {
  const scale = width > 0 ? width / 402 : 1;
  return {
    centerX: 201 * scale,
    centerY: -0.8226 * scale,
    leftAngle: defaultRatingArc.leftAngle,
    radius: ratingCircle.radius * scale,
    rightAngle: defaultRatingArc.rightAngle,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Builds the hero boundary and rating arc from the same circle center. The
 * outer arc enters the screen no higher than minimumStraightBottom, keeping
 * the venue card inside the hero even on very wide windows.
 */
export function concentricRatingLayout(
  width: number,
  height: number,
  minimumStraightBottom: number,
  gap: number,
): ConcentricRatingLayout {
  const halfWidth = width / 2;
  const straightBottom = clamp(
    Math.max(height - halfWidth, minimumStraightBottom),
    0,
    Math.max(0, height - gap - 1),
  );
  const arcDepth = Math.max(gap + 1, height - straightBottom);
  const outerRadius = (halfWidth ** 2 + arcDepth ** 2) / (2 * arcDepth);
  const centerY = arcDepth - outerRadius;
  const radius = outerRadius - gap;
  const halfChord = Math.sqrt(Math.max(0, radius ** 2 - centerY ** 2));
  // acos gives an unambiguous angle on the lower half of the circle. atan2
  // flips from +PI to -PI when centerY rounds to +0/-0 at the exact
  // semicircle breakpoint, sending intermediate markers over the upper arc.
  const rightAngle = Math.acos(clamp(halfChord / radius, -1, 1));

  return {
    arcDepth,
    outerRadius,
    ratingArc: {
      centerX: halfWidth,
      centerY,
      leftAngle: Math.PI - rightAngle,
      radius,
      rightAngle,
    },
    straightBottom,
  };
}

/** Returns the exact point on the rating arc for a potentially fractional rating. */
export function ratingCurvePoint(rating: number, geometry = defaultRatingArc) {
  const progress =
    (clamp(rating, minimumRating, maximumRating) - minimumRating) /
    (maximumRating - minimumRating);
  const angle =
    geometry.leftAngle + (geometry.rightAngle - geometry.leftAngle) * progress;
  return {
    x: geometry.centerX + Math.cos(angle) * geometry.radius,
    y: geometry.centerY + Math.sin(angle) * geometry.radius,
  };
}

/** Projects a touch point onto the arc and converts it to a continuous rating. */
export function ratingForCurvePoint(
  x: number,
  y: number,
  geometry = defaultRatingArc,
) {
  const angle = clamp(
    Math.atan2(y - geometry.centerY, x - geometry.centerX),
    geometry.rightAngle,
    geometry.leftAngle,
  );
  const progress =
    (geometry.leftAngle - angle) / (geometry.leftAngle - geometry.rightAngle);
  return minimumRating + progress * (maximumRating - minimumRating);
}

export function snapRating(rating: number) {
  return clamp(
    Math.round(rating / ratingStep) * ratingStep,
    minimumRating,
    maximumRating,
  );
}

export function ratingForLinearPoint(x: number, width: number) {
  if (width <= 0) return 0.5;
  const minimum = 0.5;
  const progress = clamp(x / width, 0, 1);
  return clamp(
    Math.round((minimum + progress * (maximumRating - minimum)) / ratingStep) *
      ratingStep,
    minimum,
    maximumRating,
  );
}
