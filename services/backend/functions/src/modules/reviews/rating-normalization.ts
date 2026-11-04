/** Only individual review, visit and dish scores are normalized; averages are not. */
export function normalizeIndividualRating(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0.5 ||
    value > 5
  )
    throw new Error(
      'An individual rating is outside the supported 0.5–5 range.',
    );
  return Math.round(value * 2) / 2;
}
export function reviewRatingPatch(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['rating', 'previousRating']) {
    if (data[key] === undefined || data[key] === null) continue;
    const value = normalizeIndividualRating(data[key]);
    if (value !== data[key]) patch[key] = value;
  }
  for (const key of ['dishReviews', 'visits', 'history']) {
    if (!Array.isArray(data[key])) continue;
    let changed = false;
    const values = data[key].map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new Error(`Invalid ${key} entry.`);
      const childPatch = reviewRatingPatch(entry as Record<string, unknown>);
      if (!Object.keys(childPatch).length) return entry;
      changed = true;
      return { ...entry, ...childPatch };
    });
    if (changed) patch[key] = values;
  }
  return patch;
}
