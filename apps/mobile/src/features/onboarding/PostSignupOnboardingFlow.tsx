import { createUserProfileInputSchema, type CompleteOnboardingInput } from '@tastes/contracts';
import { apiErrorMessage, createTastesApi } from '@tastes/firebase-client';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import addPhoto from '../../../assets/onboarding/add-photo.png';
import chevronRight from '../../../assets/onboarding/chevron-right.png';
import dishBurgers from '../../../assets/onboarding/dish-burgers.png';
import dishCurry from '../../../assets/onboarding/dish-curry.png';
import dishFish from '../../../assets/onboarding/dish-fish.png';
import dishPasta from '../../../assets/onboarding/dish-pasta.png';
import dishPizza from '../../../assets/onboarding/dish-pizza.png';
import dishRamen from '../../../assets/onboarding/dish-ramen.png';
import dishSalads from '../../../assets/onboarding/dish-salads.png';
import dishSteak from '../../../assets/onboarding/dish-steak.png';
import dishSushi from '../../../assets/onboarding/dish-sushi.png';
import dishTacos from '../../../assets/onboarding/dish-tacos.png';
import emptySearch from '../../../assets/onboarding/empty-search.png';
import filterBar from '../../../assets/onboarding/filter-bar.png';
import filterCafe from '../../../assets/onboarding/filter-cafe.png';
import filterFriends from '../../../assets/onboarding/filter-friends.png';
import filterRestaurant from '../../../assets/onboarding/filter-restaurant.png';
import filterReviews from '../../../assets/onboarding/filter-reviews.png';
import filterTrending from '../../../assets/onboarding/filter-trending.png';
import flagUk from '../../../assets/onboarding/flag-uk.png';
import inviteContacts from '../../../assets/onboarding/invite-contacts.png';
import inviteMessage from '../../../assets/onboarding/invite-message.png';
import invitePeople from '../../../assets/onboarding/invite-people.png';
import inviteShare from '../../../assets/onboarding/invite-share.png';
import permissionContacts from '../../../assets/onboarding/permission-contacts.png';
import permissionLocation from '../../../assets/onboarding/permission-location.png';
import permissionNotifications from '../../../assets/onboarding/permission-notifications.png';
import placeGemini from '../../../assets/onboarding/place-gemini.png';
import placeGeminiPopular from '../../../assets/onboarding/place-gemini-popular.png';
import placeSelected from '../../../assets/onboarding/place-selected.png';
import placeUnselected from '../../../assets/onboarding/place-unselected.png';
import placeWasabi from '../../../assets/onboarding/place-wasabi.png';
import PlaceSearchIcon from '../../../assets/onboarding/place-search.svg';
import PlaceTuningIcon from '../../../assets/onboarding/place-tuning.svg';
import ratingStar from '../../../assets/onboarding/rating-star.png';
import readyCollage from '../../../assets/onboarding/ready-collage.png';
import searchClose from '../../../assets/onboarding/search-close.png';
import startRating from '../../../assets/onboarding/start-rating.png';
import styleDark from '../../../assets/onboarding/style-dark.png';
import styleLight from '../../../assets/onboarding/style-light.png';
import styleSelected from '../../../assets/onboarding/style-selected.png';
import styleUnselected from '../../../assets/onboarding/style-unselected.png';
import { auth, functions, storage } from '../../infrastructure/firebase';
import { syncPushNotifications } from '../../infrastructure/pushNotifications';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { CityPicker, countryFlags } from './CityPicker';
import { buildCompletionInput } from './completion-input';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';

type Screen =
  | 'profile'
  | 'city'
  | 'dish'
  | 'location'
  | 'locationDenied'
  | 'place'
  | 'style'
  | 'contactsPermission'
  | 'invite'
  | 'contacts'
  | 'notifications'
  | 'ready';

interface PostSignupOnboardingFlowProps {
  onAuthenticationRequired: () => Promise<void>;
  onComplete: (input?: Partial<Omit<CompleteOnboardingInput, 'version'>>) => Promise<void>;
}

function isUnauthenticated(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'functions/unauthenticated'
    || code === 'unauthenticated'
    || message === 'Authentication is required.';
}

interface ContactCandidate {
  id: string;
  name: string;
  handle: string;
  phoneNumber: string | null;
  invited: boolean;
  userId?: string;
  following?: boolean;
}

