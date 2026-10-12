import type { PlaceReviewSort } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import restaurantImage from '../../../assets/discover/restaurant.png';
import CheckIcon from '../../../assets/activities/check.svg';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import BookmarkOutlineIcon from '../../../assets/activities/bookmark-body.svg';
import ArrowUpRightIcon from '../../../assets/place/arrow-up-right.svg';
import CalendarIcon from '../../../assets/place/calendar.svg';
import MapPinIcon from '../../../assets/discover/map-rating-pin.svg';
import PhoneIcon from '../../../assets/place/phone.svg';
import PlanetIcon from '../../../assets/place/planet.svg';
import SortIcon from '../../../assets/place/sort.svg';
import TopRatedDishesIcon from '../../../assets/place/top-rated-dishes.svg';
import ChatIcon from '../../../assets/comments/chat-round-outline.svg';
import CaretDownIcon from '../../../assets/comments/caret-down.svg';
import HeartBoldIcon from '../../../assets/comments/heart-bold.svg';
import HeartIcon from '../../../assets/comments/heart-outline.svg';
import RecommendationPlusIcon from '../../../assets/home/recommendation-plus.svg';
import ReviewStarFilled from '../../../assets/home/review-star-filled.svg';
import ReviewStarOutline from '../../../assets/home/review-star-outline.svg';
import ShareIcon from '../../../assets/comments/square-share-line-broken.svg';
import {
  SaveToFolderSheet,
  type SaveablePlace,
} from '../favourites/FavouritesPane';
import { useSavedVenue, useUnsaveVenue } from '../favourites/api';
import { usePlace, usePlaceReviews } from '../discover/api';
import { fallbackReviewPhoto } from '../discover/reviewNormalization';
import { cuisineFlag } from '../discover/cuisineFlags';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { useTastesApi } from '../../session/SessionProvider';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { formatDisplayDate } from '../../infrastructure/date';
import { captureException } from '../../infrastructure/observability';
import { resolveStorageImageUrl } from '../../infrastructure/storageImage';
import { UserAvatar } from '../profile/avatar';
import { ReviewCityBadge, ReviewMetaRow } from '../reviews/ReviewMetadata';
import { PlacePhotoPager } from './PlacePhotoPager';
import { buildGalleryPhotos } from './galleryPhotos';
import { openingHoursForDate, openingStatus } from './openingHours';

const sorts: Record<PlaceReviewSort, string> = {
  highest: 'Highest rated',
  lowest: 'Lowest rated',
  popular: 'Popular',
  recent: 'Recent',
  oldest: 'Oldest',
};

function placeImage(url: string | null | undefined): ImageSourcePropType {
  return url ? { uri: url } : restaurantImage;
}

