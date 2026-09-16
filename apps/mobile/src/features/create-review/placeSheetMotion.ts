export type PlaceSheetSnap = 'collapsed' | 'dismissed' | 'expanded';

export function placeSheetHeights(windowHeight: number, topInset: number) {
  const expandedHeight = Math.max(0, windowHeight - Math.max(topInset, 12));
  const collapsedHeight = Math.min(
    expandedHeight,
    Math.max(420, windowHeight * 0.68),
  );
  return {
    collapsedOffset: expandedHeight - collapsedHeight,
    expandedHeight,
  };
}

export function resolvePlaceSheetSnap(
  position: number,
  velocityY: number,
  collapsedOffset: number,
  expandedHeight: number,
): PlaceSheetSnap {
  const dismissDistance = Math.min(96, expandedHeight * 0.12);
  if (
    position > collapsedOffset + dismissDistance ||
    (velocityY > 1.1 && position > collapsedOffset * 0.75)
  ) {
    return 'dismissed';
  }
  if (velocityY < -0.8 || position < collapsedOffset * 0.5) {
    return 'expanded';
  }
  return 'collapsed';
}
