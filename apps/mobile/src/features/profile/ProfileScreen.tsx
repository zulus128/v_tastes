import { apiErrorMessage } from '@tastes/firebase-client';
import type { FeedItem, Venue } from '@tastes/contracts';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SearchIcon from '../../../assets/profile/search.svg';
import mapBarIcon from '../../../assets/profile/map-bar.png';
import mapCafeIcon from '../../../assets/profile/map-cafe.png';
import mapTrendingIcon from '../../../assets/profile/map-trending.png';
import mapTuneIcon from '../../../assets/profile/map-tune.png';
import MapView, { Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { FavouritesPane } from '../favourites/FavouritesPane';
import { matchesPlaceFilters } from '../discover/placeFilters';
import { storage } from '../../infrastructure/firebase';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { captureException } from '../../infrastructure/observability';
import { useTastesApi } from '../../session/SessionProvider';
import { Screen } from '../../ui/components';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useProfile, useProfileReviews } from './api';
import { ProfileHeader, ProfileTopBar } from './ProfileHeader';
import { ProfileReviewCard } from './ProfileReviewCard';
import { ProfileExtras, type ProfileExtra } from './ProfileExtras';

type ProfileTab = 'reviews' | 'map' | 'wishlist';
type MapFilter = 'trending' | 'restaurant' | 'cafe' | 'bar' | 'my-reviews';

const MAP_FILTERS: readonly { label: string; value: MapFilter }[] = [
  { label: '🔥 Trending', value: 'trending' },
  { label: '🍴 Restaurant', value: 'restaurant' },
  { label: '☕ Cafe', value: 'cafe' },
  { label: '🍸 Bar', value: 'bar' },
  { label: '✓ My Reviews', value: 'my-reviews' },
];

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#17191D' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8D929B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#17191D' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#353940' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#181A1E' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#202329' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#777D87' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#15171A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#363A42' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#24272D' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101B2D' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
];

function mapVenueIcon(venue: Venue, active: boolean) {
  const category = venue.category?.toLowerCase() ?? '';
  if (category.includes('bar') || category.includes('pub') || category.includes('club')) return mapBarIcon;
  if (active || venue.discoverTags?.includes('trending')) return mapTrendingIcon;
  return mapCafeIcon;
}

function PencilIcon() {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="M4 20l4.2-1 10.6-10.6a2.12 2.12 0 0 0-3-3L5.2 16 4 20Z" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /><Path d="m14.6 6.6 3 3" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={1.7} /></Svg>;
}

function PinIcon() {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="m14.2 4.3 5.5 5.5-3.1 1.1-3.9 3.9.3 3.1-1 1-3.4-3.4-4.1 4.1-.8-.8 4.1-4.1-3.4-3.4 1-1 3.1.3 3.9-3.9 1.1-3.1.7.7Z" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.55} /></Svg>;
}

