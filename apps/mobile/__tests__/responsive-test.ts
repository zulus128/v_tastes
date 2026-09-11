import {
  DESIGN_VIEWPORT,
  responsiveMetrics,
  responsiveWrapMetrics,
  scaleNamedStyles,
} from '../src/ui/responsive';

describe('responsive layout metrics', () => {
  it('keeps the Figma viewport at a 1:1 scale', () => {
    expect(responsiveMetrics(DESIGN_VIEWPORT.width, DESIGN_VIEWPORT.height).scale).toBe(1);
  });

  it('scales an iPhone SE from width instead of shrinking to fit its short height', () => {
    expect(responsiveMetrics(375, 667).scale).toBeCloseTo(375 / DESIGN_VIEWPORT.width);
  });

  it('balances both dimensions on larger resizable windows and caps extremes', () => {
    expect(responsiveMetrics(768, 1024).scale).toBeCloseTo(1024 / DESIGN_VIEWPORT.height);
    expect(responsiveMetrics(1024, 600).scale).toBeCloseTo(600 / DESIGN_VIEWPORT.height);
    expect(responsiveMetrics(1600, 2200).scale).toBe(2);
    expect(responsiveMetrics(280, 653).scale).toBe(0.82);
  });

  it('transitions smoothly between phone and large-window scaling', () => {
    const before = responsiveMetrics(401, 700).scale;
    const afterBoundary = responsiveMetrics(403, 700).scale;
    const during = responsiveMetrics(440, 700).scale;
    const after = responsiveMetrics(480, 700).scale;
    expect(Math.abs(afterBoundary - before)).toBeLessThan(0.01);
    expect(during).toBeLessThanOrEqual(Math.max(before, after));
    expect(during).toBeGreaterThanOrEqual(Math.min(before, after));
  });

  it('does not jump while dragging either edge across breakpoints or a square window', () => {
    for (const width of [401, 402, 403, 479, 480, 481, 599, 600, 601, 839, 840, 841, 1023, 1024, 1025]) {
      for (const height of [375, 479, 480, 481, 599, 600, 601, 900]) {
        const scale = responsiveMetrics(width, height).scale;
        expect(Math.abs(responsiveMetrics(width + 1, height).scale - scale)).toBeLessThan(0.01);
        expect(Math.abs(responsiveMetrics(width, height + 1).scale - scale)).toBeLessThan(0.01);
      }
    }
  });

  it('keeps a scaled design canvas within large resizable window height', () => {
    for (const [width, height] of [[768, 1024], [1024, 600], [1024, 479], [800, 500], [600, 600], [1600, 500]]) {
      expect(DESIGN_VIEWPORT.height * responsiveMetrics(width, height).scale).toBeLessThanOrEqual(height + 0.001);
    }
  });

  it('keeps two phone cards on one row despite pixel rounding', () => {
    const scale = responsiveMetrics(375, 667).scale;
    const grid = responsiveWrapMetrics(375, scale, 179, 4, 16, 10);
    expect((grid * 2) + 30 + 9.5).toBe(375);
  });

  it('keeps orphaned cards at the same width as a complete row', () => {
    const layout = responsiveWrapMetrics(1024, responsiveMetrics(1024, 600).scale, 280, 2, 16, 10);
    expect(layout).toBeLessThan(1024 - 32);
  });
});

describe('scaleNamedStyles', () => {
  it('scales visual measurements but preserves layout semantics', () => {
    const result = scaleNamedStyles({
      card: {
        borderRadius: 20,
        flex: 1,
        flexBasis: 80,
        height: 50,
        opacity: 0.5,
        transform: [{ translateY: -4 }, { scale: 0.8 }],
        width: 100,
      },
      pill: { borderRadius: 999 },
      largeImage: { width: 1000, height: 1200 },
    }, 0.9);

    expect(result.card.width).toBe(90);
    expect(result.card.height).toBe(45);
    expect(result.card.borderRadius).toBe(18);
    expect(result.card.flex).toBe(1);
    expect(result.card.flexBasis).toBe(72);
    expect(result.card.opacity).toBe(0.5);
    expect(result.card.transform).toEqual([{ translateY: -3.5 }, { scale: 0.8 }]);
    expect(result.pill.borderRadius).toBe(999);
    expect(result.largeImage).toEqual({ width: 900, height: 1080 });
  });
});
