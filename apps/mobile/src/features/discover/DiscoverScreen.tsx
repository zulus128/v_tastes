import type { DiscoverFeed, DiscoverPerson, Venue } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  Easing,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  type ImageSourcePropType,
} from 'react-native';
import MapView, { Marker, type MapStyleElement, type Region } from 'react-native-maps';
import restaurantImage from '../../../assets/discover/restaurant.png';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import MapFavouriteIcon from '../../../assets/discover/map-favourite.svg';
import SearchIcon from '../../../assets/favourites/search.svg';
import VoiceIcon from '../../../assets/profile/followers-voice.svg';
import MapLayersControlIcon from '../../../assets/discover/map-layers-control.svg';
import MapLocateIcon from '../../../assets/discover/map-locate.svg';
import MapRatingPin from '../../../assets/discover/map-rating-pin.svg';
import MapTuneIcon from '../../../assets/discover/map-tune.svg';
import SortIcon from '../../../assets/place/sort.svg';
import CheckIcon from '../../../assets/activities/check.svg';
import PeopleSearchIcon from '../../../assets/discover/search.svg';
import UserHeartIcon from '../../../assets/messaging/user-heart.svg';
import UserHeartLightIcon from '../../../assets/messaging/user-heart-light.svg';
import searchCloseIcon from '../../../assets/onboarding/search-close.png';
import mapBarIcon from '../../../assets/profile/map-bar.png';
import mapCafeIcon from '../../../assets/profile/map-cafe.png';
import mapTrendingIcon from '../../../assets/profile/map-trending.png';
import AiMouthOutline from '../../../assets/create-review/success-mouth-outline.svg';
import AiMouthPink from '../../../assets/create-review/success-mouth-pink.svg';
import filterBarIcon from '../../../assets/onboarding/filter-bar.png';
import filterCafeIcon from '../../../assets/onboarding/filter-cafe.png';
import filterRestaurantIcon from '../../../assets/onboarding/filter-restaurant.png';
import filterReviewsIcon from '../../../assets/onboarding/filter-reviews.png';
import filterTrendingIcon from '../../../assets/onboarding/filter-trending.png';
import {
  type DiscoverVenueFilter,
  useDiscoverFeed,
  useDiscoverPeople,
  usePeopleSearch,
  useDiscoverVenues,
  useVenueSearch,
  useToggleFollow,
} from './api';
import {
  FavouritesPane,
  SaveToFolderSheet,
  type SaveablePlace,
} from '../favourites/FavouritesPane';
import { useFavourites } from '../favourites/api';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useTastesApi } from '../../session/SessionProvider';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { matchesPlaceFilters } from './placeFilters';
import { UserAvatar } from '../profile/avatar';

type DiscoverTab = 'trending' | 'places' | 'people';
type MapFilter = DiscoverVenueFilter & { key: string; label: string };
type PlaceSort = 'best-match' | 'rating' | 'distance' | 'reviews' | 'newest';

const placeSortOptions: Array<{ label: string; value: PlaceSort }> = [
  { label: 'Best match', value: 'best-match' },
  { label: 'Top rated', value: 'rating' },
  { label: 'Nearest first', value: 'distance' },
  { label: 'Most reviewed', value: 'reviews' },
  { label: 'Newest', value: 'newest' },
];

const DISCOVER_HEADER_HEIGHT = 106;
const KEYBOARD_SEARCH_GAP = 8;

const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1B1B1B' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#777777' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#141414' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3A3A3A' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#202020' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#292929' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#121212' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#343434' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0D0D0D' }] },
];

const LIGHT_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#E8E7E5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6F7480' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#E8E7E5' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#C9C9C7' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#E8E7E5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#DEDDDA' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D5DED7' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#F5F4F1' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D5D4D1' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E1E0DD' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#D9D8D5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C9D5DC' }] },
];

type Place = {
  venueId: string;
  name: string;
  address: string;
  category: string;
  price: string;
  distance: string;
  rating: string;
  reviews: string;
  image: ImageSourcePropType;
};

function venueImage(imageUrl?: string | null): ImageSourcePropType {
  return imageUrl ? { uri: imageUrl } : restaurantImage;
}

function formatDistance(km?: number): string {
  return `${(km ?? 0).toFixed(1).replace('.', ',')} km`;
}

function formatCount(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return String(value);
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function joinedLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000));
  if (days <= 0) return 'joined Today';
  if (days === 1) return 'joined 1d ago';
  return `joined ${days}d ago`;
}

function forYouReason(venue: Venue, index: number): string {
  if (!venue.category) return 'Popular near you';
  return index % 2 === 0 ? `Because you ❤️ ${venue.category}` : `Popular ${venue.category} pick`;
}

function venueToPlace(venue: Venue): Place {
  return {
    venueId: venue.id,
    name: venue.name,
    address: venue.address ?? venue.city,
    category: venue.category ?? '',
    price: '$'.repeat(venue.priceLevel ?? 1),
    distance: formatDistance(venue.distanceKm),
    rating: (venue.rating ?? 0).toFixed(1),
    reviews: `${venue.reviewCount ?? 0} reviews`,
    image: venueImage(venue.imageUrl),
  };
}

