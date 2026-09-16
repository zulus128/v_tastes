import { describe, expect, it } from 'vitest';
import { placeSheetHeights, resolvePlaceSheetSnap } from './placeSheetMotion';

describe('place sheet motion', () => {
  it('keeps collapsed and expanded heights inside the viewport', () => {
    const regularScreen = placeSheetHeights(874, 44);
    expect(regularScreen.collapsedOffset).toBeCloseTo(235.68);
    expect(regularScreen.expandedHeight).toBe(830);
    expect(placeSheetHeights(480, 24)).toEqual({
      collapsedOffset: 36,
      expandedHeight: 456,
    });
  });

  it('expands after an upward drag', () => {
    expect(resolvePlaceSheetSnap(80, -0.9, 236, 830)).toBe('expanded');
  });

  it('returns to the collapsed position after a small downward drag', () => {
    expect(resolvePlaceSheetSnap(210, 0.2, 236, 830)).toBe('collapsed');
  });

  it('dismisses after crossing the threshold or flicking down', () => {
    expect(resolvePlaceSheetSnap(340, 0.2, 236, 830)).toBe('dismissed');
    expect(resolvePlaceSheetSnap(200, 1.2, 236, 830)).toBe('dismissed');
  });
});