export function PlaceScreen({
  onBack,
  onOpenComments,
  onWriteReview,
  userId,
  venueId,
}: {
  onBack: () => void;
  onOpenComments: (reviewId: string) => void;
  onWriteReview: () => void;
  userId: string;
  venueId: string;
}) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(0, windowWidth - insets.left - insets.right);
  const safeScreenStyle = {
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };
  const reviewButtonBottom = Math.max(insets.bottom, responsiveSize(18));
  const contentBottom = reviewButtonBottom + responsiveSize(77);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'overview' | 'reviews'>('overview');
  const [dishFilter, setDishFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<PlaceReviewSort>('recent');
  const [reviewScope, setReviewScope] = useState<'all' | 'friends'>('all');
  const [reactedReviews, setReactedReviews] = useState<Set<string>>(new Set());
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'photos' | 'sort' | null>(null);
  const [toast, setToast] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveablePlace | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const details = usePlace(venueId);
  const reviews = usePlaceReviews(venueId, sort, reviewScope);
  const savedVenue = useSavedVenue(userId, venueId);
  const unsave = useUnsaveVenue(userId);
  const saved = savedVenue.saved;
  const busy = unsave.isPending;
  async function reactToReview(reviewId: string) {
    if (reactingId) return;
    setReactingId(reviewId);
    try {
      const result = await api.reactToReview({
        idempotencyKey: createIdempotencyKey('place-review-reaction'),
        reviewId,
        reaction: 'like',
      });
      setReactedReviews((current) => {
        const next = new Set(current);
        if (result.data.active) next.add(reviewId);
        else next.delete(reviewId);
        return next;
      });
      await reviews.refetch();
    } finally {
      setReactingId(null);
    }
  }
  const toggleSave = () => {
    if (busy) return;
    if (saved) {
      unsave.mutate(venueId);
    } else {
      setSaveTarget({ venueId, name: details.data?.venue.name ?? '' });
    }
  };

  if (details.isPending || (__DEV__ && details.isFetching))
    return <Loading onBack={onBack} />;
  if (details.isError || !details.data)
    return (
      <ErrorPage
        onBack={onBack}
        message={
          details.isError ? apiErrorMessage(details.error) : 'Please try again.'
        }
        retry={() => void details.refetch()}
      />
    );

  const place = details.data;
  const photos =
    place.photoUrls.length > 0 ? place.photoUrls : [place.venue.imageUrl ?? ''];
  const galleryPhotos = buildGalleryPhotos(photos, place.photoCount);
  const photoCount = galleryPhotos.length;
  const categoryChip = place.venue.category;
  // Seed/CMS tags duplicate the category with a trailing emoji (e.g. "Japanese 🍣"
  // alongside category "Japanese") instead of being independent tags — strip those
  // out so they don't show up twice next to the category chip below.
  const categoryLabel = categoryChip
    ? [categoryChip, cuisineFlag(categoryChip)].filter(Boolean).join(' ')
    : categoryChip;
  const priceChip =
    place.venue.priceLevel == null ? null : '$'.repeat(place.venue.priceLevel);
  const detailChips = place.chips
    .filter(
      (value) =>
        !(
          categoryChip &&
          (value === categoryChip || value.startsWith(categoryChip))
        ) && !/^\$+$/.test(value),
    )
    .slice(0, 2);
  if (detailChips.length === 0)
    detailChips.push((place.venue.distanceKm ?? 0).toFixed(1) + ' km');
  const hero = (
    <View style={styles.hero}>
      <PlacePhotoPager
        activeIndex={activePhoto}
        imageStyle={styles.heroImage}
        onChange={setActivePhoto}
        sources={photos.map(placeImage)}
        width={width}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
        locations={[0, 0.55, 1]}
        pointerEvents="none"
        style={styles.topShade}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
        pointerEvents="none"
        style={styles.bottomShade}
      />
      <Pressable
        accessibilityLabel="Go back"
        hitSlop={14}
        onPress={onBack}
        style={[styles.navButton, { top: insets.top + responsiveSize(12) }]}
      >
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={saved ? 'Remove from saved' : 'Save place'}
        onPress={toggleSave}
        style={[
          styles.navButton,
          styles.save,
          { top: insets.top + responsiveSize(12) },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : saved ? (
          <BookmarkIcon
            color="#fff"
            height={responsiveSize(18)}
            width={responsiveSize(18)}
          />
        ) : (
          <BookmarkOutlineIcon
            height={responsiveSize(18)}
            width={responsiveSize(18)}
          />
        )}
      </Pressable>
      <View pointerEvents="none" style={styles.photoDots}>
        {photos.map((key, index) => (
          <View
            key={key + String(index)}
            style={[
              styles.photoDot,
              index === activePhoto && styles.photoDotActive,
            ]}
          />
        ))}
      </View>
      <Pressable onPress={() => setSheet('photos')} style={styles.photoCount}>
        <Text style={styles.photoCountText}>{photoCount} photos ›</Text>
      </Pressable>
    </View>
  );
  const intro = (
    <View
      style={[
        styles.content,
        { paddingBottom: contentBottom },
        tab === 'reviews' && styles.reviewsContent,
      ]}
    >
      <View style={styles.badges}>
        <Text style={styles.primaryBadge}>Popular</Text>
        <Text style={styles.primaryBadge}>
          ★ {place.venue.rating?.toFixed(1) ?? '–'}
        </Text>
        <Text style={styles.count}>{place.venue.reviewCount ?? 0} reviews</Text>
      </View>
      <Text style={styles.title}>{place.venue.name}</Text>
      <Text style={styles.address}>
        {place.venue.address ?? place.venue.city}
      </Text>
      <View style={styles.chips}>
        <View style={styles.compoundChip}>
          <Text style={styles.chipText}>{categoryLabel}</Text>
          {priceChip ? (
            <>
              <View style={styles.chipDivider} />
              <Text style={styles.chipSecondary}>{priceChip}</Text>
            </>
          ) : null}
        </View>
        {detailChips.map((value) => (
          <Text key={value} style={styles.chip}>
            {value}
          </Text>
        ))}
      </View>
      <View style={styles.tabs}>
        {(['overview', 'reviews'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => {
              setTab(value);
              if (value === 'overview') setDishFilter(null);
            }}
            style={[styles.tab, tab === value && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, tab === value && styles.tabTextActive]}
            >
              {value === 'overview' ? 'Overview' : 'Reviews'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'overview' ? (
        <Overview
          details={place}
          openDishReviews={(dishName) => {
            setDishFilter(dishName);
            setReviewScope('all');
            setTab('reviews');
          }}
          openPhotos={() => setSheet('photos')}
          styles={styles}
        />
      ) : (
        <>
          {dishFilter ? (
            <Pressable onPress={() => setDishFilter(null)}>
              <Text style={styles.primaryBadge}>Dish: {dishFilter} ×</Text>
            </Pressable>
          ) : null}
          <ReviewsHeader
            error={reviews.isError ? apiErrorMessage(reviews.error) : null}
            loading={reviews.isPending}
            openSort={() => setSheet('sort')}
            retry={() => void reviews.refetch()}
            scope={reviewScope}
            setScope={setReviewScope}
            sort={sort}
            styles={styles}
          />
        </>
      )}
    </View>
  );
  return (
    <View style={[styles.screen, safeScreenStyle]}>
      {tab === 'overview' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {hero}
          {intro}
        </ScrollView>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: contentBottom }}
          data={(reviews.data ?? []).filter(
            (review) =>
              !dishFilter ||
              review.dishReviews.some(
                (dish) =>
                  dish.title.toLocaleLowerCase() ===
                  dishFilter.toLocaleLowerCase(),
              ),
          )}
          initialNumToRender={8}
          keyExtractor={(review) => review.id}
          maxToRenderPerBatch={8}
          ListHeaderComponent={
            <>
              {hero}
              {intro}
            </>
          }
          ListEmptyComponent={
            !reviews.isPending && !reviews.isError ? (
              <Text style={styles.empty}>
                {dishFilter
                  ? `No reviews for ${dishFilter} yet.`
                  : 'No reviews yet.'}
              </Text>
            ) : null
          }
          ListFooterComponent={
            reviews.isFetchingNextPage ? (
              <ActivityIndicator
                color={colors.primary}
                style={{ paddingVertical: responsiveSize(18) }}
              />
            ) : null
          }
          onEndReached={() => {
            if (reviews.hasNextPage && !reviews.isFetchingNextPage)
              void reviews.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          windowSize={7}
          renderItem={({ item: review, index: reviewIndex }) => (
            <ReviewCard
              fallbackDishes={place.popularDishes}
              fallbackPhotoUrls={photos}
              item={review}
              onComments={onOpenComments}
              onReact={(reviewId) => void reactToReview(reviewId)}
              onShare={(item) =>
                void Share.share({
                  message: `${item.authorDisplayName} on Tastes: ${item.text}\nhttps://tastesapp.com/reviews/${item.id}/comments`,
                })
              }
              reacted={reactedReviews.has(review.id)}
              reactingId={reactingId}
              reviewIndex={reviewIndex}
              styles={styles}
              venueName={place.venue.name}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
      <View
        pointerEvents="box-none"
        style={[
          styles.reviewButtonDock,
          {
            bottom: reviewButtonBottom,
            left: insets.left,
            right: insets.right,
          },
        ]}
      >
        <Pressable onPress={onWriteReview} style={styles.reviewButton}>
          <View style={styles.reviewButtonIcon}>
            <RecommendationPlusIcon
              height={responsiveSize(12)}
              width={responsiveSize(12)}
            />
          </View>
          <Text style={styles.reviewButtonText}>Review now</Text>
        </Pressable>
      </View>
      {toast ? (
        <View
          style={[
            styles.toast,
            { bottom: reviewButtonBottom + responsiveSize(58) },
          ]}
        >
          <Text style={styles.toastText}>✓ Saved to your favourites</Text>
        </View>
      ) : null}
      <Gallery
        visible={sheet === 'photos'}
        close={() => setSheet(null)}
        photos={galleryPhotos}
        styles={styles}
      />
      <Sort
        visible={sheet === 'sort'}
        close={() => setSheet(null)}
        selected={sort}
        select={setSort}
        styles={styles}
      />
      <SaveToFolderSheet
        onClose={() => setSaveTarget(null)}
        onSaved={() => {
          setToast(true);
          setTimeout(() => setToast(false), 2200);
        }}
        place={saveTarget}
        userId={userId}
        visible={saveTarget !== null}
      />
    </View>
  );
}

function Overview({
  details,
  openDishReviews,
  openPhotos,
  styles,
}: {
  details: NonNullable<ReturnType<typeof usePlace>['data']>;
  openDishReviews: (dishName: string) => void;
  openPhotos: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const iconColor = styles.detailIcon.color;
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const hoursProgress = useRef(new Animated.Value(0)).current;
  const todayEntry = openingHoursForDate(details.openingHours);
  const today = todayEntry?.day;
  const status = openingStatus(details.openingHours);
  const hoursHeight = responsiveSize(64 + details.openingHours.length * 42);
  function toggleHours() {
    const next = !hoursExpanded;
    setHoursExpanded(next);
    Animated.timing(hoursProgress, {
      duration: 220,
      toValue: next ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }
  return (
    <View style={styles.section}>
      <Animated.View
        style={[
          styles.hoursCard,
          {
            height: hoursProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [responsiveSize(64), hoursHeight],
            }),
          },
        ]}
      >
        <Pressable
          accessibilityState={{ expanded: hoursExpanded }}
          onPress={toggleHours}
          style={styles.hoursHeader}
        >
          <CalendarIcon
            color={iconColor}
            height={responsiveSize(20)}
            width={responsiveSize(20)}
          />
          <View style={styles.hoursHeaderCopy}>
            <View style={styles.hoursTitleRow}>
              <Text style={styles.hoursTitle}>Opening hours</Text>
              {status !== 'unknown' ? (
                <Text
                  style={[
                    styles.openBadge,
                    status === 'closed' && styles.closedBadge,
                  ]}
                >
                  {status.toUpperCase()}
                </Text>
              ) : null}
            </View>
            <Text style={styles.todayHours}>
              Today: {todayEntry?.hours ?? 'Hours unavailable'}
            </Text>
          </View>
          <Animated.View
            style={[
              styles.hoursChevron,
              hoursExpanded && styles.hoursChevronExpanded,
            ]}
          >
            <CaretDownIcon
              color={styles.hoursChevronIcon.color as string}
              height={responsiveSize(14)}
              width={responsiveSize(14)}
            />
          </Animated.View>
        </Pressable>
        <View style={styles.inlineHours}>
          {details.openingHours.map((item) => {
            const holiday = /holiday/i.test(`${item.day} ${item.hours}`);
            return (
              <View key={item.day} style={styles.inlineHoursRow}>
                <Text
                  style={[
                    styles.inlineDay,
                    item.day === today && styles.inlineToday,
                    holiday && styles.inlineHoliday,
                  ]}
                >
                  {item.day}
                </Text>
                <Text
                  style={[
                    styles.inlineHour,
                    item.day === today && styles.inlineToday,
                    holiday && styles.inlineHoliday,
                  ]}
                >
                  {item.hours}
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
      {details.phone ? (
        <DetailRow
          icon={
            <PhoneIcon
              color={iconColor}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
          }
          label={details.phone}
          onPress={() =>
            void Linking.openURL(`tel:${details.phone!.replace(/[^+\d]/g, '')}`)
          }
          styles={styles}
        />
      ) : null}
      {details.website ? (
        <DetailRow
          icon={
            <PlanetIcon
              color={iconColor}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
          }
          label={details.website}
          onPress={() =>
            void Linking.openURL(
              /^https?:\/\//i.test(details.website!)
                ? details.website!
                : `https://${details.website}`,
            )
          }
          styles={styles}
        />
      ) : null}
      <DetailRow
        icon={
          <MapPinIcon
            color={iconColor}
            height={responsiveSize(20)}
            width={responsiveSize(20)}
          />
        }
        label={details.venue.address ?? details.venue.city}
        onPress={() =>
          void Linking.openURL(
            `https://maps.apple.com/?q=${encodeURIComponent(details.venue.address ?? details.venue.city)}`,
          )
        }
        styles={styles}
      />
      <Pressable onPress={openPhotos} style={styles.strip}>
        {details.photoUrls.slice(0, 3).map((url, index) => (
          <Image
            key={url + String(index)}
            source={placeImage(url)}
            style={styles.stripImage}
          />
        ))}
        <Text style={styles.seePhotos}>See all photos ›</Text>
      </Pressable>
      <View style={styles.sectionTitleRow}>
        <TopRatedDishesIcon
          color={styles.sectionTitleIcon.color}
          height={responsiveSize(22)}
          width={responsiveSize(24)}
        />
        <Text style={styles.sectionTitle}>Top rated dishes</Text>
      </View>
      {details.popularDishes.map((dish, index) => (
        <Pressable
          accessibilityLabel={`Show reviews for ${dish.name}`}
          key={dish.name}
          onPress={() => openDishReviews(dish.name)}
          style={styles.dish}
        >
          <Text style={styles.dishName}>
            {index + 1}. {dish.name}
          </Text>
          <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  onPress,
  styles,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={styles.detail}>
      {icon}
      <Text numberOfLines={1} style={styles.detailText}>
        {label}
      </Text>
      <ArrowUpRightIcon
        color={styles.detailIcon.color}
        height={responsiveSize(20)}
        style={styles.detailArrow}
        width={responsiveSize(20)}
      />
    </Pressable>
  );
}

function ReviewsHeader({
  error,
  loading,
  openSort,
  retry,
  scope,
  setScope,
  sort,
  styles,
}: {
  error: string | null;
  loading: boolean;
  openSort: () => void;
  retry: () => void;
  scope: 'all' | 'friends';
  setScope: (scope: 'all' | 'friends') => void;
  sort: PlaceReviewSort;
  styles: ReturnType<typeof createStyles>;
}) {
  if (loading)
    return (
      <View style={styles.status}>
        <ActivityIndicator
          color={styles.primaryBadge.backgroundColor as string}
        />
      </View>
    );
  if (error)
    return (
      <View style={styles.status}>
        <Text style={styles.errorCopy}>{error}</Text>
        <Pressable onPress={retry}>
          <Text style={styles.retry}>Try again</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={styles.reviewsHeader}>
      <View style={styles.reviewTools}>
        <View style={styles.scopeControl}>
          <Pressable
            onPress={() => setScope('all')}
            style={[
              styles.scopeButton,
              scope === 'all' && styles.scopeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.scopeText,
                scope === 'all' && styles.scopeTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setScope('friends')}
            style={[
              styles.scopeButton,
              scope === 'friends' && styles.scopeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.scopeText,
                scope === 'friends' && styles.scopeTextActive,
              ]}
            >
              Friends
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel={`Sort reviews: ${sorts[sort]}`}
          onPress={openSort}
          style={styles.sortButton}
        >
          <SortIcon
            color={styles.sort.color}
            height={responsiveSize(16)}
            width={responsiveSize(20)}
          />
        </Pressable>
      </View>
    </View>
  );
}

function RatingStars({
  rating,
  styles,
}: {
  rating: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <View
      style={styles.ratingStars}
      accessibilityLabel={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, clamped - star + 1));
        return (
          <View key={star} style={styles.ratingStarCell}>
            <ReviewStarOutline
              color="#B82F29"
              height={responsiveSize(17.9166)}
              opacity={0.3}
              width={responsiveSize(17.9179)}
            />
            {fill > 0 ? (
              <View
                style={[styles.ratingStarFill, { width: `${fill * 100}%` }]}
              >
                <ReviewStarFilled
                  color="#B82F29"
                  height={responsiveSize(16.6666)}
                  width={responsiveSize(16.6671)}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ReviewPhoto({
  fallbackUri,
  path,
  rating,
  styles,
  title,
}: {
  fallbackUri?: string;
  path?: string | null;
  rating: number;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  const normalizedPath = path?.trim().replace(/^\/+|\/+$/g, '') ?? '';
  const [uri, setUri] = useState<string | null>(fallbackUri ?? null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!normalizedPath) {
      setUri(fallbackUri ?? null);
      setFailed(!fallbackUri);
      return () => {
        active = false;
      };
    }
    let download: Promise<string>;
    try {
      download = resolveStorageImageUrl(normalizedPath);
    } catch (error) {
      captureException(error, {
        operation: 'load-place-review-photo',
        path: normalizedPath,
      });
      setUri(fallbackUri ?? null);
      setFailed(!fallbackUri);
      return () => {
        active = false;
      };
    }
    void download
      .then((value) => {
        if (active) setUri(value);
      })
      .catch((error) => {
        captureException(error, {
          operation: 'load-place-review-photo',
          path: normalizedPath,
        });
        if (active) {
          setUri(fallbackUri ?? null);
          setFailed(!fallbackUri);
        }
      });
    return () => {
      active = false;
    };
  }, [fallbackUri, normalizedPath]);

  return (
    <Pressable
      accessibilityLabel={uri ? `Enlarge ${title} photo` : undefined}
      disabled={!uri}
      onPress={() => setExpanded(true)}
      style={styles.reviewPhoto}
    >
      {uri ? (
        <Image
          onError={() => {
            if (fallbackUri && uri !== fallbackUri) setUri(fallbackUri);
            else {
              setUri(null);
              setFailed(true);
            }
          }}
          source={{ uri }}
          style={styles.reviewPhotoImage}
        />
      ) : (
        <View style={styles.reviewPhotoPlaceholder}>
          {failed ? (
            <Text style={styles.reviewPhotoError}>Photo unavailable</Text>
          ) : (
            <ActivityIndicator
              color={styles.primaryBadge.backgroundColor as string}
            />
          )}
        </View>
      )}
      <LinearGradient
        colors={['#161616', 'rgba(22,22,22,0)']}
        locations={[0.0167, 0.3067]}
        pointerEvents="none"
        style={styles.reviewPhotoGradient}
      />
      <Text numberOfLines={1} style={styles.reviewPhotoTitle}>
        {title}
      </Text>
      <Text style={styles.reviewPhotoRating}>★ {rating.toFixed(1)}</Text>
      <FullscreenPhoto
        close={() => setExpanded(false)}
        styles={styles}
        url={uri}
        visible={expanded}
      />
    </Pressable>
  );
}

export function ReviewCard({
  fallbackDishes,
  fallbackPhotoUrls,
  item: review,
  onComments,
  onReact,
  onShare,
  reacted,
  reactingId,
  reviewIndex,
  styles,
  venueName,
}: {
  fallbackDishes: Array<{ name: string; rating: number }>;
  fallbackPhotoUrls: string[];
  item: NonNullable<ReturnType<typeof usePlaceReviews>['data']>[number];
  onComments: (reviewId: string) => void;
  onReact: (reviewId: string) => void;
  onShare: (
    review: NonNullable<ReturnType<typeof usePlaceReviews>['data']>[number],
  ) => void;
  reacted: boolean;
  reactingId: string | null;
  reviewIndex: number;
  styles: ReturnType<typeof createStyles>;
  venueName: string;
}) {
  const { colors } = useAppTheme();
  const displayDishes = review.dishReviews.map((dish, dishIndex) => ({
    ...dish,
    fallbackUri: fallbackReviewPhoto(fallbackPhotoUrls, reviewIndex, dishIndex),
  }));
  if (reviewIndex < 3 && fallbackPhotoUrls.length > 0) {
    const suggestedDishes =
      fallbackDishes.length > 0
        ? fallbackDishes
        : [
            { name: 'Chef recommendation', rating: review.rating },
            { name: 'House favourite', rating: review.rating },
            { name: 'Signature dish', rating: review.rating },
            { name: 'Seasonal special', rating: review.rating },
          ];
    for (let dishIndex = displayDishes.length; dishIndex < 4; dishIndex += 1) {
      const suggestion = suggestedDishes[dishIndex % suggestedDishes.length]!;
      displayDishes.push({
        id: `preview-${review.id}-${dishIndex}`,
        title: suggestion.name,
        rating: suggestion.rating,
        photoPath: '',
        fallbackUri: fallbackReviewPhoto(
          fallbackPhotoUrls,
          reviewIndex,
          dishIndex,
        ),
      });
    }
  }
  return (
    <View style={[styles.review, styles.reviewListCard]}>
      <View style={styles.reviewer}>
        <UserAvatar
          displayName={review.authorDisplayName}
          photoUrl={review.authorPhotoUrl}
          style={styles.avatar}
        />
        <View style={styles.author}>
          <Text style={styles.authorName}>{review.authorDisplayName}</Text>
          <Text style={styles.authorHandle}>
            {review.authorUsername ? '@' + review.authorUsername : ''}
          </Text>
        </View>
        <Text style={styles.reviewDate}>
          {formatDisplayDate(review.createdAt)}
        </Text>
      </View>
      <View style={styles.reviewBody}>
        <View style={styles.reviewVenueRow}>
          <View style={styles.reviewVenueCopy}>
            <Text numberOfLines={1} style={styles.reviewVenue}>
              {venueName}
            </Text>
            <RatingStars rating={review.rating} styles={styles} />
          </View>
          <ReviewCityBadge city={review.venueCity} />
        </View>
        {displayDishes.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.reviewPhotoRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            testID={`place-review-dishes-${review.id}`}
          >
            {displayDishes.map((dish) => (
              <ReviewPhoto
                fallbackUri={dish.fallbackUri}
                key={dish.id}
                path={dish.photoPath}
                rating={dish.rating}
                styles={styles}
                title={dish.title}
              />
            ))}
          </ScrollView>
        ) : null}
        <Text style={styles.reviewText}>{review.text}</Text>
        <ReviewMetaRow cuisine={review.cuisine} mood={review.tags?.[0]} />
        {displayDishes.length === 0 && review.dishNames.length > 0 ? (
          <Text style={styles.dishes}>{review.dishNames.join('  ·  ')}</Text>
        ) : null}
        <View style={styles.reviewFooter}>
          <View style={styles.metricActions}>
            <Pressable
              accessibilityLabel={reacted ? 'Unlike review' : 'Like review'}
              disabled={reactingId === review.id}
              onPress={() => onReact(review.id)}
              style={styles.metricIconRow}
            >
              {reacted ? (
                <HeartBoldIcon
                  color={colors.primary}
                  fill={colors.primary}
                  height={responsiveSize(14.3462)}
                  width={responsiveSize(16.6667)}
                />
              ) : (
                <HeartIcon
                  color={colors.text}
                  height={responsiveSize(15.5978)}
                  width={responsiveSize(17.9167)}
                />
              )}
              <Text style={styles.metrics}>{review.reactionCount}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open comments"
              onPress={() => onComments(review.id)}
              style={styles.metricIconRow}
            >
              <ChatIcon
                color={colors.text}
                height={responsiveSize(20)}
                width={responsiveSize(20)}
              />
              <Text style={styles.metrics}>{review.commentCount}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Share review"
              onPress={() => onShare(review)}
              style={styles.metricIconRow}
            >
              <ShareIcon
                color={colors.text}
                height={responsiveSize(20)}
                width={responsiveSize(20)}
              />
            </Pressable>
          </View>
          {displayDishes.length > 0 ? (
            <View style={styles.dishCountTag}>
              <TopRatedDishesIcon
                color={colors.primary}
                height={responsiveSize(14)}
                width={responsiveSize(14)}
              />
              <Text style={styles.dishCountText}>
                Dishes ({displayDishes.length})
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Loading({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.82,
          duration: 780,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 780,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return (
    <View
      style={[
        styles.screen,
        { paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <Animated.View style={[styles.loadingHero, { opacity: pulse }]}>
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={14}
          onPress={onBack}
          style={[styles.navButton, { top: insets.top + responsiveSize(12) }]}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </Animated.View>
      <View style={styles.content}>
        <Animated.View style={[styles.skeleton, { opacity: pulse }]} />
        <Animated.View
          style={[styles.skeleton, styles.short, { opacity: pulse }]}
        />
        <Animated.View style={[styles.skeletonTabs, { opacity: pulse }]} />
        {[1, 2, 3].map((key) => (
          <Animated.View
            key={key}
            style={[styles.skeletonRow, { opacity: pulse }]}
          />
        ))}
      </View>
    </View>
  );
}
function ErrorPage({
  message,
  onBack,
  retry,
}: {
  message: string;
  onBack: () => void;
  retry: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const safePadding = {
    paddingLeft: insets.left + responsiveSize(28),
    paddingRight: insets.right + responsiveSize(28),
    paddingTop: Math.max(insets.top, responsiveSize(28)),
    paddingBottom: Math.max(insets.bottom, responsiveSize(28)),
  };
  return (
    <View style={[styles.screen, styles.errorPage, safePadding]}>
      <Pressable onPress={onBack}>
        <Text style={styles.retry}>‹ Back</Text>
      </Pressable>
      <Text style={styles.errorTitle}>Could not load place</Text>
      <Text style={styles.errorCopy}>{message}</Text>
      <Pressable onPress={retry} style={styles.errorButton}>
        <Text style={styles.errorButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}
function Gallery({
  close,
  photos,
  styles,
  visible,
}: {
  close: () => void;
  photos: string[];
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={close}>
      <View style={styles.gallery}>
        <View style={styles.galleryHead}>
          <Pressable accessibilityLabel="Close gallery" onPress={close}>
            <Text style={styles.galleryBack}>‹</Text>
          </Pressable>
          <Text style={styles.galleryTitle}>Photos</Text>
          <View style={styles.spacer} />
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {photos.map((key, index) => (
            <GalleryImage
              key={key + String(index)}
              index={index}
              onOpen={() => setExpandedPhoto(key)}
              styles={styles}
              url={key}
            />
          ))}
        </ScrollView>
        <FullscreenPhoto
          close={() => setExpandedPhoto(null)}
          styles={styles}
          url={expandedPhoto}
          visible={expandedPhoto !== null}
        />
      </View>
    </Modal>
  );
}
function GalleryImage({
  index,
  onOpen,
  styles,
  url,
}: {
  index: number;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
  url: string;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return (
    <Pressable
      accessibilityLabel={`Enlarge photo ${index + 1}`}
      onPress={onOpen}
      style={styles.gridImage}
    >
      {state === 'loading' ? (
        <View style={styles.galleryLoading}>
          <ActivityIndicator color={styles.retry.color as string} />
        </View>
      ) : null}
      {state === 'error' ? (
        <Pressable
          accessibilityLabel={`Retry photo ${index + 1}`}
          onPress={() => {
            setAttempt((value) => value + 1);
            setState('loading');
          }}
          style={styles.galleryError}
        >
          <Text style={styles.galleryErrorIcon}>↻</Text>
          <Text style={styles.galleryErrorText}>Retry</Text>
        </Pressable>
      ) : null}
      <Image
        key={attempt}
        onError={() => setState('error')}
        onLoad={() => setState('ready')}
        source={placeImage(url)}
        style={[styles.galleryPhoto, state === 'error' && styles.hiddenPhoto]}
      />
    </Pressable>
  );
}

function FullscreenPhoto({
  close,
  styles,
  url,
  visible,
}: {
  close: () => void;
  styles: ReturnType<typeof createStyles>;
  url: string | null;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={close}
      transparent
      visible={visible}
    >
      <View style={styles.photoViewer}>
        <Pressable
          accessibilityLabel="Close enlarged photo"
          onPress={close}
          style={styles.photoViewerClose}
        >
          <Text style={styles.photoViewerCloseText}>×</Text>
        </Pressable>
        {url ? (
          <Image
            resizeMode="contain"
            source={placeImage(url)}
            style={styles.photoViewerImage}
          />
        ) : null}
      </View>
    </Modal>
  );
}
function Sort({
  close,
  select,
  selected,
  styles,
  visible,
}: {
  close: () => void;
  select: (sort: PlaceReviewSort) => void;
  selected: PlaceReviewSort;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={close}
    >
      <Pressable onPress={close} style={styles.dialogBackdrop}>
        <Pressable style={styles.sortSheet}>
          <Text style={styles.sortTitle}>Sort by</Text>
          {(Object.keys(sorts) as PlaceReviewSort[]).map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                select(key);
                close();
              }}
              style={styles.sortRow}
            >
              <Text style={styles.sortOption}>{sorts[key]}</Text>
              <View
                style={[styles.radio, key === selected && styles.radioSelected]}
              >
                {key === selected ? (
                  <CheckIcon
                    height={responsiveSize(8.6)}
                    width={responsiveSize(12)}
                  />
                ) : null}
              </View>
            </Pressable>
          ))}
          <Pressable onPress={close} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    screen: { flex: 1, backgroundColor: colors.canvas },
    hero: { height: 365, overflow: 'hidden' },
    heroImage: { height: 365, resizeMode: 'cover' },
    topShade: {
      position: 'absolute',
      zIndex: 1,
      top: 0,
      right: 0,
      left: 0,
      height: 150,
    },
    bottomShade: {
      position: 'absolute',
      zIndex: 1,
      right: 0,
      bottom: 0,
      left: 0,
      height: 135,
    },
    navButton: {
      position: 'absolute',
      zIndex: 2,
      elevation: 2,
      top: 16,
      left: 16,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(33,33,33,0.64)',
    },
    save: { left: undefined, right: 16 },
    back: { color: '#fff', fontSize: 40, lineHeight: 40, marginTop: -4 },
    photoDots: {
      position: 'absolute',
      zIndex: 2,
      bottom: 28,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    photoDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
    photoDotActive: { backgroundColor: '#fff' },
    photoCount: {
      position: 'absolute',
      zIndex: 2,
      right: 18,
      bottom: 18,
      borderRadius: 13,
      backgroundColor: 'rgba(66,66,66,0.72)',
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    photoCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    content: { paddingHorizontal: 16, paddingBottom: 95 },
    reviewsContent: { paddingBottom: 0 },
    badges: {
      marginTop: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    primaryBadge: {
      color: '#fff',
      backgroundColor: colors.primary,
      borderRadius: 11,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: 10,
      fontWeight: '700',
    },
    count: { color: colors.textMuted, fontSize: 11 },
    title: {
      marginTop: 7,
      color: colors.text,
      fontSize: 21,
      fontWeight: '700',
    },
    address: { marginTop: 5, color: colors.textSecondary, fontSize: 13 },
    chips: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
    compoundChip: {
      height: 33,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      backgroundColor: colors.background,
    },
    chipDivider: {
      width: StyleSheet.hairlineWidth,
      height: 18,
      marginHorizontal: 8,
      backgroundColor: colors.border,
    },
    chipText: { color: colors.text, fontSize: 11, fontWeight: '600' },
    chipSecondary: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    chip: {
      height: 33,
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 11,
      fontWeight: '600',
    },
    tabs: {
      marginTop: 15,
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    tab: { flex: 1, alignItems: 'center', paddingBottom: 10 },
    tabActive: { borderBottomWidth: 2, borderColor: colors.primary },
    tabText: { color: colors.textMuted, fontSize: 11 },
    tabTextActive: { color: colors.text, fontWeight: '700' },
    section: { gap: 10, paddingTop: 10 },
    detail: {
      height: 54,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
    },
    detailIcon: { color: colors.text },
    detailText: {
      flex: 1,
      color: colors.text,
      opacity: 0.72,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: -0.23,
      lineHeight: 20,
    },
    detailArrow: { opacity: 0.5 },
    hoursCard: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surfaceRaised,
    },
    hoursHeader: {
      height: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    hoursHeaderCopy: { flex: 1 },
    hoursTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    hoursTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
    openBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 7,
      overflow: 'hidden',
      color: '#57C785',
      backgroundColor: 'rgba(87,199,133,0.14)',
      fontSize: 9,
      fontWeight: '700',
    },
    closedBadge: { color: '#E63946', backgroundColor: 'rgba(230,57,70,0.14)' },
    todayHours: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
    hoursChevron: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '0deg' }],
    },
    hoursChevronIcon: { color: colors.textSecondary },
    hoursChevronExpanded: { transform: [{ rotate: '180deg' }] },
    inlineHours: { paddingHorizontal: 16, paddingBottom: 8 },
    inlineHoursRow: { height: 42, flexDirection: 'row', alignItems: 'center' },
    inlineDay: { flex: 1, color: colors.textMuted, fontSize: 13 },
    inlineHour: { color: colors.textMuted, fontSize: 13 },
    inlineToday: { color: colors.text, fontWeight: '600' },
    inlineHoliday: { color: '#E63946' },
    strip: {
      height: 100,
      flexDirection: 'row',
      gap: 4,
      overflow: 'hidden',
      borderRadius: 14,
      marginTop: 8,
    },
    stripImage: { width: 112, height: 100, resizeMode: 'cover' },
    seePhotos: {
      position: 'absolute',
      right: 9,
      bottom: 8,
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.72)',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 10,
      fontSize: 10,
    },
    sectionTitleRow: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitleIcon: { color: colors.text },
    sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    dish: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dishName: { flex: 1, color: colors.textSecondary, fontSize: 14 },
    dishRating: {
      color: '#fff',
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 7,
      fontSize: 11,
      fontWeight: '700',
    },
    reviewsHeader: { paddingTop: 10, paddingBottom: 10 },
    reviewTools: {
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    scopeControl: {
      flex: 1,
      height: 34,
      padding: 3,
      flexDirection: 'row',
      borderRadius: 17,
      backgroundColor: colors.surfaceRaised,
    },
    scopeButton: {
      flex: 1,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeButtonActive: { backgroundColor: '#D9DDE5' },
    scopeText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
    scopeTextActive: { color: '#111' },
    sortButton: {
      width: 40,
      height: 40,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
    },
    sort: { color: colors.text },
    review: {
      overflow: 'hidden',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    reviewListCard: { marginHorizontal: 16, marginBottom: 12 },
    reviewer: {
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    author: { flex: 1, gap: 3, paddingLeft: 7 },
    authorName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    authorHandle: { color: colors.textSecondary, fontSize: 13 },
    reviewDate: { color: colors.text, fontSize: 14, opacity: 0.4 },
    reviewBody: { gap: 16, padding: 16 },
    reviewVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reviewVenueCopy: { flex: 1, gap: 10 },
    reviewVenue: { color: colors.text, fontSize: 16, fontWeight: '600' },
    ratingStars: { flexDirection: 'row', gap: 2 },
    ratingStarCell: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    ratingStarFill: {
      position: 'absolute',
      left: 1.6665,
      top: 1.6667,
      height: 16.6666,
      overflow: 'hidden',
    },
    reviewText: { color: colors.text, fontSize: 14, lineHeight: 18 },
    dishes: { color: colors.text, fontSize: 12, fontWeight: '600' },
    reviewPhotoRow: { gap: 9 },
    reviewPhoto: {
      width: 150,
      height: 150,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 16,
      backgroundColor: colors.surfaceRaised,
      position: 'relative',
    },
    reviewPhotoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    reviewPhotoGradient: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    reviewPhotoPlaceholder: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewPhotoError: { color: colors.textMuted, fontSize: 10 },
    reviewPhotoTitle: {
      position: 'absolute',
      top: 8,
      left: 10,
      right: 10,
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
    },
    reviewPhotoRating: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      minHeight: 24,
      overflow: 'hidden',
      borderTopRightRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 4,
      color: '#FFFFFF',
      backgroundColor: 'rgba(111,77,48,0.92)',
      fontSize: 13,
      fontWeight: '600',
    },
    reviewFooter: {
      minHeight: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metricActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    metricIconRow: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    metrics: { color: colors.text, fontSize: 14 },
    dishCountTag: {
      height: 24,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1,
      borderColor: 'rgba(184,47,41,0.4)',
      borderRadius: 40,
    },
    dishCountText: { color: colors.text, fontSize: 12 },
    status: { alignItems: 'center', gap: 10, paddingVertical: 45 },
    empty: {
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 32,
    },
    retry: { color: colors.primary, fontWeight: '700' },
    reviewButtonDock: { position: 'absolute', alignItems: 'center' },
    reviewButton: {
      height: 54,
      paddingHorizontal: 20,
      flexDirection: 'row',
      gap: 8,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E63946',
      shadowColor: '#E63946',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55,
      shadowRadius: 10,
      elevation: 8,
    },
    reviewButtonIcon: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.6,
    },
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      bottom: 76,
      borderRadius: 18,
      backgroundColor: '#303030',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    loadingHero: { height: 250, backgroundColor: colors.surfaceRaised },
    skeleton: {
      height: 17,
      marginTop: 16,
      borderRadius: 8,
      backgroundColor: colors.surfaceRaised,
    },
    short: { width: '48%', marginTop: 9 },
    skeletonTabs: {
      height: 35,
      marginTop: 20,
      borderRadius: 12,
      backgroundColor: colors.surfaceRaised,
    },
    skeletonRow: {
      height: 48,
      marginTop: 13,
      borderRadius: 12,
      backgroundColor: colors.surfaceRaised,
    },
    errorPage: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      gap: 12,
    },
    errorTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
    errorCopy: { color: colors.textMuted, textAlign: 'center' },
    errorButton: {
      borderRadius: 18,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    errorButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    dialogBackdrop: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      width: '100%',
      maxHeight: '82%',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 35,
      backgroundColor: colors.surface,
    },
    sheetHead: {
      minHeight: 34,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    hoursContent: { flexGrow: 1 },
    sheetIcon: { color: colors.text },
    sheetTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 19,
      fontWeight: '700',
    },
    closeButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeIcon: { color: colors.text },
    closeX: { position: 'absolute' },
    hours: {
      minHeight: 52,
      marginHorizontal: -16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderColor: colors.border,
    },
    hoursDivided: { borderTopWidth: StyleSheet.hairlineWidth },
    hoursToday: { borderTopWidth: 0, backgroundColor: colors.surfaceRaised },
    day: { flex: 1, color: colors.textSecondary, fontSize: 15 },
    hour: { color: colors.textSecondary, fontSize: 15 },
    today: { color: colors.text, fontWeight: '700' },
    sortSheet: {
      margin: 18,
      borderRadius: 24,
      padding: 16,
      paddingTop: 20,
      backgroundColor: colors.surface,
    },
    sortTitle: {
      paddingBottom: 12,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    sortRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    sortOption: {
      flex: 1,
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    radio: {
      width: 22,
      height: 22,
      borderWidth: 1.5,
      borderRadius: 11,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    cancel: {
      height: 48,
      marginTop: 12,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    cancelText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    gallery: { flex: 1, paddingTop: 52, backgroundColor: colors.canvas },
    galleryHead: {
      height: 42,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    galleryBack: { color: colors.text, fontSize: 34, lineHeight: 34 },
    galleryTitle: {
      flex: 1,
      color: colors.text,
      fontWeight: '700',
      textAlign: 'center',
    },
    spacer: { width: 24 },
    grid: { padding: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    gridImage: {
      width: '32.4%',
      aspectRatio: 1,
      borderRadius: 5,
      overflow: 'hidden',
      backgroundColor: colors.surfaceRaised,
    },
    galleryPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
    photoViewer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.96)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoViewerImage: { width: '100%', height: '100%' },
    photoViewerClose: {
      position: 'absolute',
      top: 48,
      right: 18,
      zIndex: 2,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoViewerCloseText: { color: '#FFFFFF', fontSize: 32, lineHeight: 34 },
    hiddenPhoto: { opacity: 0 },
    galleryLoading: {
      position: 'absolute',
      inset: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryError: {
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    galleryErrorIcon: {
      color: colors.primary,
      fontSize: 24,
      fontWeight: '700',
    },
    galleryErrorText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '600',
    },
  });