function TrashIcon() {
  return <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}><Path d="M5 7h14M9 7V4h6v3m2 0-.8 13H7.8L7 7m3 3v7m4-7v7" stroke="#D32620" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} /></Svg>;
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
  onSettings: () => void;
  targetUserId: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const own = currentUserId === targetUserId;
  const api = useTastesApi();
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

  useEffect(() => setFollowing(initialFollowing), [initialFollowing, targetUserId]);
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
      if (following) await api.unfollowUser({ targetUserId });
      else await api.followUser({ targetUserId });
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

  async function unpinReview() {
    if (!selectedReview || reviewActionPending) return;
    setReviewActionPending(true);
    try {
      await api.setReviewPinned({ reviewId: selectedReview.id, pinned: false });
      setSelectedReview(null);
    } catch (error) {
      Alert.alert('Could not unpin review', apiErrorMessage(error));
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
    <View style={[styles.controls, activeTab === 'map' && styles.mapControls, { backgroundColor: colors.canvas }]}>
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
          <SearchIcon width={24} height={24} />
          <TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
          <Pressable accessibilityLabel="Open filters" onPress={onOpenFilters}><Image source={mapTuneIcon} style={styles.mapTuneIcon} /></Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      {activeTab === 'reviews' ? (
        <FlatList
          contentContainerStyle={[styles.content, styles.reviewList]}
          data={sortedReviews}
          initialNumToRender={6}
          keyExtractor={(review) => review.id}
          maxToRenderPerBatch={6}
          ListHeaderComponent={<>{profileHeader}{controls}</>}
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
              onReact={() => void api.reactToReview({ idempotencyKey: createIdempotencyKey('profile-reaction'), reviewId: review.id, reaction: 'like' }).catch((error) => Alert.alert('Could not update reaction', apiErrorMessage(error)))}
              onShare={() => void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              profile={profile}
            /></View>}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
          {profileHeader}
          {controls}
          {activeTab === 'map' ? (
          <View style={styles.mapContent}>
            <View style={styles.mapPane}>
              <MapView
                customMapStyle={DARK_MAP_STYLE}
                initialRegion={{ latitude: 41.02, longitude: 29, latitudeDelta: 0.14, longitudeDelta: 0.13 }}
                pitchEnabled={false}
                rotateEnabled={false}
                style={styles.map}
                userInterfaceStyle="dark"
              >
                {mapPlaces.map(({ review, venue }, index) => venue.latitude != null && venue.longitude != null ? (
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
                ) : null)}
              </MapView>
              {mapError ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>Could not load the map</Text><Text style={styles.emptyCopy}>{mapError}</Text><Pressable onPress={() => setMapReload((value) => value + 1)} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable></View> : mapPlaces.length === 0 ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>No places found</Text><Text style={styles.emptyCopy}>Try another search or filter.</Text></View> : null}
            </View>
            <View style={styles.mapSearchPanel}>
              <View style={styles.searchBar}>
                <SearchIcon width={24} height={24} />
                <TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
                <Pressable accessibilityLabel="Open filters" onPress={onOpenFilters}><Image source={mapTuneIcon} style={styles.mapTuneIcon} /></Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.mapFilters} horizontal showsHorizontalScrollIndicator={false}>
                {MAP_FILTERS.map((item) => (
                  <Pressable key={item.value} onPress={() => setMapFilter(item.value)} style={[styles.mapFilterChip, mapFilter === item.value && styles.mapFilterChipActive]}>
                    <Text style={[styles.mapFilterText, mapFilter === item.value && styles.mapFilterTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {mapPlaces.map(({ review }) => <View key={review.id} style={styles.mapReviewItem}><ProfileReviewCard
              fallbackImageUrl={venueImages[review.venueId]}
              item={review}
              onComments={() => onOpenComments(review.id)}
              onMore={() => own ? setSelectedReview(review) : void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              onReact={() => void api.reactToReview({ idempotencyKey: createIdempotencyKey('profile-map-reaction'), reviewId: review.id, reaction: 'like' }).catch((error) => Alert.alert('Could not update reaction', apiErrorMessage(error)))}
              onShare={() => void Share.share({ message: `${profile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastes.app/reviews/${review.id}` })}
              profile={profile}
            /></View>)}
          </View>
          ) : own ? (
          <View style={styles.wishlistPane}><FavouritesPane appliedFilters={appliedFilters} onOpenFilters={onOpenFilters} onOpenPlace={onOpenPlace} userId={currentUserId} /></View>
        ) : (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Wishlist is private</Text><Text style={styles.emptyCopy}>Saved places are only visible to their owner.</Text></View>
          )}
        </ScrollView>
      )}
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
      <ProfileExtras onClose={() => setExtra(null)} own={own} screen={extra} targetUserId={targetUserId} visible={extra !== null} />
      <Modal animationType="fade" onRequestClose={() => setSelectedReview(null)} transparent visible={selectedReview !== null && !editingReview}>
        <Pressable onPress={() => setSelectedReview(null)} style={styles.reviewActionBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.actionSheet}>
            <Pressable onPress={() => { setEditText(selectedReview?.text ?? ''); setEditingReview(true); }} style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}><PencilIcon /><Text style={styles.actionText}>Edit</Text></Pressable>
            <Pressable disabled={reviewActionPending} onPress={() => void unpinReview()} style={({ pressed }) => [styles.actionRow, pressed && styles.actionPressed]}><PinIcon /><Text style={styles.actionText}>Unpin</Text></Pressable>
            <Pressable disabled={reviewActionPending} onPress={confirmDeleteReview} style={({ pressed }) => [styles.actionRow, styles.deleteAction, pressed && styles.actionPressed]}><TrashIcon /><Text style={styles.deleteActionText}>Delete</Text></Pressable>
            <View style={styles.actionDivider} />
            <Pressable onPress={() => setSelectedReview(null)} style={({ pressed }) => [styles.actionRow, styles.cancelAction, pressed && styles.actionPressed]}><Text style={styles.actionText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal animationType="fade" onRequestClose={() => setEditingReview(false)} transparent visible={editingReview}>
        <Pressable onPress={() => setEditingReview(false)} style={styles.actionBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.editSheet}>
            <Text style={styles.editTitle}>Edit review</Text>
            <TextInput autoFocus multiline onChangeText={setEditText} style={styles.editInput} value={editText} />
            <Pressable disabled={reviewActionPending} onPress={() => void saveReviewEdit()} style={styles.editSave}>{reviewActionPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.editSaveText}>Save</Text>}</Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 102, paddingBottom: 24 },
  controls: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  mapControls: { paddingBottom: 0 },
  switcher: { height: 40, padding: 4, flexDirection: 'row', borderRadius: 100, backgroundColor: 'rgba(223,223,233,0.12)' },
  switchOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  switchActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: '#C4CAD7', opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: '#161616', opacity: 1, fontWeight: '700' },
  searchBar: { height: 39, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.08)' },
  mapTuneIcon: { width: 24, height: 24 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  mapFilters: { gap: 8, paddingRight: 2 },
  mapSearchPanel: { gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: colors.canvas },
  mapFilterChip: { height: 34, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: '#161616' },
  mapFilterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  mapFilterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  mapFilterTextActive: { color: '#FFFFFF' },
  reviewList: { gap: 14 },
  reviewItem: { paddingHorizontal: 15 },
  listLoader: { marginVertical: 36 },
  empty: { minHeight: 220, marginHorizontal: 16, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapContent: { gap: 0 },
  mapPane: { height: 230, overflow: 'hidden', backgroundColor: '#17191D' },
  map: { width: '100%', height: '100%' },
  mapMarkerRow: { maxWidth: 138, flexDirection: 'row', alignItems: 'flex-start' },
  mapMarkerAnchor: { width: 38, alignItems: 'center' },
  mapMarkerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 19, backgroundColor: '#161616' },
  mapMarkerIconActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  mapMarkerGlyph: { width: 21, height: 21 },
  mapMarkerTip: { width: 0, height: 0, marginTop: -1, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#FFFFFF' },
  mapMarkerTipActive: { borderTopColor: colors.primary },
  mapMarkerDot: { width: 5, height: 5, marginTop: 3, borderRadius: 3, backgroundColor: '#FFFFFF' },
  mapMarkerDotActive: { backgroundColor: colors.primary },
  mapMarkerCopy: { maxWidth: 98, paddingTop: 4, paddingLeft: 6 },
  mapMarkerName: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  mapMarkerCategory: { color: '#FFFFFF', fontSize: 10 },
  mapEmpty: { position: 'absolute', left: 24, right: 24, bottom: 24, padding: 18, borderRadius: 18, alignItems: 'center', backgroundColor: 'rgba(8,8,8,0.82)' },
  mapReviewItem: { marginHorizontal: 16, marginTop: 12 },
  retryButton: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  actionBackdrop: { flex: 1, padding: 16, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  reviewActionBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.78)' },
  actionSheet: { width: '100%', maxWidth: 306, padding: 12, gap: 10, borderWidth: 1, borderColor: '#45474B', borderRadius: 24, backgroundColor: '#161616' },
  actionRow: { height: 48, paddingHorizontal: 18, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: '#242424' },
  actionText: { color: colors.text, fontSize: 16, fontWeight: '500', letterSpacing: -0.24, textAlign: 'center' },
  deleteAction: { borderWidth: 1, borderColor: '#B82F29', backgroundColor: '#1E0B0A' },
  deleteActionText: { color: '#D32620', fontSize: 16, fontWeight: '500', letterSpacing: -0.24, textAlign: 'center' },
  actionDivider: { height: 1, marginHorizontal: 2, marginVertical: 8, backgroundColor: '#45474B' },
  cancelAction: { backgroundColor: '#242424' },
  actionPressed: { opacity: 0.72 },
  editSheet: { padding: 20, borderRadius: 24, backgroundColor: colors.surface },
  editTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  editInput: { minHeight: 120, marginTop: 16, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, color: colors.text, backgroundColor: colors.canvas, textAlignVertical: 'top' },
  editSave: { height: 50, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 25, backgroundColor: colors.primary },
  editSaveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  wishlistPane: { minHeight: 720 },
});
