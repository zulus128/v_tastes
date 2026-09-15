import type { FeedItem, Venue } from '@tastes/contracts';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
import mapBarIcon from '../../../assets/profile/map-bar.png';
import mapCafeIcon from '../../../assets/profile/map-cafe.png';
import mapTrendingIcon from '../../../assets/profile/map-trending.png';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';

const LIGHT_MAP_TILES = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const DARK_MAP_TILES = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

function mapVenueIcon(venue: Venue, active: boolean) {
  const category = venue.category?.toLowerCase() ?? '';
  if (category.includes('bar') || category.includes('pub') || category.includes('club')) return mapBarIcon;
  if (active || venue.discoverTags?.includes('trending')) return mapTrendingIcon;
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
  mappedPlaces: readonly { review: FeedItem; venue: Venue & { latitude: number; longitude: number } }[];
  onClose: () => void;
  onOpenPlace: (venueId: string) => void;
  onRetry: () => void;
  placeCount: number;
  region: Region;
  visible: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(responsiveSize(610), height * 0.78);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;

  const close = () => {
    Animated.timing(translateY, { toValue: sheetHeight, duration: 180, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 5,
    onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > sheetHeight * 0.22 || gesture.vy > 0.9) {
        close();
        return;
      }
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.8, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.8, useNativeDriver: true }).start(),
  }), [sheetHeight, translateY]);

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(sheetHeight);
    Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, mass: 0.8, useNativeDriver: true }).start();
  }, [sheetHeight, translateY, visible]);

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Close reviewed places map" onPress={close} style={styles.backdrop} />
        <Animated.View style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
          <View accessibilityLabel="Drag map sheet" style={styles.dragArea} {...panResponder.panHandlers}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Places you reviewed</Text>
                <Text style={styles.count}>{placeCount} {placeCount === 1 ? 'place' : 'places'}</Text>
              </View>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={close} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
          </View>
          <View style={styles.mapWrap}>
            {mappedPlaces.length > 0 ? (
              <MapView initialRegion={region} key={keyValue} mapType="none" pitchEnabled={false} rotateEnabled={false} style={styles.map} userInterfaceStyle={isDark ? 'dark' : 'light'}>
                <UrlTile maximumZ={19} shouldReplaceMapContent tileSize={256} urlTemplate={isDark ? DARK_MAP_TILES : LIGHT_MAP_TILES} />
                {mappedPlaces.map(({ review, venue }, index) => (
                  <Marker coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} key={venue.id} onPress={() => onOpenPlace(venue.id)}>
                    <View style={styles.marker}>
                      <Image source={mapVenueIcon(venue, Boolean(review.pinned || index === 0))} style={styles.markerIcon} />
                    </View>
                  </Marker>
                ))}
              </MapView>
            ) : error ? (
              <View style={styles.empty}><Text style={styles.emptyTitle}>Could not load the map</Text><Text style={styles.emptyCopy}>{error}</Text><Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View>
            ) : (
              <View style={styles.empty}><Text style={styles.emptyIcon}>📍</Text><Text style={styles.emptyTitle}>No reviewed places yet</Text><Text style={styles.emptyCopy}>Places appear here after the first review.</Text></View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => responsiveStyleSheet({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: colors.surface },
  dragArea: { paddingTop: 8 },
  grabber: { width: 42, height: 5, alignSelf: 'center', borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.55 },
  header: { height: 78, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: '600' },
  count: { marginTop: 3, color: colors.textSecondary, fontSize: 13, lineHeight: 17 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surfaceRaised },
  closeText: { color: colors.text, fontSize: 27, lineHeight: 30, fontWeight: '300' },
  mapWrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.canvas },
  map: { width: '100%', height: '100%' },
  marker: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary, borderRadius: 19, backgroundColor: '#161616' },
  markerIcon: { width: 22, height: 22 },
  empty: { flex: 1, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 38 },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  emptyCopy: { marginTop: 6, color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
});