const dishes = [
  { label: 'Burgers', icon: dishBurgers },
  { label: 'Pasta', icon: dishPasta },
  { label: 'Pizza', icon: dishPizza },
  { label: 'Sushi', icon: dishSushi },
  { label: 'Tacos', icon: dishTacos },
  { label: 'Salads', icon: dishSalads },
  { label: 'Ramen', icon: dishRamen },
  { label: 'Steak', icon: dishSteak },
  { label: 'Fish', icon: dishFish },
  { label: 'Curry', icon: dishCurry },
] as const;
const placeFilters = [
  { icon: filterTrending, label: 'Trending' },
  { icon: filterRestaurant, label: 'Restaurant' },
  { icon: filterCafe, label: 'Cafe' },
  { icon: filterBar, label: 'Bar' },
  { icon: filterReviews, label: 'My Reviews' },
] as const;
type PlaceCandidate = {
  id: string;
  name: string;
  address: string;
  image: ImageSourcePropType;
  rating: string;
  reviews: string;
  popular: boolean;
  category: string;
  price: string;
  distance: string;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function slug(name: string) {
  return `@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}`;
}

function useOnboardingStyles() {
  const { colors, isDark } = useAppTheme();
  return useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}

function Header({ onBack, onSkip }: { onBack: () => void; onSkip?: () => void }) {
  const styles = useOnboardingStyles();
  return <><BackButton onPress={onBack} />{onSkip ? <Pressable onPress={onSkip} style={styles.skip}><Text style={styles.skipText}>Skip</Text></Pressable> : null}</>;
}

function StepDots({ step }: { step: number }) {
  const styles = useOnboardingStyles();
  return <View style={styles.stepDots}>
    {[1, 2, 3].map((index) => (
      <View key={index} style={index === step ? styles.stepDotActive : styles.stepDotInactive} />
    ))}
  </View>;
}

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  const styles = useOnboardingStyles();
  return <View style={styles.stepHeader}>
    <View style={styles.stepRow}><Text style={styles.stepLabel}>Step {step}</Text><StepDots step={step} /></View>
    <Text style={[styles.title, styles.stepTitle]}>{title}</Text>
    <Text style={[styles.subtitle, styles.stepSubtitle]}>{subtitle}</Text>
  </View>;
}

function PermissionScreen({ icon, title, subtitle, button, onBack, onSkip, onPress }: {
  icon: ImageSourcePropType; title: string; subtitle: string; button: string; onBack: () => void; onSkip: () => void; onPress: () => void;
}) {
  const styles = useOnboardingStyles();
  return <PatternScreen>
    <Header onBack={onBack} onSkip={onSkip} />
    <View style={styles.permissionContent}>
      <Image source={icon} style={styles.permissionIcon} />
      <Text style={[styles.title, styles.permissionTitle]}>{title}</Text>
      <Text style={[styles.subtitle, styles.permissionSubtitle, styles.permissionBodyText]}>{subtitle}</Text>
    </View>
    <PrimaryButton label={button} onPress={onPress} style={styles.bottomButton} />
  </PatternScreen>;
}

