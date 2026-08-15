import type { ReviewTag, Venue } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import restaurantImage from '../../../assets/discover/restaurant.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import PenIcon from '../../../assets/create-review/pen.svg';
import AddDishIcon from '../../../assets/create-review/add-dish.svg';
import DeleteDishIcon from '../../../assets/create-review/delete-dish.svg';
import RatingPin from '../../../assets/create-review/rating-pin.svg';
import RatingScale from '../../../assets/create-review/rating-scale.svg';
import SaveCheck from '../../../assets/create-review/save-check.svg';
import SelectPlaceCircle from '../../../assets/create-review/select-place-circle.svg';
import SelectPlacePlus from '../../../assets/create-review/select-place-plus.svg';
import successGlow from '../../../assets/create-review/success-glow.png';
import SuccessMouthOutline from '../../../assets/create-review/success-mouth-outline.svg';
import SuccessMouthPink from '../../../assets/create-review/success-mouth-pink.svg';
import successPattern from '../../../assets/create-review/success-pattern.png';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { PatternBackgroundLift } from '../../ui/components';
import { useDiscoverVenues, usePlace, useVenueSearch } from '../discover/api';
import { useTastesApi } from '../../session/SessionProvider';
import { type DishReviewDraft, useCreateReview } from './api';

const ratingCircle = { centerX: 169, centerY: -36.8226, radius: 167.8226 };
const ratingCircleY = (x: number) => ratingCircle.centerY
  + Math.sqrt((ratingCircle.radius ** 2) - ((x - ratingCircle.centerX) ** 2));
