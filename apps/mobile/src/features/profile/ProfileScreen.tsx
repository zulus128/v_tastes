import { apiErrorMessage } from '@tastes/firebase-client';
import type { FeedItem, Venue } from '@tastes/contracts';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadJpegImageVariant } from '../../infrastructure/imageUpload';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
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
import Svg, { Path } from 'react-native-svg';
import { FavouritesPane } from '../favourites/FavouritesPane';
import { useToggleFollow } from '../discover/api';
import { firestore, storage } from '../../infrastructure/firebase';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { captureException } from '../../infrastructure/observability';
import { useIsVisualAudit, useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import { type ProfileData, useProfile, useProfileReviews } from './api';
import { ProfileHeader, ProfileTopBar } from './ProfileHeader';
import { ProfileReviewCard } from './ProfileReviewCard';
import { ProfileDraftCard, type ProfileReviewDraft } from './ProfileDraftCard';
import { ProfileExtras, type ProfileExtra } from './ProfileExtras';
import { buildTasteHighlights } from './profileHighlights';
import { ProfileMapSheet } from './ProfileMapSheet';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

type ProfileTab = 'reviews' | 'wishlist';
const FALLBACK_MAP_REGION = {
  latitude: 41.02,
  longitude: 29,
  latitudeDelta: 0.14,
  longitudeDelta: 0.13,
};
const MAP_FOCUS_PIN_LIMIT = 5;
const REVIEW_DRAFT_KEY_PREFIX = '@tastes/review-draft/';

function fallbackProfile(displayName: string): ProfileData {
  return {
    bio: '',
    city: null,
    displayName,
    favoriteCuisines: [],
    favoriteDish: null,
    favoriteVenueId: null,
    followerCount: 0,
    followingCount: 0,
    photoPath: null,
    photoUrl: null,
    reviewCount: 0,
    username: null,
    xp: 0,
  };
}

function hasMapCoordinates(
  venue: Venue,
): venue is Venue & { latitude: number; longitude: number } {
  return (
    typeof venue.latitude === 'number' &&
    Number.isFinite(venue.latitude) &&
    venue.latitude >= -90 &&
    venue.latitude <= 90 &&
    typeof venue.longitude === 'number' &&
    Number.isFinite(venue.longitude) &&
    venue.longitude >= -180 &&
    venue.longitude <= 180
  );
}

function mapRegionFor(
  venues: readonly (Venue & { latitude: number; longitude: number })[],
) {
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

function PencilIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={responsiveSize(20)}
      viewBox="0 0 24 24"
      width={responsiveSize(20)}
    >
      <Path
        d="M4 20l4.2-1 10.6-10.6a2.12 2.12 0 0 0-3-3L5.2 16 4 20Z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.7}
      />
      <Path
        d="m14.6 6.6 3 3"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.7}
      />
    </Svg>
  );
}

function PinIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={responsiveSize(20)}
      viewBox="0 0 24 24"
      width={responsiveSize(20)}
    >
      <Path
        d="m14.2 4.3 5.5 5.5-3.1 1.1-3.9 3.9.3 3.1-1 1-3.4-3.4-4.1 4.1-.8-.8 4.1-4.1-3.4-3.4 1-1 3.1.3 3.9-3.9 1.1-3.1.7.7Z"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.55}
      />
    </Svg>
  );
}

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={responsiveSize(20)}
      viewBox="0 0 24 24"
      width={responsiveSize(20)}
    >
      <Path
        d="M5 7h14M9 7V4h6v3m2 0-.8 13H7.8L7 7m3 3v7m4-7v7"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.7}
      />
    </Svg>
  );
}

function UserBlockedIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={responsiveSize(60)}
      viewBox="0 0 60 60"
      width={responsiveSize(60)}
    >
      <Path
        d="M26 29a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-15 20c0-8.3 6.7-15 15-15 4 0 7.7 1.6 10.4 4.2"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={3.2}
      />
      <Path
        d="M40 38a10 10 0 1 0 14 14 10 10 0 0 0-14-14Zm1.3 13.3 11.4-11.4"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={3.2}
      />
    </Svg>
  );
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
  const actionDangerColor =
    colors.background === '#080808' ? '#D32620' : '#A00E0B';
  const own = currentUserId === targetUserId;
  const api = useTastesApi();
  const visualAudit = useIsVisualAudit();
  const followMutation = useToggleFollow(currentUserId);
  const {
    error: profileError,
    loading,
    profile,
    retry: retryProfile,
  } = useProfile(targetUserId, fallbackName);
  const profileReviews = useProfileReviews(targetUserId);
  const [activeTab, setActiveTab] = useState<ProfileTab>('reviews');
  const [following, setFollowing] = useState(initialFollowing);
  const [followPending, setFollowPending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [search, setSearch] = useState('');
  const [extra, setExtra] = useState<ProfileExtra>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [blockPending, setBlockPending] = useState(false);
  const [mapVenues, setMapVenues] = useState<Venue[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReload, setMapReload] = useState(0);
  const [selectedReview, setSelectedReview] = useState<FeedItem | null>(null);
  const [editingReview, setEditingReview] = useState(false);
  const [editText, setEditText] = useState('');
  const [reviewActionPending, setReviewActionPending] = useState(false);
  const [favoritePlaceName, setFavoritePlaceName] = useState<string | null>(
    null,
  );
  const [venueImages, setVenueImages] = useState<Record<string, string>>({});
  const [profileReactions, setProfileReactions] = useState<
    Record<string, boolean>
  >({});
  const [draft, setDraft] = useState<ProfileReviewDraft | null>(null);
  const editSheet = useBottomSheetMotion({
    onClose: () => setEditingReview(false),
    visible: editingReview,
  });

  async function reactToProfileReview(
    reviewId: string,
    idempotencyPrefix: string,
  ) {
    try {
      const response = await api.reactToReview({
        idempotencyKey: createIdempotencyKey(idempotencyPrefix),
        reviewId,
        reaction: 'like',
      });
      setProfileReactions((current) => ({
        ...current,
        [reviewId]: response.data.active,
      }));
    } catch (error) {
      Alert.alert('Could not update reaction', apiErrorMessage(error));
    }
  }

  useEffect(
    () => setFollowing(initialFollowing),
    [initialFollowing, targetUserId],
  );
  useEffect(() => {
    if (own) {
      setBlocked(false);
      return;
    }
    let active = true;
    void api
      .getProfileExtras({ targetUserId })
      .then((result) => {
        if (active) setBlocked(result.data.blocked);
      })
      .catch(() => {
        if (active) setBlocked(false);
      });
    return () => {
      active = false;
    };
  }, [api, own, targetUserId]);
  useEffect(() => {
    if (own) return undefined;
    return onSnapshot(
      doc(firestore, 'users', currentUserId, 'following', targetUserId),
      (snapshot) => setFollowing(snapshot.exists()),
    );
  }, [currentUserId, own, targetUserId]);
  useFocusEffect(
    useMemo(
      () => () => {
        if (!own) return undefined;
        let active = true;
        void AsyncStorage.getItem(
          `${REVIEW_DRAFT_KEY_PREFIX}${currentUserId}`,
        ).then((stored) => {
          if (!active) return;
          try {
            const value = stored
              ? (JSON.parse(stored) as {
                  dishes?: ProfileReviewDraft['dishes'];
                  rating?: number;
                  savedAt?: string;
                  selectedVenue?: { name?: string };
                  tags?: unknown[];
                  text?: string;
                  venueId?: string;
                })
              : null;
            const hasSavedDraft = Boolean(
              value &&
              (value.venueId ||
                (typeof value.rating === 'number' && value.rating > 0) ||
                value.text?.trim() ||
                (Array.isArray(value.tags) && value.tags.length > 0) ||
                (Array.isArray(value.dishes) && value.dishes.length > 0)),
            );
            setDraft(
              hasSavedDraft
                ? {
                    dishes: Array.isArray(value?.dishes) ? value.dishes : [],
                    rating:
                      typeof value?.rating === 'number' ? value.rating : 0,
                    savedAt:
                      typeof value?.savedAt === 'string'
                        ? value.savedAt
                        : new Date().toISOString(),
                    venueName: value?.selectedVenue?.name ?? 'Untitled place',
                    text:
                      value?.text?.trim() ||
                      'Your unfinished review is ready to continue.',
                  }
                : null,
            );
          } catch {
            setDraft(null);
          }
        });
        return () => {
          active = false;
        };
      },
      [currentUserId, own],
    ),
  );
  useEffect(() => {
    const venueIds = [
      ...new Set(profileReviews.reviews.map((review) => review.venueId)),
    ];
    let active = true;
    setMapError(null);
    void Promise.all(
      venueIds.map((venueId) =>
        api.getPlace({ venueId }).then((response) => response.data.venue),
      ),
    )
      .then((venues) => {
        if (active) setMapVenues(venues);
      })
      .catch((error) => {
        if (active) setMapError(apiErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [api, mapReload, profileReviews.reviews]);
  useEffect(() => {
    if (!profile?.favoriteVenueId) {
      setFavoritePlaceName(null);
      return;
    }
    let active = true;
    void api
      .getPlace({ venueId: profile.favoriteVenueId })
      .then((response) => {
        if (active) setFavoritePlaceName(response.data.venue.name);
      })
      .catch(() => {
        if (active) setFavoritePlaceName(null);
      });
    return () => {
      active = false;
    };
  }, [api, profile?.favoriteVenueId]);

  useEffect(() => {
    const venueIds = [
      ...new Set(
        profileReviews.reviews
          .filter((review) =>
            review.dishReviews?.some((dish) => !dish.photoPath),
          )
          .map((review) => review.venueId),
      ),
    ].filter((venueId) => venueId && !(venueId in venueImages));
    if (venueIds.length === 0) return;
    let active = true;
    void Promise.all(
      venueIds.map(async (venueId) => {
        try {
          const response = await api.getPlace({ venueId });
          return [venueId, response.data.venue.imageUrl ?? ''] as const;
        } catch {
          return [venueId, ''] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setVenueImages((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    });
    return () => {
      active = false;
    };
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

  function confirmBlock(nextBlocked: boolean) {
    setProfileMenuOpen(false);
    Alert.alert(
      nextBlocked
        ? `Block ${profile?.displayName ?? 'this user'}?`
        : `Unblock ${profile?.displayName ?? 'this user'}?`,
      nextBlocked
        ? "They can't follow you, message you or see your reviews."
        : 'They will be able to interact with you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextBlocked ? 'Block' : 'Unblock',
          style: nextBlocked ? 'destructive' : 'default',
          onPress: () => {
            setBlockPending(true);
            void api
              .setUserBlocked({ targetUserId, blocked: nextBlocked })
              .then(() => {
                setBlocked(nextBlocked);
                if (nextBlocked) setFollowing(false);
              })
              .catch((error) =>
                Alert.alert(
                  `Could not ${nextBlocked ? 'block' : 'unblock'} user`,
                  apiErrorMessage(error),
                ),
              )
              .finally(() => setBlockPending(false));
          },
        },
      ],
    );
  }

  async function chooseProfilePhoto() {
    if (!own || uploadingPhoto || !profile) return;
    if (visualAudit) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to update your profile photo.',
      );
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
    const photoId = Date.now();
    const photoPath = `profile-images/${currentUserId}/avatar-${photoId}.jpg`;
    const photoThumbnailPath = `profile-images/${currentUserId}/avatar-${photoId}-thumbnail.jpg`;
    setUploadingPhoto(true);
    try {
      const crop = {
        crop: {
          originX: Math.max(0, (asset.width - cropSize) / 2),
          originY: Math.max(0, (asset.height - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        },
      };
      await Promise.all([
        uploadJpegImageVariant({
          actions: [crop, { resize: { width: 512, height: 512 } }],
          compress: 0.76,
          path: photoPath,
          uri: asset.uri,
        }),
        uploadJpegImageVariant({
          actions: [crop, { resize: { width: 320, height: 320 } }],
          compress: 0.68,
          path: photoThumbnailPath,
          uri: asset.uri,
        }),
      ]);
      await api.updateProfilePhoto({ photoPath, photoThumbnailPath });
      if (profile.photoPath && profile.photoPath !== photoPath) {
        void deleteObject(storageRef(storage, profile.photoPath)).catch(
          (error) =>
            captureException(error, { operation: 'delete-old-profile-photo' }),
        );
      }
      if (
        profile.photoThumbnailPath &&
        profile.photoThumbnailPath !== photoThumbnailPath
      ) {
        void deleteObject(
          storageRef(storage, profile.photoThumbnailPath),
        ).catch((error) =>
          captureException(error, {
            operation: 'delete-old-profile-thumbnail',
          }),
        );
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
      Alert.alert(
        `Could not ${pinned ? 'pin' : 'unpin'} review`,
        apiErrorMessage(error),
      );
    } finally {
      setReviewActionPending(false);
    }
  }

  function confirmDeleteReview() {
    if (!selectedReview || reviewActionPending) return;
    const review = selectedReview;
    Alert.alert('Delete review?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setReviewActionPending(true);
          void api
            .deleteReview({ reviewId: review.id })
            .then(() => setSelectedReview(null))
            .catch((error) =>
              Alert.alert('Could not delete review', apiErrorMessage(error)),
            )
            .finally(() => setReviewActionPending(false));
        },
      },
    ]);
  }

  const displayedProfile = profile ?? fallbackProfile(fallbackName);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleReviews = profileReviews.reviews
    .filter(
      (review) =>
        review.venueName.toLowerCase().includes(normalizedSearch) ||
        review.text.toLowerCase().includes(normalizedSearch),
    )
    .filter((review) => {
      const range = appliedFilters
        .find((value) => value.startsWith('Rating:'))
        ?.slice(7)
        .split('-')
        .map(Number);
      return (
        !range ||
        range.length !== 2 ||
        (review.rating >= range[0]! && review.rating <= range[1]!)
      );
    });
  const sortedReviews = [...visibleReviews].sort(
    (left, right) =>
      Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)),
  );
  const venuesById = new Map(mapVenues.map((venue) => [venue.id, venue]));
  const tasteHighlights = buildTasteHighlights({
    favoritePlaceName,
    profile: displayedProfile,
    reviews: profileReviews.reviews,
    venues: mapVenues,
  });
  const mapPlaces = profileReviews.reviews
    .map((review) => ({ review, venue: venuesById.get(review.venueId) }))
    .filter((place): place is { review: FeedItem; venue: Venue } =>
      Boolean(place.venue),
    )
    .filter(
      ({ review }, index, places) =>
        places.findIndex((place) => place.review.venueId === review.venueId) ===
        index,
    );
  const mappedPlaces = mapPlaces.filter(
    (
      place,
    ): place is {
      review: FeedItem;
      venue: Venue & { latitude: number; longitude: number };
    } => hasMapCoordinates(place.venue),
  );
  const focusPlaces = mappedPlaces.slice(0, MAP_FOCUS_PIN_LIMIT);
  const mapRegion = mapRegionFor(focusPlaces.map(({ venue }) => venue));
  const mapKey = `${isDark ? 'dark' : 'light'}:${focusPlaces.map(({ venue }) => `${venue.id}:${venue.latitude}:${venue.longitude}`).join('|')}`;
  const profileHeader = (
    <ProfileHeader
      blocked={blocked}
      followPending={followPending}
      following={following}
      onAvatarPress={() => void chooseProfilePhoto()}
      onMessage={() => onMessage(targetUserId)}
      onFollowers={() => setExtra('followers')}
      onFollowing={() => setExtra('following')}
      onToggleFollow={() => void toggleFollow()}
      own={own}
      profile={displayedProfile}
      reviewCount={displayedProfile.reviewCount}
      tasteHighlights={tasteHighlights}
      uploadingPhoto={uploadingPhoto}
    />
  );
  const controls = (
    <View style={[styles.controls, { backgroundColor: colors.canvas }]}>
      <View style={styles.switcher}>
        <Pressable
          onPress={() => setActiveTab('reviews')}
          style={[
            styles.switchOption,
            activeTab === 'reviews' && styles.switchActive,
          ]}
        >
          <Text
            style={[
              styles.switchText,
              activeTab === 'reviews' && styles.switchTextActive,
            ]}
          >
            Reviews
          </Text>
        </Pressable>
        <Pressable onPress={() => setMapOpen(true)} style={styles.switchOption}>
          <Text style={styles.switchText}>Map</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('wishlist')}
          style={[
            styles.switchOption,
            activeTab === 'wishlist' && styles.switchActive,
          ]}
        >
          <Text
            style={[
              styles.switchText,
              activeTab === 'wishlist' && styles.switchTextActive,
            ]}
          >
            Wishlist
          </Text>
        </Pressable>
      </View>
      {activeTab === 'reviews' ? (
        <View style={styles.searchBar}>
          <SearchIcon
            color={colors.textMuted}
            width={responsiveSize(24)}
            height={responsiveSize(24)}
          />
          <TextInput
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            value={search}
          />
          <Pressable accessibilityLabel="Open filters" onPress={onOpenFilters}>
            <SearchTuneIcon
              color={colors.textMuted}
              height={responsiveSize(24)}
              width={responsiveSize(24)}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
  const initialProfileState = !profile;
  const initialReviewsError = Boolean(
    profileReviews.error && profileReviews.reviews.length === 0,
  );
  const retryProfileScreen = () => {
    retryProfile();
    profileReviews.retry();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {initialProfileState ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + responsiveSize(24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {profileHeader}
          {controls}
          <View
            accessibilityLabel={
              profileError ? 'Profile unavailable' : 'Loading profile'
            }
            style={styles.empty}
          >
            {loading && !profileError ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.emptyTitle}>
                  {profileError ? 'No connection' : 'Profile unavailable'}
                </Text>
                <Text style={styles.emptyCopy}>
                  {profileError
                    ? 'Check your internet connection and try again.'
                    : 'This profile could not be found.'}
                </Text>
                {profileError ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={retryProfileScreen}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      ) : blocked ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + responsiveSize(24) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {profileHeader}
          <View style={styles.blockedState}>
            <UserBlockedIcon color={colors.text} />
            <Text style={styles.blockedTitle}>You blocked this account</Text>
            <Text style={styles.blockedCopy}>
              They can&apos;t follow you, message you or see your reviews.
            </Text>
            <Pressable
              disabled={blockPending}
              onPress={() => confirmBlock(false)}
              style={styles.unblockButton}
            >
              {blockPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.unblockText}>Unblock</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : activeTab === 'reviews' ? (
        <FlatList
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            styles.reviewList,
            { paddingBottom: tabBarHeight + responsiveSize(24) },
          ]}
          data={sortedReviews}
          initialNumToRender={6}
          keyExtractor={(review) => review.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={6}
          ListHeaderComponent={
            <>
              {profileHeader}
              {controls}
              {own && draft ? (
                <View style={styles.draftCardWrap}>
                  <ProfileDraftCard
                    draft={draft}
                    onContinue={onContinueDraft}
                    profile={displayedProfile}
                  />
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            initialReviewsError ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No connection</Text>
                <Text style={styles.emptyCopy}>
                  Check your internet connection and try again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={profileReviews.retry}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : !profileReviews.loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptyCopy}>
                  {own
                    ? 'Your reviews will appear here.'
                    : 'This person has not posted a review yet.'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            profileReviews.loading || profileReviews.loadingMore ? (
              <ActivityIndicator
                color={colors.primary}
                style={styles.listLoader}
              />
            ) : profileReviews.error && profileReviews.reviews.length > 0 ? (
              <Pressable
                onPress={() => void profileReviews.loadMore()}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Try loading more</Text>
              </Pressable>
            ) : null
          }
          onEndReached={() => void profileReviews.loadMore()}
          onEndReachedThreshold={0.5}
          windowSize={7}
          renderItem={({ item: review }) => (
            <View style={styles.reviewItem}>
              <ProfileReviewCard
                fallbackImageUrl={venueImages[review.venueId]}
                item={review}
                onComments={() => onOpenComments(review.id)}
                onMore={() =>
                  own
                    ? setSelectedReview(review)
                    : void Share.share({
                        message: `${displayedProfile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastesapp.com/reviews/${review.id}/comments`,
                      })
                }
                onReact={() =>
                  void reactToProfileReview(review.id, 'profile-reaction')
                }
                reacted={profileReactions[review.id] ?? review.reacted}
                onShare={() =>
                  void Share.share({
                    message: `${displayedProfile.displayName} recommends ${review.venueName}: ${review.text}\nhttps://tastesapp.com/reviews/${review.id}/comments`,
                  })
                }
                profile={displayedProfile}
              />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + responsiveSize(24) },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
        >
          {profileHeader}
          {controls}
          {own ? (
            <View style={styles.wishlistPane}>
              <FavouritesPane
                appliedFilters={appliedFilters}
                onOpenFilters={onOpenFilters}
                onOpenPlace={onOpenPlace}
                userId={currentUserId}
              />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Wishlist is private</Text>
              <Text style={styles.emptyCopy}>
                Saved places are only visible to their owner.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      <ProfileTopBar
        onBack={onBack}
        onSettings={onSettings}
        onShare={() =>
          own
            ? void Share.share({
                message: `See ${displayedProfile.displayName} on Tastes: https://tastesapp.com/users/${targetUserId}`,
                url: `https://tastesapp.com/users/${targetUserId}`,
              })
            : setProfileMenuOpen(true)
        }
        own={own}
        profile={displayedProfile}
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
      <ProfileMapSheet
        error={mapError}
        keyValue={mapKey}
        mappedPlaces={mappedPlaces}
        onClose={() => setMapOpen(false)}
        onOpenPlace={(venueId) => {
          setMapOpen(false);
          onOpenPlace(venueId);
        }}
        onRetry={() => setMapReload((value) => value + 1)}
        placeCount={mapPlaces.length}
        region={mapRegion}
        visible={mapOpen && !blocked}
      />
      <Modal
        animationType="fade"
        onRequestClose={() => setProfileMenuOpen(false)}
        transparent
        visible={profileMenuOpen}
      >
        <Pressable
          onPress={() => setProfileMenuOpen(false)}
          style={styles.reviewActionBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.actionSheet}
          >
            <Pressable
              onPress={() => {
                setProfileMenuOpen(false);
                void Share.share({
                  message: `See ${displayedProfile.displayName} on Tastes: https://tastesapp.com/users/${targetUserId}`,
                });
              }}
              style={styles.actionRow}
            >
              <Text style={styles.actionText}>Share profile</Text>
            </Pressable>
            <Pressable
              disabled={blockPending}
              onPress={() => confirmBlock(!blocked)}
              style={[styles.actionRow, styles.deleteAction]}
            >
              <Text style={styles.deleteActionText}>
                {blocked ? 'Unblock user' : 'Block this user'}
              </Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              onPress={() => setProfileMenuOpen(false)}
              style={[styles.actionRow, styles.cancelAction]}
            >
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedReview(null)}
        transparent
        visible={selectedReview !== null && !editingReview}
      >
        <Pressable
          onPress={() => setSelectedReview(null)}
          style={styles.reviewActionBackdrop}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.actionSheet}
          >
            <Pressable
              onPress={() => {
                setEditText(selectedReview?.text ?? '');
                setEditingReview(true);
              }}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.actionPressed,
              ]}
            >
              <PencilIcon color={colors.text} />
              <Text style={styles.actionText}>Edit</Text>
            </Pressable>
            <Pressable
              disabled={reviewActionPending}
              onPress={() => void togglePinnedReview()}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.actionPressed,
              ]}
            >
              <PinIcon color={colors.text} />
              <Text style={styles.actionText}>
                {selectedReview?.pinned ? 'Unpin' : 'Pin'}
              </Text>
            </Pressable>
            <Pressable
              disabled={reviewActionPending}
              onPress={confirmDeleteReview}
              style={({ pressed }) => [
                styles.actionRow,
                styles.deleteAction,
                pressed && styles.actionPressed,
              ]}
            >
              <TrashIcon color={actionDangerColor} />
              <Text style={styles.deleteActionText}>Delete</Text>
            </Pressable>
            <View style={styles.actionDivider} />
            <Pressable
              onPress={() => setSelectedReview(null)}
              style={({ pressed }) => [
                styles.actionRow,
                styles.cancelAction,
                pressed && styles.actionPressed,
              ]}
            >
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        animationType="none"
        onRequestClose={editSheet.close}
        transparent
        visible={editingReview}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.actionBackdrop}
        >
          <Pressable
            onPress={editSheet.close}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.editSheet,
              { transform: [{ translateY: editSheet.translateY }] },
            ]}
          >
            <View style={styles.editSheetDragArea} {...editSheet.panHandlers}>
              <View style={styles.editSheetHandle} />
            </View>
            <Text style={styles.editTitle}>Edit review</Text>
            <TextInput
              autoFocus
              multiline
              onChangeText={setEditText}
              style={styles.editInput}
              value={editText}
            />
            <Pressable
              disabled={reviewActionPending}
              onPress={() => void saveReviewEdit()}
              style={styles.editSave}
            >
              {reviewActionPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.editSaveText}>Save</Text>
              )}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => {
  const isDark = colors.background === '#080808';
  return responsiveStyleSheet({
    screen: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingTop: 102, paddingBottom: 24 },
    controls: {
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: 14,
      gap: 12,
    },
    switcher: {
      height: 40,
      padding: 4,
      flexDirection: 'row',
      borderRadius: 100,
      backgroundColor: isDark ? 'rgba(223,223,233,0.12)' : colors.surface,
    },
    switchOption: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
    },
    switchActive: { backgroundColor: isDark ? '#D9DDE5' : '#282828' },
    switchText: { color: isDark ? '#C4CAD7' : '#7A7A7A', fontSize: 13 },
    switchTextActive: {
      color: isDark ? '#161616' : '#FFFFFF',
      fontWeight: '700',
    },
    searchBar: {
      height: 39,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 44,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surface,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      paddingVertical: 0,
    },
    reviewList: { gap: 14 },
    reviewItem: { paddingHorizontal: 15 },
    draftCardWrap: { marginHorizontal: 15 },
    listLoader: { marginVertical: 36 },
    empty: {
      minHeight: 220,
      marginHorizontal: 16,
      padding: 28,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      backgroundColor: colors.surface,
    },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    emptyCopy: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 8,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 18,
      backgroundColor: colors.primary,
    },
    retryText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
    actionBackdrop: {
      flex: 1,
      padding: 16,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    reviewActionBackdrop: {
      flex: 1,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    actionSheet: {
      width: '100%',
      maxWidth: 300,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: isDark ? '#45474B' : '#E4E4E4',
      borderRadius: 24,
      backgroundColor: isDark ? '#161616' : '#FFFFFF',
    },
    actionRow: {
      height: 48,
      paddingHorizontal: 18,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 100,
      backgroundColor: isDark ? '#242424' : 'rgba(0,0,0,0.10)',
    },
    actionText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.24,
      textAlign: 'center',
    },
    deleteAction: {
      borderWidth: isDark ? 1 : 0.5,
      borderColor: isDark ? '#B82F29' : '#A00E0B',
      backgroundColor: isDark ? '#1E0B0A' : 'rgba(160,14,11,0.10)',
    },
    deleteActionText: {
      color: isDark ? '#D32620' : '#A00E0B',
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.24,
      textAlign: 'center',
    },
    actionDivider: {
      height: 1,
      marginHorizontal: 2,
      marginVertical: 8,
      backgroundColor: isDark ? '#45474B' : '#E4E4E4',
    },
    cancelAction: { backgroundColor: isDark ? '#242424' : 'rgba(0,0,0,0.10)' },
    actionPressed: { opacity: 0.72 },
    editSheet: {
      padding: 20,
      borderRadius: 24,
      backgroundColor: colors.surface,
    },
    editSheetDragArea: {
      height: 28,
      marginTop: -14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editSheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    editTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
    editInput: {
      minHeight: 120,
      marginTop: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      color: colors.text,
      backgroundColor: colors.canvas,
      textAlignVertical: 'top',
    },
    editSave: {
      height: 50,
      marginTop: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 25,
      backgroundColor: colors.primary,
    },
    editSaveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    wishlistPane: {},
    blockedState: {
      minHeight: 360,
      paddingHorizontal: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockedTitle: {
      marginTop: 12,
      color: colors.text,
      fontSize: 22,
      lineHeight: 27,
      fontWeight: '700',
      textAlign: 'center',
    },
    blockedCopy: {
      marginTop: 10,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
    },
    unblockButton: {
      minWidth: 108,
      height: 44,
      marginTop: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 24,
      backgroundColor: colors.primary,
    },
    unblockText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  });
};
