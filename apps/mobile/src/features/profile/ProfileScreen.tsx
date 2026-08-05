import { apiErrorMessage } from '@tastes/firebase-client';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import SearchIcon from '../../../assets/profile/search.svg';
import { storage } from '../../infrastructure/firebase';
import { useTastesApi } from '../../session/SessionProvider';
import { Screen } from '../../ui/components';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useProfile, useProfileReviews } from './api';
import { ProfileHeader } from './ProfileHeader';
import { ProfileReviewCard } from './ProfileReviewCard';

type ProfileTab = 'reviews' | 'map' | 'wishlist';

export function ProfileScreen({
  currentUserId,
  fallbackName,
  initialFollowing = false,
  onBack,
  onMessage,
  onOpenComments,
  onSettings,
  targetUserId,
}: {
  currentUserId: string;
  fallbackName: string;
  initialFollowing?: boolean;
  onBack: () => void;
  onMessage: (userId: string) => void;
  onOpenComments: (reviewId: string) => void;
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

  useEffect(() => setFollowing(initialFollowing), [initialFollowing, targetUserId]);

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
            <Text style={styles.tuneGlyph}>☷</Text>
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
            {visibleReviews.map((review) => (
              <ProfileReviewCard
                item={review}
                key={review.id}
                onComments={() => onOpenComments(review.id)}
                profile={profile}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{activeTab === 'map' ? 'Taste map' : 'Wishlist'}</Text>
            <Text style={styles.emptyCopy}>
              {activeTab === 'map'
                ? 'Reviewed places will appear on the profile map.'
                : own ? 'Your saved places stay organized in Discover.' : 'Saved places are private for now.'}
            </Text>
          </View>
        )}
      </ScrollView>
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
});
