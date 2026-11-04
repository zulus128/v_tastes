import type { FeedItem, Review } from '@tastes/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DishListContent } from './DishListContent';
import TopRatedDishesIcon from '../../../assets/place/top-rated-dishes.svg';
import { captureException } from '../../infrastructure/observability';
import { resolveStorageImageUrl } from '../../infrastructure/storageImage';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';

type DishReview = NonNullable<FeedItem['dishReviews']>[number];

export function DishPhoto({
  photoPath,
  photoUrl,
}: {
  fallbackUri?: string;
  photoPath?: string;
  photoUrl?: string;
}) {
  const { colors } = useAppTheme();
  // A venue picture is not a picture of this dish. Missing or failed dish
  // images must keep the neutral placeholder on every review surface.
  const fallbackUri = undefined;
  const directUrl = photoUrl?.trim();
  const canLoadDirectly = Boolean(
    directUrl && /^(?:https?:|file:|data:|blob:)/i.test(directUrl),
  );
  const normalizedPath = (
    photoPath ?? (canLoadDirectly ? undefined : directUrl)
  )
    ?.trim()
    .replace(/^\/+|\/+$/g, '');
  const [uri, setUri] = useState<string | undefined>(
    canLoadDirectly ? directUrl : undefined,
  );

  useEffect(() => {
    let active = true;
    if (canLoadDirectly && directUrl) {
      setUri(directUrl);
      return () => {
        active = false;
      };
    }
    if (!normalizedPath) {
      setUri(fallbackUri);
      return () => {
        active = false;
      };
    }

    setUri(undefined);
    let download: Promise<string>;
    try {
      download = resolveStorageImageUrl(normalizedPath);
    } catch (error) {
      if (
        (error as { code?: string }).code !== 'storage/invalid-root-operation'
      )
        captureException(error, {
          operation: 'load-review-dish-photo',
          photoPath: normalizedPath,
        });
      setUri(fallbackUri);
      return () => {
        active = false;
      };
    }

    void download
      .then((nextUri) => {
        if (active) setUri(nextUri);
      })
      .catch((error) => {
        if (
          (error as { code?: string }).code !== 'storage/invalid-root-operation'
        )
          captureException(error, {
            operation: 'load-review-dish-photo',
            photoPath: normalizedPath,
          });
        if (active) setUri(fallbackUri);
      });
    return () => {
      active = false;
    };
  }, [canLoadDirectly, directUrl, fallbackUri, normalizedPath]);

  // Keep the full dish visible inside the fixed Figma tile. The default
  // `cover` mode trims the photo edges when its aspect ratio differs from the
  // tile, which is the slight side-cropping visible in the review carousel.
  return uri ? (
    <Image
      onError={() => {
        if (uri === fallbackUri) {
          setUri(undefined);
          return;
        }
        if (!normalizedPath || uri !== directUrl) {
          setUri(fallbackUri);
          return;
        }
        void resolveStorageImageUrl(normalizedPath)
          .then(setUri)
          .catch(() => setUri(fallbackUri));
      }}
      resizeMode="cover"
      source={{ uri }}
      style={[styles.dishPhoto, { backgroundColor: colors.surfaceRaised }]}
    />
  ) : (
    // Dishes without a photo get the same tile with a dish glyph, so a review
    // never mixes photo tiles with blank ones.
    <View
      accessibilityLabel="No dish photo"
      style={[styles.dishPhoto, styles.placeholder]}
      testID="dish-photo-placeholder"
    >
      <TopRatedDishesIcon
        color="rgba(255,255,255,0.32)"
        height={responsiveSize(28)}
        width={responsiveSize(28)}
      />
    </View>
  );
}

