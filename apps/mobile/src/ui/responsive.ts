import {
  Dimensions,
  PixelRatio,
  useWindowDimensions,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

/** The phone frame used by the product designs. */
export const DESIGN_VIEWPORT = {
  width: 402,
  height: 874,
} as const;

const MIN_LAYOUT_SCALE = 0.82;
const MIN_TABLET_LAYOUT_SCALE = 0.68;
const MAX_PHONE_LAYOUT_SCALE = 1.12;
const MAX_TABLET_LAYOUT_SCALE = 1.6;
const TABLET_MIN_EDGE = 600;

type NamedStyle = ViewStyle | TextStyle | ImageStyle;
type NamedStyles = Record<string, NamedStyle>;

const scalableProperties = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'top',
  'right',
  'bottom',
  'left',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'gap',
  'rowGap',
  'columnGap',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStartWidth',
  'borderEndWidth',
  'outlineWidth',
  'outlineOffset',
  'shadowRadius',
  'textShadowRadius',
]);

const transformProperties = new Set(['translateX', 'translateY']);

export interface ResponsiveMetrics {
  height: number;
  scale: number;
  width: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Phones scale from their short edge so a short 16:9 display does not make all
 * controls tiny. Tablets use a contain scale, preserving the complete 402x874
 * artboard while taking advantage of the available height.
 */
export function responsiveMetrics(width: number, height: number): ResponsiveMetrics {
  const shortEdge = Math.min(width, height);
  const scale = shortEdge >= TABLET_MIN_EDGE
    ? clamp(
      Math.min(width / DESIGN_VIEWPORT.width, height / DESIGN_VIEWPORT.height),
      MIN_TABLET_LAYOUT_SCALE,
      MAX_TABLET_LAYOUT_SCALE,
    )
    : clamp(shortEdge / DESIGN_VIEWPORT.width, MIN_LAYOUT_SCALE, MAX_PHONE_LAYOUT_SCALE);
  return {
    height,
    scale,
    width,
  };
}

export function useResponsiveMetrics() {
  // `window` height shrinks on Android while the resize-style keyboard is open.
  // Use it only as a subscription to orientation/window changes; scale itself
  // comes from stable physical screen dimensions.
  useWindowDimensions();
  const { width, height } = Dimensions.get('screen');
  return responsiveMetrics(width, height);
}

/**
 * Keeps the app on a phone-proportioned canvas on tablets. The surrounding
 * area remains native tablet UI, while every product screen receives the same
 * maximum viewport its scaled 402x874 design was authored for.
 */
export function responsiveViewport(width: number, height: number) {
  if (Math.min(width, height) < TABLET_MIN_EDGE) return { height, width };
  const { scale } = responsiveMetrics(width, height);
  return {
    height: Math.min(height, DESIGN_VIEWPORT.height * scale),
    width: Math.min(width, DESIGN_VIEWPORT.width * scale),
  };
}

export function useResponsiveViewport() {
  const { width, height } = useWindowDimensions();
  const screen = Dimensions.get('screen');
  const stableMetrics = responsiveMetrics(screen.width, screen.height);
  if (Math.min(screen.width, screen.height) < TABLET_MIN_EDGE) return { height, width };
  return {
    height: Math.min(height, DESIGN_VIEWPORT.height * stableMetrics.scale),
    width: Math.min(width, DESIGN_VIEWPORT.width * stableMetrics.scale),
  };
}

export function responsiveValue(value: number, scale: number) {
  if (value === 0) return 0;
  return PixelRatio.roundToNearestPixel(value * scale);
}

/** Scales numeric component props (most often SVG width/height) like styles. */
export function responsiveSize(value: number) {
  const { width, height } = Dimensions.get('screen');
  return responsiveValue(value, responsiveMetrics(width, height).scale);
}

function scaleOffset(value: unknown, scale: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const offset = value as Record<string, unknown>;
  return {
    ...offset,
    ...(typeof offset.width === 'number' ? { width: responsiveValue(offset.width, scale) } : {}),
    ...(typeof offset.height === 'number' ? { height: responsiveValue(offset.height, scale) } : {}),
  };
}

function scaleTransform(value: unknown, scale: number) {
  if (!Array.isArray(value)) return value;
  return value.map((operation: unknown) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return operation;
    const entry = operation as Record<string, unknown>;
    const [property] = Object.keys(entry);
    if (!property || !transformProperties.has(property) || typeof entry[property] !== 'number') return operation;
    return { ...entry, [property]: responsiveValue(entry[property], scale) };
  });
}

export function scaleStyle(style: NamedStyle, scale: number): NamedStyle {
  const result: Record<string, unknown> = {};
  for (const [property, value] of Object.entries(style)) {
    if (scalableProperties.has(property) && typeof value === 'number') {
      // 999 is the conventional fully-rounded sentinel and must remain larger
      // than every possible control after scaling.
      result[property] = value >= 900 ? value : responsiveValue(value, scale);
    } else if (property === 'transform') {
      result[property] = scaleTransform(value, scale);
    } else if (property === 'shadowOffset' || property === 'textShadowOffset') {
      result[property] = scaleOffset(value, scale);
    } else {
      result[property] = value;
    }
  }
  return result as NamedStyle;
}

export function scaleNamedStyles<T extends NamedStyles>(styles: T, scale: number): T {
  return Object.fromEntries(
    Object.entries(styles).map(([name, style]) => [name, scaleStyle(style, scale)]),
  ) as T;
}

type ResponsiveScaleResolver = () => number;

const windowScale: ResponsiveScaleResolver = () => {
  const { width, height } = Dimensions.get('window');
  return responsiveMetrics(width, height).scale;
};

/**
 * Drop-in replacement for StyleSheet.create. Existing screens keep authoring in
 * 402pt Figma units while the generated native styles adapt to the device width.
 */
export function responsiveStyleSheet<T extends NamedStyles>(styles: T, resolveScale: ResponsiveScaleResolver = windowScale): T {
  // Keep the style object live instead of freezing a one-time StyleSheet ID.
  // `useWindowDimensions` causes the owning screen to render again when a
  // window is resized; resolving the scale when the named style is read keeps
  // those rerenders in sync with the frame dimensions (Expo web/iPad split
  // view) without requiring every screen to recreate its styles manually.
  let cachedScale: number | null = null;
  const cache = new Map<PropertyKey, unknown>();
  return new Proxy(styles as object, {
    get(target, property, receiver) {
      const style = Reflect.get(target, property, receiver);
      if (!style || typeof style !== 'object' || Array.isArray(style)) return style;
      const scale = resolveScale();
      if (scale !== cachedScale) {
        cache.clear();
        cachedScale = scale;
      }
      if (!cache.has(property)) cache.set(property, scaleStyle(style as NamedStyle, scale));
      return cache.get(property);
    },
  }) as T;
}