const reviewRatingMarkers = [
  { kind: 'dot', value: 1, x: 7, y: ratingCircleY(7) },
  { kind: 'tick', rotation: -30, value: 1.5, x: 25, y: ratingCircleY(25) },
  { kind: 'dot', value: 2, x: 58, y: ratingCircleY(58) },
  { kind: 'tick', rotation: -70, value: 2.5, x: 111, y: ratingCircleY(111) },
  { kind: 'dot', value: 3, x: 169, y: ratingCircleY(169) },
  { kind: 'tick', rotation: 70, value: 3.5, x: 227, y: ratingCircleY(227) },
  { kind: 'dot', value: 4, x: 278, y: ratingCircleY(278) },
  { kind: 'tick', rotation: 30, value: 4.5, x: 313, y: ratingCircleY(313) },
  { kind: 'dot', value: 5, x: 331, y: ratingCircleY(331) },
] as const;
const dishRatingMarkers = [
  { value: 1, x: 7.59038 },
  { value: 1.5, x: 51 },
  { value: 2, x: 93.771 },
  { value: 2.5, x: 137 },
  { value: 3, x: 179.952 },
  { value: 3.5, x: 224 },
  { value: 4, x: 266.132 },
  { value: 4.5, x: 310 },
  { value: 5, x: 352.313 },
] as const;
const tagOptions: Array<{ label: string; value: ReviewTag }> = [
  { label: 'Casual', value: 'casual' },
  { label: '☾ Date night', value: 'date-night' },
  { label: '♨ Birthday', value: 'birthday' },
  { label: '☺ Children', value: 'children' },
];
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [venueId, setVenueId] = useState(initialVenueId ?? '');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [feedbackHeight, setFeedbackHeight] = useState(50);
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [dishes, setDishes] = useState<DishReviewDraft[]>([]);
  const [placeSelectorOpen, setPlaceSelectorOpen] = useState(false);
  const [dishEditor, setDishEditor] = useState<DishReviewDraft | null>(null);
  const [success, setSuccess] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('review'));
  const place = usePlace(venueId);
  const createReview = useCreateReview(userId);
  const venue = selectedVenue ?? place.data?.venue ?? null;
  const valid = Boolean(venueId && text.trim() && rating >= 1 && dishes.every((dish) => dish.photoUri && dish.title.trim() && dish.rating >= 1));

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
  }

  function finish() {
    reset();
    onPublished();
  }

  function submit() {
    if (!valid || createReview.isPending) return;
    createReview.mutate({
      dishReviews: dishes,
      idempotencyKey,
      rating,
      tags,
      text,
      venueId,
    }, {
      onError: (error) => Alert.alert('Could not post review', apiErrorMessage(error)),
      onSuccess: () => setSuccess(true),
    });
  }

  if (success) return <ReviewAdded onDone={finish} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ImageBackground imageStyle={styles.patternImage} source={pattern} style={styles.screen}>
        <PatternBackgroundLift />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={['#080808', '#080808', '#190404']}
            locations={[0, 0.65982, 1]}
            style={[styles.hero, { paddingTop: insets.top + 8 }]}
          >
            <View style={styles.navigation}>
              <Pressable accessibilityLabel="Close review" hitSlop={14} onPress={onClose}><Text style={styles.back}>‹</Text></Pressable>
              <Text style={styles.title}>Write a Review</Text>
              <View style={styles.navigationSpacer} />
            </View>
            {venue ? (
              <>
                <Pressable onPress={() => setPlaceSelectorOpen(true)} style={styles.venueCard}>
                  <Image source={venueImage(venue.imageUrl)} style={styles.venueImage} />
                  <View style={styles.venueCopy}>
                    <Text numberOfLines={2} style={styles.venueName}>{venue.name}</Text>
                    <Text numberOfLines={2} style={styles.venueAddress}>{venue.address ?? venue.city}</Text>
                  </View>
                  <View style={styles.edit}>
                    <PenIcon height={20} width={20} />
                  </View>
                </Pressable>
                <RatingCurve onChange={setRating} value={rating} />
              </>
            ) : (
              <Pressable onPress={() => setPlaceSelectorOpen(true)} style={styles.selectPlace}>
                {place.isPending && venueId ? <ActivityIndicator color="#fff" /> : (
                  <View style={styles.selectPlaceContent}>
                    <View style={styles.selectPlaceIcon}>
                      <SelectPlaceCircle height={21.5} style={styles.selectPlaceCircle} width={21.5} />
                      <SelectPlacePlus height={7.5} style={styles.selectPlacePlus} width={7.5} />
                    </View>
                    <Text style={styles.selectPlaceText}>Select Place</Text>
                  </View>
                )}
              </Pressable>
            )}
            <View pointerEvents="none" style={styles.heroBorder} />
          </LinearGradient>

          <SectionLabel label="Your feedback" />
          <TextInput
            maxLength={2_000}
            multiline
            onChangeText={setText}
            onContentSizeChange={({ nativeEvent }) => setFeedbackHeight(Math.min(140, Math.max(50, nativeEvent.contentSize.height)))}
            placeholder="Enter text"
            placeholderTextColor={colors.placeholder}
            scrollEnabled={feedbackHeight >= 140}
            style={[styles.feedback, { height: feedbackHeight }]}
            textAlignVertical="top"
            value={text}
          />

          <SectionLabel label="Dish reviews" />
          {dishes.length > 0 ? (
            <ScrollView contentContainerStyle={styles.dishList} horizontal showsHorizontalScrollIndicator={false}>
              {dishes.map((dish) => (
                <Pressable key={dish.id} onPress={() => setDishEditor(dish)} style={styles.dishCard}>
                  <Image source={{ uri: dish.photoUri }} style={styles.dishImage} />
                  <Pressable
                    accessibilityLabel={`Remove ${dish.title}`}
                    onPress={() => setDishes((items) => items.filter((item) => item.id !== dish.id))}
                    style={styles.deleteDish}
                  ><DeleteDishIcon height={17} width={16} /></Pressable>
                  <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
                  <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {dishes.length < 5 ? (
            <Pressable
              onPress={() => setDishEditor({ id: createIdempotencyKey('dish'), photoUri: '', rating: 1, title: '' })}
              style={styles.addDish}
            >
              <AddDishIcon height={18.0656} width={20} />
              <Text style={styles.addDishText}>Add Dish</Text>
            </Pressable>
          ) : null}

          <SectionLabel label="Tag" />
          <ScrollView contentContainerStyle={styles.tags} horizontal showsHorizontalScrollIndicator={false}>
            {tagOptions.map((tag) => {
              const selected = tags.includes(tag.value);
              return (
                <Pressable
                  key={tag.value}
                  onPress={() => setTags((items) => selected ? items.filter((item) => item !== tag.value) : [...items, tag.value])}
                  style={[styles.tag, selected && styles.tagSelected]}
                ><Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag.label}</Text></Pressable>
              );
            })}
          </ScrollView>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <Pressable disabled={!valid || createReview.isPending} onPress={submit} style={[styles.post, (!valid || createReview.isPending) && styles.postDisabled]}>
            {createReview.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.postText}>Post Review</Text>}
          </Pressable>
        </View>

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
        <DishEditor
          onClose={() => setDishEditor(null)}
          onSave={(dish) => {
            setDishes((items) => items.some((item) => item.id === dish.id)
              ? items.map((item) => item.id === dish.id ? dish : item)
              : [...items, dish]);
            setDishEditor(null);
          }}
          value={dishEditor}
          visible={dishEditor !== null}
        />
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return <Text style={[sectionStyles.label, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>;
}

function RatingCurve({
  linear = false,
  onChange,
  value,
}: {
  linear?: boolean;
  onChange: (value: number) => void;
  value: number;
}) {
  const accent = '#B82F29';
  const selectedMarker = reviewRatingMarkers.find((marker) => marker.value === value);
  return (
    <View style={ratingStyles.wrap}>
      <Text style={ratingStyles.value}>{value >= 1 ? value.toFixed(value % 1 ? 1 : 0) : '–'}</Text>
      <View style={ratingStyles.stars}>
        {Array.from({ length: 5 }, (_, index) => {
          const star = index + 1;
          const fill = Math.max(0, Math.min(1, value - index));
          return (
            <Pressable
              accessibilityLabel={`${star} stars`}
              accessibilityRole="button"
              hitSlop={4}
              key={star}
              onPress={() => onChange(star)}
              style={ratingStyles.starButton}
            >
              <View style={ratingStyles.starGlyph}>
                <Text style={ratingStyles.starOutline}>☆</Text>
                {fill > 0 ? (
                  <View style={[ratingStyles.starFillClip, { width: 26 * fill }]}>
                    <Text style={ratingStyles.starFill}>★</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {linear ? (
        <View style={ratingStyles.scale}>
          <RatingScale height={15.1808} width={359.903} />
          {dishRatingMarkers.map((marker) => (
            <Pressable
              accessibilityLabel={`${marker.value} stars`}
              accessibilityRole="button"
              key={marker.value}
              onPress={() => onChange(marker.value)}
              style={[ratingStyles.linearPointHit, { left: marker.x - 22 }]}
            >
              {marker.value === value ? <RatingPin color="#B82F29" height={38} width={38} /> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={ratingStyles.curve}>
          <Svg height={139} pointerEvents="none" width={338} style={StyleSheet.absoluteFill}>
            <Defs>
              <ClipPath id="review-rating-progress">
                <Rect height={139} width={selectedMarker?.x ?? 0} x={0} y={0} />
              </ClipPath>
            </Defs>
            <Path d="M7 7 A167.8226 167.8226 0 0 0 169 131" fill="none" stroke="#3D1A1C" strokeLinecap="round" strokeWidth={4} />
            <Path d="M169 131 A167.8226 167.8226 0 0 0 331 7" fill="none" stroke="#3D1A1C" strokeLinecap="round" strokeWidth={4} />
            {selectedMarker ? (
              <Path
                clipPath="url(#review-rating-progress)"
                d="M7 7 A167.8226 167.8226 0 0 0 169 131 A167.8226 167.8226 0 0 0 331 7"
                fill="none"
                stroke={accent}
                strokeLinecap="round"
                strokeWidth={4}
              />
            ) : null}
          </Svg>
          {reviewRatingMarkers.map((marker) => {
            const selected = marker.value === value;
            const active = marker.value <= value;
            return (
              <Pressable
                accessibilityLabel={`${marker.value} stars`}
                accessibilityRole="button"
                key={marker.value}
                onPress={() => onChange(marker.value)}
                style={[ratingStyles.pointHit, { left: marker.x - 22, top: marker.y - 22 }]}
              >
                {selected ? (
                  <RatingPin color={accent} height={38} width={38} />
                ) : marker.kind === 'dot' ? (
                  <View style={[ratingStyles.point, active && ratingStyles.pointActive]} />
                ) : (
                  <View
                    style={[
                      ratingStyles.tick,
                      active && ratingStyles.tickActive,
                      { transform: [{ rotate: `${marker.rotation}deg` }] },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PlaceSelector({
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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Cafe' | 'Club' | 'Restaurant' | null>('Restaurant');
  const [priceFilter, setPriceFilter] = useState(false);
  const [trendingFilter, setTrendingFilter] = useState(false);
  const [submittingVenueId, setSubmittingVenueId] = useState<string | null>(null);
  const api = useTastesApi();
  const query = useDiscoverVenues(userId);
  const searchQuery = useVenueSearch(search);
  const venues = query.data?.pages.flatMap((page) => page.items) ?? [];
  const localFiltered = venues.filter((venue) => {
    const needle = search.trim().toLowerCase();
    return !needle || `${venue.name} ${venue.city} ${venue.category ?? ''}`.toLowerCase().includes(needle);
  });
  const searchResults = search.trim().length >= 2
    ? searchQuery.data?.items ?? localFiltered
    : localFiltered;
  const filtered = searchResults
    .filter((venue) => {
      if (!categoryFilter) return true;
      const category = venue.category?.toLowerCase() ?? '';
      if (categoryFilter === 'Restaurant') {
        return !['cafe', 'club', 'bar'].some((nonRestaurant) => category.includes(nonRestaurant));
      }
      return category.includes(categoryFilter.toLowerCase());
    })
    .filter((venue) => !priceFilter || venue.priceLevel === 2)
    .filter((venue) => !trendingFilter || venue.discoverTags?.includes('trending'));
  const selectVenue = async (venue: Venue) => {
    if (!venue.id.startsWith('google:')) {
      onSelect(venue);
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
      Alert.alert('Place submitted', 'We found it on Google Places and sent it for moderation. It will be available for reviews after approval.');
    } catch (error) {
      Alert.alert('Could not submit place', apiErrorMessage(error));
    } finally {
      setSubmittingVenueId(null);
    }
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={[styles.sheet, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Select Place</Text><Pressable onPress={onClose}><Text style={styles.close}>⊗</Text></Pressable></View>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput autoCapitalize="none" onChangeText={setSearch} placeholder="Restaurant" placeholderTextColor={colors.placeholder} style={styles.search} value={search} />
          {search ? <Pressable onPress={() => setSearch('')}><Text style={styles.clear}>×</Text></Pressable> : null}
        </View>
        <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
          {(['Restaurant', 'Cafe', 'Club'] as const).map((filter) => {
            const active = categoryFilter === filter;
            return <Pressable key={filter} onPress={() => setCategoryFilter(active ? null : filter)} style={[styles.filter, active && styles.filterActive]}><Text style={styles.filterText}>{filter === 'Restaurant' ? '⚒' : filter === 'Cafe' ? '☕' : '▽'} {filter}</Text></Pressable>;
          })}
          <Pressable onPress={() => setPriceFilter((active) => !active)} style={[styles.filter, priceFilter && styles.filterActive]}><Text style={styles.filterText}>$$⌄</Text></Pressable>
          <Pressable onPress={() => setTrendingFilter((active) => !active)} style={[styles.filter, trendingFilter && styles.filterActive]}><Text style={styles.filterText}>♨ Trending</Text></Pressable>
        </ScrollView>
        {query.isPending || (search.trim().length >= 2 && searchQuery.isPending) ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : query.isError || searchQuery.isError ? (
          <Pressable onPress={() => void query.refetch()} style={styles.loading}><Text style={styles.error}>Could not load places. Tap to retry.</Text></Pressable>
        ) : (
          <FlatList
            data={filtered}
            initialNumToRender={8}
            keyExtractor={(venue) => venue.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No places match your search.</Text>}
            ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.more} /> : null}
            maxToRenderPerBatch={8}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            windowSize={7}
            renderItem={({ item: venue }) => (
              <Pressable disabled={submittingVenueId === venue.id} onPress={() => void selectVenue(venue)} style={styles.row}>
                <Image source={venueImage(venue.imageUrl)} style={styles.rowImage} />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowName}>{venue.name}</Text>
                  <Text numberOfLines={1} style={styles.rowAddress}>{venue.address ?? venue.city}</Text>
                  <View style={styles.meta}><Text style={styles.ratingPill}>★ {(venue.rating ?? 0).toFixed(1)}</Text><Text style={styles.metaText}>{venue.reviewCount ?? 0} reviews</Text></View>
                </View>
                {submittingVenueId === venue.id ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.add}>{venue.id.startsWith('google:') ? 'Submit' : '⊕'}</Text>}
              </Pressable>
            )}
          />
        )}
      </View>
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createDishStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DishReviewDraft | null>(value);

  useEffect(() => setDraft(value), [value]);

  async function choosePhoto(camera: boolean) {
    if (!draft) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo library'} access to add a dish photo.`);
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setDraft({ ...draft, photoUri: result.assets[0].uri });
  }

  function pickSource() {
    Alert.alert('Add dish photo', undefined, [
      { text: 'Camera', onPress: () => void choosePhoto(true) },
      { text: 'Photo library', onPress: () => void choosePhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (!draft) return null;
  const valid = Boolean(draft.photoUri && draft.title.trim() && draft.rating >= 1);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.scrim} />
      <View style={[styles.sheet, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <View style={styles.header}><Text style={styles.title}>Add Dish</Text><Pressable onPress={onClose}><Text style={styles.close}>⊗</Text></Pressable></View>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <Pressable onPress={pickSource} style={styles.photo}>
            {draft.photoUri ? <Image source={{ uri: draft.photoUri }} style={styles.photoImage} /> : <Text style={styles.photoAdd}>⊕</Text>}
          </Pressable>
          <RatingCurve linear onChange={(rating) => setDraft({ ...draft, rating })} value={draft.rating} />
          <SectionLabel label="Title" />
          <TextInput maxLength={120} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Enter text" placeholderTextColor={colors.placeholder} style={styles.input} value={draft.title} />
        </ScrollView>
        <View style={styles.actions}>
          <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable disabled={!valid} onPress={() => onSave(draft)} style={[styles.save, !valid && styles.disabled]}>
            <View style={styles.saveContent}>
              <View style={styles.saveIcon}><SaveCheck height={14.2724} width={19.9891} /></View>
              <Text style={styles.saveText}>Save</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReviewAdded({ onDone }: { onDone: () => void }) {
  return (
    <View style={successStyles.screen}>
      <Image source={successPattern} style={successStyles.pattern} />
      <Image source={successGlow} style={successStyles.glow} />
      <View style={successStyles.center}>
        <View style={successStyles.logo}>
          <SuccessMouthPink height={61} style={successStyles.logoPink} width={77} />
          <SuccessMouthOutline height={76} style={successStyles.logoOutline} width={105} />
        </View>
        <Text style={successStyles.copy}>Your review has been added</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onDone} style={successStyles.done}>
        <Text style={successStyles.doneText}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

const sectionStyles = StyleSheet.create({ label: { marginTop: 16, marginHorizontal: 16, marginBottom: 6, fontSize: 13 } });
const ratingStyles = StyleSheet.create({
  wrap: { height: 198, position: 'relative', alignItems: 'center' },
  value: { position: 'absolute', top: 18, zIndex: 3, color: '#D33B35', fontSize: 34, lineHeight: 40, fontWeight: '500' },
  stars: { position: 'absolute', top: 61, zIndex: 4, flexDirection: 'row', gap: 1 },
  starButton: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
  starGlyph: { width: 26, height: 30 },
  starOutline: { position: 'absolute', color: '#D33B35', fontSize: 29, lineHeight: 30 },
  starFillClip: { position: 'absolute', height: 30, overflow: 'hidden' },
  starFill: { width: 26, color: '#D33B35', fontSize: 27, lineHeight: 30 },
  curve: { position: 'absolute', top: 36, width: 338, height: 139 },
  scale: { position: 'absolute', top: 116, width: 360, height: 44, justifyContent: 'center' },
  pointHit: { position: 'absolute', zIndex: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  linearPointHit: { position: 'absolute', top: 0, zIndex: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  point: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: '#3D1A1C', backgroundColor: '#120606' },
  pointActive: { borderColor: '#B82F29', backgroundColor: '#fff' },
  tick: { width: 12, height: 2, borderRadius: 1, backgroundColor: '#3D1A1C' },
  tickActive: { backgroundColor: '#B82F29' },
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  patternImage: { opacity: colors.background === '#080808' ? 0.16 : 0.05, resizeMode: 'repeat' },
  content: { flexGrow: 1 },
  hero: { minHeight: 438, paddingHorizontal: 16, borderBottomLeftRadius: 210, borderBottomRightRadius: 210, overflow: 'hidden' },
  heroBorder: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderBottomLeftRadius: 210, borderBottomRightRadius: 210 },
  navigation: { height: 54, flexDirection: 'row', alignItems: 'center' },
  back: { color: '#fff', fontSize: 36, lineHeight: 38 },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  navigationSpacer: { width: 22 },
  selectPlace: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center' },
  selectPlaceContent: { height: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  selectPlaceIcon: { width: 24, height: 24 },
  selectPlaceCircle: { position: 'absolute', top: 1.25, left: 1.25 },
  selectPlacePlus: { position: 'absolute', top: 8.25, left: 8.25 },
  selectPlaceText: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 0.6 },
  venueCard: { minHeight: 142, flexDirection: 'row', alignItems: 'center' },
  venueImage: { width: 122, height: 122, borderRadius: 14 },
  venueCopy: { flex: 1, gap: 7, paddingLeft: 16 },
  venueName: { color: '#fff', fontSize: 17, lineHeight: 22, fontWeight: '600' },
  venueAddress: { color: '#AAB2C5', fontSize: 15, lineHeight: 18 },
  edit: { width: 44, height: 44, marginRight: -12, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
  feedback: { minHeight: 50, marginHorizontal: 16, borderRadius: 12, padding: 12, color: colors.text, backgroundColor: colors.background, fontSize: 15, lineHeight: 20 },
  dishList: { gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  dishCard: { width: 174, padding: 12, borderRadius: 16, backgroundColor: colors.background },
  dishImage: { width: 150, height: 150, borderRadius: 14 },
  deleteDish: { position: 'absolute', right: 17, top: 17, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,22,22,0.2)' },
  dishRating: { position: 'absolute', top: 136, left: 12, color: '#fff', fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.48)', paddingHorizontal: 9, paddingVertical: 4, borderBottomLeftRadius: 14, borderTopRightRadius: 10 },
  dishTitle: { marginTop: 12, color: colors.text, fontSize: 14, fontWeight: '600' },
  addDish: { height: 44, marginHorizontal: 16, flexDirection: 'row', gap: 8, borderRadius: 36, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(173,51,36,0.1)' },
  addDishText: { color: colors.text, fontSize: 13, fontWeight: '500', letterSpacing: 0.6 },
  tags: { gap: 8, paddingHorizontal: 16, paddingBottom: 18 },
  tag: { height: 34, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tagSelected: { borderColor: colors.primary, backgroundColor: '#D33B35' },
  tagText: { color: colors.textMuted, fontSize: 13 },
  tagTextSelected: { color: '#fff' },
  footer: { position: 'absolute', right: 0, bottom: 0, left: 0, paddingTop: 14, paddingHorizontal: 31, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.canvas },
  post: { height: 58, borderWidth: 5, borderColor: '#4C1816', borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D33B35' },
  postDisabled: { opacity: 0.45 },
  postText: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.4 },
});

const createSelectorStyles = (colors: ThemeColors) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { position: 'absolute', right: 0, bottom: 0, left: 0, maxHeight: '91%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  sheetHeader: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sheetTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }, close: { color: colors.text, fontSize: 27 },
  searchBox: { height: 42, marginHorizontal: 16, marginTop: 16, borderRadius: 22, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised },
  searchIcon: { color: colors.text, marginRight: 8, fontSize: 22 },
  search: { flex: 1, height: 42, paddingVertical: 0, color: colors.text, fontSize: 16 },
  clear: { color: colors.textSecondary, fontSize: 22 },
  filters: { gap: 7, paddingHorizontal: 16, paddingVertical: 10 },
  filter: { height: 29, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  filterActive: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  filterText: { color: colors.text, fontSize: 12 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' }, error: { color: colors.primary, textAlign: 'center' },
  row: { minHeight: 176, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowImage: { width: 122, height: 122, borderRadius: 14 }, rowCopy: { flex: 1, gap: 7 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: '600' }, rowAddress: { color: colors.textSecondary, fontSize: 13 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 }, ratingPill: { color: '#fff', borderRadius: 15, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: '#D33B35', fontWeight: '700' }, metaText: { color: colors.textMuted, fontSize: 12 },
  add: { color: colors.text, fontSize: 21 }, empty: { color: colors.textMuted, padding: 36, textAlign: 'center' },
  more: { height: 54, alignItems: 'center', justifyContent: 'center' }, moreText: { color: colors.primary, fontWeight: '600' },
});

const createDishStyles = (colors: ThemeColors) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { position: 'absolute', right: 0, bottom: 0, left: 0, height: '92%', overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  header: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' }, close: { color: colors.text, fontSize: 27 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  photo: { width: '100%', aspectRatio: 1, maxHeight: 370, borderWidth: 1, borderColor: colors.border, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.background },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' }, photoAdd: { color: colors.textMuted, fontSize: 32 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.background, fontSize: 16 },
  actions: { paddingTop: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.canvas }, cancel: { flex: 1, height: 52, borderWidth: 1, borderColor: colors.primary, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: colors.text, fontSize: 15 },
  save: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D33B35' }, saveContent: { flexDirection: 'row', alignItems: 'center', gap: 8 }, saveIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#fff', fontSize: 15, fontWeight: '600' }, disabled: { opacity: 0.45 },
});

const successStyles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#161616' },
  pattern: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  glow: { position: 'absolute', left: '50%', top: '50%', width: 553, height: 552, marginLeft: -276.5, marginTop: -283 },
  center: { zIndex: 1, alignItems: 'center', gap: 29 },
  logo: { position: 'relative', width: 233, height: 95 },
  logoPink: { position: 'absolute', top: 22, left: 78 },
  logoOutline: { position: 'absolute', top: 9, left: 64, transform: [{ scaleY: -1 }] },
  copy: { color: '#fff', fontSize: 17, fontWeight: '600' },
  done: { position: 'absolute', right: 36, bottom: 28, left: 36, height: 54, zIndex: 2, borderWidth: 5, borderColor: '#4C1816', borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '600', letterSpacing: 0.4 },
});
