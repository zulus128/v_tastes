import type { ReviewTag, Venue } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import restaurantImage from '../../../assets/discover/restaurant.png';
import PenIcon from '../../../assets/create-review/pen.svg';
import AddDishIcon from '../../../assets/create-review/add-dish.svg';
import CameraIcon from '../../../assets/create-review/camera.svg';
import DeleteDishIcon from '../../../assets/create-review/delete-dish.svg';
import PlaceFilterBarIcon from '../../../assets/create-review/place-filter-bar.svg';
import PlaceFilterCafeCup from '../../../assets/create-review/place-filter-cafe-cup.svg';
import PlaceFilterCafeSteamLeft from '../../../assets/create-review/place-filter-cafe-steam-left.svg';
import PlaceFilterCafeSteamRight from '../../../assets/create-review/place-filter-cafe-steam-right.svg';
import PlaceFilterMyListIcon from '../../../assets/create-review/place-filter-my-list.svg';
import PlaceFilterRestaurantIcon from '../../../assets/create-review/place-filter-restaurant.svg';
import PlaceFilterTrendingIcon from '../../../assets/create-review/place-filter-trending.svg';
import PlaceRatingStarIcon from '../../../assets/create-review/place-rating-star.svg';
import PlaceSelectorClearIcon from '../../../assets/create-review/place-selector-clear.svg';
import PlaceSelectorCloseIcon from '../../../assets/create-review/place-selector-close.svg';
import PlaceSelectorSearchIcon from '../../../assets/create-review/place-selector-search.svg';
import RatingPin from '../../../assets/create-review/rating-pin.svg';
import RatingScale from '../../../assets/create-review/rating-scale.svg';
import RatingScaleLight from '../../../assets/create-review/rating-scale-light.svg';
import SaveCheck from '../../../assets/create-review/save-check.svg';
import SelectPlaceCircle from '../../../assets/create-review/select-place-circle.svg';
import SelectPlacePlus from '../../../assets/create-review/select-place-plus.svg';
import successGlow from '../../../assets/create-review/success-glow.png';
import SuccessMouthOutline from '../../../assets/create-review/success-mouth-outline.svg';
import SuccessMouthPink from '../../../assets/create-review/success-mouth-pink.svg';
import successPattern from '../../../assets/create-review/success-pattern.png';
import CloseCircle from '../../../assets/recap/story/close-circle.svg';
import CloseX from '../../../assets/recap/story/close-x.svg';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import {
  cancelDraftReminder,
  scheduleDraftReminder,
} from '../../infrastructure/pushNotifications';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import { PatternBackgroundLift } from '../../ui/components';
import { useDiscoverVenues, usePlace, useVenueSearch } from '../discover/api';
import { useFavourites } from '../favourites/api';
import { useTastesApi } from '../../session/SessionProvider';
import { type DishReviewDraft, useCreateReview } from './api';
import { placeSheetHeights, resolvePlaceSheetSnap } from './placeSheetMotion';
import {
  concentricRatingLayout,
  dishRatingArcHeight,
  dishRatingArcGeometry,
  ratingCurvePoint,
  ratingForCurveDrag,
  ratingForCurveX,
  ratingForLinearPoint,
  snapRating,
} from './ratingCurveGeometry';

// Figma (node 5978:18283, "Rectangle 9946") draws the hero card's rounded bottom as a plain
// CSS corner-radius (210) on the full-width card, independent of the rating arc's own circle
// (node 5700:5935, centerX/centerY/radius above) — so the gap between the arc and the card's
// edge isn't constant: it's small near the sides and large under the arc's deepest point.
// Rather than reproduce that mismatch, the card's bottom edge below is drawn as a second
// circle concentric with the arc (same center, radius + heroCurveGap), so the visible gap
// stays the same all the way around. heroCurveGap is chosen so the card's overall height is
// unchanged from the original 210-radius version (it already left ~31px under the arc's
// deepest point; this just makes that clearance uniform instead of only happening at center).
const heroCurveGap = 31;
const reviewRatingMarkers = [
  { kind: 'dot', value: 1 },
  { kind: 'tick', rotation: -30, value: 1.5 },
  { kind: 'dot', value: 2 },
  { kind: 'tick', rotation: -70, value: 2.5 },
  { kind: 'dot', value: 3 },
  { kind: 'tick', rotation: 70, value: 3.5 },
  { kind: 'dot', value: 4 },
  { kind: 'tick', rotation: 30, value: 4.5 },
  { kind: 'dot', value: 5 },
] as const;
const dishRatingMarkers = Array.from({ length: 10 }, (_, index) => ({
  value: (index + 1) / 2,
  x: 7.59038 + ((352.313 - 7.59038) * index) / 9,
}));
const tagOptions: Array<{ emoji: string; label: string; value: ReviewTag }> = [
  { emoji: '⚡', label: 'Quick Bite', value: 'quick-bites' },
  { emoji: '🍽️', label: 'Casual', value: 'casual' },
  { emoji: '🥂', label: 'Fancy', value: 'fancy' },
  { emoji: '🌙', label: 'Night Out', value: 'night-out' },
];
const selectableReviewTags = new Set<ReviewTag>(
  tagOptions.map((tag) => tag.value),
);

function PlaceFilterCafeIcon() {
  return (
    <View style={placeFilterIconStyles.cafe}>
      <PlaceFilterCafeSteamLeft style={placeFilterIconStyles.cafeSteamLeft} />
      <PlaceFilterCafeSteamRight style={placeFilterIconStyles.cafeSteamRight} />
      <PlaceFilterCafeCup style={placeFilterIconStyles.cafeCup} />
    </View>
  );
}

const placeFilterOptions = [
  {
    Icon: PlaceFilterTrendingIcon,
    label: 'Trending',
    value: 'trending',
  },
  {
    Icon: PlaceFilterRestaurantIcon,
    label: 'Restaurant',
    value: 'restaurant',
  },
  { Icon: PlaceFilterCafeIcon, label: 'Cafe', value: 'cafe' },
  { Icon: PlaceFilterBarIcon, label: 'Bar', value: 'bar' },
  { Icon: PlaceFilterMyListIcon, label: 'My list', value: 'my-list' },
] as const;

const placeFilterIconStyles = StyleSheet.create({
  cafe: { height: 14, position: 'relative', width: 14 },
  cafeSteamLeft: { left: 3.8556, position: 'absolute', top: 0 },
  cafeSteamRight: { left: 6.6766, position: 'absolute', top: 0 },
  cafeCup: { left: 1.4364, position: 'absolute', top: 6.0452 },
});
const reviewDraftKey = (userId: string) => `@tastes/review-draft/${userId}`;

interface StoredReviewDraft {
  dishes: DishReviewDraft[];
  idempotencyKey: string;
  rating: number;
  savedAt?: string;
  selectedVenue: Venue | null;
  tags: ReviewTag[];
  text: string;
  venueId: string;
}

function venueImage(url: string | undefined): ImageSourcePropType {
  return url ? { uri: url } : restaurantImage;
}

