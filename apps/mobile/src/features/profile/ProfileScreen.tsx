import { apiErrorMessage } from '@tastes/firebase-client';
import type { FeedItem, Venue } from '@tastes/contracts';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SearchIcon from '../../../assets/profile/search.svg';
import SearchTuneIcon from '../../../assets/profile/search-tune.svg';
import MapFilterBarIcon from '../../../assets/profile/map-filter-bar.svg';
import mapFilterCafeIcon from '../../../assets/profile/map-filter-cafe.png';
import MapFilterFriendsIcon from '../../../assets/profile/map-filter-friends.svg';
import MapFilterRestaurantIcon from '../../../assets/profile/map-filter-restaurant.svg';
import MapFilterReviewsIcon from '../../../assets/profile/map-filter-reviews.svg';
import MapFilterTrendingIcon from '../../../assets/profile/map-filter-trending.svg';
import MapFilterTuningIcon from '../../../assets/profile/map-filter-tuning.svg';
import MapSearchVoiceIcon from '../../../assets/profile/followers-voice.svg';
import mapBarIcon from '../../../assets/profile/map-bar.png';
import mapCafeIcon from '../../../assets/profile/map-cafe.png';
import mapTrendingIcon from '../../../assets/profile/map-trending.png';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { FavouritesPane } from '../favourites/FavouritesPane';
import { useToggleFollow } from '../discover/api';
import { matchesPlaceFilters } from '../discover/placeFilters';
import { firestore, storage } from '../../infrastructure/firebase';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { captureException } from '../../infrastructure/observability';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useProfile, useProfileReviews } from './api';
import { ProfileHeader, ProfileTopBar } from './ProfileHeader';
import { ProfileReviewCard } from './ProfileReviewCard';
import { ProfileDraftCard, type ProfileReviewDraft } from './ProfileDraftCard';
import { ProfileExtras, type ProfileExtra } from './ProfileExtras';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

type ProfileTab = 'reviews' | 'map' | 'wishlist';
type MapFilter = 'trending' | 'restaurant' | 'cafe' | 'bar' | 'my-reviews' | 'friends';

const MAP_FILTERS: readonly { emphasized: boolean; label: string; value: MapFilter; width: number }[] = [
  { emphasized: true, label: 'Trending', value: 'trending', width: 87 },
  { emphasized: false, label: 'Restaurant', value: 'restaurant', width: 100 },
  { emphasized: true, label: 'Cafe', value: 'cafe', width: 62 },
  { emphasized: true, label: 'Bar', value: 'bar', width: 54 },
  { emphasized: false, label: 'My Reviews', value: 'my-reviews', width: 105 },
  { emphasized: false, label: 'Friends', value: 'friends', width: 79 },
];

const LIGHT_MAP_TILES = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const DARK_MAP_TILES = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const FALLBACK_MAP_REGION = { latitude: 41.02, longitude: 29, latitudeDelta: 0.14, longitudeDelta: 0.13 };
const MAP_FOCUS_PIN_LIMIT = 5;
const REVIEW_DRAFT_KEY_PREFIX = '@tastes/review-draft/';

function hasMapCoordinates(venue: Venue): venue is Venue & { latitude: number; longitude: number } {
  return typeof venue.latitude === 'number'
    && Number.isFinite(venue.latitude)
    && venue.latitude >= -90
    && venue.latitude <= 90
    && typeof venue.longitude === 'number'
    && Number.isFinite(venue.longitude)
    && venue.longitude >= -180
    && venue.longitude <= 180;
}

function mapRegionFor(venues: readonly (Venue & { latitude: number; longitude: number })[]) {
  if (venues.length === 0) return FALLBACK_MAP_REGION;
  const latitudes = venues.map((venue) => venue.latitude);
  const longitudes = venues.map((venue) => venue.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(0.04, (maxLatitude - minLatitude) * 1.8),
    longitudeDelta: Math.max(0.04, (maxLongitude - minLongitude) * 1.8),
  };
}

function mapVenueIcon(venue: Venue, active: boolean) {
  const category = venue.category?.toLowerCase() ?? '';
  if (category.includes('bar') || category.includes('pub') || category.includes('club')) return mapBarIcon;
  if (active || venue.discoverTags?.includes('trending')) return mapTrendingIcon;
  return mapCafeIcon;
}

