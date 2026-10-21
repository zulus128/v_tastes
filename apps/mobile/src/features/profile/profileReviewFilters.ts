export function profileReviewFilterSummary({
  filterCount,
  totalCount,
  visibleCount,
}: {
  filterCount: number;
  totalCount: number;
  visibleCount: number;
}) {
  return `${visibleCount} of ${totalCount} reviews · ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`;
}
