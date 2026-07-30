import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
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
  FavouritesPane,
  SaveToFolderSheet,
  type SaveablePlace,
} from '../favourites/FavouritesPane';
import { useFavourites } from '../favourites/api';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type DiscoverTab = 'trending' | 'places' | 'people';

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

const places: Place[] = [
  {
    venueId: 'joes-shanghai',
    name: "Joe's Shanghai Soup Dumpling Restaurant",
    address: '2972 Westheimer Rd. Santa Ana, Illinois 85486',
    category: 'Chinese',
    price: '$$',
    distance: '0,9 km',
    rating: '4.5',
    reviews: '821 reviews',
    image: restaurantImage,
  },
  {
    venueId: 'coffee-bar-760',
    name: 'Coffee Bar 760',
    address: '410 Spring St, NY 10013',
    category: 'Café',
    price: '$',
    distance: '0,4 km',
    rating: '4.2',
    reviews: '92 reviews',
    image: cafeImage,
  },
  {
    venueId: 'tacos-la-brea',
    name: 'Tacos La Brea',
    address: '6051 W 3rd St, Los Angeles',
    category: 'Mexican',
    price: '$',
    distance: '2,1 km',
    rating: '4.6',
    reviews: '240 reviews',
    image: tacosImage,
  },
];

const gridPlaces = [
  { ...places[0], distance: '0,9 km' },
  { ...places[0], venueId: 'morimoto', name: 'Wasabi by Morimoto', rating: '4.7', distance: '1,8 km', image: sushiImage },
  { ...places[0], venueId: 'gemini-750', name: 'Gemini750 Restaurant', rating: '4.3', distance: '1,2 km', image: loungeImage },
  places[2],
  places[1],
];

const people = [
  { name: 'Kristin Watson', handle: '@kristinw', tastes: 'Tacos · BBQ', growth: '+412 this week', image: avatarKristin },
  { name: 'Cameron Williamson', handle: '@cameronw', tastes: 'Italian · Pasta', growth: '+318 this week', image: avatarCameron },
  { name: 'Wade Warren', handle: '@wadew', tastes: 'Sushi · Ramen', growth: '+206 this week', image: avatarWade },
];