function MapFilterGlyph({ value }: { value: MapFilter }) {
  if (value === 'trending') return <MapFilterTrendingIcon height={11.3438} width={9.9167} />;
  if (value === 'restaurant') return <MapFilterRestaurantIcon height={11.053} width={11.0527} />;
  if (value === 'cafe') return <Image source={mapFilterCafeIcon} style={staticStyles.mapFilterCafeIcon} />;
  if (value === 'bar') return <MapFilterBarIcon height={13.2408} width={11.586} />;
  if (value === 'my-reviews') return <MapFilterReviewsIcon height={8.3256} width={11.6603} />;
  return <MapFilterFriendsIcon height={14} width={14} />;
}

function PencilIcon({ color }: { color: string }) {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="M4 20l4.2-1 10.6-10.6a2.12 2.12 0 0 0-3-3L5.2 16 4 20Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /><Path d="m14.6 6.6 3 3" stroke={color} strokeLinecap="round" strokeWidth={1.7} /></Svg>;
}

function PinIcon({ color }: { color: string }) {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="m14.2 4.3 5.5 5.5-3.1 1.1-3.9 3.9.3 3.1-1 1-3.4-3.4-4.1 4.1-.8-.8 4.1-4.1-3.4-3.4 1-1 3.1.3 3.9-3.9 1.1-3.1.7.7Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.55} /></Svg>;
}

function TrashIcon({ color }: { color: string }) {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="M5 7h14M9 7V4h6v3m2 0-.8 13H7.8L7 7m3 3v7m4-7v7" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /></Svg>;
}

