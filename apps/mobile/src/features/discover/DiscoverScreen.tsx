import type { DiscoverFeed, DiscoverPerson, Venue } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import avatarCameron from '../../../assets/discover/avatar-cameron.jpg';
import avatarKristin from '../../../assets/discover/avatar-kristin.png';
import avatarWade from '../../../assets/discover/avatar-wade.png';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import mapImage from '../../../assets/discover/map.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import sushiImage from '../../../assets/discover/sushi.jpg';
import tacosImage from '../../../assets/discover/tacos.jpg';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import {
  type DiscoverVenueFilter,
  useDiscoverFeed,
  useDiscoverPeople,
  useDiscoverVenues,
  useToggleFollow,
} from './api';
import {
  FavouritesPane,
  SaveToFolderSheet,
  type SaveablePlace,
} from '../favourites/FavouritesPane';
import { useFavourites } from '../favourites/api';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type DiscoverTab = 'trending' | 'places' | 'people';
type MapFilter = DiscoverVenueFilter & { key: string; label: string };

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

const venueImages: Record<string, ImageSourcePropType> = {
  sushi: sushiImage,
  restaurant: restaurantImage,
  lounge: loungeImage,
  tacos: tacosImage,
  cafe: cafeImage,
};

function venueImage(imageKey?: string | null): ImageSourcePropType {
  if (imageKey && venueImages[imageKey]) return venueImages[imageKey];
  return restaurantImage;
}

const avatarImages: Record<string, ImageSourcePropType> = {
  kristin: avatarKristin,
  cameron: avatarCameron,
  wade: avatarWade,
};

function avatarSource(photoUrl: string | null, avatarKey: string | null): ImageSourcePropType {
  if (photoUrl) return { uri: photoUrl };
  if (avatarKey && avatarImages[avatarKey]) return avatarImages[avatarKey];
  return avatarKristin;
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
    image: venueImage(venue.imageKey),
  };
}

const MAP_BOUNDS = { latMin: 40.95, latMax: 41.08, lonMin: 28.96, lonMax: 29.08 };

function clampPercent(value: number): number {
  return Math.min(88, Math.max(8, value));
}

