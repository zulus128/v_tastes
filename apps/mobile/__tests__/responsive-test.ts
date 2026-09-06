import { DESIGN_VIEWPORT, responsiveMetrics, scaleNamedStyles } from '../src/ui/responsive';

describe('responsive layout metrics', () => {
  it('keeps the Figma viewport at a 1:1 scale', () => {
    expect(responsiveMetrics(DESIGN_VIEWPORT.width, DESIGN_VIEWPORT.height).scale).toBe(1);
  });

  it('scales an iPhone SE from width instead of shrinking to fit its short height', () => {
    expect(responsiveMetrics(375, 667).scale).toBeCloseTo(375 / DESIGN_VIEWPORT.width);
  });

  it('caps oversized and undersized viewports', () => {
    expect(responsiveMetrics(768, 1024).scale).toBe(1.12);
    expect(responsiveMetrics(280, 653).scale).toBe(0.82);
  });
});

describe('scaleNamedStyles', () => {
  it('scales visual measurements but preserves layout semantics', () => {
    const result = scaleNamedStyles({
      card: {
        borderRadius: 20,
        flex: 1,
        height: 50,
        opacity: 0.5,
        transform: [{ translateY: -4 }, { scale: 0.8 }],
        width: 100,
      },
      pill: { borderRadius: 999 },
    }, 0.9);

    expect(result.card.width).toBe(90);
    expect(result.card.height).toBe(45);
    expect(result.card.borderRadius).toBe(18);
    expect(result.card.flex).toBe(1);
    expect(result.card.opacity).toBe(0.5);
    expect(result.card.transform).toEqual([{ translateY: -3.5 }, { scale: 0.8 }]);
    expect(result.pill.borderRadius).toBe(999);
  });
});