export function ProfileScreen({
  appliedFilters,
  currentUserId,
  fallbackName,
  initialFollowing = false,
  onBack,
  onMessage,
  onOpenComments,
  onOpenFilters,
  onOpenPlace,
  onOpenProfile,
  onContinueDraft,
  onSettings,
  targetUserId,
}: {
  appliedFilters: string[];
  currentUserId: string;
  fallbackName: string;
  initialFollowing?: boolean;
  onBack: () => void;
  onMessage: (userId: string) => void;
  onOpenComments: (reviewId: string) => void;
  onOpenFilters: () => void;
  onOpenPlace: (venueId: string) => void;
  onOpenProfile: (userId: string, following: boolean) => void;
  onContinueDraft: () => void;
  onSettings: () => void;
  targetUserId: string;
}) {
  const { colors, isDark } = useAppTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const actionDangerColor = colors.background === '#080808' ? '#D32620' : '#A00E0B';
  const own = currentUserId === targetUserId;
  const api = useTastesApi();
  const followMutation = useToggleFollow(currentUserId);
  const { loading, profile } = useProfile(targetUserId, fallbackName);
  const profileReviews = useProfileReviews(targetUserId);
  const [activeTab, setActiveTab] = useState<ProfileTab>('reviews');
  const [following, setFollowing] = useState(initialFollowing);
  const [followPending, setFollowPending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [search, setSearch] = useState('');
  const [extra, setExtra] = useState<ProfileExtra>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter>('trending');
  const [mapVenues, setMapVenues] = useState<Venue[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReload, setMapReload] = useState(0);
  const [selectedReview, setSelectedReview] = useState<FeedItem | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [editText, setEditText] = useState('');
  const [reviewActionPending, setReviewActionPending] = useState(false);
  const [favoritePlaceName, setFavoritePlaceName] = useState<string | null>(null);
  const [venueImages, setVenueImages] = useState<Record<string, string>>({});
  const [profileReactions, setProfileReactions] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<ProfileReviewDraft | null>(null);
  const mapKeyboardInset = useRef(new Animated.Value(0)).current;
  const mapKeyboardContentTranslate = useMemo(
    () => Animated.multiply(mapKeyboardInset, -1),
    [mapKeyboardInset],
  );
  const mapKeyboardVisibleRef = useRef(false);
  const screenRef = useRef<View>(null);

  useEffect(() => {
    mapKeyboardVisibleRef.current = false;
    if (activeTab !== 'map') {
      mapKeyboardInset.stopAnimation();
      mapKeyboardInset.setValue(0);
      return;
    }

    const updateKeyboardInset = (screenY: number, duration?: number, animate = true) => {
      screenRef.current?.measureInWindow((_x, y, _width, height) => {
        const nextInset = Math.max(0, y + height - screenY);
        mapKeyboardInset.stopAnimation();
        if (!animate) {
          mapKeyboardInset.setValue(nextInset);
          return;
        }
        Animated.timing(mapKeyboardInset, {
          toValue: nextInset,
          duration: duration && duration > 0 ? duration : 250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }).start();
      });
    };
    const currentKeyboard = Keyboard.metrics();
    if (currentKeyboard) {
      mapKeyboardVisibleRef.current = true;
      updateKeyboardInset(currentKeyboard.screenY, undefined, false);
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (mapKeyboardVisibleRef.current) return;
      mapKeyboardVisibleRef.current = true;
      updateKeyboardInset(event.endCoordinates.screenY, event.duration);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      mapKeyboardVisibleRef.current = false;
      mapKeyboardInset.stopAnimation();
      Animated.timing(mapKeyboardInset, {
        toValue: 0,
        duration: event.duration && event.duration > 0 ? event.duration : 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [activeTab, mapKeyboardInset]);

  async function reactToProfileReview(reviewId: string, idempotencyPrefix: string) {
    try {
      const response = await api.reactToReview({ idempotencyKey: createIdempotencyKey(idempotencyPrefix), reviewId, reaction: 'like' });
      setProfileReactions((current) => ({ ...current, [reviewId]: response.data.active }));
    } catch (error) {
      Alert.alert('Could not update reaction', apiErrorMessage(error));
    }
  }

  useEffect(() => setFollowing(initialFollowing), [initialFollowing, targetUserId]);
  useEffect(() => {
    if (own) return undefined;
    return onSnapshot(
      doc(firestore, 'users', currentUserId, 'following', targetUserId),
      (snapshot) => setFollowing(snapshot.exists()),
    );
  }, [currentUserId, own, targetUserId]);
  useFocusEffect(useMemo(() => () => {
    if (!own) return undefined;
    let active = true;
    void AsyncStorage.getItem(`${REVIEW_DRAFT_KEY_PREFIX}${currentUserId}`).then((stored) => {
      if (!active) return;
      try {
        const value = stored ? JSON.parse(stored) as {
          dishes?: ProfileReviewDraft['dishes'];
          rating?: number;
          savedAt?: string;
          selectedVenue?: { name?: string };
          tags?: unknown[];
          text?: string;
          venueId?: string;
        } : null;
        const hasSavedDraft = Boolean(value && (
          value.venueId
          || (typeof value.rating === 'number' && value.rating > 0)
          || value.text?.trim()
          || (Array.isArray(value.tags) && value.tags.length > 0)
          || (Array.isArray(value.dishes) && value.dishes.length > 0)
        ));
        setDraft(hasSavedDraft ? {
          dishes: Array.isArray(value?.dishes) ? value.dishes : [],
          rating: typeof value?.rating === 'number' ? value.rating : 0,
          savedAt: typeof value?.savedAt === 'string' ? value.savedAt : new Date().toISOString(),
          venueName: value?.selectedVenue?.name ?? 'Untitled place',
          text: value?.text?.trim() || 'Your unfinished review is ready to continue.',
        } : null);
      } catch {
        setDraft(null);
      }
    });
    return () => { active = false; };
  }, [currentUserId, own]));
  useEffect(() => {
    if (activeTab !== 'map') return;
    const venueIds = [...new Set(profileReviews.reviews.map((review) => review.venueId))];
    let active = true;
    setMapError(null);
    void Promise.all(venueIds.map((venueId) => api.getPlace({ venueId }).then((response) => response.data.venue)))
      .then((venues) => { if (active) setMapVenues(venues); })
      .catch((error) => { if (active) setMapError(apiErrorMessage(error)); });
    return () => { active = false; };
  }, [activeTab, api, mapReload, profileReviews.reviews]);
  useEffect(() => {
    if (!profile?.favoriteVenueId) {
      setFavoritePlaceName(null);
      return;
    }
    let active = true;
    void api.getPlace({ venueId: profile.favoriteVenueId })
      .then((response) => { if (active) setFavoritePlaceName(response.data.venue.name); })
      .catch(() => { if (active) setFavoritePlaceName(null); });
    return () => { active = false; };
  }, [api, profile?.favoriteVenueId]);

  useEffect(() => {
    const venueIds = [...new Set(profileReviews.reviews
      .filter((review) => review.dishReviews?.some((dish) => !dish.photoPath))
      .map((review) => review.venueId))]
      .filter((venueId) => venueId && !(venueId in venueImages));
    if (venueIds.length === 0) return;
    let active = true;
    void Promise.all(venueIds.map(async (venueId) => {
      try {
        const response = await api.getPlace({ venueId });
        return [venueId, response.data.venue.imageUrl ?? ''] as const;
      } catch {
        return [venueId, ''] as const;
      }
    })).then((entries) => {
      if (!active) return;
      setVenueImages((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [api, profileReviews.reviews, venueImages]);

  async function toggleFollow() {
    if (followPending) return;
    setFollowPending(true);
    try {
      await followMutation.mutateAsync({ targetUserId, following });
      setFollowing(!following);
    } catch (error) {
      Alert.alert('Could not update follow', apiErrorMessage(error));
    } finally {
      setFollowPending(false);
    }
  }

  async function chooseProfilePhoto() {
    if (!own || uploadingPhoto || !profile) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to update your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const cropSize = Math.min(asset.width, asset.height);
    const photoPath = `profile-images/${currentUserId}/avatar-${Date.now()}.jpg`;
    setUploadingPhoto(true);
    try {
      const optimized = await manipulateAsync(asset.uri, [
        { crop: {
          originX: Math.max(0, (asset.width - cropSize) / 2),
          originY: Math.max(0, (asset.height - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        } },
        { resize: { width: 512, height: 512 } },
      ], { compress: 0.78, format: SaveFormat.JPEG });
      const response = await fetch(optimized.uri);
      await uploadBytes(storageRef(storage, photoPath), await response.blob(), { contentType: 'image/jpeg' });
      await api.updateProfilePhoto({ photoPath });
      if (profile.photoPath && profile.photoPath !== photoPath) {
        void deleteObject(storageRef(storage, profile.photoPath)).catch((error) => captureException(error, { operation: 'delete-old-profile-photo' }));
      }
    } catch (error) {
      Alert.alert('Could not update photo', apiErrorMessage(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveReviewEdit() {
    if (!selectedReview || !editText.trim() || reviewActionPending) return;
    setReviewActionPending(true);
    try {
      await api.editReview({
        reviewId: selectedReview.id,
        rating: selectedReview.rating,
        text: editText.trim(),
        tags: selectedReview.tags,
        dishReviews: selectedReview.dishReviews,
      });
      setEditingReview(false);
      setSelectedReview(null);
    } catch (error) {
      Alert.alert('Could not edit review', apiErrorMessage(error));
    } finally {
      setReviewActionPending(false);
    }
  }

  async function togglePinnedReview() {
    if (!selectedReview || reviewActionPending) return;
    const pinned = !selectedReview.pinned;
    setReviewActionPending(true);
    try {
      await api.setReviewPinned({ reviewId: selectedReview.id, pinned });
      setSelectedReview(null);
    } catch (error) {
      Alert.alert(`Could not ${pinned ? 'pin' : 'unpin'} review`, apiErrorMessage(error));
    } finally {
      setReviewActionPending(false);
    }
  }

  function confirmDeleteReview() {
    if (!selectedReview || reviewActionPending) return;
    const review = selectedReview;
    Alert.alert('Delete review?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setReviewActionPending(true);
        void api.deleteReview({ reviewId: review.id })
          .then(() => setSelectedReview(null))
          .catch((error) => Alert.alert('Could not delete review', apiErrorMessage(error)))
          .finally(() => setReviewActionPending(false));
      } },
    ]);
  }

  if (loading || !profile) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleReviews = profileReviews.reviews.filter((review) => (
    review.venueName.toLowerCase().includes(normalizedSearch)
      || review.text.toLowerCase().includes(normalizedSearch)
  )).filter((review) => {
    const range = appliedFilters.find((value) => value.startsWith('Rating:'))?.slice(7).split('-').map(Number);
    return !range || range.length !== 2 || (review.rating >= range[0]! && review.rating <= range[1]!);
  });
  const sortedReviews = [...visibleReviews].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
  const venuesById = new Map(mapVenues.map((venue) => [venue.id, venue]));
  const mapPlaces = visibleReviews
    .map((review) => ({ review, venue: venuesById.get(review.venueId) }))
    .filter((place): place is { review: FeedItem; venue: Venue } => Boolean(place.venue))
    .filter(({ venue }) => {
      const category = venue.category?.toLowerCase() ?? '';
      if (mapFilter === 'restaurant') return category.includes('restaurant');
      if (mapFilter === 'cafe') return category.includes('cafe') || category.includes('coffee');
      if (mapFilter === 'bar') return category.includes('bar') || category.includes('pub');
      if (mapFilter === 'trending') return venue.discoverTags?.includes('trending') ?? true;
      return matchesPlaceFilters(venue, appliedFilters);
    })
    .filter(({ review }, index, places) => places.findIndex((place) => place.review.venueId === review.venueId) === index);
  const mappedPlaces = mapPlaces.filter((place): place is { review: FeedItem; venue: Venue & { latitude: number; longitude: number } } => hasMapCoordinates(place.venue));
  const focusPlaces = mappedPlaces.slice(0, MAP_FOCUS_PIN_LIMIT);
  const mapRegion = mapRegionFor(focusPlaces.map(({ venue }) => venue));
  const mapKey = `${isDark ? 'dark' : 'light'}:${focusPlaces.map(({ venue }) => `${venue.id}:${venue.latitude}:${venue.longitude}`).join('|')}`;
  const profileHeader = (
    <ProfileHeader
      favoritePlaceName={favoritePlaceName}
      followPending={followPending}
      following={following}
      onAvatarPress={() => void chooseProfilePhoto()}
      onMessage={() => onMessage(targetUserId)}
      onFollowers={() => setExtra('followers')}
      onFollowing={() => setExtra('following')}
      onRewards={() => setExtra('rewards')}
      onToggleFollow={() => void toggleFollow()}
      own={own}
      profile={profile}
      reviewCount={profile.reviewCount}
      uploadingPhoto={uploadingPhoto}
    />
  );
  const controls = (
    <View style={[styles.controls, activeTab === 'map' && styles.mapControls, { backgroundColor: activeTab === 'map' ? 'transparent' : colors.canvas }]}>
      <View style={styles.switcher}>
        {(['reviews', 'map', 'wishlist'] as const).map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.switchOption, activeTab === tab && styles.switchActive]}>
            <Text style={[styles.switchText, activeTab === tab && styles.switchTextActive]}>
              {tab === 'wishlist' ? 'Wishlist' : tab[0].toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {activeTab === 'reviews' ? (
        <View style={styles.searchBar}>
          <SearchIcon color={colors.textMuted} width={24} height={24} />
          <TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
          <Pressable accessibilityLabel="Open filters" onPress={onOpenFilters}><SearchTuneIcon color={colors.textMuted} height={24} width={24} /></Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View ref={screenRef} style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {activeTab === 'reviews' ? (
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.content, styles.reviewList, { paddingBottom: tabBarHeight + 24 }]}
          data={sortedReviews}
          initialNumToRender={6}
          keyExtractor={(review) => review.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={6}
          ListHeaderComponent={<>{profileHeader}{controls}{own && draft ? <View style={styles.draftCardWrap}><ProfileDraftCard draft={draft} onContinue={onContinueDraft} profile={profile} /></View> : null}</>}
          ListEmptyComponent={!profileReviews.loading ? <View style={styles.empty}><Text style={styles.emptyTitle}>No reviews yet</Text><Text style={styles.emptyCopy}>{own ? 'Your reviews will appear here.' : 'This person has not posted a review yet.'}</Text></View> : null}
          ListFooterComponent={profileReviews.loading || profileReviews.loadingMore ? <ActivityIndicator color={colors.primary} style={styles.listLoader} /> : profileReviews.error ? <Pressable onPress={() => void profileReviews.loadMore()} style={styles.retryButton}><Text style={styles.retryText}>Try loading more</Text></Pressable> : null}
          onEndReached={() => void profileReviews.loadMore()}
          onEndReachedThreshold={0.5}
          windowSize={7}
          renderItem={({ item: review }) => <View style={styles.reviewItem}><ProfileReviewCard
              fallbackImageUrl={venueImages[review.venueId]}
              item={review}
              onComments={() => onOpenComments(review.id)}
              onMore={() => own ? setSelectedReview(review) : void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              onReact={() => void reactToProfileReview(review.id, 'profile-reaction')}
              reacted={profileReactions[review.id] ?? review.reacted}
              onShare={() => void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              profile={profile}
            /></View>}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <Animated.ScrollView
          automaticallyAdjustKeyboardInsets={activeTab !== 'map'}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={activeTab === 'map' ? undefined : [1]}
          style={activeTab === 'map' ? { transform: [{ translateY: mapKeyboardContentTranslate }] } : undefined}
        >
          {profileHeader}
          {activeTab !== 'map' ? controls : null}
          {activeTab === 'map' ? (
          <View style={styles.mapContent}>
            <View style={styles.mapPane}>
              <MapView
                initialRegion={mapRegion}
                key={mapKey}
                mapPadding={{ top: 68, right: 12, bottom: 122, left: 12 }}
                mapType={Platform.OS === 'android' ? 'none' : 'standard'}
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
                  <Marker coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} key={venue.id} onPress={() => onOpenPlace(venue.id)}>
                    <View style={styles.mapMarkerRow}>
                      <View style={styles.mapMarkerAnchor}>
                        <View style={[styles.mapMarkerIcon, (review.pinned || index === 0) && styles.mapMarkerIconActive]}><Image source={mapVenueIcon(venue, Boolean(review.pinned || index === 0))} style={styles.mapMarkerGlyph} /></View>
                        <View style={[styles.mapMarkerTip, (review.pinned || index === 0) && styles.mapMarkerTipActive]} />
                        <View style={[styles.mapMarkerDot, (review.pinned || index === 0) && styles.mapMarkerDotActive]} />
                      </View>
                      <View style={styles.mapMarkerCopy}>
                        <Text numberOfLines={1} style={styles.mapMarkerName}>{venue.name}</Text>
                        <Text numberOfLines={1} style={styles.mapMarkerCategory}>{venue.category ?? 'Place'}</Text>
                      </View>
                    </View>
                  </Marker>
                ))}
              </MapView>
              {controls}
              {mapError ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>Could not load the map</Text><Text style={styles.emptyCopy}>{mapError}</Text><Pressable onPress={() => setMapReload((value) => value + 1)} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View> : mapPlaces.length === 0 ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>No places found</Text><Text style={styles.emptyCopy}>Try another search or filter.</Text></View> : mappedPlaces.length === 0 ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>Locations unavailable</Text><Text style={styles.emptyCopy}>These places do not have map coordinates yet.</Text></View> : null}
            </View>
            {mapPlaces.map(({ review }) => <View key={review.id} style={styles.mapReviewItem}><ProfileReviewCard
              fallbackImageUrl={venueImages[review.venueId]}
              item={review}
              onComments={() => onOpenComments(review.id)}
              onMore={() => own ? setSelectedReview(review) : void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              onReact={() => void reactToProfileReview(review.id, 'profile-map-reaction')}
              reacted={profileReactions[review.id] ?? review.reacted}
              onShare={() => void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              profile={profile}
            /></View>)}
          </View>
          ) : own ? (
          <View style={styles.wishlistPane}><FavouritesPane appliedFilters={appliedFilters} onOpenFilters={onOpenFilters} onOpenPlace={onOpenPlace} userId={currentUserId} /></View>
        ) : (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Wishlist is private</Text><Text style={styles.emptyCopy}>Saved places are only visible to their owner.</Text></View>
          )}
        </Animated.ScrollView>
      )}
      {activeTab === 'map' ? (
        <Animated.View style={[styles.mapSearchPanel, { bottom: mapKeyboardInset }]}>
          <View style={styles.mapSearchRow}>
            <View style={[styles.searchBar, styles.mapSearchBar]}>
              <SearchIcon color={colors.textMuted} width={24} height={24} />
              <TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
              <MapSearchVoiceIcon color={colors.textMuted} height={24} width={24} />
            </View>
            <Pressable accessibilityLabel="Open filters" hitSlop={8} onPress={onOpenFilters} style={styles.mapTuningButton}>
              <MapFilterTuningIcon height={21.1838} width={17.1838} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.mapFilters} horizontal showsHorizontalScrollIndicator={false}>
            {MAP_FILTERS.map((item) => (
              <Pressable key={item.value} onPress={() => setMapFilter(item.value)} style={[styles.mapFilterChip, { width: item.width }]}>
                <View style={[styles.mapFilterIcon, !(item.emphasized || mapFilter === item.value) && styles.mapFilterMuted]}><MapFilterGlyph value={item.value} /></View>
                <Text style={[styles.mapFilterText, !(item.emphasized || mapFilter === item.value) && styles.mapFilterMuted]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
      <ProfileTopBar
        onBack={onBack}
        onSettings={onSettings}
        onShare={() => void Share.share({
          message: `See ${profile.displayName} on Tastes: https://tastes.app/profile/${targetUserId}`,
          url: `https://tastes.app/profile/${targetUserId}`,
        })}
        own={own}
        profile={profile}
      />
      <ProfileExtras
        onClose={() => setExtra(null)}
        onOpenProfile={(userId, personFollowing) => {
          setExtra(null);
          onOpenProfile(userId, personFollowing);
        }}
        own={own}
        screen={extra}
        targetUserId={targetUserId}
        visible={extra !== null}
      />
      <Modal animationType="fade" onRequestClose={() => setSelectedReview(null)} transparent visible={selectedReview !== null && !editingReview}>
        <Pressable onPress={() => setSelectedReview(null)} style={styles.reviewActionBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.actionSheet}>
            <Pressable onPress={() => { setEditText(selectedReview?.text ?? ''); setEditingReview(true); }} style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}><PencilIcon color={colors.text} /><Text style={styles.actionText}>Edit</Text></Pressable>
            <Pressable disabled={reviewActionPending} onPress={() => void togglePinnedReview()} style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}><PinIcon color={colors.text} /><Text style={styles.actionText}>{selectedReview?.pinned ? 'Unpin' : 'Pin'}</Text></Pressable>
            <Pressable disabled={reviewActionPending} onPress={confirmDeleteReview} style={({ pressed }) => [styles.actionRow, styles.deleteAction, pressed && styles.actionPressed]}><TrashIcon color={actionDangerColor} /><Text style={styles.deleteActionText}>Delete</Text></Pressable>
            <View style={styles.actionDivider} />
            <Pressable onPress={() => setSelectedReview(null)} style={({ pressed }) => [styles.actionRow, styles.cancelAction, pressed && styles.actionPressed]}><Text style={styles.actionText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setEditingReview(false)} transparent visible={editingReview}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.actionBackdrop}>
          <Pressable onPress={() => setEditingReview(false)} style={StyleSheet.absoluteFill} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.editSheet}>
            <Text style={styles.editTitle}>Edit review</Text>
            <TextInput autoFocus multiline onChangeText={setEditText} style={styles.editInput} value={editText} />
            <Pressable disabled={reviewActionPending} onPress={() => void saveReviewEdit()} style={styles.editSave}>{reviewActionPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.editSaveText}>Save</Text>}</Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => {
  const isDark = colors.background === '#080808';
  return StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 102, paddingBottom: 24 },
  controls: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  mapControls: { position: 'absolute', top: 26, left: 0, right: 0, zIndex: 2, paddingBottom: 0 },
  switcher: { height: 40, padding: 4, flexDirection: 'row', borderRadius: 100, backgroundColor: isDark ? 'rgba(223,223,233,0.12)' : colors.surface },
  switchOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  switchActive: { backgroundColor: isDark ? '#D9DDE5' : '#282828' },
  switchText: { color: isDark ? '#C4CAD7' : '#7A7A7A', fontSize: 13 },
  switchTextActive: { color: isDark ? '#161616' : '#FFFFFF', fontWeight: '700' },
  searchBar: { height: 39, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 44, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surface },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  mapSearchRow: { height: 39, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapSearchBar: { flex: 1 },
  mapTuningButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  mapFilters: { gap: 6, paddingRight: 16 },
  mapSearchPanel: { position: 'absolute', left: 0, right: 0, zIndex: 4, elevation: 4, overflow: 'hidden', gap: 12, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, borderTopWidth: 1, borderTopColor: isDark ? '#45474B' : '#D9DDE5', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: isDark ? '#161616' : colors.surface },
  mapFilterChip: { height: 28, paddingHorizontal: 8, flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border, borderRadius: 40, backgroundColor: isDark ? '#161616' : colors.surface },
  mapFilterIcon: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  mapFilterText: { color: colors.text, fontSize: 13, fontWeight: '500', letterSpacing: -0.23, lineHeight: 20 },
  mapFilterMuted: { opacity: 0.5 },
  reviewList: { gap: 14 },
  reviewItem: { paddingHorizontal: 15 },
  draftCardWrap: { marginHorizontal: 15 },
  listLoader: { marginVertical: 36 },
  empty: { minHeight: 220, marginHorizontal: 16, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapContent: { gap: 0 },
  mapPane: { height: 426, marginTop: -26, zIndex: 0, overflow: 'hidden', backgroundColor: '#17191D' },
  map: { width: '100%', height: '100%' },
  mapMarkerRow: { width: 122, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  mapMarkerAnchor: { width: 38, alignItems: 'center' },
  mapMarkerIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 18, backgroundColor: '#161616' },
  mapMarkerIconActive: { borderColor: colors.primary },
  mapMarkerGlyph: { width: 21, height: 21 },
  mapMarkerTip: { width: 0, height: 0, marginTop: -1, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF' },
  mapMarkerTipActive: { borderTopColor: colors.primary },
  mapMarkerDot: { width: 5, height: 5, marginTop: 3, borderRadius: 3, backgroundColor: '#FFFFFF' },
  mapMarkerDotActive: { backgroundColor: colors.primary },
  mapMarkerCopy: { width: 80, paddingTop: 4 },
  mapMarkerName: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: -0.41 },
  mapMarkerCategory: { color: '#FFFFFF', fontSize: 12, letterSpacing: -0.24 },
  mapEmpty: { position: 'absolute', left: 24, right: 24, bottom: 122, zIndex: 3, padding: 18, borderRadius: 18, alignItems: 'center', backgroundColor: 'rgba(8,8,8,0.82)' },
  mapReviewItem: { marginHorizontal: 16, marginTop: 12 },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  actionBackdrop: { flex: 1, padding: 16, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  reviewActionBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  actionSheet: { width: '100%', maxWidth: 300, padding: 14, gap: 10, borderWidth: 1, borderColor: isDark ? '#45474B' : '#E4E4E4', borderRadius: 24, backgroundColor: isDark ? '#161616' : '#FFFFFF' },
  actionRow: { height: 48, paddingHorizontal: 18, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 100, backgroundColor: isDark ? '#242424' : 'rgba(0,0,0,0.10)' },
  actionText: { color: colors.text, fontSize: 16, fontWeight: '500', letterSpacing: -0.24, textAlign: 'center' },
  deleteAction: { borderWidth: isDark ? 1 : 0.5, borderColor: isDark ? '#B82F29' : '#A00E0B', backgroundColor: isDark ? '#1E0B0A' : 'rgba(160,14,11,0.10)' },
  deleteActionText: { color: isDark ? '#D32620' : '#A00E0B', fontSize: 16, fontWeight: '500', letterSpacing: -0.24, textAlign: 'center' },
  actionDivider: { height: 1, marginHorizontal: 2, marginVertical: 8, backgroundColor: isDark ? '#45474B' : '#E4E4E4' },
  cancelAction: { backgroundColor: isDark ? '#242424' : 'rgba(0,0,0,0.10)' },
  actionPressed: { opacity: 0.72 },
  editSheet: { padding: 20, borderRadius: 24, backgroundColor: colors.surface },
  editTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  editInput: { minHeight: 120, marginTop: 16, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, color: colors.text, backgroundColor: colors.canvas, textAlignVertical: 'top' },
  editSave: { height: 50, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: colors.primary },
  editSaveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  wishlistPane: { minHeight: 720 },
  });
};

const staticStyles = StyleSheet.create({
  mapFilterCafeIcon: { width: 14, height: 14 },
});