export function DishReviewSheet({
  dishes,
  fallbackUri,
  visits,
  index,
  onClose,
  onIndexChange,
}: {
  dishes: DishReview[];
  visits?: Review['visits'];
  fallbackUri?: string | ((index: number) => string | undefined);
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const swipeStartX = useRef<number | null>(null);
  const sheet = useBottomSheetMotion({ onClose, visible: index !== null });
  const dish = index !== null ? dishes[index] : undefined;
  const step = (delta: number) => {
    if (index === null || index < 0) return;
    onIndexChange((index + delta + dishes.length) % dishes.length);
  };

  return (
    <Modal
      animationType="none"
      transparent
      visible={index !== null}
      onRequestClose={sheet.close}
    >
      <View style={styles.scrim}>
        <Pressable
          accessibilityLabel="Close dish review"
          onPress={sheet.close}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(30, insets.bottom),
              transform: [{ translateY: sheet.translateY }],
            },
          ]}
          testID="dish-review-sheet"
        >
          <View style={styles.dragArea} {...sheet.panHandlers}>
            <View
              style={[styles.sheetHandle, { backgroundColor: colors.border }]}
            />
          </View>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {index === -1 ? `Dishes (${dishes.length})` : 'Dish Review'}
            </Text>
            <Pressable
              accessibilityLabel="Close dish review"
              hitSlop={10}
              onPress={sheet.close}
              style={styles.close}
            >
              <Text style={[styles.closeText, { color: colors.text }]}>×</Text>
            </Pressable>
          </View>
          {index !== null && index >= 0 ? (
            <Pressable
              onPress={() => onIndexChange(-1)}
              style={{
                paddingHorizontal: responsiveSize(16),
                paddingBottom: responsiveSize(12),
              }}
            >
              <Text style={{ color: colors.primary }}>‹ All dishes</Text>
            </Pressable>
          ) : null}
          {index === -1 ? (
            <DishListContent
              dishes={dishes}
              visits={visits}
              onOpen={onIndexChange}
            />
          ) : null}
          {dish ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
            >
              <View
                onTouchEnd={(event) => {
                  if (swipeStartX.current == null || dishes.length < 2) return;
                  const delta = event.nativeEvent.pageX - swipeStartX.current;
                  swipeStartX.current = null;
                  if (Math.abs(delta) < 40) return;
                  step(delta < 0 ? 1 : -1);
                }}
                onTouchStart={(event) => {
                  swipeStartX.current = event.nativeEvent.pageX;
                }}
                style={styles.photo}
              >
                <DishPhoto
                  fallbackUri={
                    typeof fallbackUri === 'function'
                      ? fallbackUri(index ?? 0)
                      : fallbackUri
                  }
                  photoPath={dish.photoPath}
                  photoUrl={dish.photoUrl}
                />
                {dishes.length > 1 ? (
                  <View style={styles.arrows} pointerEvents="box-none">
                    <Pressable
                      accessibilityLabel="Previous dish"
                      onPress={() => step(-1)}
                      style={styles.arrow}
                    >
                      <Text style={styles.arrowText}>‹</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Next dish"
                      onPress={() => step(1)}
                      style={styles.arrow}
                    >
                      <Text style={styles.arrowText}>›</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <View style={styles.description}>
                <View style={styles.rating}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingValue}>
                    {dish.rating.toFixed(1)}
                  </Text>
                </View>
                <Text style={[styles.name, { color: colors.text }]}>
                  {dish.title}
                </Text>
                {(dish.history?.length ?? 0) > 1 ? (
                  <View
                    style={{
                      gap: responsiveSize(8),
                      paddingVertical: responsiveSize(12),
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600' }}>
                      Rating history
                    </Text>
                    {[...(dish.history ?? [])].reverse().map((entry) => (
                      <Text
                        key={entry.visitId}
                        style={{ color: colors.textSecondary }}
                      >
                        ★ {entry.rating.toFixed(1)} ·{' '}
                        {new Date(entry.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = responsiveStyleSheet({
  dishPhoto: { width: '100%', height: '100%', backgroundColor: '#2C2C2E' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.64)',
  },
  sheet: {
    maxHeight: '100%',
    borderTopWidth: 1,
    borderColor: '#45474B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#161616',
  },
  dragArea: { height: 24, alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2 },
  scroll: { flexShrink: 1 },
  content: { flexGrow: 1 },
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.45,
  },
  close: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 30,
  },
  // The review photo is a square and should use the full sheet width. A fixed
  // maxHeight made React Native constrain the width as well on Mac/iPad,
  // leaving a large empty column beside the image.
  photo: {
    width: '100%',
    aspectRatio: 1,
    paddingHorizontal: 16,
    position: 'relative',
  },
  arrows: {
    position: 'absolute',
    top: '50%',
    left: 21,
    right: 21,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,22,22,0.45)',
  },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 30,
  },
  description: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 7,
  },
  rating: {
    height: 28,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    borderRadius: 100,
    backgroundColor: '#B82F29',
  },
  ratingStar: { color: '#FFFFFF', fontSize: 14 },
  ratingValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.24,
  },
});
