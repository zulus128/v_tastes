import type { FeedItem } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import avatarCameron from '../../../assets/discover/avatar-cameron.jpg';
import avatarKristin from '../../../assets/discover/avatar-kristin.png';
import avatarWade from '../../../assets/discover/avatar-wade.png';
import burgerBadge from '../../../assets/profile/burger-lover.png';
import cityBadge from '../../../assets/profile/city-explorer.png';
import followIcon from '../../../assets/profile/follow.png';
import levelBadge from '../../../assets/profile/level.png';
import matchaBadge from '../../../assets/profile/matcha-hunter.png';
import messageIcon from '../../../assets/profile/message.png';
import tiramisuBadge from '../../../assets/profile/tiramisu.png';
import fallbackAvatar from '../../../assets/home/avatar.png';
import BackIcon from '../../../assets/leaderboard/back.svg';
import SearchIcon from '../../../assets/profile/search.svg';
import SettingsIcon from '../../../assets/profile/settings.svg';
import ShareIcon from '../../../assets/profile/share.svg';
import { firestore, storage } from '../../infrastructure/firebase';
import { useTastesApi } from '../../session/SessionProvider';
import { Screen } from '../../ui/components';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type ProfileTab = 'reviews' | 'map' | 'wishlist';

type ProfileData = {
  avatarKey: string | null;
  bio: string;
  city: string | null;
  displayName: string;
  favoriteCuisines: string[];
  followerCount: number;
  followingCount: number;
  photoUrl: string | null;
  photoPath: string | null;
  reviewCount: number;
  username: string | null;
  xp: number;
};

const badgeAssets = [levelBadge, burgerBadge, tiramisuBadge, matchaBadge, cityBadge];
const avatarAssets: Record<string, ImageSourcePropType> = {
  cameron: avatarCameron,
  kristin: avatarKristin,
  wade: avatarWade,
};
const badgeLabels = ['Level', 'Burger Lover', 'Tiramisu\nConnaisseur', 'Matcha Hunter', 'City Explorer'];
const tagLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

function avatarSource(profile: ProfileData | null): ImageSourcePropType {
  if (profile?.photoUrl) return { uri: profile.photoUrl };
  if (profile?.avatarKey && avatarAssets[profile.avatarKey]) return avatarAssets[profile.avatarKey];
  return fallbackAvatar;
}

function profileFromDocument(data: DocumentData | undefined, fallbackName: string): ProfileData {
  const cuisines = Array.isArray(data?.favoriteCuisines)
    ? data.favoriteCuisines.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  return {
    avatarKey: typeof data?.avatarKey === 'string' ? data.avatarKey : null,
    bio: typeof data?.bio === 'string' ? data.bio : '',
    city: typeof data?.city === 'string' ? data.city : null,
    displayName: typeof data?.displayName === 'string' ? data.displayName : fallbackName,
    favoriteCuisines: cuisines,
    followerCount: Number(data?.followerCount ?? 0),
    followingCount: Number(data?.followingCount ?? 0),
    photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
    photoPath: typeof data?.photoPath === 'string' ? data.photoPath : null,
    reviewCount: Number(data?.reviewCount ?? 0),
    username: typeof data?.username === 'string' ? data.username : null,
    xp: Number(data?.xp ?? 0),
  };
}

function reviewFromDocument(document: QueryDocumentSnapshot<DocumentData>): FeedItem {
  const data = document.data();
  const createdAt = data.createdAt as Timestamp | undefined;
  return {
    id: document.id,
    authorId: String(data.authorId ?? ''),
    authorDisplayName: String(data.authorDisplayName ?? 'Tastes member'),
    venueId: String(data.venueId ?? ''),
    venueName: String(data.venueName ?? 'Place'),
    rating: Number(data.rating ?? 0),
    text: String(data.text ?? ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    dishReviews: Array.isArray(data.dishReviews) ? data.dishReviews : [],
    status: 'published',
    commentCount: Number(data.commentCount ?? 0),
    reactionCount: Number(data.reactionCount ?? 0),
    createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : new Date().toISOString(),
  };
}

function useProfile(userId: string, fallbackName: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onSnapshot(
    doc(firestore, 'users', userId),
    (snapshot) => {
      setProfile(snapshot.exists() ? profileFromDocument(snapshot.data(), fallbackName) : null);
      setLoading(false);
    },
    () => setLoading(false),
  ), [fallbackName, userId]);
  return { loading, profile };
}

function useProfileReviews(userId: string) {
  const [reviews, setReviews] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => onSnapshot(
    query(
      collection(firestore, 'reviews'),
      where('status', '==', 'published'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20),
    ),
    (snapshot) => {
      setReviews(snapshot.docs.map(reviewFromDocument));
      setLoading(false);
    },
    () => setLoading(false),
  ), [userId]);
  return { loading, reviews };
}

