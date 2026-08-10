import { apiErrorMessage } from '@tastes/firebase-client';
import type { Venue } from '@tastes/contracts';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SearchIcon from '../../../assets/profile/search.svg';
import MapView, { Marker } from 'react-native-maps';
import { FavouritesPane } from '../favourites/FavouritesPane';
import { storage } from '../../infrastructure/firebase';
import { useTastesApi } from '../../session/SessionProvider';
import { Screen } from '../../ui/components';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useProfile, useProfileReviews } from './api';
import { ProfileHeader } from './ProfileHeader';
import { ProfileReviewCard } from './ProfileReviewCard';
import { ProfileExtras, type ProfileExtra } from './ProfileExtras';

type ProfileTab = 'reviews' | 'map' | 'wishlist';

export function ProfileScreen({
  currentUserId,
  fallbackName,
  initialFollowing = false,
  onBack,
  onMessage,
  onOpenComments,
  onOpenPlace,
  onSettings,
  targetUserId,
}: {
  currentUserId: string;
  fallbackName: string;
  initialFollowing?: boolean;
  onBack: () => void;
  onMessage: (userId: string) => void;
  onOpenComments: (reviewId: string) => void;
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'highest' | 'recent'>('all');
  const [mapVenues, setMapVenues] = useState<Venue[]>([]);

  useEffect(() => setFollowing(initialFollowing), [initialFollowing, targetUserId]);
  useEffect(() => { if (activeTab !== 'map') return; let active = true; void api.getVenues({ limit: 50 }).then((response) => { if (active) setMapVenues(response.data.items); }).catch(() => undefined); return () => { active = false; }; }, [activeTab, api]);

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
        void deleteObject(storageRef(storage, profile.photoPath)).catch(() => undefined);
      }
    } catch (error) {
      Alert.alert('Could not update photo', apiErrorMessage(error));
    } finally {
      setUploadingPhoto(false);
    }
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
  ));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <ProfileHeader
          followPending={followPending}
          following={following}
          onAvatarPress={() => void chooseProfilePhoto()}
          onBack={onBack}
          onMessage={() => onMessage(targetUserId)}
          onFollowers={() => setExtra('followers')}
          onRewards={() => setExtra('rewards')}
          onSettings={onSettings}
          onToggleFollow={() => void toggleFollow()}
          own={own}
          profile={profile}
          reviewCount={profileReviews.reviews.length}
          uploadingPhoto={uploadingPhoto}
        />

        <View style={[styles.controls, { backgroundColor: colors.canvas }]}>
          <View style={styles.switcher}>
            {(['reviews', 'map', 'wishlist'] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.switchOption, activeTab === tab && styles.switchActive]}
              >
                <Text style={[styles.switchText, activeTab === tab && styles.switchTextActive]}>
                  {tab === 'wishlist' ? 'Wishlist' : tab[0].toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.searchBar}>
            <SearchIcon width={24} height={24} />
            <TextInput
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              value={search}
            />
            <Pressable accessibilityLabel="Filter profile" onPress={() => setFilterOpen(true)}><Text style={styles.tuneGlyph}>☷</Text></Pressable>
          </View>
        </View>

        {activeTab === 'reviews' ? (
          <View style={styles.reviewList}>
            {profileReviews.loading ? <ActivityIndicator color={colors.primary} style={styles.listLoader} /> : null}
            {!profileReviews.loading && visibleReviews.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptyCopy}>
                  {own ? 'Your reviews will appear here.' : 'This person has not posted a review yet.'}
                </Text>
              </View>
            ) : null}
            {[...visibleReviews].sort((left, right) => filter === 'highest' ? right.rating - left.rating : filter === 'recent' ? new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() : 0).map((review) => (
              <ProfileReviewCard
                item={review}
                key={review.id}
                onComments={() => onOpenComments(review.id)}
                profile={profile}
              />
            ))}
          </View>
        ) : activeTab === 'map' ? (
          <View style={styles.mapPane}>
            <MapView initialRegion={{ latitude: 41.02, longitude: 29, latitudeDelta: 0.14, longitudeDelta: 0.13 }} style={styles.map}>{visibleReviews.map((review) => { const venue = mapVenues.find((candidate) => candidate.id === review.venueId); return venue?.latitude != null && venue.longitude != null ? <Marker coordinate={{ latitude: venue.latitude, longitude: venue.longitude }} key={review.id} onPress={() => onOpenPlace(review.venueId)} title={venue.name}><View style={styles.mapPin}><Text style={styles.mapPinText}>{review.rating.toFixed(1)}</Text></View></Marker> : null; })}</MapView>
            {visibleReviews.length === 0 ? <View style={styles.mapEmpty}><Text style={styles.emptyTitle}>Your taste map is waiting</Text><Text style={styles.emptyCopy}>Reviewed places will appear here.</Text></View> : null}
          </View>
        ) : own ? (
          <View style={styles.wishlistPane}><FavouritesPane onOpenPlace={onOpenPlace} userId={currentUserId} /></View>
        ) : (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Wishlist is private</Text><Text style={styles.emptyCopy}>Saved places are only visible to their owner.</Text></View>
        )}
      </ScrollView>
      <ProfileExtras onClose={() => setExtra(null)} screen={extra} visible={extra !== null} />
      <Modal animationType="slide" onRequestClose={() => setFilterOpen(false)} transparent visible={filterOpen}>
        <Pressable onPress={() => setFilterOpen(false)} style={styles.filterBackdrop}><Pressable onPress={() => undefined} style={styles.filterSheet}><View style={styles.filterHandle} /><Text style={styles.filterTitle}>Filter reviews</Text>{([['all', 'All reviews'], ['highest', 'Highest rated'], ['recent', 'Most recent']] as const).map(([value, label]) => <Pressable key={value} onPress={() => { setFilter(value); setFilterOpen(false); }} style={styles.filterRow}><Text style={styles.filterLabel}>{label}</Text><Text style={styles.filterRadio}>{filter === value ? '●' : '○'}</Text></Pressable>)}</Pressable></Pressable>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 24 },
  controls: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  switcher: { height: 40, padding: 4, flexDirection: 'row', borderRadius: 100, backgroundColor: 'rgba(223,223,233,0.12)' },
  switchOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  switchActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: '#C4CAD7', opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: '#161616', opacity: 1, fontWeight: '700' },
  searchBar: { height: 39, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.08)' },
  tuneGlyph: { color: colors.textMuted, fontSize: 18 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  reviewList: { paddingHorizontal: 15, gap: 14 },
  listLoader: { marginVertical: 36 },
  empty: { minHeight: 220, marginHorizontal: 16, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapPane: { height: 510, marginHorizontal: 16, overflow: 'hidden', borderRadius: 24, backgroundColor: colors.surface },
  map: { width: '100%', height: '100%' },
  mapPin: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  mapPinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  mapEmpty: { position: 'absolute', left: 24, right: 24, bottom: 24, padding: 18, borderRadius: 18, alignItems: 'center', backgroundColor: 'rgba(8,8,8,0.82)' },
  wishlistPane: { height: 720, marginTop: -8 },
  filterBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
  filterSheet: { paddingHorizontal: 18, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas },
  filterHandle: { width: 36, height: 4, marginTop: 10, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  filterTitle: { marginVertical: 20, color: colors.text, fontSize: 20, fontWeight: '700' },
  filterRow: { height: 56, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  filterLabel: { flex: 1, color: colors.text, fontSize: 16 },
  filterRadio: { color: colors.primary, fontSize: 20 },
});