export function DiscoverScreen({
  appliedFilters,
  onOpenAI,
  onOpenFilters,
  onOpenComments,
  onOpenPlace,
  onOpenProfile,
  userId,
}: {
  appliedFilters: string[];
  onOpenAI: () => void;
  onOpenFilters: () => void;
  onOpenComments: (reviewId: string) => void;
  onOpenPlace: (venueId: string) => void;
  onOpenProfile: (person: DiscoverPerson) => void;
  userId: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<DiscoverTab>('trending');
  const [favouritesOpen, setFavouritesOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveablePlace | null>(null);
  const favourites = useFavourites(userId);
  const savedVenueIds = new Set(favourites.data?.places.map((place) => place.venueId) ?? []);
  const feedQuery = useDiscoverFeed(userId);
  const toggleFollow = useToggleFollow(userId);
  const [followPendingId, setFollowPendingId] = useState<string | null>(null);
  const [seeAllPlaces, setSeeAllPlaces] = useState<Venue[] | null>(null);
  const mapMode = tab === 'places' && !favouritesOpen;

  function selectTab(value: DiscoverTab) {
    setTab(value);
    setFavouritesOpen(false);
  }

  function handleToggleFollow(person: DiscoverPerson) {
    if (person.userId === userId || toggleFollow.isPending) return;
    setFollowPendingId(person.userId);
    toggleFollow.mutate(
      { targetUserId: person.userId, following: person.following },
      {
        onError: (error) => Alert.alert('Could not update follow', apiErrorMessage(error)),
        onSettled: () => setFollowPendingId(null),
      },
    );
  }

  return (
    <View style={[styles.screen, mapMode && styles.mapDiscoverScreen]}>
      <View style={[styles.header, mapMode && styles.mapHeader]}>
        <View style={styles.switcher}>
          {(['trending', 'places', 'people'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              onPress={() => selectTab(value)}
              style={[styles.switchOption, tab === value && styles.switchOptionActive]}
            >
              <Text style={[styles.switchText, tab === value && styles.switchTextActive]}>
                {value[0].toUpperCase() + value.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'trending' ? (
        feedQuery.isPending ? (
          <TrendingLoading />
        ) : feedQuery.isError ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>{/network|offline|unavailable/i.test(feedQuery.error.message) ? 'You’re offline' : 'Could not load Discover'}</Text>
            <Text style={styles.stateCopy}>{/network|offline|unavailable/i.test(feedQuery.error.message) ? 'Reconnect to refresh trending places. Your saved places are still available.' : feedQuery.error.message}</Text>
            <Pressable onPress={() => void feedQuery.refetch()} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <TrendingFeed
            feed={feedQuery.data}
            followPending={toggleFollow.isPending}
            followPendingId={followPendingId}
            onSave={setSaveTarget}
            onOpenPlace={onOpenPlace}
            onOpenComments={onOpenComments}
            onOpenProfile={onOpenProfile}
            onToggleFollow={handleToggleFollow}
            onSeeAll={setSeeAllPlaces}
            savedVenueIds={savedVenueIds}
          />
        )
      ) : null}
      {tab === 'places' && favouritesOpen ? <FavouritesPane appliedFilters={appliedFilters} onOpenFilters={onOpenFilters} onOpenPlace={onOpenPlace} userId={userId} /> : null}
      {tab === 'places' && !favouritesOpen ? (
        <PlacesMap
          appliedFilters={appliedFilters}
          onOpenFavourites={() => setFavouritesOpen(true)}
          onOpenFilters={onOpenFilters}
          onOpenPlace={onOpenPlace}
          onSave={setSaveTarget}
          savedVenueIds={savedVenueIds}
          userId={userId}
        />
      ) : null}
      {tab === 'people' ? <PeopleFeed onOpenProfile={onOpenProfile} userId={userId} /> : null}
      <SaveToFolderSheet
        onClose={() => setSaveTarget(null)}
        place={saveTarget}
        userId={userId}
        visible={saveTarget !== null}
      />
      <Pressable accessibilityLabel="Open Tastes AI" onPress={onOpenAI} style={styles.aiFab}>
        <View style={styles.aiFabMark}>
          <AiMouthPink height={10} style={styles.aiFabMarkPink} width={13} />
          <AiMouthOutline color={colors.text} height={13} style={styles.aiFabMarkOutline} width={18} />
        </View>
      </Pressable>
      <SeeAllPlacesModal onClose={() => setSeeAllPlaces(null)} onOpenPlace={onOpenPlace} onSave={setSaveTarget} savedVenueIds={savedVenueIds} venues={seeAllPlaces} />
    </View>
  );
}

function TrendingLoading() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.82, duration: 780, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 780, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View
      accessibilityLabel="Loading trending places"
      accessibilityState={{ busy: true }}
      style={styles.trendingLoading}
    >
      <Animated.View style={[styles.loadingHero, { opacity: pulse }]} />
      <Animated.View style={[styles.loadingTitle, { opacity: pulse }]} />
      <Animated.View style={[styles.loadingCard, { opacity: pulse }]} />
      <Animated.View style={[styles.loadingCard, { opacity: pulse }]} />
      <Animated.View style={[styles.loadingCard, { opacity: pulse }]} />
    </View>
  );
}

function TrendingFeed({
  feed,
  followPending,
  followPendingId,
  onSave,
  onOpenPlace,
  onOpenComments,
  onOpenProfile,
  onToggleFollow,
  onSeeAll,
  savedVenueIds,
}: {
  feed: DiscoverFeed;
  followPending: boolean;
  followPendingId: string | null;
  onSave: (place: SaveablePlace) => void;
  onOpenPlace: (venueId: string) => void;
  onOpenComments: (reviewId: string) => void;
  onOpenProfile: (person: DiscoverPerson) => void;
  onToggleFollow: (person: DiscoverPerson) => void;
  onSeeAll: (venues: Venue[]) => void;
  savedVenueIds: Set<string>;
}) {
  const { colors } = useAppTheme();
  const api = useTastesApi();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reactedReviews, setReactedReviews] = useState<Set<string>>(new Set());
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const { hero, topReviewer } = feed;
  const hasContent = Boolean(
    hero
    || topReviewer
    || feed.trending.length
    || feed.newSpots.length
    || feed.mostReviewed.length
    || feed.forYou.length
    || feed.hiddenGems.length
    || feed.popularReviews.length,
  );

  if (!hasContent) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateTitle}>Nothing to discover yet</Text>
        <Text style={styles.stateCopy}>New places and reviews will appear here soon.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.feedContent}
      showsVerticalScrollIndicator={false}
    >
      {hero ? (
        <Pressable onPress={() => onOpenPlace(hero.id)} style={styles.hero}>
          <Image source={venueImage(hero.imageUrl)} style={styles.coverImage} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.88)']}
            locations={[0.34, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.hotChip}><Text style={styles.hotChipText}>🔥 Hot in your area</Text></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{hero.name}</Text>
            <Text style={styles.heroMeta}>{hero.category} · {formatDistance(hero.distanceKm)}</Text>
            <View style={styles.inlineMeta}>
              <RatingPill value={(hero.rating ?? 0).toFixed(1)} />
              <Text style={styles.imageMetaText}>{hero.reviewCount ?? 0} reviews</Text>
            </View>
          </View>
        </Pressable>
      ) : null}

      {feed.trending.length > 0 ? (
        <>
          <SectionLabel title="Trending near you" subtitle="Highly rated within 1 mi" onSeeAll={() => onSeeAll(feed.trending)} />
          <ScrollView
            contentContainerStyle={styles.horizontalContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {feed.trending.map((venue) => (
              <TrendingTile
                key={venue.id}
                onOpen={() => onOpenPlace(venue.id)}
                image={venueImage(venue.imageUrl)}
                meta={`${venue.category ?? ''} · ${'$'.repeat(venue.priceLevel ?? 1)}`}
                name={venue.name}
                rating={(venue.rating ?? 0).toFixed(1)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {feed.newSpots.length > 0 ? (
        <>
          <SectionLabel title="New spots" subtitle="Just opened in your area" />
          <View style={styles.placeRows}>
            {feed.newSpots.map((venue) => (
              <PlaceRow
                key={venue.id}
                onOpen={() => onOpenPlace(venue.id)}
                onSave={() => onSave({ venueId: venue.id, name: venue.name })}
                place={venueToPlace(venue)}
                saved={savedVenueIds.has(venue.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {feed.mostReviewed.length > 0 ? (
        <>
          <SectionLabel title="Most reviewed" subtitle="What everyone's talking about" />
          <View style={styles.grid}>
            {feed.mostReviewed.map((venue) => <GridPlace key={venue.id} onOpen={() => onOpenPlace(venue.id)} place={venueToPlace(venue)} />)}
          </View>
        </>
      ) : null}

      {feed.popularReviews.length > 0 ? (
        <>
          <SectionLabel title="Popular reviews" subtitle="What people are saying right now" />
          <View style={styles.reviewList}>
            {feed.popularReviews.map((review) => (
              <ReviewCard
                author={review.authorDisplayName}
                avatarUrl={review.authorPhotoUrl}
                image={venueImage(review.venueImageUrl)}
                key={review.id}
                onComments={() => onOpenComments(review.id)}
                onReact={() => void api.reactToReview({ idempotencyKey: createIdempotencyKey('discover-reaction'), reviewId: review.id, reaction: 'like' }).then((result) => {
                  setReactionCounts((counts) => ({ ...counts, [review.id]: result.data.reactionCount }));
                  setReactedReviews((current) => { const next = new Set(current); if (result.data.active) next.add(review.id); else next.delete(review.id); return next; });
                }).catch((error) => Alert.alert('Could not update reaction', apiErrorMessage(error)))}
                onShare={() => void Share.share({ message: `${review.authorDisplayName} recommends ${review.venueName}: ${review.text}\nhttps://tastesapp.com/reviews/${review.id}` })}
                onOpen={() => onOpenPlace(review.venueId)}
                place={review.venueName}
                rating={review.rating.toFixed(1)}
                reactionCount={reactionCounts[review.id] ?? review.reactionCount}
                reacted={reactedReviews.has(review.id)}
                text={review.text}
                time={timeAgo(review.createdAt)}
                commentCount={review.commentCount}
              />
            ))}
          </View>
        </>
      ) : null}

      {topReviewer ? (
        <>
          <SectionLabel title="Popular reviewer" subtitle="Trusted voice in your neighborhood" />
          <TopReviewer
            onFollow={() => onToggleFollow(topReviewer)}
            onOpen={() => onOpenProfile(topReviewer)}
            pending={followPending || followPendingId === topReviewer.userId}
            person={topReviewer}
          />
        </>
      ) : null}

      {feed.forYou.length > 0 ? (
        <>
          <SectionLabel title="For you" subtitle="Picked from your tastes & saves" />
          <ScrollView
            contentContainerStyle={styles.horizontalContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {feed.forYou.map((venue, index) => (
              <ForYouCard
                image={venueImage(venue.imageUrl)}
                key={venue.id}
                onOpen={() => onOpenPlace(venue.id)}
                place={venueToPlace(venue)}
                reason={forYouReason(venue, index)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {feed.hiddenGems.length > 0 ? (
        <>
          <SectionLabel title="Hidden gems" subtitle="High ratings, low review counts" />
          <View style={styles.gemList}>
            {feed.hiddenGems.map((venue) => <HiddenGem key={venue.id} onOpen={() => onOpenPlace(venue.id)} place={venueToPlace(venue)} />)}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function PlacesMap({
  appliedFilters,
  onOpenFavourites,
  onOpenFilters,
  onOpenPlace,
  onSave,
  savedVenueIds,
  userId,
}: {
  appliedFilters: string[];
  onOpenFavourites: () => void;
  onOpenFilters: () => void;
  onOpenPlace: (venueId: string) => void;
  onSave: (place: SaveablePlace) => void;
  savedVenueIds: Set<string>;
  userId: string;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<MapFilter | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({ friends: false, saved: false, openNow: false });
  const [mapInstanceKey, setMapInstanceKey] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetExpandedRef = useRef(false);
  const [sort, setSort] = useState<PlaceSort>('best-match');
  const [sortOpen, setSortOpen] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const searchRowRef = useRef<View | null>(null);
  const [region, setRegion] = useState<Region>({ latitude: 41.02, longitude: 29.0, latitudeDelta: 0.13, longitudeDelta: 0.12 });
  const sheetHeight = useRef(new Animated.Value(330)).current;
  const sheetKeyboardTranslate = useRef(new Animated.Value(0)).current;
  const currentSheetHeight = useRef(330);
  const sheetBounds = useRef({ collapsed: 330, expanded: 650 });
  const dragStartHeight = useRef(330);
  const sheetInitialized = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const keyboardTransitionRef = useRef(false);
  const keyboardAdjustedRef = useRef(false);
  const venueFilter = activeFilter
    ? { category: activeFilter.category, tag: activeFilter.tag }
    : {};
  const venuesQuery = useDiscoverVenues(userId, venueFilter);
  const venueSearchQuery = useVenueSearch(search);
  const peopleQuery = useDiscoverPeople(userId);
  const mapFeedQuery = useDiscoverFeed(userId);
  const venues = venuesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const searchResults = search.trim().length >= 2 ? (venueSearchQuery.data?.items ?? []) : [];
  const searchableVenues = searchResults.length > 0
    ? [...new Map([...venues, ...searchResults].map((venue) => [venue.id, venue])).values()]
    : venues;

  const filters: Array<MapFilter & { icon: ImageSourcePropType }> = [
    { key: 'trending', label: 'Trending', tag: 'trending', icon: filterTrendingIcon },
    { key: 'restaurant', label: 'Restaurant', category: 'Restaurant', icon: filterRestaurantIcon },
    { key: 'cafe', label: 'Cafe', category: 'Cafe', icon: filterCafeIcon },
    { key: 'bar', label: 'Bar', category: 'Bar', icon: filterBarIcon },
    { key: 'my-reviews', label: 'My Reviews', icon: filterReviewsIcon },
  ];

  const filtered = searchableVenues.filter((venue) => {
    const query = search.trim().toLowerCase();
    const searchable = [venue.name, venue.address, venue.city, venue.category]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (query && !searchable.includes(query)) return false;
    return matchesPlaceFilters(venue, appliedFilters);
  });

  const orderedVenues = [...filtered].sort((left, right) => {
    if (sort === 'best-match') {
      return (right.matchPercent ?? 0) - (left.matchPercent ?? 0)
        || (right.rating ?? 0) - (left.rating ?? 0);
    }
    if (sort === 'reviews') return (right.reviewCount ?? 0) - (left.reviewCount ?? 0);
    if (sort === 'distance') return (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
    if (sort === 'newest') {
      return Number(right.discoverTags?.includes('new')) - Number(left.discoverTags?.includes('new'));
    }
    return (right.rating ?? 0) - (left.rating ?? 0);
  });
  const sortLabel = placeSortOptions.find((option) => option.value === sort)?.label ?? 'Best match';
  const mappableVenues = orderedVenues.filter((venue) => (
    venue.latitude != null
    && venue.longitude != null
    && (!mapLayers.openNow || matchesPlaceFilters(venue, ['OpenNow:true']))
  ));
  const layerMode = mapLayers.friends || mapLayers.saved;
  const followedIds = new Set([
    ...(peopleQuery.data?.trending ?? []),
    ...(peopleQuery.data?.new ?? []),
    ...(peopleQuery.data?.suggested ?? []),
  ].filter((person) => person.following).map((person) => person.userId));
  const venuesById = new Map(mappableVenues.map((venue) => [venue.id, venue]));
  const friendMarkers = mapLayers.friends
    ? (mapFeedQuery.data?.popularReviews ?? []).flatMap((review) => {
      const venue = venuesById.get(review.venueId);
      return venue && followedIds.has(review.authorId) ? [{ review, venue }] : [];
    })
    : [];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') setMapInstanceKey((key) => key + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const listener = sheetHeight.addListener(({ value }) => {
      currentSheetHeight.current = value;
    });
    return () => sheetHeight.removeListener(listener);
  }, [sheetHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateKeyboardOffset = (translateY: number, duration?: number) => {
      sheetKeyboardTranslate.stopAnimation();
      const animationDuration = duration && duration > 0 ? duration : 250;
      Animated.timing(sheetKeyboardTranslate, {
        toValue: translateY,
        duration: animationDuration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) keyboardTransitionRef.current = false;
      });
    };
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardVisibleRef.current = true;
      setSortOpen(false);
      searchRowRef.current?.measureInWindow((_x, y, _width, height) => {
        const keyboardOverlap = Math.max(
          0,
          y + height + KEYBOARD_SEARCH_GAP - event.endCoordinates.screenY,
        );
        keyboardAdjustedRef.current = keyboardOverlap > 0;
        keyboardTransitionRef.current = keyboardAdjustedRef.current;
        if (keyboardAdjustedRef.current) {
          animateKeyboardOffset(-keyboardOverlap, event.duration);
        }
      });
    });
    const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
      keyboardVisibleRef.current = false;
      if (!keyboardAdjustedRef.current) {
        keyboardTransitionRef.current = false;
        return;
      }
      keyboardAdjustedRef.current = false;
      keyboardTransitionRef.current = true;
      animateKeyboardOffset(0, event.duration);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [sheetKeyboardTranslate]);

  function settleSheet(expanded: boolean) {
    if (keyboardVisibleRef.current) {
      Keyboard.dismiss();
      return;
    }
    sheetExpandedRef.current = expanded;
    setSheetExpanded(expanded);
    if (!expanded) setSortOpen(false);
    Animated.spring(sheetHeight, {
      toValue: expanded ? sheetBounds.current.expanded : sheetBounds.current.collapsed,
      damping: 24,
      stiffness: 240,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }

  const sheetPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
    onPanResponderGrant: () => {
      sheetHeight.stopAnimation();
      dragStartHeight.current = currentSheetHeight.current;
    },
    onPanResponderMove: (_, gesture) => {
      const next = dragStartHeight.current - gesture.dy;
      sheetHeight.setValue(Math.max(
        sheetBounds.current.collapsed,
        Math.min(sheetBounds.current.expanded, next),
      ));
    },
    onPanResponderRelease: (_, gesture) => {
      const midpoint = (sheetBounds.current.collapsed + sheetBounds.current.expanded) / 2;
      const expand = gesture.vy < -0.35
        || (gesture.vy <= 0.35 && currentSheetHeight.current >= midpoint);
      settleSheet(expand);
    },
    onPanResponderTerminate: () => {
      settleSheet(currentSheetHeight.current >= (
        sheetBounds.current.collapsed + sheetBounds.current.expanded
      ) / 2);
    },
  })).current;

  function handleMapLayout(height: number) {
    const availableHeight = Math.max(0, height - 8);
    const expanded = Math.max(0, availableHeight - DISCOVER_HEADER_HEIGHT);
    const collapsed = Math.min(expanded, Math.max(330, Math.round(height * 0.53)));
    if (!sheetInitialized.current) {
      sheetInitialized.current = true;
      sheetBounds.current = { collapsed, expanded };
      currentSheetHeight.current = collapsed;
      sheetHeight.setValue(collapsed);
      return;
    }
    if (keyboardVisibleRef.current || keyboardTransitionRef.current) return;

    sheetBounds.current = { collapsed, expanded };

    // Animate orientation and container-size changes without jumping.
    sheetHeight.stopAnimation();
    const nextHeight = sheetExpandedRef.current ? expanded : collapsed;
    currentSheetHeight.current = nextHeight;
    Animated.timing(sheetHeight, {
      toValue: nextHeight,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }

  function zoom(multiplier: number) {
    const next = {
      ...region,
      latitudeDelta: Math.max(0.008, Math.min(0.5, region.latitudeDelta * multiplier)),
      longitudeDelta: Math.max(0.008, Math.min(0.5, region.longitudeDelta * multiplier)),
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 250);
  }

  async function goToCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocationEnabled(false);
      Alert.alert('Location is off', 'Enable location in Settings or keep browsing the selected city.');
      return;
    }
    const position = await Location.getCurrentPositionAsync();
    const next = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      latitudeDelta: 0.045,
      longitudeDelta: 0.045,
    };
    setRegion(next);
    setLocationEnabled(true);
    mapRef.current?.animateToRegion(next, 450);
  }

  function focusFirstSearchResult() {
    const venue = filtered.find((item) => item.latitude != null && item.longitude != null);
    if (!venue) return;
    mapRef.current?.animateToRegion({
      latitude: venue.latitude!,
      longitude: venue.longitude!,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    }, 350);
  }

  function toggleMapLayer(key: keyof typeof mapLayers) {
    setMapLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <View onLayout={(event) => handleMapLayout(event.nativeEvent.layout.height)} style={styles.mapScreen}>
      <MapView
        key={mapInstanceKey}
        customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        initialRegion={region}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        onRegionChangeComplete={setRegion}
        ref={mapRef}
        showsCompass={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsUserLocation={locationEnabled}
        style={styles.mapNative}
        toolbarEnabled={false}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
      >
        {mappableVenues.map((venue) => {
          const saved = savedVenueIds.has(venue.id);
          if (layerMode && !(mapLayers.saved && saved)) return null;
          return (
            <Marker
              anchor={{ x: 0.5, y: 1 }}
              coordinate={{ latitude: venue.latitude!, longitude: venue.longitude! }}
              key={venue.id}
              onPress={() => onOpenPlace(venue.id)}
            >
              <MapVenueMarker layered={layerMode} styles={styles} venue={venue} />
            </Marker>
          );
        })}
        {friendMarkers.map(({ review, venue }) => (
          <Marker
            anchor={{ x: 0.18, y: 1 }}
            coordinate={{ latitude: venue.latitude!, longitude: venue.longitude! }}
            key={`friend-${review.id}`}
            onPress={() => onOpenPlace(venue.id)}
          >
            <View style={styles.mapFriendMarker}>
              <View style={styles.mapFriendAvatarWrap}>
                <UserAvatar displayName={review.authorDisplayName} photoUrl={review.authorPhotoUrl} style={styles.mapFriendAvatar} />
              </View>
              <View style={styles.mapLayerMarkerDot} />
              <View style={styles.mapLayerMarkerCopy}>
                <Text numberOfLines={1} style={styles.mapLayerMarkerName}>{review.authorDisplayName}</Text>
                <Text numberOfLines={1} style={styles.mapLayerMarkerCategory}>{review.venueCategory}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>
      <View
        pointerEvents="none"
        style={[styles.mapToneOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.19)' }]}
      />
      <View style={styles.mapControls}>
        <Pressable accessibilityLabel="Zoom in" onPress={() => zoom(0.55)} style={styles.mapControlButton}>
          <Text style={styles.mapControlGlyph}>+</Text>
        </Pressable>
        <Pressable accessibilityLabel="Zoom out" onPress={() => zoom(1.8)} style={styles.mapControlButton}>
          <Text style={styles.mapControlGlyph}>−</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="My location"
          accessibilityState={{ selected: locationEnabled }}
          onPress={() => void goToCurrentLocation()}
          style={[styles.mapControlButton, locationEnabled && styles.mapControlButtonActive]}
        >
          <MapLocateIcon color={locationEnabled ? '#FFFFFF' : colors.text} height={18} width={18} />
        </Pressable>
        <Pressable
          accessibilityLabel="Show on map"
          accessibilityState={{ expanded: layersOpen }}
          onPress={() => setLayersOpen((value) => !value)}
          style={[styles.mapControlButton, layersOpen && styles.mapControlButtonActive]}
        >
          <MapLayersControlIcon color={layersOpen ? '#FFFFFF' : colors.text} height={20} width={20} />
        </Pressable>
      </View>
      {layersOpen ? (
        <View style={styles.layersMenu}>
          <Text style={styles.layersTitle}>Show on map</Text>
          <MapLayerToggle active={mapLayers.friends} label="Friends" onPress={() => toggleMapLayer('friends')} styles={styles} />
          <MapLayerToggle active={mapLayers.saved} label="Saved" onPress={() => toggleMapLayer('saved')} styles={styles} />
          <MapLayerToggle active={mapLayers.openNow} label="Open now" onPress={() => toggleMapLayer('openNow')} styles={styles} />
        </View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[styles.mapSheetUnderlay, { height: sheetHeight }]}
      />
      <Animated.View
        style={[
          styles.mapSheet,
          { height: sheetHeight, transform: [{ translateY: sheetKeyboardTranslate }] },
        ]}
      >
        <Pressable
          accessibilityLabel={sheetExpanded ? 'Collapse place list' : 'Expand place list'}
          onPress={() => settleSheet(!sheetExpanded)}
          style={styles.sheetDragArea}
          {...sheetPanResponder.panHandlers}
        >
          <View style={styles.sheetHandle} />
        </Pressable>
        <View ref={searchRowRef} style={styles.mapSearchRow}>
          <View style={styles.mapSearch}>
            <SearchIcon color={colors.textSecondary} height={24} width={24} />
            <TextInput
              autoCorrect={false}
              onChangeText={setSearch}
              onSubmitEditing={focusFirstSearchResult}
              placeholder="Search"
              placeholderTextColor={colors.placeholder}
              returnKeyType="search"
              style={styles.mapSearchInput}
              value={search}
            />
            <VoiceIcon color={colors.text} height={24} width={24} />
          </View>
          <Pressable accessibilityLabel="Open filters" hitSlop={8} onPress={onOpenFilters} style={styles.mapHeaderIcon}>
            <MapTuneIcon color={colors.text} height={24} width={20} />
          </Pressable>
          <Pressable accessibilityLabel="Open favourites" hitSlop={8} onPress={onOpenFavourites} style={styles.mapHeaderIcon}>
            <MapFavouriteIcon color={colors.text} height={22} width={20} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.filterContent}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterList}
        >
          {appliedFilters.length > 0 ? <Pressable onPress={onOpenFilters} style={[styles.filterChip, styles.filterChipActive]}><Text style={[styles.filterText, styles.filterTextActive]}>{appliedFilters.length} filters</Text></Pressable> : null}
          {filters.map((filter) => {
            const active = activeFilter?.key === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(active ? null : filter)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Image source={filter.icon} style={styles.filterIcon} />
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {sheetExpanded ? (
          <View style={styles.mapResultsMeta}>
            <Text style={styles.mapResultsCount}>{filtered.length} places</Text>
            <Pressable
              accessibilityLabel="Sort places"
              accessibilityState={{ expanded: sortOpen }}
              onPress={() => setSortOpen((value) => !value)}
              style={styles.mapSortButton}
            >
              <SortIcon color={colors.textSecondary} height={12} width={16} />
              <Text style={styles.mapSortText}>Sort by: {sortLabel}</Text>
              <Text style={styles.mapSortChevron}>⌄</Text>
            </Pressable>
          </View>
        ) : null}
        {venuesQuery.isPending ? (
          <View style={styles.placesStatus}><ActivityIndicator color={colors.primary} /></View>
        ) : venuesQuery.isError ? (
          <View style={styles.placesStatus}>
            <Text style={styles.placesStatusText}>Could not load places.</Text>
            <Pressable onPress={() => void venuesQuery.refetch()} style={styles.inlineRetry}>
              <Text style={styles.inlineRetryText}>Try again</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.placesStatus}><Text style={styles.placesStatusText}>No places match your search.</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.placesList}>
            <View style={styles.placesListContent}>
              {orderedVenues.map((venue) => (
                <PlaceRow
                  key={venue.id}
                  onOpen={() => onOpenPlace(venue.id)}
                  onSave={() => onSave({ venueId: venue.id, name: venue.name })}
                  place={venueToPlace(venue)}
                  saved={savedVenueIds.has(venue.id)}
                />
              ))}
              {venuesQuery.hasNextPage ? (
                <Pressable
                  disabled={venuesQuery.isFetchingNextPage}
                  onPress={() => void venuesQuery.fetchNextPage()}
                  style={styles.loadMore}
                >
                  {venuesQuery.isFetchingNextPage
                    ? <ActivityIndicator color={colors.primary} />
                    : <Text style={styles.loadMoreText}>Load more places</Text>}
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        )}
      </Animated.View>
      <Modal
        animationType="fade"
        onRequestClose={() => setSortOpen(false)}
        transparent
        visible={sortOpen}
      >
        <View style={styles.sortModalScrim}>
          <Pressable accessibilityLabel="Close sort options" onPress={() => setSortOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sortSheet}>
            <View style={styles.sortSheetHandle} />
            <View style={styles.sortSheetHeader}>
              <Text style={styles.sortSheetTitle}>Sort by</Text>
              <Pressable accessibilityLabel="Close" hitSlop={8} onPress={() => setSortOpen(false)} style={styles.sortSheetClose}>
                <Text style={styles.sortSheetCloseText}>×</Text>
              </Pressable>
            </View>
            {placeSortOptions.map((option, index) => {
              const selected = sort === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => {
                    setSort(option.value);
                    setSortOpen(false);
                  }}
                  style={[styles.sortSheetRow, index === placeSortOptions.length - 1 && styles.sortSheetRowLast]}
                >
                  <Text style={styles.sortSheetLabel}>{option.label}</Text>
                  <View style={[styles.sortSheetRadio, selected && styles.sortSheetRadioSelected]}>
                    {selected ? <CheckIcon height={8} width={11} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MapVenueMarker({
  layered,
  styles,
  venue,
}: {
  layered: boolean;
  styles: ReturnType<typeof createStyles>;
  venue: Venue;
}) {
  if (layered) {
    const category = venue.category?.toLowerCase() ?? '';
    const icon = category.includes('cafe') || category.includes('coffee')
      ? mapCafeIcon
      : category.includes('bar') || category.includes('club')
        ? mapBarIcon
        : mapTrendingIcon;
    return (
      <View style={styles.mapLayerMarker}>
        <View style={styles.mapLayerMarkerIcon}>
          <Image source={icon} style={styles.mapLayerMarkerImage} />
        </View>
        <View style={styles.mapLayerMarkerDot} />
        <View style={styles.mapLayerMarkerCopy}>
          <Text numberOfLines={1} style={styles.mapLayerMarkerName}>{venue.name}</Text>
          <Text numberOfLines={1} style={styles.mapLayerMarkerCategory}>{venue.category ?? 'Place'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.mapRatingMarker}>
      <MapRatingPin height={44} width={36} />
      <Text style={styles.mapRatingMarkerText}>{(venue.rating ?? 0).toFixed(1)}</Text>
    </View>
  );
}

function MapLayerToggle({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={styles.layerRow}
    >
      <Text style={styles.layerOptionText}>{label}</Text>
      <View style={[styles.layerSwitch, active && styles.layerSwitchActive]}>
        <View style={[styles.layerSwitchThumb, active && styles.layerSwitchThumbActive]} />
      </View>
    </Pressable>
  );
}

function PeopleFeed({ onOpenProfile, userId }: { onOpenProfile: (person: DiscoverPerson) => void; userId: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const peopleQuery = useDiscoverPeople(userId);
  const peopleSearchQuery = usePeopleSearch(userId, debouncedQuery);
  const toggleFollow = useToggleFollow(userId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [seeMore, setSeeMore] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  function handleFollow(person: DiscoverPerson) {
    if (person.userId === userId || toggleFollow.isPending) return;
    setPendingId(person.userId);
    toggleFollow.mutate(
      { targetUserId: person.userId, following: person.following },
      {
        onError: (error) => Alert.alert('Could not update follow', apiErrorMessage(error)),
        onSettled: () => setPendingId(null),
      },
    );
  }

  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;
  const isSearching = normalizedQuery.length >= 2;
  const searchIsSettled = debouncedQuery === normalizedQuery;
  const trending = peopleQuery.data?.trending ?? [];
  const freshPeople = peopleQuery.data?.new ?? [];
  const suggested = peopleQuery.data?.suggested ?? [];
  const searchResults = isSearching && searchIsSettled ? peopleSearchQuery.data ?? [] : [];
  const resultIds = new Set(searchResults.map((person) => person.userId));
  const peopleYouMayKnow = suggested.filter((person) => !resultIds.has(person.userId));
  const resultsPending = isSearching
    ? !searchIsSettled || peopleSearchQuery.isPending
    : peopleQuery.isPending;
  const resultsError = isSearching ? peopleSearchQuery.error : peopleQuery.error;
  const seeMorePeople = [
    ...new Map(
      [...trending, ...freshPeople, ...suggested].map((person) => [person.userId, person]),
    ).values(),
  ];

  return (
    <ScrollView contentContainerStyle={styles.peopleContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.peopleSearchRow}>
        <View style={styles.peopleSearch}>
          <PeopleSearchIcon color={colors.text} height={24} width={24} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor={colors.placeholder}
            returnKeyType="search"
            style={styles.peopleSearchInput}
            value={query}
          />
          {hasQuery ? (
            <Pressable accessibilityLabel="Clear people search" hitSlop={8} onPress={() => setQuery('')}>
              <Image source={searchCloseIcon} style={styles.peopleSearchClear} />
            </Pressable>
          ) : null}
        </View>
        <View accessibilityLabel="People you may know" style={styles.peopleSearchFriends}>
          {isDark
            ? <UserHeartIcon height={24} width={24} />
            : <UserHeartLightIcon height={24} width={24} />}
        </View>
      </View>

      {resultsPending ? (
        <View style={styles.centerState}><Text style={styles.stateCopy}>Loading people…</Text></View>
      ) : resultsError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Could not load people</Text>
          <Text style={styles.stateCopy}>{resultsError.message}</Text>
          <Pressable onPress={() => void (isSearching ? peopleSearchQuery.refetch() : peopleQuery.refetch())} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : hasQuery ? (
        <>
          {isSearching && searchResults.length > 0 ? (
            <>
              <Text style={styles.peopleResultCount}>
                {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} for &quot;{normalizedQuery}&quot;
              </Text>
              <View style={styles.peopleSearchResults}>
                {searchResults.map((person) => (
                  <PeopleSearchResult
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    onOpen={() => onOpenProfile(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.peopleSearchEmpty}>
              <PeopleSearchIcon color={colors.text} height={60} width={60} />
              <Text style={styles.peopleSearchEmptyTitle}>
                {isSearching ? 'No people found' : 'Search people'}
              </Text>
              <Text style={styles.peopleSearchEmptyCopy}>
                {isSearching ? 'Try another name, or invite friends to Tastes.' : 'Type at least 2 characters.'}
              </Text>
            </View>
          )}
          <PeopleYouMayKnow
            onFollow={handleFollow}
            onOpen={onOpenProfile}
            pendingId={pendingId}
            people={peopleYouMayKnow}
            togglePending={toggleFollow.isPending}
          />
        </>
      ) : (
        <>
          {trending.length > 0 ? (
            <>
              <PeopleSectionHeader onSeeMore={() => setSeeMore(true)} subtitle="Gaining followers this week" title="🔥 Trending tastemakers" />
              <ScrollView
                contentContainerStyle={styles.peopleCarousel}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {trending.map((person) => (
                  <TastemakerCard
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    onOpen={() => onOpenProfile(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {freshPeople.length > 0 ? (
            <>
              <PeopleSectionHeader onSeeMore={() => setSeeMore(true)} subtitle="Just joined the community" title="New on Tastes" />
              <View style={styles.compactPeople}>
                {freshPeople.map((person) => (
                  <CompactPerson
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    onOpen={() => onOpenProfile(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </View>
            </>
          ) : null}

          {suggested.length > 0 ? (
            <>
              <PeopleSectionHeader
                onSeeMore={isSearching ? undefined : () => setSeeMore(true)}
                subtitle="Popular people on Tastes"
                title="Suggested people"
              />
              <View style={styles.profileList}>
                {suggested.map((person) => (
                  <ProfileSuggestion
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    onOpen={() => onOpenProfile(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </View>
            </>
          ) : null}

          {trending.length === 0 && freshPeople.length === 0 && suggested.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateCopy}>No people to show yet.</Text>
            </View>
          ) : null}
        </>
      )}
      <Modal animationType="slide" visible={seeMore} onRequestClose={() => setSeeMore(false)}>
        <View style={styles.screen}>
          <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
            <Pressable onPress={() => setSeeMore(false)} style={styles.headerAction}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
            <Text style={[styles.stateTitle, { flex: 1 }]}>Trending tastemakers</Text>
            <View style={styles.headerAction} />
          </View>
          <ScrollView contentContainerStyle={styles.profileList}>
            {seeMorePeople.map((person) => (
              <ProfileSuggestion
                following={person.following}
                key={person.userId}
                onFollow={() => handleFollow(person)}
                onOpen={() => {
                  setSeeMore(false);
                  onOpenProfile(person);
                }}
                pending={toggleFollow.isPending || pendingId === person.userId}
                person={person}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SectionLabel({ onSeeAll, subtitle, title }: { onSeeAll?: () => void; subtitle: string; title: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sectionLabel}>
      <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>
      {onSeeAll ? <Pressable onPress={onSeeAll}><Text style={styles.seeMoreLink}>See all →</Text></Pressable> : null}
    </View>
  );
}

function SeeAllPlacesModal({ onClose, onOpenPlace, onSave, savedVenueIds, venues }: { onClose: () => void; onOpenPlace: (id: string) => void; onSave: (place: SaveablePlace) => void; savedVenueIds: Set<string>; venues: Venue[] | null }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); const [query, setQuery] = useState('');
  const visible = (venues ?? []).filter((venue) => venue.name.toLowerCase().includes(query.toLowerCase()));
  return <Modal animationType="slide" visible={venues !== null} onRequestClose={onClose}><View style={styles.screen}><View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}><Pressable onPress={onClose} style={styles.headerAction}><Text style={styles.back}>‹</Text></Pressable><Text style={[styles.stateTitle, { flex: 1 }]}>Trending near you</Text><View style={styles.headerAction} /></View><View style={[styles.peopleSearch, { margin: 16 }]}><PeopleSearchIcon color={colors.textSecondary} height={24} width={24} /><TextInput onChangeText={setQuery} placeholder="Search in trending" placeholderTextColor={colors.placeholder} style={styles.peopleSearchInput} value={query} /></View><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 10 }}>{visible.map((venue) => <PlaceRow key={venue.id} onOpen={() => { onClose(); onOpenPlace(venue.id); }} onSave={() => { onClose(); onSave({ venueId: venue.id, name: venue.name }); }} place={venueToPlace(venue)} saved={savedVenueIds.has(venue.id)} />)}</ScrollView></View></Modal>;
}

function RatingPill({ value }: { value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.ratingPill}><Text style={styles.ratingText}>★ {value}</Text></View>;
}

function TrendingTile({ image, meta, name, onOpen, rating }: { image: ImageSourcePropType; meta: string; name: string; onOpen: () => void; rating: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.trendingTile}>
      <Image source={image} style={styles.coverImage} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />
      <View style={styles.tileRating}><RatingPill value={rating} /></View>
      <View style={styles.tileCopy}>
        <Text numberOfLines={1} style={styles.tileTitle}>{name}</Text>
        <Text style={styles.tileMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

function PlaceRow({ onOpen, onSave, place, saved }: { onOpen: () => void; onSave: () => void; place: Place; saved: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.placeRow}>
      <Pressable onPress={onOpen}>
        <Image source={place.image} style={styles.placeImage} />
        <View style={styles.newChip}><Text style={styles.newChipText}>Popular</Text></View>
      </Pressable>
      <Pressable onPress={onOpen} style={styles.placeInfo}>
        <Text numberOfLines={1} style={styles.placeName}>{place.name}</Text>
        <Text numberOfLines={2} style={styles.placeAddress}>{place.address}</Text>
        <View style={styles.inlineMeta}>
          <RatingPill value={place.rating} />
          <Text style={styles.mutedMeta}>{place.reviews}</Text>
        </View>
        <View style={styles.chipRow}>
          {[place.category, place.price, place.distance].map((chip) => (
            <View key={chip} style={styles.infoChip}><Text style={styles.infoChipText}>{chip}</Text></View>
          ))}
        </View>
      </Pressable>
      <Pressable accessibilityLabel={saved ? 'Remove from saved' : 'Save place'} hitSlop={8} onPress={onSave} style={styles.placeSave}>
        <BookmarkIcon color={saved ? colors.primary : colors.text} height={20} width={20} />
      </Pressable>
    </View>
  );
}

function GridPlace({ onOpen, place }: { onOpen: () => void; place: Place }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.gridCard}>
      <Image source={place.image} style={styles.gridImage} />
      <View style={styles.gridBody}>
        <Text numberOfLines={1} style={styles.gridTitle}>{place.name}</Text>
        <View style={styles.inlineMeta}>
          <RatingPill value={place.rating} />
          <Text style={styles.gridMeta}>{place.distance}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ReviewCard({
  author,
  avatarUrl,
  image,
  place,
  rating,
  reactionCount,
  text,
  time,
  commentCount,
  onComments,
  onReact,
  onShare,
  onOpen,
  reacted,
}: {
  author: string;
  avatarUrl: string | null;
  image: ImageSourcePropType;
  place: string;
  rating: string;
  reactionCount: number;
  text: string;
  time: string;
  commentCount: number;
  onComments: () => void;
  onReact: () => void;
  onShare: () => void;
  onOpen: () => void;
  reacted: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.reviewCard}>
      <Image source={image} style={styles.reviewImage} />
      <View style={styles.reviewBody}>
        <View style={styles.reviewHead}>
          <UserAvatar displayName={author} photoUrl={avatarUrl} style={styles.reviewAvatar} />
          <View style={styles.reviewWho}>
            <Text numberOfLines={1} style={styles.reviewAuthor}>{author}</Text>
            <Text numberOfLines={2} style={styles.reviewPlace}>on {place}</Text>
          </View>
          <RatingPill value={rating} />
        </View>
        <Text numberOfLines={2} style={styles.reviewText}>{text}</Text>
        <View style={styles.reviewFooter}>
          <Pressable onPress={(event) => { event.stopPropagation(); onReact(); }}><Text style={[styles.reviewAction, reacted && { color: colors.primary }]}>♥ {reactionCount}</Text></Pressable>
          <Pressable onPress={(event) => { event.stopPropagation(); onComments(); }}><Text style={styles.reviewAction}>◯ {commentCount}</Text></Pressable>
          <Pressable onPress={(event) => { event.stopPropagation(); onShare(); }}><Text style={styles.reviewAction}>↗</Text></Pressable>
          <Text style={styles.reviewTime}>{time}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TopReviewer({ onFollow, onOpen, pending, person }: { onFollow: () => void; onOpen: () => void; pending: boolean; person: DiscoverPerson }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <LinearGradient
      colors={['rgba(184,47,41,0.28)', colors.surface]}
      end={{ x: 1, y: 0 }}
      start={{ x: 0, y: 0 }}
      style={styles.reviewerCard}
    >
      <View style={styles.reviewerHead}>
        <View>
          <UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.reviewerAvatar} />
          <View style={styles.reviewerBadge}><Text style={styles.reviewerBadgeText}>★</Text></View>
        </View>
        <View style={styles.reviewerCopy}>
          <Text style={styles.topReviewer}>★ Top reviewer</Text>
          <Text style={styles.reviewerName}>{person.displayName}</Text>
          <Text style={styles.reviewerHandle}>{person.username ? `@${person.username}` : ''}</Text>
        </View>
      </View>
      <Text style={styles.reviewerMeta}>
        {person.favoriteCuisines.join(' · ') || 'Local tastemaker'} · {person.reviewCount} reviews
      </Text>
      <View style={styles.reviewerButtons}>
        <Pressable disabled={pending} onPress={onFollow} style={[styles.followWide, pending && styles.pressed]}>
          <Text style={styles.followWideText}>{person.following ? 'Following' : 'Follow'}</Text>
        </Pressable>
        <Pressable onPress={onOpen} style={styles.profileButton}><Text style={styles.profileButtonText}>View profile</Text></Pressable>
      </View>
    </LinearGradient>
  );
}

function ForYouCard({ image, onOpen, place, reason }: { image: ImageSourcePropType; onOpen: () => void; place: Place; reason: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.forYouCard}>
      <Image source={image} style={styles.coverImage} />
      <LinearGradient colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.94)']} style={StyleSheet.absoluteFill} />
      <View style={styles.reasonChip}><Text style={styles.reasonText}>{reason}</Text></View>
      <View style={styles.forYouCopy}>
        <Text numberOfLines={2} style={styles.forYouTitle}>{place.name}</Text>
        <Text style={styles.forYouMeta}>{place.category} · {place.distance}</Text>
        <View style={styles.inlineMeta}><RatingPill value={place.rating} /><Text style={styles.imageMetaText}>{place.reviews}</Text></View>
      </View>
    </Pressable>
  );
}

function HiddenGem({ onOpen, place }: { onOpen: () => void; place: Place }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.gemCard}>
      <Image source={place.image} style={styles.gemImage} />
      <View style={styles.gemCopy}>
        <View style={styles.gemTop}><Text style={styles.gemBadge}>💎 GEM</Text><Text style={styles.gemReviews}>only {place.reviews}</Text></View>
        <Text style={styles.gemName}>{place.name}</Text>
        <View style={styles.inlineMeta}><RatingPill value={place.rating} /><Text style={styles.gemMeta}>{place.category} · {place.price} · {place.distance}</Text></View>
      </View>
    </Pressable>
  );
}

function PeopleSectionHeader({ onSeeMore, subtitle, title }: { onSeeMore?: () => void; subtitle: string; title: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.peopleSectionHead}>
      <View>
        <Text style={styles.peopleSectionTitle}>{title}</Text>
        <Text style={styles.peopleSectionSubtitle}>{subtitle}</Text>
      </View>
      {onSeeMore ? <Pressable onPress={onSeeMore}><Text style={styles.seeMoreLink}>See more →</Text></Pressable> : null}
    </View>
  );
}

function PeopleSearchResult({
  following,
  onFollow,
  onOpen,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  onOpen: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.peopleResultCard}>
      <UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.peopleResultAvatar} />
      <View style={styles.peopleResultCopy}>
        <Text numberOfLines={1} style={styles.peopleResultName}>{person.displayName}</Text>
        <Text numberOfLines={1} style={styles.peopleResultHandle}>
          {person.username ? `@${person.username}` : 'Tastes member'}
        </Text>
      </View>
      <SearchFollowButton following={following} onPress={onFollow} pending={pending} />
    </Pressable>
  );
}

function PeopleYouMayKnow({
  onFollow,
  onOpen,
  pendingId,
  people,
  togglePending,
}: {
  onFollow: (person: DiscoverPerson) => void;
  onOpen: (person: DiscoverPerson) => void;
  pendingId: string | null;
  people: DiscoverPerson[];
  togglePending: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (people.length === 0) return null;
  return (
    <View style={styles.peopleMayKnowSection}>
      <Text style={styles.peopleMayKnowTitle}>People you may know</Text>
      <ScrollView
        contentContainerStyle={styles.peopleMayKnowList}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {people.map((person) => (
          <View key={person.userId} style={styles.peopleMayKnowCard}>
            <Pressable onPress={() => onOpen(person)}>
              <UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.peopleMayKnowAvatar} />
            </Pressable>
            <Pressable onPress={() => onOpen(person)} style={styles.peopleMayKnowCopy}>
              <Text numberOfLines={1} style={styles.peopleMayKnowName}>{person.displayName}</Text>
              <Text numberOfLines={1} style={styles.peopleMayKnowHandle}>
                {person.username ? `@${person.username}` : 'Tastes member'}
              </Text>
            </Pressable>
            <SearchFollowButton
              following={person.following}
              onPress={() => onFollow(person)}
              pending={togglePending || pendingId === person.userId}
              wide
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SearchFollowButton({ following, onPress, pending, wide = false }: {
  following: boolean;
  onPress: () => void;
  pending: boolean;
  wide?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      disabled={pending}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={[
        styles.searchFollowButton,
        wide && styles.searchFollowButtonWide,
        following && styles.searchFollowingButton,
        pending && styles.pressed,
      ]}
    >
      <Text style={[styles.searchFollowButtonText, following && styles.searchFollowingButtonText]}>
        {following ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  );
}

function FollowButton({ following, onPress, pending }: { following: boolean; onPress: () => void; pending: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      disabled={pending}
      onPress={onPress}
      style={[styles.followButton, following && styles.followingButton, pending && styles.pressed]}
    >
      <Text style={[styles.followButtonText, following && styles.followingButtonText]}>{following ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

function TastemakerCard({
  following,
  onFollow,
  onOpen,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  onOpen: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <LinearGradient colors={['rgba(184,47,41,0.35)', colors.surface]} style={styles.tastemakerCard}>
      <Pressable onPress={onOpen}>
        <UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.tastemakerAvatar} />
      </Pressable>
      <Text numberOfLines={1} onPress={onOpen} style={styles.tastemakerName}>{person.displayName}</Text>
      <Text style={styles.tastemakerTastes}>{person.favoriteCuisines.join(' · ') || (person.username ? `@${person.username}` : '')}</Text>
      <Text style={styles.tastemakerGrowth}>+{person.weeklyFollowerGrowth} this week</Text>
      <FollowButton following={following} onPress={onFollow} pending={pending} />
    </LinearGradient>
  );
}

function CompactPerson({
  following,
  onFollow,
  onOpen,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  onOpen: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.compactPerson}>
      <Pressable onPress={onOpen}><UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.compactAvatar} /></Pressable>
      <Pressable onPress={onOpen} style={styles.compactCopy}>
        <View style={styles.newPersonRow}><Text style={styles.newPersonBadge}>NEW</Text><Text style={styles.compactName}>{person.displayName}</Text></View>
        <Text numberOfLines={1} style={styles.compactTastes}>
          {person.favoriteCuisines.join(' · ') || 'Tastes explorer'} · {joinedLabel(person.createdAt)}
        </Text>
      </Pressable>
      <FollowButton following={following} onPress={onFollow} pending={pending} />
    </View>
  );
}

function ProfileSuggestion({
  following,
  onFollow,
  onOpen,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  onOpen: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stats: Array<[string, string]> = [
    [String(person.reviewCount), 'reviews'],
    [formatCount(person.followerCount), 'followers'],
    [formatCount(person.followingCount), 'following'],
  ];
  return (
    <View style={styles.profileSuggestion}>
      <View style={styles.suggestionHead}>
        <Pressable onPress={onOpen}><UserAvatar displayName={person.displayName} photoUrl={person.photoUrl} style={styles.suggestionAvatar} /></Pressable>
        <Pressable onPress={onOpen} style={styles.suggestionCopy}>
          <Text style={styles.suggestionName}>{person.displayName}</Text>
          <Text style={styles.suggestionHandle}>{person.username ? `@${person.username}` : ''}</Text>
          <Text style={styles.suggestionTastes}>{person.favoriteCuisines.join(' · ')}</Text>
        </Pressable>
        <FollowButton following={following} onPress={onFollow} pending={pending} />
      </View>
      <View style={styles.statsRow}>
        {stats.map(([value, label]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      {person.bio ? <Text style={styles.mutualText}>{person.bio}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  mapDiscoverScreen: { backgroundColor: colors.canvas },
  aiFab: { position: 'absolute', right: 16, bottom: 18, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 24, backgroundColor: colors.surface },
  aiFabMark: { width: 20, height: 18 },
  aiFabMarkPink: { position: 'absolute', top: 6, left: 4 },
  aiFabMarkOutline: { position: 'absolute', top: 2, left: 1, transform: [{ scaleY: -1 }] },
  header: { height: DISCOVER_HEADER_HEIGHT, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.background },
  mapHeader: { position: 'absolute', zIndex: 10, top: 0, right: 0, left: 0, elevation: 10 },
  headerAction: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.text, fontSize: 38, lineHeight: 40 },
  switcher: { height: 40, padding: 4, flexDirection: 'row', borderRadius: 999, backgroundColor: colors.surfaceRaised },
  switchOption: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  switchOptionActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: colors.textSecondary, opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: '#161616', opacity: 1, fontWeight: '700' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  stateTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  stateCopy: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
  retry: { marginTop: 4, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  trendingLoading: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  loadingHero: {
    height: 188,
    marginBottom: 4,
    borderRadius: 16,
    backgroundColor: colors.discoverSkeleton,
  },
  loadingTitle: {
    width: 140,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.discoverSkeleton,
  },
  loadingCard: {
    height: 156,
    borderRadius: 16,
    backgroundColor: colors.discoverSkeleton,
  },
  feedContent: { paddingBottom: 24, backgroundColor: colors.canvas },
  hero: { height: 220, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  hotChip: { position: 'absolute', top: 12, left: 12, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: '#FF4757', justifyContent: 'center' },
  hotChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  heroCopy: { position: 'absolute', left: 14, right: 14, bottom: 13, gap: 4 },
  heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  heroMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ratingPill: { height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#FF4757', alignItems: 'center', justifyContent: 'center' },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  imageMetaText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  sectionLabel: { height: 58, paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'flex-start' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sectionSubtitle: { marginTop: 2, color: colors.textSecondary, fontSize: 13 },
  horizontalContent: { paddingHorizontal: 16, gap: 10 },
  trendingTile: { width: 200, height: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface },
  tileRating: { position: 'absolute', top: 8, right: 8 },
  tileCopy: { position: 'absolute', left: 10, right: 10, bottom: 10, gap: 3 },
  tileTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  tileMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  placeRows: { paddingHorizontal: 16, gap: 10 },
  placeRow: { minHeight: 125, padding: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  placeImage: { width: 86, height: 86, borderRadius: 9, resizeMode: 'cover' },
  newChip: { position: 'absolute', top: 6, left: 6, height: 18, paddingHorizontal: 7, borderRadius: 9, backgroundColor: '#E63946', justifyContent: 'center' },
  newChipText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  placeInfo: { flex: 1, minWidth: 0, gap: 3 },
  placeName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  placeAddress: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  mutedMeta: { color: colors.textSecondary, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoChip: { height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  infoChipText: { color: colors.text, fontSize: 13 },
  grid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: { width: '48.5%', height: 151, borderWidth: 1, borderColor: colors.border, borderRadius: 13, overflow: 'hidden', backgroundColor: colors.surface },
  gridImage: { width: '100%', height: 90, resizeMode: 'cover' },
  gridBody: { height: 61, padding: 9, gap: 4 },
  gridTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  gridMeta: { color: colors.textSecondary, fontSize: 12 },
  reviewList: { paddingHorizontal: 16, gap: 10 },
  reviewCard: { height: 121, flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.surface },
  reviewImage: { width: 110, height: 121, resizeMode: 'cover' },
  reviewBody: { flex: 1, minWidth: 0, padding: 10, gap: 7 },
  reviewHead: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 7 },
  reviewAvatar: { width: 26, height: 26, borderRadius: 13 },
  reviewWho: { flex: 1, minWidth: 0 },
  reviewAuthor: { color: colors.text, fontSize: 13, fontWeight: '700' },
  reviewPlace: { color: colors.textSecondary, fontSize: 10, lineHeight: 12 },
  reviewText: { color: colors.text, fontSize: 12, lineHeight: 16 },
  reviewFooter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewAction: { color: colors.textSecondary, fontSize: 12 },
  reviewTime: { marginLeft: 'auto', color: colors.textSecondary, fontSize: 11 },
  reviewerCard: { height: 181, marginHorizontal: 16, padding: 16, borderWidth: 1, borderColor: colors.primary, borderRadius: 17 },
  reviewerHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  reviewerAvatar: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: colors.primary },
  reviewerBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FF4757', alignItems: 'center', justifyContent: 'center' },
  reviewerBadgeText: { color: '#FFFFFF', fontSize: 13 },
  reviewerCopy: { flex: 1 },
  topReviewer: { color: '#FF4757', fontSize: 12, fontWeight: '700' },
  reviewerName: { marginTop: 2, color: colors.text, fontSize: 20, fontWeight: '700' },
  reviewerHandle: { marginTop: 2, color: colors.textSecondary, fontSize: 12 },
  reviewerMeta: { marginTop: 10, color: colors.textSecondary, fontSize: 12 },
  reviewerButtons: { marginTop: 10, flexDirection: 'row', gap: 8 },
  followWide: { flex: 1, height: 35, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  followWideText: { color: '#161616', fontSize: 14, fontWeight: '600' },
  profileButton: { height: 35, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  profileButtonText: { color: colors.text, fontSize: 13 },
  forYouCard: { width: 240, height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  reasonChip: { position: 'absolute', top: 12, left: 12, height: 27, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  reasonText: { color: '#FFFFFF', fontSize: 12 },
  forYouCopy: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 5 },
  forYouTitle: { color: '#FFFFFF', fontSize: 17, lineHeight: 20, fontWeight: '700' },
  forYouMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  gemList: { paddingHorizontal: 16, gap: 10 },
  gemCard: { height: 94, padding: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: colors.surface },
  gemImage: { width: 70, height: 70, borderRadius: 8, resizeMode: 'cover' },
  gemCopy: { flex: 1, minWidth: 0, gap: 4 },
  gemTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gemBadge: { color: '#FFFFFF', fontSize: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: '#C99E58', overflow: 'hidden' },
  gemReviews: { color: colors.textSecondary, fontSize: 12 },
  gemName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  gemMeta: { color: colors.textSecondary, fontSize: 11 },
  mapScreen: { flex: 1, backgroundColor: colors.canvas, overflow: 'hidden' },
  mapNative: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mapToneOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.32)' },
  mapRatingMarker: { width: 36, height: 44, shadowColor: '#E63946', shadowOpacity: 0.67, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  mapRatingMarkerText: { position: 'absolute', top: 8, left: 0, width: 36, color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  mapLayerMarker: { width: 142, height: 52, flexDirection: 'row', alignItems: 'flex-start' },
  mapLayerMarkerIcon: { width: 36, height: 36, borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 18, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center' },
  mapLayerMarkerImage: { width: 20, height: 20, resizeMode: 'contain' },
  mapFriendMarker: { width: 142, height: 52, flexDirection: 'row', alignItems: 'flex-start' },
  mapFriendAvatarWrap: { width: 36, height: 36, borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 18, backgroundColor: '#161616', overflow: 'hidden' },
  mapFriendAvatar: { width: 34, height: 34, resizeMode: 'cover' },
  mapLayerMarkerDot: { position: 'absolute', left: 16, top: 43, width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
  mapLayerMarkerCopy: { width: 96, marginLeft: 6, paddingTop: 3 },
  mapLayerMarkerName: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  mapLayerMarkerCategory: { marginTop: 2, color: '#D9D9D9', fontSize: 11 },
  mapControls: { position: 'absolute', zIndex: 5, top: 124, right: 16, gap: 10 },
  mapControlButton: { width: 48, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  mapControlButtonActive: { borderColor: colors.primary, backgroundColor: 'rgba(184,47,41,0.9)' },
  mapControlGlyph: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  layersMenu: { position: 'absolute', zIndex: 6, top: 124, right: 72, width: 190, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  layersTitle: { marginBottom: 4, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  layerRow: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  layerOptionText: { color: colors.text, fontSize: 15 },
  layerSwitch: { width: 38, height: 22, padding: 2, justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised },
  layerSwitchActive: { backgroundColor: colors.primary },
  layerSwitchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  layerSwitchThumbActive: { alignSelf: 'flex-end' },
  mapSheet: { position: 'absolute', zIndex: 8, elevation: 8, right: 0, bottom: 0, left: 0, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, overflow: 'hidden' },
  mapSheetUnderlay: { position: 'absolute', zIndex: 7, elevation: 7, right: 0, bottom: 0, left: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  sheetDragArea: { height: 24, alignItems: 'center', justifyContent: 'center' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  mapSearchRow: { zIndex: 2, height: 45, flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapSearch: { flex: 1, minWidth: 0, height: 39, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: colors.surfaceRaised },
  mapSearchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, paddingVertical: 0 },
  mapHeaderIcon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  filterList: { flexGrow: 0, height: 38 },
  filterContent: { alignItems: 'center', gap: 6 },
  filterChip: { height: 28, paddingHorizontal: 8, flexDirection: 'row', gap: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  filterChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(184,47,41,0.12)' },
  filterIcon: { width: 14, height: 14, resizeMode: 'contain' },
  filterText: { color: colors.textSecondary, fontSize: 12 },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  mapResultsMeta: { zIndex: 3, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapResultsCount: { color: colors.textSecondary, fontSize: 12 },
  mapSortButton: { minHeight: 28, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  mapSortText: { color: colors.textSecondary, fontSize: 11 },
  mapSortChevron: { marginTop: -3, color: colors.textSecondary, fontSize: 13 },
  sortModalScrim: { flex: 1, paddingHorizontal: 16, paddingBottom: 24, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sortSheet: { height: 340, paddingHorizontal: 24, borderRadius: 22, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  sortSheetHandle: { position: 'absolute', top: 10, left: '50%', width: 36, height: 4, marginLeft: -18, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  sortSheetHeader: { height: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortSheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  sortSheetClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  sortSheetCloseText: { color: colors.text, fontSize: 26, lineHeight: 28 },
  sortSheetRow: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  sortSheetRowLast: { borderBottomWidth: 0 },
  sortSheetLabel: { color: colors.text, fontSize: 16 },
  sortSheetRadio: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.textMuted, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sortSheetRadioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  placesStatus: { paddingVertical: 20, alignItems: 'center', gap: 10 },
  placesStatusText: { color: colors.textSecondary, fontSize: 13 },
  inlineRetry: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  inlineRetryText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  placesList: { flex: 1, marginTop: 8 },
  placesListContent: { gap: 10, paddingBottom: 16 },
  loadMore: { height: 38, marginTop: 2, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  placeSave: { alignSelf: 'flex-start', paddingTop: 2 },
  peopleContent: { padding: 16, paddingBottom: 24, gap: 16 },
  peopleSearchRow: { height: 39, flexDirection: 'row', alignItems: 'center', gap: 12 },
  peopleSearch: { flex: 1, minWidth: 0, height: 39, paddingLeft: 10, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, backgroundColor: colors.surfaceRaised },
  peopleSearchInput: { flex: 1, color: colors.text, fontSize: 16, letterSpacing: -0.41, paddingVertical: 0 },
  peopleSearchClear: { width: 24, height: 24 },
  peopleSearchFriends: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  peopleResultCount: { marginTop: -2, color: colors.textSecondary, fontSize: 13, letterSpacing: -0.24 },
  peopleSearchResults: { gap: 8 },
  peopleResultCard: { minHeight: 64, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.hairline, borderRadius: 14, backgroundColor: colors.surface },
  peopleResultAvatar: { width: 44, height: 44, borderRadius: 22 },
  peopleResultCopy: { flex: 1, minWidth: 0, gap: 4 },
  peopleResultName: { color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.41 },
  peopleResultHandle: { color: colors.textMuted, fontSize: 13, letterSpacing: -0.24 },
  peopleSearchEmpty: { minHeight: 380, paddingTop: 42, alignItems: 'center', gap: 10 },
  peopleSearchEmptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  peopleSearchEmptyCopy: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  peopleMayKnowSection: { marginTop: 14, gap: 8 },
  peopleMayKnowTitle: { color: colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.24 },
  peopleMayKnowList: { gap: 10 },
  peopleMayKnowCard: { width: 165, minHeight: 174, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: colors.hairline, borderRadius: 16, backgroundColor: colors.surface },
  peopleMayKnowAvatar: { width: 40, height: 40, borderRadius: 20 },
  peopleMayKnowCopy: { width: '100%', alignItems: 'center', gap: 4 },
  peopleMayKnowName: { width: '100%', color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.41, textAlign: 'center' },
  peopleMayKnowHandle: { width: '100%', color: colors.textMuted, fontSize: 13, letterSpacing: -0.24, textAlign: 'center' },
  searchFollowButton: { minWidth: 74, height: 31, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchFollowButtonWide: { width: '100%', height: 40 },
  searchFollowButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600', letterSpacing: 0.6 },
  searchFollowingButton: { borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
  searchFollowingButtonText: { color: colors.primary },
  peopleSectionHead: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 4 },
  peopleSectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  peopleSectionSubtitle: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  seeMoreLink: { color: colors.primary, fontSize: 12 },
  peopleCarousel: { gap: 10 },
  tastemakerCard: { width: 156, height: 186, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 17, alignItems: 'center' },
  tastemakerAvatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: '#FFFFFF' },
  tastemakerName: { marginTop: 10, color: colors.text, fontSize: 14, fontWeight: '700' },
  tastemakerTastes: { marginTop: 7, color: colors.textSecondary, fontSize: 12 },
  tastemakerGrowth: { marginTop: 7, color: '#7AD49A', fontSize: 12 },
  compactPeople: { gap: 9 },
  compactPerson: { height: 68, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  compactAvatar: { width: 44, height: 44, borderRadius: 22 },
  compactCopy: { flex: 1, minWidth: 0 },
  newPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  newPersonBadge: { color: '#161616', backgroundColor: '#7AD49A', fontSize: 10, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7, overflow: 'hidden' },
  compactName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  compactTastes: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  followButton: { minWidth: 74, height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  followButtonText: { color: '#161616', fontSize: 13, fontWeight: '600' },
  followingButton: { borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
  followingButtonText: { color: colors.primary },
  profileList: { gap: 10 },
  profileSuggestion: { minHeight: 172, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  suggestionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  suggestionAvatar: { width: 54, height: 54, borderRadius: 27 },
  suggestionCopy: { flex: 1, minWidth: 0 },
  suggestionName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  suggestionHandle: { color: colors.textSecondary, fontSize: 11 },
  suggestionTastes: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
  statsRow: { height: 55, marginTop: 10, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  statLabel: { marginTop: 4, color: colors.textSecondary, fontSize: 11 },
  mutualText: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.78 },
});
