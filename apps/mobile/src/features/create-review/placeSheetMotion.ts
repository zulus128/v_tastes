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
  // A bottom sheet that is already at its collapsed stop should dismiss after a
  // deliberate, fairly short pull on the handle. The previous 96px threshold
  // made ordinary one-handed drags feel as if the handle had snapped back.
  const dismissDistance = Math.min(56, Math.max(32, expandedHeight * 0.07));
  if (
    position > collapsedOffset + dismissDistance ||
    (velocityY > 0.65 && position > collapsedOffset + 8)
  ) {
    return 'dismissed';
  }
  if (velocityY < -0.8 || position < collapsedOffset * 0.5) {
    return 'expanded';
  }
  return 'collapsed';
}