export function PostSignupOnboardingFlow({
  onAuthenticationRequired,
  onComplete,
}: PostSignupOnboardingFlowProps) {
  const { colors, preference, resolvedTheme, setPreference } = useAppTheme();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const styles = useOnboardingStyles();
  const collageWidth = Math.max(0, Math.min(402, viewportWidth));
  const collageScale = collageWidth / 402;
  const collageHeight = 288 * collageScale;
  const usesCompactDishLayout = viewportHeight < 840 || viewportWidth < 360;
  const dishGap = usesCompactDishLayout ? 5 : 8;
  const dishPanelHeight = viewportHeight - (usesCompactDishLayout ? 205 : 212) - (usesCompactDishLayout ? 105 : 110);
  const dishPillHeight = Math.max(30, Math.min(45, Math.floor((dishPanelHeight - 8 - dishGap * (dishes.length - 1)) / dishes.length)));
  const usesNarrowPlaceLayout = viewportWidth < 360;
  const api = useMemo(() => createTastesApi(functions), []);
  const [screen, setScreen] = useState<Screen>('profile');
  const [history, setHistory] = useState<Screen[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('London');
  const [cityFlag, setCityFlag] = useState<ImageSourcePropType>(flagUk);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [dish, setDish] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeFilterSet, setPlaceFilterSet] = useState<Set<string>>(new Set(['trending']));
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [availablePlaces, setAvailablePlaces] = useState<PlaceCandidate[]>([]);
  const [darkMode, setDarkMode] = useState(resolvedTheme === 'dark');
  const [automatic, setAutomatic] = useState(preference === 'system');
  const [contacts, setContacts] = useState<ContactCandidate[]>([]);
  const [busy, setBusy] = useState(false);

  function togglePlaceFilter(label: string) {
    const key = label.toLowerCase();
    setPlaceFilterSet((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function navigate(next: Screen) {
    setHistory((items) => [...items, screen]);
    setScreen(next);
  }

  function back() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setScreen(previous);
  }

  async function choosePhoto(camera: boolean) {
    setPhotoSheet(false);
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo library'} access to add a profile photo.`);
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function saveProfile() {
    if (displayName.trim().length < 2 || username.trim().length < 2) {
      Alert.alert('Complete your profile', 'Add your name and username to continue.');
      return;
    }
    const input = {
      displayName: displayName.trim(),
      username: username.trim(),
      city,
    };
    const validation = createUserProfileInputSchema.safeParse(input);
    if (!validation.success) {
      Alert.alert('Check your profile', validation.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      let photoPath: string | undefined;
      if (photoUri && auth.currentUser) {
        photoPath = `profile-images/${auth.currentUser.uid}/avatar.jpg`;
        const response = await fetch(photoUri);
        const blob = await response.blob();
        await uploadBytes(storageRef(storage, photoPath), blob, { contentType: blob.type || 'image/jpeg' });
      }
      await api.createUserProfile({
        ...validation.data,
        ...(photoPath ? { photoPath } : {}),
      });
      navigate('dish');
    } catch (error) {
      if (isUnauthenticated(error)) {
        await onAuthenticationRequired();
        return;
      }
      Alert.alert('Could not save profile', apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestLocation() {
    const result = await Location.requestForegroundPermissionsAsync();
    if (!result.granted) {
      navigate('locationDenied');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      if (address?.city) setCity(address.city);
      if (address?.isoCountryCode) {
        const flag = countryFlags[address.isoCountryCode.toUpperCase()];
        if (flag) setCityFlag(flag);
      }
    } catch {
      // Permission is enough to continue; city can still be selected manually.
    }
    enterPlaces();
  }

  function enterPlaces() {
    navigate('place');
    setPlaceLoading(true);
    setPlaceError(null);
    void api.getVenues({ limit: 20 }).then((response) => {
      const mapped = response.data.items.map((venue, index): PlaceCandidate => ({
        id: venue.id,
        name: venue.name,
        address: venue.address ?? venue.city,
        image: venue.imageUrl ? { uri: venue.imageUrl } : [placeGeminiPopular, placeWasabi, placeGemini][index % 3]!,
        rating: (venue.rating ?? 0).toFixed(1),
        reviews: `${venue.reviewCount ?? 0} reviews`,
        popular: venue.discoverTags?.includes('trending') ?? false,
        category: venue.category ?? 'Restaurant',
        price: '$'.repeat(venue.priceLevel ?? 2),
        distance: `${(venue.distanceKm ?? 0).toFixed(1)} km`,
      }));
      setAvailablePlaces(mapped);
    }).catch((error) => setPlaceError(apiErrorMessage(error))).finally(() => setPlaceLoading(false));
  }

  async function requestContacts() {
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status === 'granted') {
      const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails] });
      const mapped = result.data.filter((item) => item.name).slice(0, 20).map((item) => ({
        id: item.id,
        name: item.name,
        handle: slug(item.name),
        phoneNumber: item.phoneNumbers?.[0]?.number ?? null,
        invited: false,
      }));
      const phoneNumbers = result.data.flatMap((item) => item.phoneNumbers ?? []).flatMap((phone) => {
        const normalized = phone.number?.replace(/[\s()-]/g, '') ?? '';
        return /^\+[1-9]\d{7,14}$/.test(normalized) ? [normalized] : [];
      });
      const emails = result.data.flatMap((item) => item.emails ?? []).flatMap((email) => email.email ? [email.email] : []);
      let matches: ContactCandidate[] = [];
      if (phoneNumbers.length || emails.length) {
        try {
          const response = await api.importContacts({ phoneNumbers, emails });
          matches = response.data.matches.map((match) => ({
            id: `tastes-${match.userId}`,
            name: match.displayName,
            handle: match.username ? `@${match.username}` : 'Already on Tastes',
            phoneNumber: null,
            invited: match.following,
            userId: match.userId,
            following: match.following,
          }));
        } catch (error) {
          Alert.alert('Friend matching is unavailable', apiErrorMessage(error));
        }
      }
      setContacts([...matches, ...mapped]);
      navigate('contacts');
      return;
    }
    navigate('invite');
  }

  async function requestNotifications() {
    try {
      await syncPushNotifications(api, { requestPermission: true });
    } catch (error) {
      Alert.alert('Could not enable notifications', apiErrorMessage(error));
    } finally {
      navigate('ready');
    }
  }

  async function shareInvite() {
    await Share.share({ message: 'Join me on Tastes: https://tastes.app/invite' });
  }

  async function textInvite(phoneNumber?: string | null) {
    const message = encodeURIComponent('Join me on Tastes: https://tastes.app/invite');
    const separator = Platform.OS === 'ios' ? '&' : '?';
    await Linking.openURL(`sms:${phoneNumber ?? ''}${separator}body=${message}`);
  }

  async function inviteContact(contact: ContactCandidate) {
    try {
      if (contact.userId) await api.followUser({ targetUserId: contact.userId });
      else if (contact.phoneNumber) await textInvite(contact.phoneNumber);
      else await shareInvite();
      setContacts((items) => items.map((item) => item.id === contact.id ? { ...item, invited: true } : item));
    } catch (error) {
      Alert.alert('Could not open invite', apiErrorMessage(error));
    }
  }

  async function finishOnboarding() {
    setBusy(true);
    try {
      await setPreference(automatic ? 'system' : (darkMode ? 'dark' : 'light'));
      await onComplete(buildCompletionInput({
        dish,
        place,
        invitedContactCount: invitedCount,
        appearance: automatic ? 'system' : (darkMode ? 'dark' : 'light'),
      }));
    } catch (error) {
      if (isUnauthenticated(error)) {
        await onAuthenticationRequired();
        return;
      }
      Alert.alert('Could not finish onboarding', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  const commonSubtitle = 'Can be changed later in Settings';
  const invitedCount = contacts.filter((item) => item.invited).length;

  if (screen === 'city') {
    return <PatternScreen>
      <Header onBack={back} />
      <CityPicker onSelect={(name, flag) => { setCity(name); setCityFlag(flag); back(); }} />
    </PatternScreen>;
  }

  if (screen === 'profile') {
    return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileKeyboardAvoiding}>
      <PatternScreen>
        <View style={styles.profileKeyboardLayout}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.profilePage}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.profileScroll}
          >
            <Text style={styles.title}>Create your profile</Text>
            <Text style={[styles.subtitle, styles.profileSubtitle]}>Choose a username and add a photo so others can recognize you</Text>
            <Pressable accessibilityLabel="Add profile photo" onPress={() => setPhotoSheet(true)} style={styles.photo}>
              {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoImage} /> : <Image source={addPhoto} style={styles.addPhotoIcon} />}
            </Pressable>
            <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your Name" placeholderTextColor={colors.placeholder} style={styles.field} />
            <TextInput value={username} autoCapitalize="none" onChangeText={setUsername} placeholder="Username" placeholderTextColor={colors.placeholder} style={styles.field} />
            <Pressable onPress={() => navigate('city')} style={styles.fieldRow}><Text style={styles.locationLabel}>Location</Text><View style={styles.locationSelection}><Text style={styles.locationValue}>{city}</Text><Image source={cityFlag} style={styles.locationFlag} /><Image source={chevronRight} style={styles.locationChevron} /></View></Pressable>
          </ScrollView>
          <View style={styles.profileButtonArea}>
            <PrimaryButton label="Continue" loading={busy} onPress={saveProfile} />
          </View>
        </View>
        <Modal animationType="slide" transparent visible={photoSheet} onRequestClose={() => setPhotoSheet(false)}>
          <Pressable onPress={() => setPhotoSheet(false)} style={styles.modalBackdrop}>
            <View style={styles.sheetWrap}>
              <View style={styles.sheet}>
                <Pressable onPress={() => choosePhoto(true)} style={styles.sheetAction}><Text style={styles.sheetText}>Take Photo</Text></Pressable>
                <Pressable onPress={() => choosePhoto(false)} style={styles.sheetAction}><Text style={styles.sheetText}>Choose from Library</Text></Pressable>
                <Pressable onPress={() => { setPhotoUri(null); setPhotoSheet(false); }} style={styles.sheetAction}><Text style={styles.destructive}>Remove Photo</Text></Pressable>
              </View>
              <Pressable onPress={() => setPhotoSheet(false)} style={[styles.sheet, styles.cancel]}><Text style={styles.sheetText}>Cancel</Text></Pressable>
            </View>
          </Pressable>
        </Modal>
      </PatternScreen>
    </KeyboardAvoidingView>;
  }

  if (screen === 'dish') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('location')} />
      <StepHeader step={1} title="Your favourite dish!" subtitle={commonSubtitle} />
      <View
        style={[
          styles.pillsPanel,
          usesCompactDishLayout && styles.pillsPanelCompact,
          styles.pills,
          { gap: dishGap },
        ]}
      >
        {dishes.map((item) => <Pressable key={item.label} onPress={() => setDish(item.label)} style={[styles.pill, { height: dishPillHeight }, dish === item.label && styles.pillSelected]}><View style={styles.pillContent}><Text style={[styles.pillText, dish === item.label && styles.pillTextSelected]}>{item.label}</Text><Image source={item.icon} style={[styles.dishIcon, dish !== item.label && styles.dishIconDimmed]} /></View></Pressable>)}
      </View>
      {!dish ? <Text style={styles.helper}>Select at least one to continue</Text> : null}
      <PrimaryButton label="Continue" disabled={!dish} onPress={() => navigate('location')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'location') return <PermissionScreen icon={permissionLocation} title="Discover places near you" subtitle="Allow location access so Tastes can show the best spots around you." button="Allow Location" onBack={back} onSkip={enterPlaces} onPress={requestLocation} />;
  if (screen === 'locationDenied') return <PermissionScreen icon={permissionLocation} title="Location is off" subtitle="Turn on location in Settings to discover places and friends near you." button="Open Settings" onBack={back} onSkip={enterPlaces} onPress={() => Linking.openSettings()} />;

  if (screen === 'place') {
    const normalizedPlaceQuery = placeQuery.trim().toLowerCase();
    const filteredPlaces = availablePlaces.filter((candidate) => {
      const queryMatches = !normalizedPlaceQuery
        || candidate.name.toLowerCase().includes(normalizedPlaceQuery)
        || candidate.category?.toLowerCase().includes(normalizedPlaceQuery);
      const categoryFilters = [...placeFilterSet].filter((value) => !['trending', 'friends', 'my reviews'].includes(value));
      const categoryMatches = categoryFilters.length === 0 || categoryFilters.some((value) => candidate.category?.toLowerCase().includes(value));
      const trendingMatches = !placeFilterSet.has('trending') || candidate.popular;
      return queryMatches && categoryMatches && trendingMatches;
    });
    const noResults = !placeLoading && filteredPlaces.length === 0;
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('style')} />
      <StepHeader step={2} title="Choose your favourite place" subtitle={commonSubtitle} />
      <View style={[styles.placesCard, usesNarrowPlaceLayout && styles.placesCardNarrow]}>
        <View style={styles.placeHeader}>
          <View style={styles.placeSearchRow}>
            <View style={styles.placeSearch}>
              <PlaceSearchIcon color={colors.text} style={styles.placeSearchIcon} />
              <TextInput value={placeQuery} onChangeText={setPlaceQuery} placeholder="Search places" placeholderTextColor={colors.placeholder} style={styles.placeSearchInput} />
              {placeQuery.length > 0 ? <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setPlaceQuery('')} style={styles.placeClear}><Image source={searchClose} style={styles.placeClearIcon} /></Pressable> : <View style={styles.placeClearSpacer} />}
            </View>
            <Pressable accessibilityLabel="Toggle place filters" accessibilityRole="button" onPress={() => setFiltersExpanded((value) => !value)}>
              <PlaceTuningIcon color={colors.text} style={styles.tuningIcon} />
            </Pressable>
          </View>
          {filtersExpanded ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {placeFilters.map(({ icon, label }) => {
              const active = placeFilterSet.has(label.toLowerCase());
              return <Pressable accessibilityRole="button" key={label} onPress={() => togglePlaceFilter(label)} style={[styles.filter, active && styles.filterActive]}>
                <Image source={icon} style={[styles.filterIcon, !active && styles.filterDimmed]} />
                <Text style={[styles.filterText, !active && styles.filterDimmed]}>{label}</Text>
              </Pressable>;
            })}
            <Pressable accessibilityRole="button" onPress={() => togglePlaceFilter('Friends')} style={[styles.filter, placeFilterSet.has('friends') && styles.filterActive]}>
              <Image source={filterFriends} style={[styles.filterIcon, !placeFilterSet.has('friends') && styles.filterDimmed]} />
              <Text style={[styles.filterText, !placeFilterSet.has('friends') && styles.filterDimmed]}>Friends</Text>
            </Pressable>
          </ScrollView> : null}
        </View>
        {placeLoading ? (
          <ScrollView contentContainerStyle={styles.placeListContent} style={styles.placeList} showsVerticalScrollIndicator={false}>
            {[1, 2, 3].map((item) => (
              <View key={item} style={styles.venue}>
                <View style={styles.venueMainRow}>
                  <View style={styles.skeletonImage} />
                  <View style={styles.skeletonCopy}>
                    <View style={styles.skeletonTitle} />
                    <View style={styles.skeletonLine} />
                    <View style={styles.skeletonShort} />
                  </View>
                </View>
                <View style={styles.skeletonTags} />
              </View>
            ))}
          </ScrollView>
        ) : placeError ? (
          <View style={styles.empty}><Image source={emptySearch} style={styles.emptyIcon} /><Text style={styles.emptyTitle}>Couldn’t load places</Text><Text style={styles.emptyText}>{placeError}</Text><Pressable onPress={enterPlaces}><Text style={styles.retryText}>Try again</Text></Pressable></View>
        ) : noResults ? (
          <View style={styles.empty}><Image source={emptySearch} style={styles.emptyIcon} /><Text style={styles.emptyTitle}>No places found</Text><Text style={styles.emptyText}>Try a different search or clear a filter.</Text></View>
        ) : (
          <ScrollView contentContainerStyle={styles.placeListContent} style={styles.placeList} showsVerticalScrollIndicator={false}>
            {filteredPlaces.map((item) => {
              const selected = place === item.id;
              return (
                <Pressable key={item.id} onPress={() => setPlace(item.id)} style={[styles.venue, selected && styles.venueSelected]}>
                  <Image source={selected ? placeSelected : placeUnselected} style={styles.venueSelection} />
                  <View style={styles.venueMainRow}>
                    <View style={styles.venueImageWrap}>
                      <Image source={item.image} resizeMode="cover" style={styles.venueImage} />
                      {item.popular ? <View style={styles.popularBadge}><Text style={styles.popularText}>Popular</Text></View> : null}
                    </View>
                    <View style={styles.venueCopy}>
                      <View style={styles.venueDetails}>
                        <Text numberOfLines={1} style={styles.venueTitle}>{item.name}</Text>
                        <Text numberOfLines={2} style={styles.venueAddress}>{item.address}</Text>
                        <View style={styles.ratingRow}><View style={styles.ratingTag}><Image source={ratingStar} style={styles.ratingStar} /><Text style={styles.ratingValue}>{item.rating}</Text></View><Text numberOfLines={1} style={styles.reviews}>{item.reviews}</Text></View>
                      </View>
                    </View>
                  </View>
                  <View style={styles.venueTagsRow}><View style={styles.venueTag}><Text numberOfLines={1} style={styles.venueTagText}>{item.category}</Text></View><View style={styles.venueTag}><Text numberOfLines={1} style={styles.venueTagText}>{item.price}</Text></View><View style={styles.venueTag}><Text numberOfLines={1} style={styles.venueTagText}>{item.distance}</Text></View></View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={resolvedTheme === 'dark'
          ? ['rgba(8,8,8,0)', colors.surface, colors.surface]
          : ['rgba(242,239,234,0)', colors.surface, colors.surface]}
        locations={[0, 0.58, 1]}
        style={styles.placeFooterGradient}
      />
      <PrimaryButton label="Continue" disabled={!place} onPress={() => navigate('style')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'style') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('contactsPermission')} />
      <StepHeader step={3} title="Choose Your Style" subtitle="Switch between dark and light mode anytime" />
      <View style={styles.styleCard}>
        <View style={styles.previews}>
          {[false, true].map((dark) => <Pressable key={String(dark)} onPress={() => {
            setDarkMode(dark);
            setAutomatic(false);
            void setPreference(dark ? 'dark' : 'light');
          }} style={styles.previewChoice}>
            <View style={[styles.phonePreview, dark ? styles.previewDark : styles.previewLight]}><Image source={dark ? styleDark : styleLight} resizeMode="cover" style={styles.phonePreviewImage} /></View>
            <Text style={styles.previewLabel}>{dark ? 'Dark' : 'Light'}</Text><Image source={(automatic ? resolvedTheme === 'dark' : darkMode) === dark ? styleSelected : styleUnselected} style={styles.styleSelection} />
          </Pressable>)}
        </View>
        <View style={styles.automaticRow}><Text style={styles.automaticText}>Automatic</Text><Switch value={automatic} onValueChange={(value) => {
          setAutomatic(value);
          const currentIsDark = resolvedTheme === 'dark';
          setDarkMode(currentIsDark);
          void setPreference(value ? 'system' : (currentIsDark ? 'dark' : 'light'));
        }} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.switchThumb} /></View>
      </View>
      <PrimaryButton label="Continue" onPress={() => navigate('contactsPermission')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'contactsPermission') return <PermissionScreen icon={permissionContacts} title="Find your friends" subtitle="Connect your contacts to find people you know already on Tastes." button="Allow Contacts" onBack={back} onSkip={() => navigate('invite')} onPress={requestContacts} />;

  if (screen === 'contacts') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('invite')} />
      <View style={styles.listPage}><Text style={styles.listTitle}>Friends from contacts</Text><Text style={styles.listSubtitle}>Follow people already on Tastes or invite the rest.</Text>
        <ScrollView>{contacts.map((contact, index) => <View key={contact.id} style={styles.contactRow}>
          <View style={[styles.avatar, { backgroundColor: ['#263854', '#24504c', '#4b315d', '#5a4427', '#2f5438'][index % 5] }]}><Text style={styles.avatarText}>{initials(contact.name)}</Text></View>
          <View style={styles.contactCopy}><Text style={styles.contactName}>{contact.name}</Text><Text style={styles.contactHandle}>{contact.handle}</Text></View>
          <Pressable onPress={() => inviteContact(contact)} disabled={contact.invited} style={[styles.inviteButton, contact.invited && styles.invitedButton]}><Text style={styles.inviteText}>{contact.userId ? contact.invited ? 'Following' : 'Follow' : contact.invited ? 'Invited' : 'Invite'}</Text></Pressable>
        </View>)}</ScrollView>
      </View><PrimaryButton label="Done" onPress={() => navigate('invite')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'invite') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('notifications')} />
      <View style={styles.invitePage}><Image source={invitePeople} style={styles.peopleIcon} /><Text style={styles.title}>Invite your friends</Text><Text style={[styles.subtitle, styles.permissionSubtitle]}>Add 3 friends and see their ratings and recommendations</Text>
        {invitedCount ? <><Text style={styles.progressText}>{Math.min(invitedCount, 3)} of 3 friends invited</Text><View style={styles.progressDots}>{[0, 1, 2].map((index) => <View key={index} style={[styles.progressDot, index < Math.min(invitedCount, 3) && styles.progressDotActive]} />)}</View></> : null}
        <View style={styles.inviteActions}><Pressable onPress={shareInvite} style={styles.actionRow}><Image source={inviteShare} style={styles.actionIcon} /><Text style={styles.actionText}>Share your invite link</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable><Pressable onPress={() => textInvite()} style={styles.actionRow}><Image source={inviteMessage} style={styles.actionIcon} /><Text style={styles.actionText}>Invite friend via text</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable><Pressable onPress={requestContacts} style={styles.actionRow}><Image source={inviteContacts} style={styles.actionIcon} /><Text style={styles.actionText}>Invite from your contacts</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable></View>
      </View><PrimaryButton label="Continue" onPress={() => navigate('notifications')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'notifications') return <PermissionScreen icon={permissionNotifications} title="Stay in the loop" subtitle="Get notified when friends post, invite you, or react to your reviews." button="Turn on Notifications" onBack={back} onSkip={() => navigate('ready')} onPress={requestNotifications} />;

  return <LinearGradient colors={resolvedTheme === 'dark' ? ['#560E0B', '#080808'] : ['#F7E8E4', colors.canvas]} style={styles.ready}>
    <View style={styles.readyContent}>
      <Image source={readyCollage} resizeMode="contain" style={{ height: collageHeight, width: collageWidth }} />
      <View style={styles.readyCopy}><Text style={styles.readyTitle}>You’re ready!</Text><Text style={styles.readySubtitle}>Write your first 3 reviews to unlock personalized recommendations</Text></View>
      <PrimaryButton contentGap={8} icon={startRating} iconSize={24} label="Start rating" loading={busy} onPress={finishOnboarding} style={styles.readyButton} />
    </View>
  </LinearGradient>;
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  skip: { position: 'absolute', top: 58, right: 16, zIndex: 3, padding: 8 },
  skipText: { color: colors.textMuted, fontSize: 14 },
  title: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bottomButton: { position: 'absolute', left: 36, right: 36, bottom: Platform.OS === 'ios' ? 24 : 18 },
  stepHeader: { position: 'absolute', top: 118, left: 16, right: 16, alignItems: 'center' },
  stepRow: { height: 17, flexDirection: 'row', gap: 7, alignItems: 'center' },
  stepLabel: { color: colors.text, fontSize: 14, lineHeight: 17, fontWeight: '400', letterSpacing: 0.6 },
  stepDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDotActive: { width: 20, height: 6, borderRadius: 3, backgroundColor: colors.text },
  stepDotInactive: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted, opacity: 0.5 },
  stepTitle: { marginTop: 7, fontSize: 24, lineHeight: 29, letterSpacing: 0.6 },
  stepSubtitle: { marginTop: 7, fontSize: 15, lineHeight: 18, letterSpacing: -0.41, color: colors.textSecondary },
  permissionContent: { position: 'absolute', top: 132, left: 26, right: 26, alignItems: 'center' },
  permissionIcon: { width: 60, height: 60, marginBottom: 25, tintColor: colors.text },
  permissionTitle: { fontSize: 24, lineHeight: 29 },
  permissionSubtitle: { width: '100%', marginTop: 7, fontSize: 15, lineHeight: 18, textAlign: 'center' },
  permissionBodyText: { color: colors.textMuted },
  profileKeyboardAvoiding: { flex: 1 },
  profileKeyboardLayout: { flex: 1 },
  profileScroll: { flex: 1 },
  profilePage: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 126, paddingBottom: 16, alignItems: 'center' },
  profileButtonArea: { paddingHorizontal: 36, paddingBottom: Platform.OS === 'ios' ? 24 : 18 },
  profileSubtitle: { marginTop: 8, width: 285 },
  photo: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.border, marginTop: 22, marginBottom: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  photoImage: { width: '100%', height: '100%', borderRadius: 59 },
  addPhotoIcon: { width: 28, height: 28 },
  field: { width: '100%', height: 53, borderBottomWidth: 1, borderBottomColor: colors.hairline, color: colors.text, fontSize: 15, paddingHorizontal: 4 },
  fieldRow: { width: '100%', height: 53, borderBottomWidth: 1, borderBottomColor: colors.hairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  locationLabel: { color: colors.placeholder, fontSize: 15 },
  locationValue: { color: colors.textMuted, fontSize: 15 },
  locationSelection: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationFlag: { width: 18, height: 18 },
  locationChevron: { width: 8, height: 16, marginLeft: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 18 },
  sheetWrap: { gap: 9 },
  sheet: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  sheetAction: { height: 56, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  sheetText: { color: colors.text, fontSize: 16 },
  destructive: { color: '#e34840', fontSize: 16 },
  cancel: { height: 56, alignItems: 'center', justifyContent: 'center' },
  listPage: { flex: 1, paddingTop: 126, paddingHorizontal: 16, paddingBottom: 90 },
  listTitle: { color: colors.text, fontSize: 23, lineHeight: 28, fontWeight: '700', marginBottom: 14 },
  listSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: -7, marginBottom: 16 },
  search: { height: 44, borderRadius: 10, backgroundColor: colors.surfaceRaised, paddingHorizontal: 14, color: colors.text, fontSize: 14 },
  cityRow: { height: 49, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline, flexDirection: 'row', alignItems: 'center' },
  cityFlag: { width: 20, height: 20, marginRight: 14 },
  cityName: { color: colors.text, fontSize: 15, flex: 1 },
  cityCountry: { color: colors.textMuted, fontSize: 13 },
  pillsPanel: { position: 'absolute', top: 212, left: 0, right: 0, bottom: 110 },
  pillsPanelCompact: { top: 205, bottom: 105 },
  pills: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  pill: { height: 45, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pillSelected: { backgroundColor: colors.primary },
  pillText: { color: colors.textMuted, fontSize: 15, fontWeight: '400' },
  pillTextSelected: { color: colors.onPrimary },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dishIcon: { width: 18, height: 18 },
  dishIconDimmed: { opacity: 0.5 },
  helper: { position: 'absolute', bottom: 90, alignSelf: 'center', color: colors.textMuted, fontSize: 12 },
  placesCard: { position: 'absolute', top: 212, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  placesCardNarrow: { top: 241 },
  placeHeader: { height: 105, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 16, gap: 12, backgroundColor: colors.canvas },
  placeSearchRow: { height: 39, flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeSearch: { flex: 1, height: 39, borderRadius: 22, paddingLeft: 10, paddingRight: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised },
  placeSearchIcon: { width: 24, height: 24 },
  placeSearchInput: { flex: 1, height: 39, paddingHorizontal: 8, paddingVertical: 0, color: colors.text, fontSize: 16 },
  placeClear: { width: 24, height: 24 },
  placeClearIcon: { width: 24, height: 24, opacity: 0.8 },
  placeClearSpacer: { width: 24, height: 24 },
  tuningIcon: { width: 24, height: 24 },
  filters: { height: 28, gap: 6 },
  filter: { height: 28, borderRadius: 14, paddingHorizontal: 8, gap: 3, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.surfaceRaised },
  filterIcon: { width: 14, height: 14 },
  filterText: { color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '500', letterSpacing: -0.23 },
  filterDimmed: { opacity: 0.5 },
  placeList: { flex: 1 },
  placeListContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 110, gap: 12 },
  venue: { minHeight: 167, padding: 12, gap: 12, borderWidth: 1, borderColor: isDark ? '#2A2A2A' : colors.border, borderRadius: 16, backgroundColor: isDark ? '#1A1A1A' : colors.surface },
  venueSelected: { borderColor: isDark ? '#2A2A2A' : colors.border, backgroundColor: isDark ? '#222222' : colors.surfaceRaised },
  venueSelection: { position: 'absolute', zIndex: 2, top: 9, right: 9, width: 22, height: 22 },
  venueMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  venueImageWrap: { position: 'relative', width: 86, height: 86, borderRadius: 12, overflow: 'hidden' },
  venueImage: { width: 86, height: 86, borderRadius: 12 },
  popularBadge: { position: 'absolute', top: 6, left: 6, height: 18, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  popularText: { color: colors.onPrimary, fontSize: 12, letterSpacing: -0.24 },
  venueCopy: { flex: 1, minWidth: 0 },
  venueDetails: { gap: 6, paddingRight: 24 },
  venueTitle: { color: colors.text, fontSize: 14, fontWeight: '600', letterSpacing: -0.41 },
  venueAddress: { minHeight: 30, color: colors.textMuted, fontSize: 13, lineHeight: 15, letterSpacing: -0.24 },
  ratingRow: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 9 },
  ratingTag: { height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { width: 14, height: 14 },
  ratingValue: { color: colors.onPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.23 },
  reviews: { color: colors.textMuted, fontSize: 14, letterSpacing: -0.24 },
  venueTagsRow: { height: 33, flexDirection: 'row', alignItems: 'center', gap: 7 },
  venueTag: { height: 33, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? colors.surfaceMuted : colors.background, alignItems: 'center', justifyContent: 'center' },
  venueTagContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueTagText: { color: colors.text, fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  venueFlag: { width: 14, height: 14, transform: [{ translateY: -1 }] },
  skeletonImage: { width: 86, height: 86, borderRadius: 12, backgroundColor: colors.skeletonMuted },
  skeletonCopy: { flex: 1, minWidth: 0, gap: 12 },
  skeletonTitle: { width: '72%', height: 14, backgroundColor: colors.skeleton, borderRadius: 4 },
  skeletonLine: { width: '94%', height: 24, backgroundColor: colors.skeletonMuted, borderRadius: 4 },
  skeletonShort: { width: '52%', height: 28, backgroundColor: colors.skeletonMuted, borderRadius: 14 },
  skeletonTags: { width: '100%', height: 33, backgroundColor: colors.skeletonMuted, borderRadius: 17 },
  placeFooterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 94 },
  empty: { alignItems: 'center', paddingHorizontal: 45, paddingTop: 118 },
  emptyIcon: { width: 44, height: 44 },
  emptyTitle: { color: colors.text, fontWeight: '600', fontSize: 16, marginTop: 12 },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 7 },
  retryText: { color: colors.primary, fontSize: 14, fontWeight: '600', marginTop: 14 },
  styleCard: { position: 'absolute', top: 196, left: 16, right: 16, backgroundColor: colors.surface, borderRadius: 17, padding: 20 },
  previews: { flexDirection: 'row', gap: 18 },
  previewChoice: { flex: 1, alignItems: 'center' },
  phonePreview: { width: 104, height: 176, borderRadius: 12, borderWidth: 3, overflow: 'hidden' },
  previewLight: { backgroundColor: '#efefed', borderColor: '#bbb' },
  previewDark: { backgroundColor: '#090909', borderColor: '#4b4b4b' },
  phonePreviewImage: { width: '100%', height: '100%', borderRadius: 8 },
  previewLabel: { color: colors.text, fontSize: 13, marginTop: 10 },
  styleSelection: { width: 24, height: 24, marginTop: 8 },
  automaticRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, marginTop: 20, paddingTop: 13 },
  automaticText: { color: colors.text, fontSize: 15 },
  contactRow: { height: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  contactCopy: { flex: 1, marginLeft: 11 },
  contactName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  contactHandle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  inviteButton: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: colors.primary },
  invitedButton: { backgroundColor: colors.surfaceRaised },
  inviteText: { color: colors.onPrimary, fontSize: 11 },
  invitePage: { paddingTop: 131, paddingHorizontal: 18, alignItems: 'center' },
  peopleIcon: { width: 118, height: 46, marginBottom: 22 },
  progressText: { color: '#e0453c', fontSize: 12, fontWeight: '600', marginTop: 12 },
  progressDots: { height: 8, flexDirection: 'row', gap: 6, marginTop: 7 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised },
  progressDotActive: { backgroundColor: colors.primary },
  inviteActions: { width: '100%', gap: 9, marginTop: 30 },
  actionRow: { height: 46, borderRadius: 23, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17 },
  actionIcon: { width: 18, height: 18, marginRight: 12, tintColor: colors.text },
  actionText: { color: colors.text, fontSize: 13, flex: 1 },
  actionChevron: { width: 8, height: 16, opacity: 0.7 },
  ready: { flex: 1 },
  readyContent: { position: 'absolute', top: 170, left: 0, right: 0, alignItems: 'center' },
  readyCopy: { width: '100%', maxWidth: 370, height: 72, alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 24, paddingHorizontal: 16 },
  readyTitle: { width: '100%', color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  readySubtitle: { width: '100%', color: '#AAB2C5', fontSize: 15, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
  readyButton: { width: 330, marginTop: 24 },
});