function DishPhoto({ path }: { path: string }) {
  const [uri, setUri] = useState<string>();
  useEffect(() => {
    let active = true;
    void getDownloadURL(storageRef(storage, path)).then((value) => {
      if (active) setUri(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [path]);
  return uri
    ? <Image source={{ uri }} style={stylesStatic.dishImage} />
    : <View style={stylesStatic.dishImagePlaceholder} />;
}

function ReviewCard({ item, onComments, profile }: { item: FeedItem; onComments: () => void; profile: ProfileData }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dishes = item.dishReviews ?? [];
  const tags = item.tags ?? [];
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Image source={avatarSource(profile)} style={styles.reviewAvatar} />
        <View style={styles.reviewAuthorCopy}>
          <Text style={styles.reviewAuthor}>{profile.displayName}</Text>
          <Text style={styles.reviewHandle}>{profile.username ? `@${profile.username}` : ''}</Text>
        </View>
        <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        <Text style={styles.moreGlyph}>⋮</Text>
      </View>
      <View style={styles.reviewBody}>
        <View style={styles.reviewVenueRow}>
          <View style={styles.reviewVenueCopy}>
            <Text numberOfLines={1} style={styles.reviewVenue}>{item.venueName}</Text>
            <Text style={styles.reviewStars}>{'★'.repeat(Math.max(1, Math.round(item.rating)))}<Text style={styles.emptyStars}>{'★'.repeat(Math.max(0, 5 - Math.round(item.rating)))}</Text></Text>
          </View>
          {tags[0] ? <Text style={styles.visitTag}>{tagLabels[tags[0]] ?? tags[0]}</Text> : null}
        </View>
        {dishes.length > 0 ? (
          <ScrollView contentContainerStyle={styles.dishRow} horizontal showsHorizontalScrollIndicator={false}>
            {dishes.map((dish) => (
              <View key={dish.id} style={styles.dishCard}>
                <DishPhoto path={dish.photoPath} />
                <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <Text numberOfLines={4} style={styles.reviewText}>{item.text}</Text>
        <View style={styles.metrics}>
          <Text style={styles.metric}>♡ {item.reactionCount}</Text>
          <Pressable onPress={onComments}><Text style={styles.metric}>◯ {item.commentCount}</Text></Pressable>
          <Text style={styles.metric}>↗</Text>
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={stylesStatic.stat}>
      <Text style={[stylesStatic.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[stylesStatic.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

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
    return <View style={[styles.loading, { backgroundColor: colors.canvas }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const visibleReviews = profileReviews.reviews.filter((review) => (
    review.venueName.toLowerCase().includes(search.trim().toLowerCase())
      || review.text.toLowerCase().includes(search.trim().toLowerCase())
  ));
  const chips = [
    profile.city ? `${profile.city} 📍` : null,
    profile.favoriteCuisines[0] ? `${profile.favoriteCuisines[0]} ❤️` : null,
    profile.favoriteCuisines[1] ? `${profile.favoriteCuisines[1]} 🍽️` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <View style={styles.hero}>
          <View style={styles.topBar}>
            <Pressable accessibilityLabel={own ? 'Open settings' : 'Back'} onPress={own ? onSettings : onBack} style={styles.topAction}>
              {own ? <SettingsIcon width={20} height={20} /> : <BackIcon width={9} height={16} />}
            </Pressable>
            <Text numberOfLines={1} style={styles.username}>{profile.username ? `@${profile.username}` : profile.displayName}</Text>
            <Pressable accessibilityLabel="Share profile" style={styles.topAction}><ShareIcon width={24} height={24} /></Pressable>
          </View>
          <Pressable disabled={!own || uploadingPhoto} onPress={() => void chooseProfilePhoto()} style={styles.avatarWrap}>
            <Image source={avatarSource(profile)} style={styles.avatar} />
            {uploadingPhoto ? <View style={styles.avatarBusy}><ActivityIndicator color="#FFFFFF" /></View> : null}
          </Pressable>
          <Text style={styles.name}>{profile.displayName}</Text>
          {profile.bio ? <Text numberOfLines={2} style={styles.bio}>{profile.bio}</Text> : null}
          <View style={styles.stats}>
            <Stat label="Reviews" value={profile.reviewCount || profileReviews.reviews.length} />
            <View style={styles.statDivider} />
            <Stat label="Followers" value={profile.followerCount} />
            <View style={styles.statDivider} />
            <Stat label="Following" value={profile.followingCount} />
          </View>
          {!own ? (
            <View style={styles.publicActions}>
              <Pressable disabled={followPending} onPress={() => void toggleFollow()} style={[styles.followAction, following && styles.followingAction]}>
                {followPending ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.actionLabel}><Image source={followIcon} style={styles.followIcon} /><Text style={styles.followActionText}>{following ? 'Following' : 'Follow'}</Text></View>}
              </Pressable>
              <Pressable onPress={() => onMessage(targetUserId)} style={styles.messageAction}><View style={styles.actionLabel}><Image source={messageIcon} style={styles.messageIcon} /><Text style={styles.messageActionText}>Message</Text></View></Pressable>
            </View>
          ) : null}
          {chips.length > 0 ? <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>{chips.map((chip) => <Text key={chip} style={styles.chip}>{chip}</Text>)}</ScrollView> : null}
          <View style={styles.badges}>
            {badgeAssets.map((asset, index) => <View key={badgeLabels[index]} style={styles.badge}><Image resizeMode="contain" source={asset} style={styles.badgeImage} /></View>)}
          </View>
        </View>

        <View style={[styles.controls, { backgroundColor: colors.canvas }]}>
          <View style={styles.switcher}>
            {(['reviews', 'map', 'wishlist'] as const).map((tab) => (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.switchOption, activeTab === tab && styles.switchActive]}>
                <Text style={[styles.switchText, activeTab === tab && styles.switchTextActive]}>{tab === 'wishlist' ? 'Wishlist' : tab[0].toUpperCase() + tab.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.searchBar}>
            <SearchIcon width={24} height={24} />
            <TextInput onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={search} />
            <Text style={styles.tuneGlyph}>☷</Text>
          </View>
        </View>

        {activeTab === 'reviews' ? (
          <View style={styles.reviewList}>
            {profileReviews.loading ? <ActivityIndicator color={colors.primary} style={styles.listLoader} /> : null}
            {!profileReviews.loading && visibleReviews.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyTitle}>No reviews yet</Text><Text style={styles.emptyCopy}>{own ? 'Your reviews will appear here.' : 'This person has not posted a review yet.'}</Text></View>
            ) : null}
            {visibleReviews.map((review) => <ReviewCard item={review} key={review.id} onComments={() => onOpenComments(review.id)} profile={profile} />)}
          </View>
        ) : (
          <View style={styles.empty}><Text style={styles.emptyTitle}>{activeTab === 'map' ? 'Taste map' : 'Wishlist'}</Text><Text style={styles.emptyCopy}>{activeTab === 'map' ? 'Reviewed places will appear on the profile map.' : own ? 'Your saved places stay organized in Discover.' : 'Saved places are private for now.'}</Text></View>
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 24 },
  hero: { paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  topBar: { height: 102, paddingTop: 48, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background },
  topAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  username: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  avatarWrap: { width: 120, height: 120, marginTop: 18, alignSelf: 'center', borderRadius: 60 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceRaised },
  avatarBusy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  name: { marginTop: 10, color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  bio: { marginTop: 6, marginHorizontal: 38, color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  stats: { height: 50, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  publicActions: { marginTop: 13, paddingHorizontal: 16, flexDirection: 'row', gap: 10 },
  followAction: { flex: 1, height: 45, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9312B' },
  followingAction: { backgroundColor: '#8E2824' },
  actionLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followIcon: { width: 24, height: 24 },
  messageIcon: { width: 20, height: 20 },
  followActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.7 },
  messageAction: { flex: 1, height: 45, borderWidth: 1, borderColor: '#C9312B', borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161616' },
  messageActionText: { color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: 0.6 },
  chips: { minWidth: '100%', paddingHorizontal: 10, paddingTop: 14, gap: 6, justifyContent: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 39, overflow: 'hidden', backgroundColor: '#161616', color: colors.text, fontSize: 14 },
  badges: { height: 86, marginTop: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { width: 68, height: 84, alignItems: 'center', justifyContent: 'center' },
  badgeImage: { width: 68, height: 84 },
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
  reviewCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  reviewHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20 },
  reviewAuthorCopy: { flex: 1, marginLeft: 8, gap: 3 },
  reviewAuthor: { color: colors.text, fontSize: 15, fontWeight: '600' },
  reviewHandle: { color: colors.textSecondary, fontSize: 13 },
  reviewDate: { color: colors.textMuted, fontSize: 13 },
  moreGlyph: { marginLeft: 8, color: colors.textMuted, fontSize: 24 },
  reviewBody: { padding: 16, gap: 13 },
  reviewVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewVenueCopy: { flex: 1, gap: 3 },
  reviewVenue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  reviewStars: { color: '#D33B35', fontSize: 18, letterSpacing: 1 },
  emptyStars: { color: '#D33B35', opacity: 0.3 },
  visitTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 40, overflow: 'hidden', backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 12 },
  dishRow: { gap: 9 },
  dishCard: { width: 150, height: 150, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, backgroundColor: colors.surfaceRaised },
  dishTitle: { position: 'absolute', top: 8, left: 10, right: 10, color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dishRating: { position: 'absolute', bottom: 5, left: 0, paddingHorizontal: 10, paddingVertical: 4, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(22,22,22,0.72)', color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  reviewText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  metrics: { paddingTop: 2, flexDirection: 'row', gap: 20 },
  metric: { color: colors.text, fontSize: 14 },
  empty: { minHeight: 220, marginHorizontal: 16, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});

const stylesStatic = StyleSheet.create({
  stat: { width: 90, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '600' },
  statLabel: { marginTop: 2, fontSize: 13 },
  dishImage: { width: 150, height: 150 },
  dishImagePlaceholder: { width: 150, height: 150, backgroundColor: '#222222' },
});
