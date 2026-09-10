import {
  Dimensions,
  PixelRatio,
  Platform,
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
const MAX_TABLET_LAYOUT_SCALE = 2;
const LARGE_WINDOW_SCALE_START = 480;
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
  'flexBasis',
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

export interface ResponsiveWrapMetrics {
  columns: number;
  itemWidth: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Phones scale from their short edge so a short 16:9 display does not make all
 * controls tiny. Larger, freely resizable windows use both dimensions: the
 * geometric mean follows the available area without letting an unusually wide
 * or tall aspect ratio dominate the typography and icon size.
 */
export function responsiveMetrics(width: number, height: number): ResponsiveMetrics {
  const shortEdge = Math.min(width, height);
  const phoneScale = clamp(shortEdge / DESIGN_VIEWPORT.width, MIN_LAYOUT_SCALE, MAX_PHONE_LAYOUT_SCALE);
  const areaScale = Math.max(
    phoneScale,
    clamp(
      Math.sqrt(
        (width / DESIGN_VIEWPORT.width) * (height / DESIGN_VIEWPORT.height),
      ),
      MIN_TABLET_LAYOUT_SCALE,
      MAX_TABLET_LAYOUT_SCALE,
    ),
  );
  const largeWindowProgress = clamp(
    (shortEdge - LARGE_WINDOW_SCALE_START) / (TABLET_MIN_EDGE - LARGE_WINDOW_SCALE_START),
    0,
    1,
  );
  const scale = phoneScale + ((areaScale - phoneScale) * largeWindowProgress);
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
  return { ...responsiveMetrics(width, height), scale: stableAvailableScale() };
}

/**
 * Layout always follows the usable native window. Visual measurements still
 * scale from the 402x874 design viewport, but the application canvas itself
 * must not preserve the phone aspect ratio: iPad split view and resizable Mac
 * windows can be substantially wider or shorter than a phone.
 */
export function responsiveViewport(width: number, height: number) {
  return { height, width };
}

export function useResponsiveViewport() {
  const { width, height } = useWindowDimensions();
  return responsiveViewport(width, height);
}

export function responsiveValue(value: number, scale: number) {
  if (value === 0) return 0;
  return PixelRatio.roundToNearestPixel(value * scale);
}

/**
 * Keeps fixed-position flows reachable when a freely resizable window is
 * shorter than the design canvas. The viewport can still shrink; callers can
 * expose the remaining canvas through scrolling.
 */
export function responsiveContentHeight(
  viewportHeight: number,
  scale: number,
  designHeight = DESIGN_VIEWPORT.height,
) {
  return Math.max(viewportHeight, responsiveValue(designHeight, scale));
}

/**
 * Fits wrapped cards to the exact available row width. Computing the item
 * width from the already-rounded padding and gap avoids half-pixel overflow on
 * narrow phones, while a fixed column count keeps an orphaned final card from
 * growing across the row.
 */
export function responsiveWrapMetrics(
  viewportWidth: number,
  scale: number,
  minimumItemWidth: number,
  maximumColumns: number,
  horizontalPadding = 16,
  gap = 10,
): ResponsiveWrapMetrics {
  const scaledPadding = responsiveValue(horizontalPadding, scale);
  const scaledGap = responsiveValue(gap, scale);
  const scaledMinimum = responsiveValue(minimumItemWidth, scale);
  const availableWidth = Math.max(0, viewportWidth - (scaledPadding * 2));
  const columns = clamp(
    Math.floor((availableWidth + scaledGap) / (scaledMinimum + scaledGap)),
    1,
    maximumColumns,
  );
  return {
    columns,
    itemWidth: (availableWidth - (scaledGap * (columns - 1))) / columns,
  };
}

/** Scales numeric component props (most often SVG width/height) like styles. */
export function responsiveSize(value: number) {
  return responsiveValue(value, stableAvailableScale());
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

const stableAvailableScale: ResponsiveScaleResolver = () => {
  // Android may resize `window` while its keyboard is open. Styles must use
  // the same physical metrics as responsiveSize/useResponsiveMetrics so only
  // the available viewport changes, never the control scale mid-edit.
  const screen = Dimensions.get('screen');
  const window = Dimensions.get('window');
  // Only Android's resize-style keyboard needs the stable physical height.
  // Other platforms must follow both live window dimensions so a resizable
  // iPad/Mac window updates typography, icons, and imagery in both directions.
  const availableHeight = Platform.OS === 'android' ? screen.height : window.height;
  return responsiveMetrics(window.width, availableHeight).scale;
};

/**
 * Drop-in replacement for StyleSheet.create. Existing screens keep authoring in
 * 402pt Figma units while the generated native styles adapt to the device width.
 */
export function responsiveStyleSheet<T extends NamedStyles>(styles: T, resolveScale: ResponsiveScaleResolver = stableAvailableScale): T {
  // Keep the style object live instead of freezing a one-time StyleSheet ID.
  // `useWindowDimensions` causes the owning screen to render again when a
  // window is resized; resolving the scale when the named style is read keeps
  // those rerenders in sync with the stable device frame without requiring
  // every screen to recreate its styles manually. The native layout viewport
  // separately follows split-view, window resize, and keyboard changes.
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
