import type { FeedItem, Venue } from '@tastes/contracts';
import { useMemo } from 'react';
import {
  Animated,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
import mapBarIcon from '../../../assets/profile/map-bar.png';
import mapCafeIcon from '../../../assets/profile/map-cafe.png';
import mapTrendingIcon from '../../../assets/profile/map-trending.png';
import EmptyMapIcon from '../../../assets/favourites/empty.svg';
import CloseCircleIcon from '../../../assets/recap/story/close-circle.svg';
import CloseXIcon from '../../../assets/recap/story/close-x.svg';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveStyleSheet } from '../../ui/responsive';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';

const LIGHT_MAP_TILES =
  'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const DARK_MAP_TILES =
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function mapVenueIcon(venue: Venue, active: boolean) {
  const category = venue.category?.toLowerCase() ?? '';
  if (
    category.includes('bar') ||
    category.includes('pub') ||
    category.includes('club')
  )
    return mapBarIcon;
  if (active || venue.discoverTags?.includes('trending'))
    return mapTrendingIcon;
  return mapCafeIcon;
}

export function ProfileMapSheet({
  error,
  keyValue,
  mappedPlaces,
  onClose,
  onOpenPlace,
  onRetry,
  placeCount,
  region,
  visible,
}: {
  error: string | null;
  keyValue: string;
  mappedPlaces: readonly {
    review: FeedItem;
    venue: Venue & { latitude: number; longitude: number };
  }[];
  onClose: () => void;
  onOpenPlace: (venueId: string) => void;
  onRetry: () => void;
  placeCount: number;
  region: Region;
  visible: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(724, height * 0.86);
  const sheet = useBottomSheetMotion({
    closedOffset: sheetHeight,
    onClose,
    visible,
  });

  return (
    <Modal
      animationType="none"
      onRequestClose={sheet.close}
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <AnimatedPressable
          accessibilityLabel="Close reviewed places map"
          onPress={sheet.close}
          style={[styles.backdrop, { opacity: sheet.backdropOpacity }]}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              transform: [{ translateY: sheet.translateY }],
            },
          ]}
        >
          <View
            accessibilityLabel="Drag map sheet"
            style={styles.dragArea}
            {...sheet.panHandlers}
          >
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Places you reviewed</Text>
                <Text style={styles.count}>
                  {placeCount === 0
                    ? 'No places yet'
                    : `${placeCount} ${placeCount === 1 ? 'place' : 'places'}`}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close"
                hitSlop={10}
                onPress={sheet.close}
                style={styles.close}
              >
                <CloseCircleIcon />
                <View pointerEvents="none" style={styles.closeCross}>
                  <CloseXIcon />
                </View>
              </Pressable>
            </View>
          </View>
          <View style={styles.mapWrap}>
            {mappedPlaces.length > 0 ? (
              <MapView
                initialRegion={region}
                key={keyValue}
                mapType="none"
                pitchEnabled={false}
                rotateEnabled={false}
                style={styles.map}
                userInterfaceStyle={isDark ? 'dark' : 'light'}
              >
                <UrlTile
                  maximumZ={19}
                  shouldReplaceMapContent
                  tileSize={256}
                  urlTemplate={isDark ? DARK_MAP_TILES : LIGHT_MAP_TILES}
                />
                {mappedPlaces.map(({ review, venue }, index) => (
                  <Marker
                    coordinate={{
                      latitude: venue.latitude,
                      longitude: venue.longitude,
                    }}
                    key={venue.id}
                    onPress={() => onOpenPlace(venue.id)}
                  >
                    <View style={styles.marker}>
                      <Image
                        source={mapVenueIcon(
                          venue,
                          Boolean(review.pinned || index === 0),
                        )}
                        style={styles.markerIcon}
                      />
                    </View>
                  </Marker>
                ))}
              </MapView>
            ) : error ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Could not load the map</Text>
                <Text style={styles.emptyCopy}>{error}</Text>
                <Pressable onPress={onRetry} style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <EmptyMapIcon />
                </View>
                <Text style={styles.emptyTitle}>No places on your map yet</Text>
                <Text style={styles.emptyCopy}>
                  Places you review or save show up here.
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  responsiveStyleSheet({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
      backgroundColor: isDark ? '#121212' : colors.surface,
    },
    dragArea: { paddingTop: 8 },
    grabber: {
      width: 36,
      height: 4,
      alignSelf: 'center',
      borderRadius: 2,
      backgroundColor: colors.textMuted,
      opacity: 0.55,
    },
    header: {
      height: 76,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '600',
    },
    count: {
      marginTop: 3,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 17,
    },
    close: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeCross: { position: 'absolute' },
    mapWrap: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: isDark ? '#121212' : colors.canvas,
    },
    map: { width: '100%', height: '100%' },
    marker: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 19,
      backgroundColor: '#161616',
    },
    markerIcon: { width: 22, height: 22 },
    empty: {
      flex: 1,
      paddingHorizontal: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyIcon: {
      width: 60,
      height: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      marginTop: 12,
      color: colors.text,
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyCopy: {
      marginTop: 10,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
    },
    retry: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: colors.primary,
    },
    retryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  });