function projectToMap(latitude?: number, longitude?: number): { left: `${number}%`; top: `${number}%` } {
  if (latitude == null || longitude == null) return { left: '50%', top: '50%' };
  const left = clampPercent(((longitude - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * 100);
  const top = clampPercent(((MAP_BOUNDS.latMax - latitude) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * 100);
  return { left: `${left}%`, top: `${top}%` };
}

export function DiscoverScreen({ onOpenPlace, userId }: { onOpenPlace: (venueId: string) => void; userId: string }) {
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
    <View style={styles.screen}>
      <View style={styles.header}>
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
            <Text style={styles.stateTitle}>Could not load Discover</Text>
            <Text style={styles.stateCopy}>{feedQuery.error.message}</Text>
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
            onToggleFollow={handleToggleFollow}
            savedVenueIds={savedVenueIds}
          />
        )
      ) : null}
      {tab === 'places' && favouritesOpen ? <FavouritesPane onOpenPlace={onOpenPlace} userId={userId} /> : null}
      {tab === 'places' && !favouritesOpen ? (
        <PlacesMap
          onOpenFavourites={() => setFavouritesOpen(true)}
          onOpenPlace={onOpenPlace}
          onSave={setSaveTarget}
          savedVenueIds={savedVenueIds}
          userId={userId}
        />
      ) : null}
      {tab === 'people' ? <PeopleFeed userId={userId} /> : null}
      <SaveToFolderSheet
        onClose={() => setSaveTarget(null)}
        place={saveTarget}
        userId={userId}
        visible={saveTarget !== null}
      />
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
  onToggleFollow,
  savedVenueIds,
}: {
  feed: DiscoverFeed;
  followPending: boolean;
  followPendingId: string | null;
  onSave: (place: SaveablePlace) => void;
  onOpenPlace: (venueId: string) => void;
  onToggleFollow: (person: DiscoverPerson) => void;
  savedVenueIds: Set<string>;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          <Image source={venueImage(hero.imageKey)} style={styles.coverImage} />
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
          <SectionLabel title="Trending near you" subtitle="Highly rated within 1 mi" />
          <ScrollView
            contentContainerStyle={styles.horizontalContent}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {feed.trending.map((venue) => (
              <TrendingTile
                key={venue.id}
                onOpen={() => onOpenPlace(venue.id)}
                image={venueImage(venue.imageKey)}
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
                avatar={avatarSource(review.authorPhotoUrl, review.authorAvatarKey)}
                image={venueImage(review.venueImageKey)}
                key={review.id}
                onOpen={() => onOpenPlace(review.venueId)}
                place={review.venueName}
                rating={review.rating.toFixed(1)}
                reactionCount={review.reactionCount}
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
                image={venueImage(venue.imageKey)}
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
  onOpenFavourites,
  onOpenPlace,
  onSave,
  savedVenueIds,
  userId,
}: {
  onOpenFavourites: () => void;
  onOpenPlace: (venueId: string) => void;
  onSave: (place: SaveablePlace) => void;
  savedVenueIds: Set<string>;
  userId: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<MapFilter | null>(null);
  const catalogueQuery = useDiscoverVenues(userId);
  const venuesQuery = useDiscoverVenues(userId, activeFilter ?? {});
  const catalogueVenues = catalogueQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const venues = venuesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const categories = useMemo(
    () => [...new Set(catalogueVenues.map((venue) => venue.category).filter((value): value is string => Boolean(value)))],
    [catalogueVenues],
  );
  const filters = useMemo<MapFilter[]>(
    () => [
      { key: 'trending', label: '🔥 Trending', tag: 'trending' },
      ...categories.map((category) => ({ key: `category:${category}`, label: category, category })),
    ],
    [categories],
  );

  const filtered = venues.filter((venue) => {
    const query = search.trim().toLowerCase();
    if (query && !venue.name.toLowerCase().includes(query)) return false;
    return true;
  });

  return (
    <View style={styles.mapScreen}>
      <Image source={mapImage} style={styles.mapImage} />
      {filtered.map((venue) => {
        const position = projectToMap(venue.latitude, venue.longitude);
        return <MapPin key={venue.id} left={position.left} onPress={() => onOpenPlace(venue.id)} top={position.top} value={(venue.rating ?? 0).toFixed(1)} />;
      })}
      <View style={styles.mapControls}>
        <Text style={styles.mapControl}>+</Text>
        <Text style={styles.mapControl}>−</Text>
        <Text style={styles.mapControl}>⌖</Text>
        <Text style={styles.mapControl}>▱</Text>
      </View>
      <View style={styles.mapSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.mapSearchRow}>
          <View style={styles.mapSearch}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={colors.placeholder}
              style={styles.mapSearchInput}
              value={search}
            />
            <Text style={styles.voiceGlyph}>●</Text>
          </View>
          <Text style={styles.filterGlyph}>☷</Text>
          <Pressable accessibilityLabel="Open favourites" hitSlop={10} onPress={onOpenFavourites}>
            <Text style={[styles.filterGlyph, styles.favouritesGlyph]}>♥</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.filterContent}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {filters.map((filter) => {
            const active = activeFilter?.key === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(active ? null : filter)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
              {filtered.map((venue) => (
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
      </View>
    </View>
  );
}

function PeopleFeed({ userId }: { userId: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const peopleQuery = useDiscoverPeople(userId);
  const toggleFollow = useToggleFollow(userId);
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const trending = (peopleQuery.data?.trending ?? []).filter((person) => matches(person.displayName));
  const freshPeople = (peopleQuery.data?.new ?? []).filter((person) => matches(person.displayName));
  const suggested = (peopleQuery.data?.suggested ?? []).filter((person) => matches(person.displayName));

  return (
    <ScrollView contentContainerStyle={styles.peopleContent} showsVerticalScrollIndicator={false}>
      <View style={styles.peopleSearch}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search people, cuisines, cities"
          placeholderTextColor={colors.textSecondary}
          style={styles.peopleSearchInput}
          value={query}
        />
      </View>

      {peopleQuery.isPending ? (
        <View style={styles.centerState}><Text style={styles.stateCopy}>Loading people…</Text></View>
      ) : peopleQuery.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Could not load people</Text>
          <Text style={styles.stateCopy}>{peopleQuery.error.message}</Text>
          <Pressable onPress={() => void peopleQuery.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {trending.length > 0 ? (
            <>
              <PeopleSectionHeader subtitle="Gaining followers this week" title="🔥 Trending tastemakers" />
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
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {freshPeople.length > 0 ? (
            <>
              <PeopleSectionHeader subtitle="Just joined the community" title="New on Tastes" />
              <View style={styles.compactPeople}>
                {freshPeople.map((person) => (
                  <CompactPerson
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </View>
            </>
          ) : null}

          {suggested.length > 0 ? (
            <>
              <PeopleSectionHeader subtitle="Based on mutual connections" title="Similar to people you follow" />
              <View style={styles.profileList}>
                {suggested.map((person) => (
                  <ProfileSuggestion
                    following={person.following}
                    key={person.userId}
                    onFollow={() => handleFollow(person)}
                    pending={toggleFollow.isPending || pendingId === person.userId}
                    person={person}
                  />
                ))}
              </View>
            </>
          ) : null}

          {trending.length === 0 && freshPeople.length === 0 && suggested.length === 0 ? (
            <View style={styles.centerState}><Text style={styles.stateCopy}>No people match your search.</Text></View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function SectionLabel({ subtitle, title }: { subtitle: string; title: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
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
        <View style={styles.newChip}><Text style={styles.newChipText}>NEW</Text></View>
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
      <Pressable accessibilityLabel={saved ? 'Remove from saved' : 'Save place'} hitSlop={8} onPress={onSave}>
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
  avatar,
  image,
  place,
  rating,
  reactionCount,
  text,
  time,
  commentCount,
  onOpen,
}: {
  author: string;
  avatar: ImageSourcePropType;
  image: ImageSourcePropType;
  place: string;
  rating: string;
  reactionCount: number;
  text: string;
  time: string;
  commentCount: number;
  onOpen: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onOpen} style={styles.reviewCard}>
      <Image source={image} style={styles.reviewImage} />
      <View style={styles.reviewBody}>
        <View style={styles.reviewHead}>
          <Image source={avatar} style={styles.reviewAvatar} />
          <View style={styles.reviewWho}>
            <Text numberOfLines={1} style={styles.reviewAuthor}>{author}</Text>
            <Text numberOfLines={2} style={styles.reviewPlace}>on {place}</Text>
          </View>
          <RatingPill value={rating} />
        </View>
        <Text numberOfLines={2} style={styles.reviewText}>{text}</Text>
        <View style={styles.reviewFooter}>
          <Text style={styles.reviewAction}>♥ {reactionCount}</Text>
          <Text style={styles.reviewAction}>◯ {commentCount}</Text>
          <Text style={styles.reviewTime}>{time}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function TopReviewer({ onFollow, pending, person }: { onFollow: () => void; pending: boolean; person: DiscoverPerson }) {
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
          <Image source={avatarSource(person.photoUrl, person.avatarKey)} style={styles.reviewerAvatar} />
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
        <Pressable style={styles.profileButton}><Text style={styles.profileButtonText}>View profile</Text></Pressable>
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

function MapPin({ left, onPress, top, value }: { left: `${number}%`; onPress: () => void; top: `${number}%`; value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={[styles.mapPin, { left, top }]}>
      <Text style={styles.mapPinText}>{value}</Text>
      <View style={styles.mapPinTip} />
    </Pressable>
  );
}

function PeopleSectionHeader({ subtitle, title }: { subtitle: string; title: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.peopleSectionHead}>
      <View>
        <Text style={styles.peopleSectionTitle}>{title}</Text>
        <Text style={styles.peopleSectionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.seeMoreLink}>See more →</Text>
    </View>
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
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <LinearGradient colors={['rgba(184,47,41,0.35)', colors.surface]} style={styles.tastemakerCard}>
      <Image source={avatarSource(person.photoUrl, person.avatarKey)} style={styles.tastemakerAvatar} />
      <Text numberOfLines={1} style={styles.tastemakerName}>{person.displayName}</Text>
      <Text style={styles.tastemakerTastes}>{person.favoriteCuisines.join(' · ') || (person.username ? `@${person.username}` : '')}</Text>
      <Text style={styles.tastemakerGrowth}>+{person.weeklyFollowerGrowth} this week</Text>
      <FollowButton following={following} onPress={onFollow} pending={pending} />
    </LinearGradient>
  );
}

function CompactPerson({
  following,
  onFollow,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  pending: boolean;
  person: DiscoverPerson;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.compactPerson}>
      <Image source={avatarSource(person.photoUrl, person.avatarKey)} style={styles.compactAvatar} />
      <View style={styles.compactCopy}>
        <View style={styles.newPersonRow}><Text style={styles.newPersonBadge}>NEW</Text><Text style={styles.compactName}>{person.displayName}</Text></View>
        <Text numberOfLines={1} style={styles.compactTastes}>
          {person.favoriteCuisines.join(' · ') || 'Tastes explorer'} · {joinedLabel(person.createdAt)}
        </Text>
      </View>
      <FollowButton following={following} onPress={onFollow} pending={pending} />
    </View>
  );
}

function ProfileSuggestion({
  following,
  onFollow,
  pending,
  person,
}: {
  following: boolean;
  onFollow: () => void;
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
        <Image source={avatarSource(person.photoUrl, person.avatarKey)} style={styles.suggestionAvatar} />
        <View style={styles.suggestionCopy}>
          <Text style={styles.suggestionName}>{person.displayName}</Text>
          <Text style={styles.suggestionHandle}>{person.username ? `@${person.username}` : ''}</Text>
          <Text style={styles.suggestionTastes}>{person.favoriteCuisines.join(' · ')}</Text>
        </View>
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
  header: { height: 106, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.background },
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
  sectionLabel: { height: 58, paddingHorizontal: 16, paddingTop: 18 },
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
  mapScreen: { flex: 1, backgroundColor: '#161616', overflow: 'hidden' },
  mapImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', resizeMode: 'cover' },
  mapPin: { position: 'absolute', width: 42, height: 42, borderRadius: 21, backgroundColor: '#FF4757', alignItems: 'center', justifyContent: 'center', shadowColor: '#FF4757', shadowOpacity: 0.65, shadowRadius: 10 },
  mapPinText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  mapPinTip: { position: 'absolute', bottom: -4, width: 10, height: 10, backgroundColor: '#FF4757', transform: [{ rotate: '45deg' }] },
  mapControls: { position: 'absolute', top: 94, right: 16, gap: 8 },
  mapControl: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(22,22,22,0.9)', color: '#FFFFFF', fontSize: 22, lineHeight: 40, textAlign: 'center', overflow: 'hidden' },
  mapSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 330, paddingTop: 8, paddingHorizontal: 16, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.canvas },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  mapSearchRow: { height: 49, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapSearch: { flex: 1, height: 39, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: colors.surfaceRaised },
  searchGlyph: { color: colors.textSecondary, fontSize: 21 },
  mapSearchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  voiceGlyph: { color: colors.textSecondary, fontSize: 12 },
  filterGlyph: { color: colors.text, fontSize: 22 },
  favouritesGlyph: { color: colors.primary },
  filterContent: { height: 38, alignItems: 'center', gap: 6 },
  filterChip: { height: 28, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  filterChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(184,47,41,0.12)' },
  filterText: { color: colors.textSecondary, fontSize: 12 },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
  placesStatus: { paddingVertical: 20, alignItems: 'center', gap: 10 },
  placesStatusText: { color: colors.textSecondary, fontSize: 13 },
  inlineRetry: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  inlineRetryText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  placesList: { maxHeight: 170, marginTop: 8 },
  placesListContent: { gap: 10, paddingBottom: 16 },
  loadMore: { height: 38, marginTop: 2, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  loadMoreText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  peopleContent: { padding: 16, paddingBottom: 24, gap: 16 },
  peopleSearch: { height: 44, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  peopleSearchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
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