export function CreateReviewScreen({
  initialVenueId,
  onClose,
  onPublished,
  userId,
}: {
  initialVenueId?: string;
  onClose: () => void;
  onPublished: () => void;
  userId: string;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const feedbackRef = useRef<TextInput>(null);
  // Measured so the hero's SVG background (HeroBackground) can be shaped to the card's real
  // size — its bottom edge is drawn concentric with the rating arc (see heroCurveGeometry)
  // instead of an independently-radiused CSS corner, so the gap to the arc stays constant.
  const [heroSize, setHeroSize] = useState({ height: 0, width: 0 });
  const [venueCardBottom, setVenueCardBottom] = useState(0);
  const [venueId, setVenueId] = useState(initialVenueId ?? '');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [rating, setRating] = useState(0);
  const [ratingGestureActive, setRatingGestureActive] = useState(false);
  const [text, setText] = useState('');
  const feedbackMinHeight = responsiveSize(50);
  const feedbackMaxHeight = responsiveSize(140);
  const [feedbackHeight, setFeedbackHeight] = useState(() =>
    responsiveSize(50),
  );
  const [feedbackFocused, setFeedbackFocused] = useState(false);
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [dishes, setDishes] = useState<DishReviewDraft[]>([]);
  const [placeSelectorOpen, setPlaceSelectorOpen] = useState(false);
  const [dishEditor, setDishEditor] = useState<DishReviewDraft | null>(null);
  const [dishToRemove, setDishToRemove] = useState<DishReviewDraft | null>(
    null,
  );
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Measured rather than a fixed guess: at larger accessibility text sizes the footer's own
  // text/button grows taller, and a hardcoded padding would stop covering it, letting the
  // scrolled content (e.g. "Add Dish") show through underneath the "Post Review" button.
  const [footerHeight, setFooterHeight] = useState(112);
  const [submitError, setSubmitError] = useState<'failed' | 'offline' | null>(
    null,
  );
  const [success, setSuccess] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey('review'),
  );
  const place = usePlace(venueId);
  const createReview = useCreateReview(userId);
  const venue = selectedVenue ?? place.data?.venue ?? null;
  const valid = Boolean(
    venueId &&
    text.trim() &&
    rating >= 1 &&
    dishes.every((dish) => dish.title.trim() && dish.rating >= 0.5),
  );
  const hasDraftChanges = Boolean(
    venueId !== (initialVenueId ?? '') ||
    rating > 0 ||
    text.trim() ||
    tags.length > 0 ||
    dishes.length > 0,
  );

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (initialVenueId) return;
    let active = true;
    void AsyncStorage.getItem(reviewDraftKey(userId)).then((stored) => {
      if (!active || !stored) return;
      try {
        const draft = JSON.parse(stored) as Partial<StoredReviewDraft>;
        if (
          typeof draft.venueId !== 'string' ||
          typeof draft.text !== 'string' ||
          typeof draft.rating !== 'number'
        )
          return;
        setVenueId(draft.venueId);
        setSelectedVenue(draft.selectedVenue ?? null);
        setRating(draft.rating);
        setText(draft.text);
        setTags(
          Array.isArray(draft.tags)
            ? draft.tags
                .filter((tag): tag is ReviewTag =>
                  selectableReviewTags.has(tag),
                )
                .slice(0, 1)
            : [],
        );
        setDishes(Array.isArray(draft.dishes) ? draft.dishes : []);
        if (typeof draft.idempotencyKey === 'string')
          setIdempotencyKey(draft.idempotencyKey);
      } catch {
        void AsyncStorage.removeItem(reviewDraftKey(userId));
      }
    });
    return () => {
      active = false;
    };
  }, [initialVenueId, userId]);

  useEffect(() => {
    if (!initialVenueId || selectedVenue) return;
    setVenueId(initialVenueId);
    setSelectedVenue(null);
  }, [initialVenueId, selectedVenue]);

  function reset() {
    setVenueId('');
    setSelectedVenue(null);
    setRating(0);
    setText('');
    setFeedbackHeight(50);
    setTags([]);
    setDishes([]);
    setIdempotencyKey(createIdempotencyKey('review'));
    setSuccess(false);
    setSubmitError(null);
    void AsyncStorage.removeItem(reviewDraftKey(userId));
    void cancelDraftReminder();
  }

  async function persistDraft() {
    const draft: StoredReviewDraft = {
      dishes,
      idempotencyKey,
      rating,
      savedAt: new Date().toISOString(),
      selectedVenue: venue,
      tags,
      text,
      venueId,
    };
    try {
      await AsyncStorage.setItem(reviewDraftKey(userId), JSON.stringify(draft));
      await scheduleDraftReminder(venue?.name ?? selectedVenue?.name ?? '');
    } catch {
      // Leaving the form should not be blocked if local storage is unavailable.
    }
  }

  function requestClose() {
    Keyboard.dismiss();
    if (hasDraftChanges) {
      setExitPromptOpen(true);
      return;
    }
    onClose();
  }

  function finish() {
    reset();
    onPublished();
  }

  function submit() {
    if (!valid || createReview.isPending) return;
    Keyboard.dismiss();
    setSubmitError(null);
    createReview.mutate(
      {
        dishReviews: dishes,
        idempotencyKey,
        rating,
        tags,
        text,
        venueId,
      },
      {
        onError: (error) => {
          const message = apiErrorMessage(error);
          setSubmitError(
            /network|offline|unavailable|deadline/i.test(message)
              ? 'offline'
              : 'failed',
          );
          void persistDraft();
        },
        onSuccess: () => setSuccess(true),
      },
    );
  }

  if (success) return <ReviewAdded onDone={finish} />;

  // The ScrollView below already handles iOS keyboard insets itself
  // (automaticallyAdjustKeyboardInsets); adding KeyboardAvoidingView's own
  // padding on top of that double-compensates, so the content doesn't settle
  // back to its resting position once the keyboard closes and the footer
  // reappears overlapping it. Android has no such prop, so it still needs
  // KeyboardAvoidingView.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? undefined : 'height'}
      style={styles.screen}
    >
      <ImageBackground
        imageStyle={styles.patternImage}
        source={successPattern}
        style={styles.screen}
      >
        <PatternBackgroundLift />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[styles.content, { paddingBottom: 16 }]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ref={scrollRef}
          scrollEnabled={!ratingGestureActive}
          showsVerticalScrollIndicator={false}
          // A bottom padding on the content alone only helps once you've actually scrolled to
          // the end — it doesn't stop the floating "Post Review" button from sitting on top of
          // whatever unscrolled content happens to render near the screen's bottom edge (e.g.
          // "Add Dish" on a short form). Shrinking the ScrollView's own viewport by the
          // footer's height reserves that strip for real, so content can never land under the
          // button in the first place, scrolled or not.
          style={{ flex: 1, marginBottom: keyboardVisible ? 0 : footerHeight }}
        >
          <View
            onLayout={({ nativeEvent }) =>
              setHeroSize({
                height: nativeEvent.layout.height,
                width: nativeEvent.layout.width,
              })
            }
            style={[styles.hero, { paddingTop: insets.top + 8 }]}
          >
            {heroSize.width > 0 ? (
              <HeroBackground
                borderColor={isDark ? 'rgba(255,255,255,0.18)' : colors.border}
                colors={
                  isDark
                    ? ['#080808', '#080808', '#190404']
                    : ['#FFFFFF', '#FFFFFF', '#F8EBEA']
                }
                heroHeight={heroSize.height}
                heroWidth={heroSize.width}
                locations={[0, 0.65982, 1]}
                minimumStraightBottom={venueCardBottom + responsiveSize(12)}
              />
            ) : null}
            <View style={styles.navigation}>
              <Pressable
                accessibilityLabel="Close review"
                hitSlop={14}
                onPress={requestClose}
              >
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text maxFontSizeMultiplier={1.3} style={styles.title}>
                Write a Review
              </Text>
              <View style={styles.navigationSpacer} />
            </View>
            {venue ? (
              <>
                <Pressable
                  onLayout={({ nativeEvent }) =>
                    setVenueCardBottom(
                      nativeEvent.layout.y + nativeEvent.layout.height,
                    )
                  }
                  onPress={() => setPlaceSelectorOpen(true)}
                  style={styles.venueCard}
                >
                  <Image
                    source={venueImage(venue.imageUrl)}
                    style={styles.venueImage}
                  />
                  <View style={styles.venueCopy}>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={2}
                      style={styles.venueName}
                    >
                      {venue.name}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={2}
                      style={styles.venueAddress}
                    >
                      {venue.address ?? venue.city}
                    </Text>
                  </View>
                  <View style={styles.edit}>
                    <PenIcon
                      color={colors.text}
                      height={responsiveSize(20)}
                      width={responsiveSize(20)}
                    />
                  </View>
                </Pressable>
                {/* Fixed-height card above the arc — the venue name/address are capped so a
                    larger accessibility text size can't grow the hero past its designed height
                    and pull the arc out of alignment with the card's rounded bottom. */}
                <RatingCurve
                  heroHeight={heroSize.height}
                  heroWidth={heroSize.width}
                  minimumStraightBottom={venueCardBottom + responsiveSize(12)}
                  onChange={setRating}
                  onGestureActiveChange={setRatingGestureActive}
                  value={rating}
                />
              </>
            ) : (
              <Pressable
                onPress={() => setPlaceSelectorOpen(true)}
                style={styles.selectPlace}
              >
                {place.isPending && venueId ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <View style={styles.selectPlaceContent}>
                    <View style={styles.selectPlaceIcon}>
                      <SelectPlaceCircle
                        color={colors.text}
                        height={responsiveSize(21.5)}
                        style={styles.selectPlaceCircle}
                        width={responsiveSize(21.5)}
                      />
                      <SelectPlacePlus
                        color={colors.text}
                        height={responsiveSize(7.5)}
                        style={styles.selectPlacePlus}
                        width={responsiveSize(7.5)}
                      />
                    </View>
                    <Text
                      maxFontSizeMultiplier={1.3}
                      style={styles.selectPlaceText}
                    >
                      Select Place
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>

          <SectionLabel
            label="Your review"
            onDone={
              feedbackFocused
                ? () => {
                    feedbackRef.current?.blur();
                    Keyboard.dismiss();
                  }
                : undefined
            }
          />
          <TextInput
            blurOnSubmit
            maxLength={500}
            multiline
            onBlur={() => setFeedbackFocused(false)}
            onChangeText={setText}
            onContentSizeChange={({ nativeEvent }) =>
              setFeedbackHeight(
                Math.min(
                  feedbackMaxHeight,
                  Math.max(feedbackMinHeight, nativeEvent.contentSize.height),
                ),
              )
            }
            onFocus={() => setFeedbackFocused(true)}
            onSubmitEditing={() => {
              feedbackRef.current?.blur();
              Keyboard.dismiss();
            }}
            placeholder="Enter text"
            placeholderTextColor={colors.placeholder}
            ref={feedbackRef}
            returnKeyType="done"
            scrollEnabled={feedbackHeight >= feedbackMaxHeight}
            style={[styles.feedback, { height: feedbackHeight }]}
            textAlignVertical="top"
            value={text}
          />
          <Text style={styles.reviewCounter}>{text.length}/500</Text>
          {submitError ? (
            <View accessibilityRole="alert" style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {submitError === 'offline'
                  ? "You're offline. Your review is kept as a draft until you're back."
                  : "Couldn't post your review.\nCheck your connection and try again."}
              </Text>
            </View>
          ) : null}

          <SectionLabel label="Dish reviews" />
          {dishes.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.dishList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {dishes.map((dish) => (
                <Pressable
                  key={dish.id}
                  onPress={() => setDishEditor(dish)}
                  style={styles.dishCard}
                >
                  {dish.photoUri ? (
                    <Image
                      source={{ uri: dish.photoUri }}
                      style={styles.dishImage}
                    />
                  ) : (
                    <View style={[styles.dishImage, styles.emptyDishPhoto]}>
                      <Text style={styles.addPhotoText}>+ Add photo</Text>
                    </View>
                  )}
                  <Pressable
                    accessibilityLabel={`Remove ${dish.title}`}
                    onPress={() => setDishToRemove(dish)}
                    style={styles.deleteDish}
                  >
                    <DeleteDishIcon
                      height={responsiveSize(17)}
                      width={responsiveSize(16)}
                    />
                  </Pressable>
                  <Text style={styles.dishRating}>
                    ★ {dish.rating.toFixed(1)}
                  </Text>
                  <Text numberOfLines={1} style={styles.dishTitle}>
                    {dish.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {dishes.length < 5 ? (
            <Pressable
              onPress={() =>
                setDishEditor({
                  id: createIdempotencyKey('dish'),
                  photoUri: '',
                  rating: 0,
                  title: '',
                })
              }
              style={styles.addDish}
            >
              <AddDishIcon
                color={colors.text}
                height={responsiveSize(18.0654)}
                width={responsiveSize(20)}
              />
              <Text maxFontSizeMultiplier={1.3} style={styles.addDishText}>
                Add Dish
              </Text>
            </Pressable>
          ) : null}

          <SectionLabel label="Tag" />
          <ScrollView
            contentContainerStyle={styles.tags}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsScroll}
          >
            {tagOptions.map((tag) => (
              <ReviewTagPill
                emoji={tag.emoji}
                key={tag.value}
                label={tag.label}
                onPress={() =>
                  setTags((items) =>
                    items[0] === tag.value ? [] : [tag.value],
                  )
                }
                reduceMotion={reduceMotion}
                selected={tags[0] === tag.value}
                styles={styles}
              />
            ))}
          </ScrollView>
        </ScrollView>

        {/* Height is measured (see footerHeight/onLayout above), so a taller button here at
            larger accessibility text sizes still gets fully reserved-for in the ScrollView's
            bottom padding instead of overlapping "Add Dish". */}
        {!keyboardVisible ? (
          <LinearGradient
            colors={
              isDark
                ? ['rgba(8,8,8,0)', colors.background]
                : ['rgba(255,255,255,0)', '#FFFFFF']
            }
            onLayout={({ nativeEvent }) =>
              setFooterHeight(nativeEvent.layout.height)
            }
            style={[
              styles.footer,
              { paddingBottom: Math.max(16, insets.bottom) },
            ]}
          >
            <Pressable
              disabled={!valid || createReview.isPending}
              onPress={submit}
              style={[
                styles.post,
                (!valid || createReview.isPending) && styles.postDisabled,
              ]}
            >
              {createReview.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text maxFontSizeMultiplier={1.3} style={styles.postText}>
                  Post Review
                </Text>
              )}
            </Pressable>
          </LinearGradient>
        ) : null}

        {placeSelectorOpen ? (
          <PlaceSelector
            onClose={() => setPlaceSelectorOpen(false)}
            onSelect={(next) => {
              setVenueId(next.id);
              setSelectedVenue(next);
              setPlaceSelectorOpen(false);
            }}
            userId={userId}
            visible={placeSelectorOpen}
          />
        ) : null}
        <DishEditor
          onClose={() => setDishEditor(null)}
          onSave={(dish) => {
            setDishes((items) =>
              items.some((item) => item.id === dish.id)
                ? items.map((item) => (item.id === dish.id ? dish : item))
                : [...items, dish],
            );
            setDishEditor(null);
          }}
          value={dishEditor}
          visible={dishEditor !== null}
        />
        <ReviewConfirmationSheet
          body="The photo, rating and title will be deleted from your review."
          dangerLabel="Remove"
          onClose={() => setDishToRemove(null)}
          onDanger={() => {
            if (dishToRemove)
              setDishes((items) =>
                items.filter((item) => item.id !== dishToRemove.id),
              );
            setDishToRemove(null);
          }}
          primaryLabel="Keep dish"
          title="Remove this dish?"
          visible={dishToRemove !== null}
        />
        <ReviewConfirmationSheet
          body="Your review will be saved as a draft, so you can finish it later."
          dangerLabel="Discard review"
          onClose={() => setExitPromptOpen(false)}
          onDanger={() => {
            reset();
            setExitPromptOpen(false);
            onClose();
          }}
          onPrimary={() => {
            void persistDraft().finally(() => {
              setExitPromptOpen(false);
              onClose();
            });
          }}
          primaryLabel="Save draft & exit"
          secondaryLabel="Keep writing"
          title="Leave without posting?"
          visible={exitPromptOpen}
        />
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({
  label,
  onDone,
}: {
  label: string;
  onDone?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={sectionStyles.row}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={[sectionStyles.label, { color: colors.textMuted }]}
      >
        {label.toUpperCase()}
      </Text>
      {onDone ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onDone}>
          <Text style={[sectionStyles.done, { color: colors.primary }]}>
            Done
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReviewTagPill({
  emoji,
  label,
  onPress,
  reduceMotion,
  selected,
  styles,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  reduceMotion: boolean;
  selected: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const pressFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(selection, {
      duration: reduceMotion ? 0 : 180,
      easing: Easing.inOut(Easing.cubic),
      toValue: selected ? 1 : 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, selected, selection]);

  useEffect(() => () => pressFlash.stopAnimation(), [pressFlash]);

  const flashBorder = () => {
    pressFlash.stopAnimation();
    pressFlash.setValue(0);
    if (reduceMotion || !selected) return;
    Animated.sequence([
      Animated.timing(pressFlash, {
        duration: 8,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(pressFlash, {
        duration: 16,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      onPressIn={flashBorder}
      style={styles.tagPressable}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.tag,
          {
            backgroundColor: selection.interpolate({
              inputRange: [0, 1],
              outputRange: [styles.tag.backgroundColor as string, '#B82F29'],
            }),
            borderColor: selection.interpolate({
              inputRange: [0, 1],
              outputRange: [styles.tag.borderColor as string, '#B82F29'],
            }),
          },
        ]}
      >
        <Text allowFontScaling={false} style={styles.tagEmoji}>
          {emoji}
        </Text>
        <Animated.Text
          maxFontSizeMultiplier={1.3}
          style={[
            styles.tagText,
            {
              color: selection.interpolate({
                inputRange: [0, 1],
                outputRange: [styles.tagText.color as string, '#FFFFFF'],
              }),
            },
          ]}
        >
          {label}
        </Animated.Text>
        <Animated.View
          pointerEvents="none"
          style={[styles.tagPressFlash, { opacity: pressFlash }]}
        />
      </Animated.View>
    </Pressable>
  );
}

function RatingCurve({
  heroHeight = 0,
  heroWidth = 0,
  linear = false,
  minimumStraightBottom = 0,
  onChange,
  onGestureActiveChange,
  standaloneArc = false,
  value,
}: {
  heroHeight?: number;
  heroWidth?: number;
  linear?: boolean;
  minimumStraightBottom?: number;
  onChange: (value: number) => void;
  onGestureActiveChange?: (active: boolean) => void;
  standaloneArc?: boolean;
  value: number;
}) {
  const { isDark } = useAppTheme();
  const accent = '#B82F29';
  const curveBase = isDark ? '#3D1A1C' : '#FFCBCE';
  const curvePoint = isDark ? '#120606' : '#FFFFFF';
  // The scale asset is authored at a fixed 359.903pt canvas, which overflows
  // narrower screens (e.g. iPhone SE). Measure the space actually available
  // and scale the design-space marker positions to fit it instead.
  const [scaleWidth, setScaleWidth] = useState(0);
  const [standaloneWidth, setStandaloneWidth] = useState(0);
  const [visualRating, setVisualRating] = useState(value);
  const minimumRating = linear ? 0.5 : 1;
  const reduceMotion = useRef(false);
  const markerScale = scaleWidth / 359.903;
  const curvedLayout =
    !linear && !standaloneArc && heroWidth > 0 && heroHeight > 0
      ? concentricRatingLayout(
          heroWidth,
          heroHeight,
          minimumStraightBottom,
          responsiveSize(heroCurveGap),
        )
      : null;
  const arcGeometry =
    standaloneArc && standaloneWidth > 0
      ? dishRatingArcGeometry(standaloneWidth)
      : curvedLayout?.ratingArc;
  const standaloneHeight = dishRatingArcHeight(standaloneWidth);
  const selectedPoint =
    visualRating >= 1 ? ratingCurvePoint(visualRating, arcGeometry) : null;
  const initialPinPoint = ratingCurvePoint(Math.max(1, value), arcGeometry);
  const pinPosition = useRef(
    new Animated.ValueXY({
      x: initialPinPoint.x - responsiveSize(22),
      y: initialPinPoint.y - responsiveSize(22),
    }),
  ).current;
  const dragging = useRef(false);
  const curveRef = useRef<View>(null);
  const curveWindowX = useRef(0);
  const settling = useRef(false);
  const dragStartRating = useRef(value);
  const currentDragRating = useRef(value);
  const settleRating = useRef(new Animated.Value(value)).current;
  const interaction = useRef({
    arcGeometry,
    onChange,
    onGestureActiveChange,
    scaleWidth,
    value,
  });
  interaction.current = {
    arcGeometry,
    onChange,
    onGestureActiveChange,
    scaleWidth,
    value,
  };
  const geometrySignature = [
    heroHeight,
    heroWidth,
    minimumStraightBottom,
    arcGeometry?.radius ?? 0,
  ].join(':');
  const previousGeometrySignature = useRef(geometrySignature);

  const setPinPosition = (
    rating: number,
    geometry = interaction.current.arcGeometry,
  ) => {
    const point = ratingCurvePoint(rating, geometry);
    pinPosition.setValue({
      x: point.x - responsiveSize(22),
      y: point.y - responsiveSize(22),
    });
  };

  const setVisualPosition = (rating: number) => {
    currentDragRating.current = rating;
    setPinPosition(rating);
    setVisualRating(rating);
  };

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reduceMotion.current = enabled;
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const listener = settleRating.addListener(({ value: nextRating }) =>
      setVisualPosition(nextRating),
    );
    return () => {
      settleRating.stopAnimation();
      settleRating.removeListener(listener);
    };
  }, [settleRating]);

  useEffect(() => {
    const geometryChanged =
      previousGeometrySignature.current !== geometrySignature;
    previousGeometrySignature.current = geometrySignature;
    if (geometryChanged) {
      // A resize can interrupt delivery of the native release event. Explicitly
      // end the gesture so the old responder cannot keep the ScrollView locked.
      dragging.current = false;
      interaction.current.onGestureActiveChange?.(false);
      settling.current = false;
      settleRating.stopAnimation();
      currentDragRating.current = value;
    }
    if (!dragging.current && !settling.current) {
      currentDragRating.current = value;
      setVisualRating(value);
    }
    if (
      value >= 1 &&
      (!dragging.current || geometryChanged) &&
      !settling.current
    ) {
      setPinPosition(value, arcGeometry);
    }
  }, [arcGeometry, geometrySignature, value, pinPosition, settleRating]);

  const settleToRating = (target: number) => {
    dragging.current = false;
    settling.current = true;
    settleRating.stopAnimation();
    settleRating.setValue(currentDragRating.current);
    Animated.timing(settleRating, {
      duration: reduceMotion.current ? 0 : 150,
      easing: Easing.out(Easing.cubic),
      toValue: target,
      useNativeDriver: false,
    }).start(({ finished }) => {
      settling.current = false;
      if (!finished) return;
      setVisualPosition(target);
      interaction.current.onChange(target);
    });
  };

  const selectRating = (rating: number) => {
    settleRating.stopAnimation();
    dragging.current = false;
    settling.current = false;
    setVisualPosition(rating);
    interaction.current.onChange(rating);
  };

  const curvePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        dragging.current = true;
        interaction.current.onGestureActiveChange?.(true);
        // The responder lives on the 44pt handle, so locationX/locationY are
        // handle-local coordinates, not curve coordinates. Starting from those
        // values projects a simple tap to the 1-star endpoint. Anchor the drag to
        // the current rating and apply only gesture deltas from there.
        dragStartRating.current = currentDragRating.current;
        settleRating.stopAnimation();
        settling.current = false;
      },
      onPanResponderMove: (_event, gesture) => {
        if (!dragging.current) return;
        const continuousRating = ratingForCurveDrag(
          dragStartRating.current,
          gesture.dx,
          gesture.dy,
          interaction.current.arcGeometry,
        );
        setVisualPosition(continuousRating);
      },
      onPanResponderRelease: (_event, gesture) => {
        interaction.current.onGestureActiveChange?.(false);
        const coast = responsiveSize(18);
        const projectedRating = ratingForCurveDrag(
          dragStartRating.current,
          gesture.dx +
            Math.max(
              -responsiveSize(30),
              Math.min(responsiveSize(30), gesture.vx * coast),
            ),
          gesture.dy +
            Math.max(
              -responsiveSize(30),
              Math.min(responsiveSize(30), gesture.vy * coast),
            ),
          interaction.current.arcGeometry,
        );
        settleToRating(snapRating(projectedRating));
      },
      onPanResponderTerminate: () => {
        interaction.current.onGestureActiveChange?.(false);
        settleToRating(snapRating(currentDragRating.current));
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;
  const updateEmptyCurveRating = (pageX: number) => {
    const geometry = interaction.current.arcGeometry;
    if (!geometry) return;
    setVisualPosition(ratingForCurveX(pageX - curveWindowX.current, geometry));
  };
  const emptyCurvePanResponder = useRef(
    PanResponder.create({
      // Claim the whole curve canvas while the rating is empty. Requiring the
      // initial touch to land within a narrow band around the SVG path meant a
      // finger that started just above/below it never became the responder, so
      // the first interaction could only be a tap. Once claimed, every point is
      // still projected onto the arc by updateEmptyCurveRating.
      onStartShouldSetPanResponderCapture: () =>
        interaction.current.value < 1 &&
        Boolean(interaction.current.arcGeometry),
      onStartShouldSetPanResponder: () =>
        interaction.current.value < 1 &&
        Boolean(interaction.current.arcGeometry),
      onMoveShouldSetPanResponder: () =>
        interaction.current.value < 1 &&
        Boolean(interaction.current.arcGeometry),
      onMoveShouldSetPanResponderCapture: () =>
        interaction.current.value < 1 &&
        Boolean(interaction.current.arcGeometry),
      onPanResponderGrant: (event) => {
        dragging.current = true;
        settling.current = false;
        settleRating.stopAnimation();
        interaction.current.onGestureActiveChange?.(true);
        updateEmptyCurveRating(event.nativeEvent.pageX);
      },
      onPanResponderMove: (event) => {
        if (!dragging.current) return;
        updateEmptyCurveRating(event.nativeEvent.pageX);
      },
      onPanResponderRelease: () => {
        interaction.current.onGestureActiveChange?.(false);
        settleToRating(snapRating(currentDragRating.current));
      },
      onPanResponderTerminate: () => {
        interaction.current.onGestureActiveChange?.(false);
        settleToRating(snapRating(currentDragRating.current));
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;
  const updateLinearRating = (locationX: number) => {
    const width = interaction.current.scaleWidth;
    if (width <= 0) return;
    const nextRating = ratingForLinearPoint(locationX, width);
    currentDragRating.current = nextRating;
    setVisualRating(nextRating);
    interaction.current.onChange(nextRating);
  };
  const linearPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (event) => {
        dragging.current = true;
        updateLinearRating(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event) =>
        updateLinearRating(event.nativeEvent.locationX),
      onPanResponderRelease: () => {
        dragging.current = false;
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;
  const innerBottom = arcGeometry
    ? arcGeometry.centerY + arcGeometry.radius
    : responsiveSize(167);
  return (
    <View
      onLayout={
        standaloneArc
          ? (event) => setStandaloneWidth(event.nativeEvent.layout.width)
          : undefined
      }
      style={[
        ratingStyles.wrap,
        standaloneArc && [
          ratingStyles.standaloneWrap,
          { height: standaloneHeight },
        ],
        curvedLayout && {
          bottom: 0,
          height: curvedLayout.arcDepth,
          left: 0,
          position: 'absolute',
          width: heroWidth,
        },
      ]}
    >
      {/* The digit and stars sit at fixed pixel offsets over the SVG arc below, so they opt
          out of font scaling entirely rather than drifting out of alignment with it. Screen
          readers still get the rating via each star's accessibilityLabel. */}
      <Text
        allowFontScaling={false}
        style={[
          ratingStyles.value,
          curvedLayout && { top: innerBottom - responsiveSize(149) },
          standaloneArc && { top: innerBottom - responsiveSize(141) },
        ]}
      >
        {visualRating >= minimumRating
          ? visualRating.toFixed(
              Math.abs(visualRating - Math.round(visualRating)) < 0.03 ? 0 : 1,
            )
          : '–'}
      </Text>
      <View
        style={[
          ratingStyles.stars,
          curvedLayout && { top: innerBottom - responsiveSize(106) },
          standaloneArc && { top: innerBottom - responsiveSize(96) },
        ]}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const star = index + 1;
          const fill = Math.max(0, Math.min(1, visualRating - index));
          return (
            <Pressable
              accessibilityLabel={`${star} stars`}
              accessibilityRole="button"
              hitSlop={4}
              key={star}
              onPress={() => selectRating(star)}
              style={ratingStyles.starButton}
            >
              <View style={ratingStyles.starGlyph}>
                <Text allowFontScaling={false} style={ratingStyles.starOutline}>
                  ☆
                </Text>
                {fill > 0 ? (
                  <View
                    style={[
                      ratingStyles.starFillClip,
                      { width: responsiveSize(26) * fill },
                    ]}
                  >
                    <Text
                      allowFontScaling={false}
                      style={ratingStyles.starFill}
                    >
                      ★
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {linear ? (
        <View
          onLayout={(event) => setScaleWidth(event.nativeEvent.layout.width)}
          style={ratingStyles.scale}
          {...linearPanResponder.panHandlers}
        >
          {scaleWidth > 0 ? (
            <>
              {isDark ? (
                <RatingScale
                  height={responsiveSize(15.1808)}
                  width={scaleWidth}
                />
              ) : (
                <RatingScaleLight
                  height={responsiveSize(15.1808)}
                  width={scaleWidth}
                />
              )}
              {value >= minimumRating ? (
                <Svg
                  height={responsiveSize(15.1808)}
                  pointerEvents="none"
                  preserveAspectRatio="none"
                  style={ratingStyles.linearProgress}
                  viewBox="0 0 359.903 15.1808"
                  width={scaleWidth}
                >
                  <Line
                    stroke={accent}
                    strokeLinecap="round"
                    strokeWidth={4}
                    x1={4}
                    x2={
                      dishRatingMarkers.find((marker) => marker.value === value)
                        ?.x ?? 4
                    }
                    y1={8}
                    y2={8}
                  />
                  {dishRatingMarkers
                    .filter((marker) => marker.value <= value)
                    .map((marker) =>
                      Number.isInteger(marker.value) ? (
                        <Circle
                          cx={marker.x}
                          cy={7.59038}
                          fill="#FFFFFF"
                          key={marker.value}
                          r={6.09038}
                          stroke={accent}
                          strokeWidth={3}
                        />
                      ) : (
                        <Line
                          key={marker.value}
                          stroke={accent}
                          strokeLinecap="round"
                          strokeWidth={2}
                          x1={marker.x}
                          x2={marker.x}
                          y1={2}
                          y2={13.3857}
                        />
                      ),
                    )}
                </Svg>
              ) : null}
              {dishRatingMarkers.map((marker) => (
                <Pressable
                  accessibilityLabel={`${marker.value} stars`}
                  accessibilityRole="button"
                  key={marker.value}
                  onPress={() => selectRating(marker.value)}
                  style={[
                    ratingStyles.linearPointHit,
                    { left: marker.x * markerScale - responsiveSize(22) },
                  ]}
                >
                  {marker.value === value ? (
                    <RatingPin
                      color="#B82F29"
                      height={responsiveSize(38)}
                      width={responsiveSize(38)}
                    />
                  ) : null}
                </Pressable>
              ))}
            </>
          ) : null}
        </View>
      ) : arcGeometry && (curvedLayout || standaloneArc) ? (
        <View
          onLayout={() => {
            curveRef.current?.measureInWindow((x) => {
              curveWindowX.current = x;
            });
          }}
          ref={curveRef}
          {...emptyCurvePanResponder.panHandlers}
          style={[
            ratingStyles.curve,
            {
              height: standaloneArc ? standaloneHeight : curvedLayout?.arcDepth,
              width: standaloneArc ? standaloneWidth : heroWidth,
            },
          ]}
        >
          <Svg
            height={standaloneArc ? standaloneHeight : curvedLayout?.arcDepth}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            viewBox={`0 0 ${standaloneArc ? standaloneWidth : heroWidth} ${standaloneArc ? standaloneHeight : curvedLayout?.arcDepth}`}
            width={standaloneArc ? standaloneWidth : heroWidth}
          >
            <Defs>
              <ClipPath id="review-rating-progress">
                <Rect
                  height={
                    standaloneArc ? standaloneHeight : curvedLayout?.arcDepth
                  }
                  width={selectedPoint?.x ?? 0}
                  x={0}
                  y={0}
                />
              </ClipPath>
            </Defs>
            <Path
              d={`M${ratingCurvePoint(1, arcGeometry).x} ${ratingCurvePoint(1, arcGeometry).y} A${arcGeometry.radius} ${arcGeometry.radius} 0 0 0 ${arcGeometry.centerX} ${innerBottom}`}
              fill="none"
              stroke={curveBase}
              strokeLinecap="round"
              strokeWidth={responsiveSize(4)}
            />
            <Path
              d={`M${arcGeometry.centerX} ${innerBottom} A${arcGeometry.radius} ${arcGeometry.radius} 0 0 0 ${ratingCurvePoint(5, arcGeometry).x} ${ratingCurvePoint(5, arcGeometry).y}`}
              fill="none"
              stroke={curveBase}
              strokeLinecap="round"
              strokeWidth={responsiveSize(4)}
            />
            {selectedPoint ? (
              <Path
                clipPath="url(#review-rating-progress)"
                d={`M${ratingCurvePoint(1, arcGeometry).x} ${ratingCurvePoint(1, arcGeometry).y} A${arcGeometry.radius} ${arcGeometry.radius} 0 0 0 ${arcGeometry.centerX} ${innerBottom} A${arcGeometry.radius} ${arcGeometry.radius} 0 0 0 ${ratingCurvePoint(5, arcGeometry).x} ${ratingCurvePoint(5, arcGeometry).y}`}
                fill="none"
                stroke={accent}
                strokeLinecap="round"
                strokeWidth={responsiveSize(4)}
              />
            ) : null}
          </Svg>
          {reviewRatingMarkers.map((marker) => {
            const active = marker.value <= visualRating;
            const point = ratingCurvePoint(marker.value, arcGeometry);
            return (
              <Pressable
                accessibilityLabel={`${marker.value} stars`}
                accessibilityRole="button"
                key={marker.value}
                onPress={() => selectRating(marker.value)}
                style={[
                  ratingStyles.pointHit,
                  {
                    left: point.x - responsiveSize(22),
                    top: point.y - responsiveSize(22),
                  },
                ]}
              >
                {marker.kind === 'dot' ? (
                  <View
                    style={[
                      ratingStyles.point,
                      {
                        backgroundColor: curvePoint,
                        borderColor: active ? accent : curveBase,
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      ratingStyles.tick,
                      { backgroundColor: active ? accent : curveBase },
                      { transform: [{ rotate: `${marker.rotation}deg` }] },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
          {visualRating >= 1 ? (
            <Animated.View
              accessibilityActions={[
                { name: 'increment' },
                { name: 'decrement' },
              ]}
              accessibilityLabel={`${visualRating.toFixed(1)} stars. Swipe left or right to adjust.`}
              accessibilityRole="adjustable"
              onAccessibilityAction={({ nativeEvent }) => {
                const delta =
                  nativeEvent.actionName === 'increment' ? 0.5 : -0.5;
                selectRating(snapRating(visualRating + delta));
              }}
              style={[
                ratingStyles.pointHit,
                ratingStyles.dragPin,
                pinPosition.getLayout(),
              ]}
              {...curvePanResponder.panHandlers}
            >
              <RatingPin
                color={accent}
                height={responsiveSize(38)}
                width={responsiveSize(38)}
              />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Renders the hero card's own fill + outline as a single SVG shape instead of a CSS
// LinearGradient box with a corner-radius bottom: the bottom edge is a circle concentric
// with the rating arc (same center, see heroCurveGeometry), so the gap between the arc and
// the card's edge reads as constant all the way across instead of widening toward the
// center, where a plain corner-radius would otherwise leave a mismatched pocket of empty
// space under the arc's deepest point (visible as extra dark background there).
function HeroBackground({
  borderColor,
  colors,
  heroHeight,
  heroWidth,
  locations,
  minimumStraightBottom,
}: {
  borderColor: string;
  colors: string[];
  heroHeight: number;
  heroWidth: number;
  locations: number[];
  minimumStraightBottom: number;
}) {
  const { outerRadius, straightBottom } = concentricRatingLayout(
    heroWidth,
    heroHeight,
    minimumStraightBottom,
    responsiveSize(heroCurveGap),
  );
  const centerX = heroWidth / 2;
  // Traversal order matters for the sweep-flag below: this mirrors the rating arc's own two
  // segments (left-edge → center-bottom → right-edge, both "0 0" flags) exactly. Going the
  // other way around with the same flags picks the other/complementary circle and produces a
  // self-intersecting path — a sharp V instead of a smooth dip.
  const d = `M0,${straightBottom} A${outerRadius},${outerRadius} 0 0 0 ${centerX},${heroHeight} A${outerRadius},${outerRadius} 0 0 0 ${heroWidth},${straightBottom} L${heroWidth},0 L0,0 Z`;
  return (
    <Svg
      height={heroHeight}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width={heroWidth}
    >
      <Defs>
        <SvgLinearGradient
          id="heroBackgroundGradient"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          {colors.map((color, index) => (
            <Stop
              key={color + index}
              offset={locations[index]}
              stopColor={color}
            />
          ))}
        </SvgLinearGradient>
      </Defs>
      <Path
        d={d}
        fill="url(#heroBackgroundGradient)"
        stroke={borderColor}
        strokeWidth={1}
      />
    </Svg>
  );
}

export function PlaceSelector({
  onClose,
  onSelect,
  userId,
  visible,
}: {
  onClose: () => void;
  onSelect: (venue: Venue) => void;
  userId: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSelectorStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { collapsedOffset, expandedHeight } = placeSheetHeights(
    windowHeight,
    insets.top,
  );
  const hiddenOffset = expandedHeight + Math.max(insets.bottom, 24);
  const sheetTranslateY = useRef(new Animated.Value(hiddenOffset)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const sheetPosition = useRef(hiddenOffset);
  const dragStart = useRef(collapsedOffset);
  const dragVelocityY = useRef(0);
  const dragging = useRef(false);
  const closing = useRef(false);
  const openingFrame = useRef<number | null>(null);
  const reduceMotion = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<
    'bar' | 'cafe' | 'my-list' | 'restaurant' | 'trending' | null
  >(null);
  const [submittingVenueId, setSubmittingVenueId] = useState<string | null>(
    null,
  );
  const api = useTastesApi();
  const query = useDiscoverVenues(userId);
  const favourites = useFavourites(userId);
  const searchQuery = useVenueSearch(search);
  const venues = query.data?.pages.flatMap((page) => page.items) ?? [];
  const favouriteVenues: Venue[] = (favourites.data?.places ?? []).map(
    (place) => ({
      address: place.address,
      category: place.category,
      city: place.city,
      distanceKm: place.distanceKm,
      id: place.venueId,
      imageUrl: place.imageUrl ?? undefined,
      name: place.name,
      priceLevel: place.priceLevel,
      rating: place.rating,
      reviewCount: place.reviewCount,
      status: 'active',
    }),
  );
  const localFiltered = (
    activeFilter === 'my-list' ? favouriteVenues : venues
  ).filter((venue) => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      `${venue.name} ${venue.city} ${venue.category ?? ''}`
        .toLowerCase()
        .includes(needle)
    );
  });
  const searchResults =
    search.trim().length >= 2 && activeFilter !== 'my-list'
      ? (searchQuery.data?.items ?? localFiltered)
      : localFiltered;
  const filtered = searchResults.filter((venue) => {
    if (!activeFilter || activeFilter === 'my-list') return true;
    const category = venue.category?.toLowerCase() ?? '';
    if (activeFilter === 'restaurant') {
      return !['cafe', 'club', 'bar'].some((nonRestaurant) =>
        category.includes(nonRestaurant),
      );
    }
    if (activeFilter === 'trending')
      return venue.discoverTags?.includes('trending');
    if (activeFilter === 'bar')
      return category.includes('bar') || category.includes('club');
    return category.includes(activeFilter);
  });
  const usingSearch = search.trim().length >= 2 && activeFilter !== 'my-list';
  const isPending =
    activeFilter === 'my-list'
      ? favourites.isPending
      : query.isPending || (usingSearch && searchQuery.isPending);
  const isError =
    activeFilter === 'my-list'
      ? favourites.isError
      : query.isError || (usingSearch && searchQuery.isError);

  const animateTo = useCallback(
    (toValue: number, onFinished?: () => void) => {
      if (reduceMotion.current) {
        sheetPosition.current = toValue;
        sheetTranslateY.setValue(toValue);
        onFinished?.();
        return;
      }
      Animated.spring(sheetTranslateY, {
        damping: 24,
        mass: 0.85,
        stiffness: 260,
        toValue,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinished?.();
      });
    },
    [sheetTranslateY],
  );

  const dismiss = useCallback(
    (afterClose: () => void = onClose) => {
      if (closing.current) return;
      closing.current = true;
      Keyboard.dismiss();
      if (reduceMotion.current) {
        scrimOpacity.setValue(0);
        afterClose();
        return;
      }
      Animated.timing(scrimOpacity, {
        duration: 160,
        easing: Easing.out(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }).start();
      Animated.timing(sheetTranslateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: hiddenOffset,
        useNativeDriver: true,
      }).start(() => afterClose());
    },
    [hiddenOffset, onClose, scrimOpacity, sheetTranslateY],
  );

  const handleShow = useCallback(() => {
    closing.current = false;
    setExpanded(false);
    sheetPosition.current = hiddenOffset;
    sheetTranslateY.setValue(hiddenOffset);
    scrimOpacity.setValue(0);
    if (openingFrame.current != null)
      cancelAnimationFrame(openingFrame.current);
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      if (reduceMotion.current) {
        scrimOpacity.setValue(1);
      } else {
        Animated.timing(scrimOpacity, {
          duration: 120,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      }
      animateTo(collapsedOffset);
    });
  }, [animateTo, collapsedOffset, hiddenOffset, scrimOpacity, sheetTranslateY]);

  useEffect(() => {
    const listener = sheetTranslateY.addListener(({ value }) => {
      sheetPosition.current = value;
    });
    return () => sheetTranslateY.removeListener(listener);
  }, [sheetTranslateY]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reduceMotion.current = enabled;
      },
    );
    return () => {
      active = false;
      subscription.remove();
      if (openingFrame.current != null)
        cancelAnimationFrame(openingFrame.current);
    };
  }, []);

  const settleDrag = useCallback(
    (velocityY = dragVelocityY.current) => {
      if (!dragging.current) return;
      dragging.current = false;
      sheetTranslateY.stopAnimation();
      const snap = resolvePlaceSheetSnap(
        sheetPosition.current,
        velocityY,
        collapsedOffset,
        expandedHeight,
      );
      if (snap === 'dismissed') {
        dismiss();
        return;
      }
      const nextExpanded = snap === 'expanded';
      setExpanded(nextExpanded);
      animateTo(nextExpanded ? 0 : collapsedOffset);
    },
    [animateTo, collapsedOffset, dismiss, expandedHeight, sheetTranslateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the handle on pointer-down as well as touch-down. Waiting for a
        // move event is unreliable for iOS apps running in a macOS window.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > 6 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          dragging.current = true;
          dragVelocityY.current = 0;
          sheetTranslateY.stopAnimation();
          dragStart.current = sheetPosition.current;
        },
        onPanResponderMove: (_event, gesture) => {
          dragVelocityY.current = gesture.vy;
          const position = Math.max(
            0,
            Math.min(expandedHeight, dragStart.current + gesture.dy),
          );
          sheetPosition.current = position;
          sheetTranslateY.setValue(position);
        },
        onPanResponderRelease: (_event, gesture) => settleDrag(gesture.vy),
        onPanResponderTerminate: () => settleDrag(),
        onPanResponderTerminationRequest: () => false,
      }),
    [expandedHeight, settleDrag, sheetTranslateY],
  );

  const selectVenue = async (venue: Venue) => {
    if (!venue.id.startsWith('google:')) {
      dismiss(() => onSelect(venue));
      return;
    }
    setSubmittingVenueId(venue.id);
    try {
      await api.submitUserVenue({
        name: venue.name,
        city: venue.city === 'Unknown' ? 'Unknown city' : venue.city,
        address: venue.address ?? venue.city,
        category: venue.category ?? 'Restaurant',
        latitude: venue.latitude,
        longitude: venue.longitude,
        googlePlaceId: venue.id.slice('google:'.length),
      });
      Alert.alert(
        'Place submitted',
        'We found it on Google Places and sent it for moderation. It will be available for reviews after approval.',
      );
    } catch (error) {
      Alert.alert('Could not submit place', apiErrorMessage(error));
    } finally {
      setSubmittingVenueId(null);
    }
  };
  return (
    <Modal
      animationType="none"
      onRequestClose={() => dismiss()}
      onShow={handleShow}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalScreen}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: scrimOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close place selector"
            onPress={() => dismiss()}
            style={styles.scrim}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              height: expandedHeight,
              paddingBottom: Math.max(12, insets.bottom),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View
            accessibilityLabel={
              expanded ? 'Collapse place selector' : 'Expand place selector'
            }
            accessibilityRole="adjustable"
            onPointerCancel={() => settleDrag()}
            onPointerUp={() => settleDrag()}
            onTouchCancel={() => settleDrag()}
            onTouchEnd={() => settleDrag()}
            style={styles.dragArea}
            {...panResponder.panHandlers}
          >
            <View style={styles.dragHandle} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select Place</Text>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={() => dismiss()}
            >
              <PlaceSelectorCloseIcon />
            </Pressable>
          </View>
          <View style={styles.searchBox}>
            <PlaceSelectorSearchIcon />
            <TextInput
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Restaurant"
              placeholderTextColor={colors.placeholder}
              style={styles.search}
              value={search}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')}>
                <PlaceSelectorClearIcon />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            contentContainerStyle={styles.filters}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersScroll}
          >
            {placeFilterOptions.map((filter) => {
              const active = activeFilter === filter.value;
              const FilterIcon = filter.Icon;
              return (
                <Pressable
                  key={filter.value}
                  onPress={() => setActiveFilter(active ? null : filter.value)}
                  style={[styles.filter, active && styles.filterActive]}
                >
                  <View style={styles.filterIcon}>
                    <FilterIcon />
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={styles.filterText}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {isPending ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : isError ? (
            <Pressable
              onPress={() =>
                void (activeFilter === 'my-list'
                  ? favourites.refetch()
                  : usingSearch
                    ? searchQuery.refetch()
                    : query.refetch())
              }
              style={styles.loading}
            >
              <Text style={styles.error}>
                Could not load places. Tap to retry.
              </Text>
            </Pressable>
          ) : (
            <FlatList
              style={styles.placeList}
              data={filtered}
              initialNumToRender={8}
              keyExtractor={(venue) => venue.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>No places match your search.</Text>
              }
              ListFooterComponent={
                query.isFetchingNextPage ? (
                  <ActivityIndicator
                    color={colors.primary}
                    style={styles.more}
                  />
                ) : null
              }
              maxToRenderPerBatch={8}
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage)
                  void query.fetchNextPage();
              }}
              onEndReachedThreshold={0.5}
              windowSize={7}
              renderItem={({ item: venue }) => (
                <Pressable
                  disabled={submittingVenueId === venue.id}
                  onPress={() => void selectVenue(venue)}
                  style={styles.row}
                >
                  <View style={styles.rowImageWrap}>
                    <Image
                      source={venueImage(venue.imageUrl)}
                      style={styles.rowImage}
                    />
                    {venue.discoverTags?.includes('trending') ? (
                      <Text style={styles.badge}>Trending</Text>
                    ) : (venue.reviewCount ?? 0) >= 20 ? (
                      <Text style={styles.badge}>Popular</Text>
                    ) : null}
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={styles.rowName}>
                      {venue.name}
                    </Text>
                    {venue.address || venue.city ? (
                      <Text numberOfLines={1} style={styles.rowAddress}>
                        {venue.address || venue.city}
                      </Text>
                    ) : null}
                    <View style={styles.meta}>
                      <View style={styles.ratingPill}>
                        <PlaceRatingStarIcon />
                        <Text style={styles.ratingPillText}>
                          {(venue.rating ?? 0).toFixed(1)}
                        </Text>
                      </View>
                      <Text style={styles.metaText}>
                        {venue.reviewCount ?? 0} reviews
                      </Text>
                    </View>
                    <View style={styles.detailPills}>
                      {[
                        venue.category,
                        venue.priceLevel ? '$'.repeat(venue.priceLevel) : null,
                        venue.distanceKm == null
                          ? null
                          : `${venue.distanceKm.toFixed(1)} km`,
                      ]
                        .filter((detail): detail is string => Boolean(detail))
                        .map((detail) => (
                          <View
                            key={`${venue.id}-${detail}`}
                            style={styles.detailPill}
                          >
                            <Text style={styles.detailPillText}>{detail}</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                  {submittingVenueId === venue.id ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DishEditor({
  onClose,
  onSave,
  value,
  visible,
}: {
  onClose: () => void;
  onSave: (dish: DishReviewDraft) => void;
  value: DishReviewDraft | null;
  visible: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(
    () => createDishStyles(colors, isDark),
    [colors, isDark],
  );
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DishReviewDraft | null>(value);
  const [ratingGestureActive, setRatingGestureActive] = useState(false);

  useEffect(() => {
    setDraft(value);
    setRatingGestureActive(false);
  }, [value]);
  const sheet = useBottomSheetMotion({ onClose, visible });

  async function choosePhoto(camera: boolean) {
    if (!draft) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        `Allow ${camera ? 'camera' : 'photo library'} access to add a dish photo.`,
      );
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ['images'],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          mediaTypes: ['images'],
          quality: 0.8,
        });
    if (!result.canceled) {
      // Normalize at the upload boundary so restored drafts and newly chosen
      // images take exactly one lossy resize/encode pass.
      setDraft({ ...draft, photoUri: result.assets[0].uri });
    }
  }

  function pickSource() {
    Alert.alert('Add dish photo', undefined, [
      { text: 'Camera', onPress: () => void choosePhoto(true) },
      { text: 'Photo library', onPress: () => void choosePhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (!draft) return null;
  const valid = Boolean(draft.title.trim() && draft.rating >= 1);
  return (
    <Modal
      animationType="none"
      onRequestClose={sheet.close}
      transparent
      visible={visible}
    >
      {/* Same double-compensation risk as the main review screen: the
          ScrollView below already adjusts for the iOS keyboard itself. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? undefined : 'height'}
        style={styles.modalScreen}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: sheet.backdropOpacity }]}
        >
          <Pressable
            accessibilityLabel="Close Add Dish"
            onPress={sheet.close}
            style={styles.scrim}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(10, insets.bottom),
              transform: [{ translateY: sheet.translateY }],
            },
          ]}
        >
          <View
            accessibilityLabel="Dismiss Add Dish"
            accessibilityRole="adjustable"
            style={styles.dragArea}
            {...sheet.panHandlers}
          >
            <View style={styles.dragHandle} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Add Dish</Text>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={sheet.close}
              style={styles.closeButton}
            >
              <CloseCircle
                color={colors.text}
                height={responsiveSize(30)}
                width={responsiveSize(30)}
              />
              <CloseX
                color={colors.text}
                height={responsiveSize(9)}
                style={styles.closeX}
                width={responsiveSize(9)}
              />
            </Pressable>
          </View>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.body}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!ratingGestureActive}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <Pressable
              onPress={pickSource}
              style={[styles.photo, draft.photoUri && styles.photoSelected]}
            >
              {draft.photoUri ? (
                <Image
                  source={{ uri: draft.photoUri }}
                  style={styles.photoImage}
                />
              ) : (
                <View style={styles.photoEmpty}>
                  <CameraIcon
                    height={responsiveSize(24)}
                    width={responsiveSize(30)}
                  />
                  <Text style={styles.photoAdd}>Add photo</Text>
                </View>
              )}
            </Pressable>
            <RatingCurve
              onChange={(rating) => setDraft({ ...draft, rating })}
              onGestureActiveChange={setRatingGestureActive}
              standaloneArc
              value={draft.rating}
            />
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                maxLength={120}
                onChangeText={(title) => setDraft({ ...draft, title })}
                placeholder="Enter text"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={draft.title}
              />
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={sheet.close} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!valid}
              onPress={() => sheet.closeThen(() => onSave(draft))}
              style={[styles.save, !valid && styles.saveDisabled]}
            >
              <View style={styles.saveContent}>
                <View style={styles.saveIcon}>
                  <SaveCheck
                    height={responsiveSize(14.2724)}
                    width={responsiveSize(19.9891)}
                  />
                </View>
                <Text style={styles.saveText}>Save</Text>
              </View>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReviewConfirmationSheet({
  body,
  dangerLabel,
  onClose,
  onDanger,
  onPrimary = onClose,
  primaryLabel,
  secondaryLabel,
  title,
  visible,
}: {
  body: string;
  dangerLabel: string;
  onClose: () => void;
  onDanger: () => void;
  onPrimary?: () => void;
  primaryLabel: string;
  secondaryLabel?: string;
  title: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createConfirmationStyles(colors), [colors]);
  const sheet = useBottomSheetMotion({ onClose, visible });
  return (
    <Modal
      animationType="none"
      onRequestClose={sheet.close}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close confirmation"
          onPress={sheet.close}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheet.translateY }] },
          ]}
        >
          <View style={styles.dragArea} {...sheet.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              sheet.closeThen(onPrimary === onClose ? undefined : onPrimary)
            }
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
          {secondaryLabel ? (
            <Pressable
              accessibilityRole="button"
              onPress={sheet.close}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => sheet.closeThen(onDanger)}
            style={styles.danger}
          >
            <Text style={styles.dangerText}>{dangerLabel}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ReviewAdded({ onDone }: { onDone: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(
    () => createSuccessStyles(colors, isDark),
    [colors, isDark],
  );
  return (
    <View style={styles.screen}>
      <Image source={successPattern} style={styles.pattern} />
      {isDark ? <Image source={successGlow} style={styles.glow} /> : null}
      <View style={styles.center}>
        <View style={styles.logo}>
          <SuccessMouthPink
            height={responsiveSize(61)}
            style={styles.logoPink}
            width={responsiveSize(77)}
          />
          <SuccessMouthOutline
            color={colors.text}
            height={responsiveSize(76)}
            style={styles.logoOutline}
            width={responsiveSize(105)}
          />
        </View>
        <Text style={styles.copy}>Your review has been added</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={styles.done}
      >
        <Text style={styles.doneText}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

const sectionStyles = responsiveStyleSheet({
  row: {
    minHeight: 35,
    marginTop: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { flex: 1, fontSize: 13 },
  done: { fontSize: 15, fontWeight: '600' },
});
const ratingStyles = responsiveStyleSheet({
  wrap: { height: 198, position: 'relative', alignItems: 'center' },
  // The sheet's body centers its children. Since the arc and markers are
  // absolutely positioned, they contribute no intrinsic width; explicitly
  // fill the sheet so onLayout can build the Figma-sized arc geometry.
  standaloneWrap: { width: '100%' },
  value: {
    position: 'absolute',
    top: 18,
    zIndex: 3,
    color: '#B82F29',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '500',
  },
  stars: {
    position: 'absolute',
    top: 61,
    zIndex: 4,
    flexDirection: 'row',
    gap: 4,
  },
  starButton: {
    width: 26,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlyph: { width: 26, height: 30 },
  starOutline: {
    position: 'absolute',
    color: '#B82F29',
    opacity: 0.3,
    fontSize: 29,
    lineHeight: 30,
  },
  starFillClip: { position: 'absolute', height: 30, overflow: 'hidden' },
  starFill: { width: 26, color: '#B82F29', fontSize: 27, lineHeight: 30 },
  curve: { position: 'absolute', left: 0, top: 0 },
  scale: {
    position: 'absolute',
    top: 116,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 359.903,
    height: 44,
    justifyContent: 'center',
  },
  linearProgress: { position: 'absolute', left: 0, top: 14.4096 },
  pointHit: {
    position: 'absolute',
    zIndex: 5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragPin: { zIndex: 6 },
  linearPointHit: {
    position: 'absolute',
    top: 0,
    zIndex: 5,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  tick: { width: 12, height: 2, borderRadius: 1 },
});

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  responsiveStyleSheet({
    screen: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.canvas,
    },
    patternImage: {
      opacity: isDark ? 1 : 0.06,
      resizeMode: 'repeat',
      tintColor: '#161616',
    },
    content: { flexGrow: 1 },
    // Background/border are drawn by HeroBackground (an absolutely-filled sibling), not a CSS
    // gradient + corner-radius, so the bottom edge can follow the rating arc's own curvature.
    hero: { minHeight: 438, paddingHorizontal: 16, overflow: 'hidden' },
    navigation: { height: 54, flexDirection: 'row', alignItems: 'center' },
    back: { color: colors.text, fontSize: 36, lineHeight: 38 },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
    },
    navigationSpacer: { width: 22 },
    selectPlace: {
      flex: 1,
      minHeight: 250,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectPlaceContent: {
      height: 44,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectPlaceIcon: { width: 24, height: 24 },
    selectPlaceCircle: { position: 'absolute', top: 1.25, left: 1.25 },
    selectPlacePlus: { position: 'absolute', top: 8.25, left: 8.25 },
    selectPlaceText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.6,
    },
    venueCard: { minHeight: 142, flexDirection: 'row', alignItems: 'center' },
    venueImage: { width: 122, height: 122, borderRadius: 14 },
    venueCopy: { flex: 1, gap: 7, paddingLeft: 16 },
    venueName: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
    },
    venueAddress: { color: colors.textSecondary, fontSize: 15, lineHeight: 18 },
    edit: {
      width: 44,
      height: 44,
      marginRight: -12,
      alignSelf: 'flex-start',
      alignItems: 'center',
      justifyContent: 'center',
    },
    feedback: {
      minHeight: 50,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      backgroundColor: colors.surface,
      fontSize: 16,
      lineHeight: 22,
    },
    reviewCounter: {
      marginTop: 4,
      marginHorizontal: 20,
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'right',
    },
    errorBanner: {
      minHeight: 52,
      marginTop: 10,
      marginHorizontal: 16,
      borderWidth: 1,
      borderColor: '#D94D45',
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 8,
      justifyContent: 'center',
      backgroundColor: 'rgba(217,77,69,0.12)',
    },
    errorBannerText: { color: '#D94D45', fontSize: 13, lineHeight: 16 },
    dishList: { gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
    dishCard: {
      width: 174,
      padding: 12,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    dishImage: { width: 150, height: 150, borderRadius: 14 },
    emptyDishPhoto: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
    },
    addPhotoText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    deleteDish: {
      position: 'absolute',
      right: 17,
      top: 17,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(22,22,22,0.2)',
    },
    dishRating: {
      position: 'absolute',
      top: 136,
      left: 12,
      color: '#fff',
      fontWeight: '700',
      backgroundColor: 'rgba(0,0,0,0.48)',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderBottomLeftRadius: 14,
      borderTopRightRadius: 10,
    },
    dishTitle: {
      marginTop: 12,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    addDish: {
      height: 44,
      marginHorizontal: 16,
      flexDirection: 'row',
      gap: 8,
      borderRadius: 36,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(173,51,36,0.1)',
    },
    addDishText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.6,
    },
    tagsScroll: { flexGrow: 0 },
    tags: {
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 18,
      alignItems: 'center',
    },
    tagPressable: { height: 34, borderRadius: 999, alignSelf: 'center' },
    tag: {
      height: 34,
      paddingHorizontal: 10,
      flexDirection: 'row',
      gap: 4,
      borderWidth: 1,
      borderColor: isDark ? colors.border : 'rgba(0,0,0,0.1)',
      borderRadius: 999,
      alignItems: 'center',
      alignSelf: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    tagPressFlash: {
      position: 'absolute',
      top: -1,
      right: -1,
      bottom: -1,
      left: -1,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.95)',
      borderRadius: 999,
    },
    tagEmoji: { fontSize: 14, lineHeight: 18 },
    tagText: { color: colors.textMuted, fontSize: 14, letterSpacing: -0.23 },
    footer: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      paddingTop: 16,
      paddingHorizontal: 36,
    },
    post: {
      height: 54,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E63946',
      shadowColor: '#E53845',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.55,
      shadowRadius: 13,
      elevation: 10,
    },
    postDisabled: { opacity: 0.45 },
    postText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
  });

const createSelectorStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    modalScreen: { flex: 1 },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
    sheet: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      overflow: 'hidden',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.canvas,
    },
    dragArea: { height: 36, alignItems: 'center', justifyContent: 'center' },
    dragHandle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.textMuted,
      opacity: 0.45,
    },
    sheetHeader: {
      height: 48,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    sheetTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    searchBox: {
      height: 42,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 22,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    search: {
      flex: 1,
      height: 42,
      paddingVertical: 0,
      color: colors.text,
      fontSize: 16,
    },
    placeList: { flex: 1 },
    filtersScroll: { flexGrow: 0, flexShrink: 0, height: 54 },
    filters: { gap: 7, paddingHorizontal: 16, paddingVertical: 10 },
    filter: {
      height: 34,
      paddingHorizontal: 10,
      flexDirection: 'row',
      gap: 3,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    filterIcon: {
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceRaised,
    },
    filterText: { color: colors.text, fontSize: 12, lineHeight: 16 },
    loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
    error: { color: colors.primary, textAlign: 'center' },
    row: {
      minHeight: 154,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowImageWrap: { width: 112, height: 112 },
    rowImage: { width: 112, height: 112, borderRadius: 14 },
    badge: {
      position: 'absolute',
      left: 7,
      bottom: 7,
      overflow: 'hidden',
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      color: '#FFFFFF',
      backgroundColor: '#D33B35',
      fontSize: 10,
      fontWeight: '700',
    },
    rowCopy: { flex: 1, gap: 7 },
    rowName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    rowAddress: { color: colors.textSecondary, fontSize: 13 },
    meta: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    ratingPill: {
      height: 28,
      flexDirection: 'row',
      gap: 3,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      paddingHorizontal: 11,
      paddingVertical: 6,
      backgroundColor: '#D33B35',
    },
    ratingPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    metaText: {
      flexShrink: 1,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    detailPills: {
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 7,
    },
    detailPill: {
      minHeight: 33,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    detailPillText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: -0.24,
    },
    empty: { color: colors.textMuted, padding: 36, textAlign: 'center' },
    more: { height: 54, alignItems: 'center', justifyContent: 'center' },
    moreText: { color: colors.primary, fontWeight: '600' },
  });

const createDishStyles = (colors: ThemeColors, isDark: boolean) =>
  responsiveStyleSheet({
    modalScreen: { flex: 1 },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
    sheet: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      height: 629,
      overflow: 'hidden',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: isDark ? '#45474B' : colors.border,
      backgroundColor: isDark ? '#161616' : colors.surface,
    },
    dragArea: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      zIndex: 10,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    header: {
      height: 64,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600',
      letterSpacing: -0.45,
    },
    closeButton: {
      position: 'relative',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeX: { position: 'absolute' },
    scroll: { flex: 1 },
    body: { paddingBottom: 12, gap: 12, alignItems: 'center' },
    photo: {
      width: 150,
      height: 150,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: '#45474B',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: isDark ? '#0E0E10' : colors.surfaceRaised,
    },
    photoSelected: { borderWidth: 0, backgroundColor: 'transparent' },
    photoImage: { width: 150, height: 150, resizeMode: 'cover' },
    photoEmpty: { alignItems: 'center', gap: 8 },
    photoAdd: { color: '#AAB2C5', fontSize: 13 },
    fieldSection: {
      width: '100%',
      padding: 16,
      paddingTop: 0,
      gap: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    fieldLabel: {
      color: colors.text,
      opacity: 0.5,
      fontSize: 13,
      lineHeight: 16,
    },
    input: {
      height: 50,
      borderRadius: 12,
      paddingHorizontal: 12,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      fontSize: 16,
    },
    actions: {
      minHeight: 79,
      paddingTop: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      gap: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: isDark ? '#080808' : colors.surface,
    },
    cancel: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderColor: '#45474B',
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#161616' : colors.surface,
    },
    cancelText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.6,
    },
    save: {
      flex: 1,
      height: 40,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#E63946',
    },
    saveDisabled: { backgroundColor: '#2F2F33', opacity: 0.5 },
    saveContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    saveIcon: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0.6,
    },
  });

const createConfirmationStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    sheet: {
      paddingTop: 32,
      paddingHorizontal: 16,
      paddingBottom: 28,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    dragArea: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    handle: {
      position: 'absolute',
      top: 10,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    title: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    body: {
      maxWidth: 310,
      marginTop: 9,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 18,
      textAlign: 'center',
    },
    primary: {
      width: '100%',
      height: 50,
      marginTop: 24,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#B82F29',
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '500' },
    secondary: {
      width: '100%',
      minHeight: 22,
      marginTop: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: colors.text, fontSize: 16, fontWeight: '500' },
    danger: {
      width: '100%',
      minHeight: 22,
      marginTop: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerText: { color: '#D94D45', fontSize: 16, fontWeight: '500' },
  });

const createSuccessStyles = (colors: ThemeColors, isDark: boolean) =>
  responsiveStyleSheet({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: isDark ? '#161616' : colors.canvas,
    },
    pattern: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: isDark ? 1 : 0.06,
      resizeMode: 'cover',
      tintColor: isDark ? undefined : '#161616',
    },
    glow: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 553,
      height: 552,
      marginLeft: -276.5,
      marginTop: -283,
    },
    center: { zIndex: 1, alignItems: 'center', gap: 29 },
    logo: { position: 'relative', width: 233, height: 95 },
    logoPink: { position: 'absolute', top: 22, left: 78 },
    logoOutline: {
      position: 'absolute',
      top: 9,
      left: 64,
      transform: [{ scaleY: -1 }],
    },
    copy: { color: colors.text, fontSize: 17, fontWeight: '600' },
    done: {
      position: 'absolute',
      right: 36,
      bottom: 28,
      left: 36,
      height: 54,
      zIndex: 2,
      borderWidth: 5,
      borderColor: isDark ? '#4C1816' : '#FFFFFF',
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#B82F29',
    },
    doneText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
  });