export function DiscoverScreen({ userId }: { userId: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<DiscoverTab>('trending');
  const [favouritesOpen, setFavouritesOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveablePlace | null>(null);
  const favourites = useFavourites(userId);
  const savedVenueIds = new Set(favourites.data?.places.map((place) => place.venueId) ?? []);

  function selectTab(value: DiscoverTab) {
    setTab(value);
    setFavouritesOpen(false);
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
        favourites.isPending
          ? <TrendingLoading />
          : <TrendingFeed onSave={setSaveTarget} savedVenueIds={savedVenueIds} />
      ) : null}
      {tab === 'places' && favouritesOpen ? <FavouritesPane userId={userId} /> : null}
      {tab === 'places' && !favouritesOpen ? (
        <PlacesMap
          onOpenFavourites={() => setFavouritesOpen(true)}
          onSave={setSaveTarget}
          savedVenueIds={savedVenueIds}
        />
      ) : null}
      {tab === 'people' ? <PeopleFeed /> : null}
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

  return (
    <View
      accessibilityLabel="Loading trending places"
      accessibilityState={{ busy: true }}
      style={styles.trendingLoading}
    >
      <View style={styles.loadingHero} />
      <View style={styles.loadingTitle} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
      <View style={styles.loadingCard} />
    </View>
  );
}

function TrendingFeed({
  onSave,
  savedVenueIds,
}: {
  onSave: (place: SaveablePlace) => void;
  savedVenueIds: Set<string>;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      contentContainerStyle={styles.feedContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Image source={sushiImage} style={styles.coverImage} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.88)']}
          locations={[0.34, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.hotChip}><Text style={styles.hotChipText}>🔥 Hot in your area</Text></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Wasabi by Morimoto</Text>
          <Text style={styles.heroMeta}>Japanese · 1,8 km</Text>
          <View style={styles.inlineMeta}>
            <RatingPill value="4.7" />
            <Text style={styles.imageMetaText}>512 reviews</Text>
          </View>
        </View>
      </View>

      <SectionLabel title="Trending near you" subtitle="Highly rated within 1 mi" />
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <TrendingTile image={sushiImage} name="Wasabi by Morimoto" meta="Japanese · $$$" rating="4.7" />
        <TrendingTile image={tacosImage} name="Tacos La Brea" meta="Mexican · $" rating="4.6" />
        <TrendingTile image={restaurantImage} name="Gemini750" meta="Italian · $$" rating="4.4" />
      </ScrollView>

      <SectionLabel title="New spots" subtitle="Just opened in your area" />
      <View style={styles.placeRows}>
        {places.map((place) => (
          <PlaceRow
            key={place.name}
            place={place}
            saved={savedVenueIds.has(place.venueId)}
            onSave={() => onSave({ venueId: place.venueId, name: place.name })}
          />
        ))}
      </View>

      <SectionLabel title="Most reviewed" subtitle="What everyone's talking about" />
      <View style={styles.grid}>
        {gridPlaces.map((place) => <GridPlace key={place.name} place={place} />)}
        <Pressable style={({ pressed }) => [styles.seeMore, pressed && styles.pressed]}>
          <View style={styles.plusCircle}><Text style={styles.plusText}>+</Text></View>
          <Text style={styles.seeMoreTitle}>See more</Text>
          <Text style={styles.seeMoreSubtitle}>12+ more spots</Text>
        </Pressable>
      </View>

      <SectionLabel title="Popular reviews" subtitle="What people are saying right now" />
      <View style={styles.reviewList}>
        <ReviewCard
          author="Cameron Williamson"
          avatar={avatarCameron}
          image={loungeImage}
          place="Gemini750 Restaurant"
          rating="4.5"
          text="The hand-cut tagliolini is unreal — go on a Tuesday for the chef's special. Came back twice this week already."
          time="2h ago"
        />
        <ReviewCard
          author="Devon Lane"
          avatar={avatarWade}
          image={cafeImage}
          place="Coffee Bar 760"
          rating="4.0"
          text="Tucked-away matcha spot with the smoothest pull I've had in months. Ask for the house oat milk."
          time="4h ago"
        />
        <ReviewCard
          author="Wade Warren"
          avatar={avatarKristin}
          image={restaurantImage}
          place="Joe's Shanghai Soup Dumpling Restaurant"
          rating="5.0"
          text="16 folds, perfect every time. Skip the line, sit at the bar, and order the pork and crab together."
          time="4h ago"
        />
      </View>

      <SectionLabel title="Popular reviewer" subtitle="Trusted voice in your neighborhood" />
      <TopReviewer />

      <SectionLabel title="For you" subtitle="Picked from your tastes & saves" />
      <ScrollView
        contentContainerStyle={styles.horizontalContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <ForYouCard image={restaurantImage} reason="Because you ❤️ Italian" place={places[0]} />
        <ForYouCard image={sushiImage} reason="Saved for date night" place={{ ...places[0], venueId: 'morimoto', name: 'Wasabi by Morimoto', rating: '4.7', reviews: '512' }} />
        <ForYouCard image={tacosImage} reason="Popular near you" place={places[2]} />
      </ScrollView>

      <SectionLabel title="Hidden gems" subtitle="High ratings, low review counts" />
      <View style={styles.gemList}>
        <HiddenGem place={places[2]} />
        <HiddenGem place={places[1]} />
      </View>
    </ScrollView>
  );
}

function PlacesMap({
  onOpenFavourites,
  onSave,
  savedVenueIds,
}: {
  onOpenFavourites: () => void;
  onSave: (place: SaveablePlace) => void;
  savedVenueIds: Set<string>;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const mapPlace: Place = {
    ...places[0],
    venueId: 'gemini-750',
    name: 'Gemini750 Restaurant',
    rating: '4.4',
    reviews: '389 reviews',
    image: loungeImage,
  };

  return (
    <View style={styles.mapScreen}>
      <Image source={mapImage} style={styles.mapImage} />
      <MapPin left="12%" top="12%" value="4.7" />
      <MapPin left="48%" top="16%" value="4.6" />
      <MapPin left="16%" top="48%" value="4.3" />
      <MapPin left="66%" top="50%" value="4.2" />
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
          {['🔥 Trending', '🍴 Restaurant', '☕ Cafe', '▽ Bar', '✓ My Reviews'].map((label) => (
            <Pressable key={label} style={styles.filterChip}>
              <Text style={styles.filterText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <PlaceRow
          onSave={() => onSave({ venueId: mapPlace.venueId, name: mapPlace.name })}
          place={mapPlace}
          saved={savedVenueIds.has(mapPlace.venueId)}
        />
      </View>
    </View>
  );
}

function PeopleFeed() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [following, setFollowing] = useState<Set<string>>(() => new Set());

  function toggleFollow(name: string) {
    setFollowing((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());

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

      <PeopleSectionHeader title="🔥 Trending tastemakers" subtitle="Gaining followers this week" />
      <ScrollView
        contentContainerStyle={styles.peopleCarousel}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {people.filter((person) => matches(person.name)).map((person) => (
          <TastemakerCard
            key={person.name}
            following={following.has(person.name)}
            onFollow={() => toggleFollow(person.name)}
            person={person}
          />
        ))}
      </ScrollView>

      <PeopleSectionHeader title="New on Tastes" subtitle="Just joined the community" />
      <View style={styles.compactPeople}>
        {[
          { ...people[1], name: 'Luke Cooper', tastes: 'Coffee · Brunch · joined Today' },
          { ...people[2], name: 'Brooklyn Simmons', tastes: 'Steak · Wine · joined 2d ago' },
          { ...people[0], name: 'Martin Baena', tastes: 'Vegan · Bakery · joined 3d ago' },
        ].filter((person) => matches(person.name)).map((person) => (
          <CompactPerson
            key={person.name}
            following={following.has(person.name)}
            onFollow={() => toggleFollow(person.name)}
            person={person}
          />
        ))}
      </View>

      <PeopleSectionHeader title="Similar to people you follow" subtitle="Based on mutual connections" />
      <View style={styles.profileList}>
        {people.slice(1).filter((person) => matches(person.name)).map((person, index) => (
          <ProfileSuggestion
            key={person.name}
            following={following.has(person.name)}
            index={index}
            onFollow={() => toggleFollow(person.name)}
            person={person}
          />
        ))}
      </View>
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

function TrendingTile({ image, meta, name, rating }: { image: ImageSourcePropType; meta: string; name: string; rating: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.trendingTile}>
      <Image source={image} style={styles.coverImage} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />
      <View style={styles.tileRating}><RatingPill value={rating} /></View>
      <View style={styles.tileCopy}>
        <Text numberOfLines={1} style={styles.tileTitle}>{name}</Text>
        <Text style={styles.tileMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function PlaceRow({ onSave, place, saved }: { onSave: () => void; place: Place; saved: boolean }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.placeRow}>
      <View>
        <Image source={place.image} style={styles.placeImage} />
        <View style={styles.newChip}><Text style={styles.newChipText}>NEW</Text></View>
      </View>
      <View style={styles.placeInfo}>
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
      </View>
      <Pressable accessibilityLabel={saved ? 'Remove from saved' : 'Save place'} hitSlop={8} onPress={onSave}>
        <BookmarkIcon color={saved ? colors.primary : colors.text} height={20} width={20} />
      </Pressable>
    </View>
  );
}

function GridPlace({ place }: { place: Place }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.gridCard}>
      <Image source={place.image} style={styles.gridImage} />
      <View style={styles.gridBody}>
        <Text numberOfLines={1} style={styles.gridTitle}>{place.name}</Text>
        <View style={styles.inlineMeta}>
          <RatingPill value={place.rating} />
          <Text style={styles.gridMeta}>{place.distance}</Text>
        </View>
      </View>
    </View>
  );
}

function ReviewCard({
  author,
  avatar,
  image,
  place,
  rating,
  text,
  time,
}: {
  author: string;
  avatar: ImageSourcePropType;
  image: ImageSourcePropType;
  place: string;
  rating: string;
  text: string;
  time: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.reviewCard}>
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
          <Text style={styles.reviewAction}>♥ 12</Text>
          <Text style={styles.reviewAction}>◯ 5</Text>
          <Text style={styles.reviewTime}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

function TopReviewer() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [following, setFollowing] = useState(false);
  return (
    <LinearGradient
      colors={['rgba(184,47,41,0.28)', colors.surface]}
      end={{ x: 1, y: 0 }}
      start={{ x: 0, y: 0 }}
      style={styles.reviewerCard}
    >
      <View style={styles.reviewerHead}>
        <View>
          <Image source={avatarKristin} style={styles.reviewerAvatar} />
          <View style={styles.reviewerBadge}><Text style={styles.reviewerBadgeText}>★</Text></View>
        </View>
        <View style={styles.reviewerCopy}>
          <Text style={styles.topReviewer}>★ Top reviewer</Text>
          <Text style={styles.reviewerName}>Kristin Watson</Text>
          <Text style={styles.reviewerHandle}>@kristinw</Text>
        </View>
      </View>
      <Text style={styles.reviewerMeta}>Tacos · BBQ · 87 reviews this month</Text>
      <View style={styles.reviewerButtons}>
        <Pressable onPress={() => setFollowing((value) => !value)} style={styles.followWide}>
          <Text style={styles.followWideText}>{following ? 'Following' : 'Follow'}</Text>
        </Pressable>
        <Pressable style={styles.profileButton}><Text style={styles.profileButtonText}>View profile</Text></Pressable>
      </View>
    </LinearGradient>
  );
}

function ForYouCard({ image, place, reason }: { image: ImageSourcePropType; place: Place; reason: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.forYouCard}>
      <Image source={image} style={styles.coverImage} />
      <LinearGradient colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.94)']} style={StyleSheet.absoluteFill} />
      <View style={styles.reasonChip}><Text style={styles.reasonText}>{reason}</Text></View>
      <View style={styles.forYouCopy}>
        <Text numberOfLines={2} style={styles.forYouTitle}>{place.name}</Text>
        <Text style={styles.forYouMeta}>{place.category} · {place.distance}</Text>
        <View style={styles.inlineMeta}><RatingPill value={place.rating} /><Text style={styles.imageMetaText}>{place.reviews}</Text></View>
      </View>
    </View>
  );
}

function HiddenGem({ place }: { place: Place }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.gemCard}>
      <Image source={place.image} style={styles.gemImage} />
      <View style={styles.gemCopy}>
        <View style={styles.gemTop}><Text style={styles.gemBadge}>💎 GEM</Text><Text style={styles.gemReviews}>only {place.reviews}</Text></View>
        <Text style={styles.gemName}>{place.name}</Text>
        <View style={styles.inlineMeta}><RatingPill value={place.rating} /><Text style={styles.gemMeta}>{place.category} · {place.price} · {place.distance}</Text></View>
      </View>
    </View>
  );
}

function MapPin({ left, top, value }: { left: `${number}%`; top: `${number}%`; value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.mapPin, { left, top }]}>
      <Text style={styles.mapPinText}>{value}</Text>
      <View style={styles.mapPinTip} />
    </View>
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

function FollowButton({ following, onPress }: { following: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} style={[styles.followButton, following && styles.followingButton]}>
      <Text style={[styles.followButtonText, following && styles.followingButtonText]}>{following ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

function TastemakerCard({
  following,
  onFollow,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  person: typeof people[number];
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <LinearGradient colors={['rgba(184,47,41,0.35)', colors.surface]} style={styles.tastemakerCard}>
      <Image source={person.image} style={styles.tastemakerAvatar} />
      <Text numberOfLines={1} style={styles.tastemakerName}>{person.name}</Text>
      <Text style={styles.tastemakerTastes}>{person.tastes}</Text>
      <Text style={styles.tastemakerGrowth}>{person.growth}</Text>
      <FollowButton following={following} onPress={onFollow} />
    </LinearGradient>
  );
}

function CompactPerson({
  following,
  onFollow,
  person,
}: {
  following: boolean;
  onFollow: () => void;
  person: typeof people[number];
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.compactPerson}>
      <Image source={person.image} style={styles.compactAvatar} />
      <View style={styles.compactCopy}>
        <View style={styles.newPersonRow}><Text style={styles.newPersonBadge}>NEW</Text><Text style={styles.compactName}>{person.name}</Text></View>
        <Text numberOfLines={1} style={styles.compactTastes}>{person.tastes}</Text>
      </View>
      <FollowButton following={following} onPress={onFollow} />
    </View>
  );
}

function ProfileSuggestion({
  following,
  index,
  onFollow,
  person,
}: {
  following: boolean;
  index: number;
  onFollow: () => void;
  person: typeof people[number];
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.profileSuggestion}>
      <View style={styles.suggestionHead}>
        <Image source={person.image} style={styles.suggestionAvatar} />
        <View style={styles.suggestionCopy}>
          <Text style={styles.suggestionName}>{index ? 'Jenny Wilson' : person.name}</Text>
          <Text style={styles.suggestionHandle}>{index ? '@jennyw' : person.handle}</Text>
          <Text style={styles.suggestionTastes}>{person.tastes}</Text>
        </View>
        <FollowButton following={following} onPress={onFollow} />
      </View>
      <View style={styles.statsRow}>
        {[index ? ['35', 'reviews'] : ['46', 'reviews'], index ? ['864', 'followers'] : ['1.2K', 'followers'], index ? ['212', 'following'] : ['189', 'following']].map(([value, label]) => (
          <View key={label} style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.mutualText}>👥 Followed by {index ? 2 : 3} people you follow</Text>
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
  seeMore: { width: '48.5%', height: 158, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 13, backgroundColor: 'rgba(184,47,41,0.08)', alignItems: 'center', justifyContent: 'center' },
  plusCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF4757', alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#FFFFFF', fontSize: 25, fontWeight: '600' },
  seeMoreTitle: { marginTop: 8, color: colors.text, fontSize: 16, fontWeight: '600' },
  seeMoreSubtitle: { marginTop: 8, color: colors.textSecondary, fontSize: 12 },
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
  filterText: { color: colors.textSecondary, fontSize: 12 },
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
