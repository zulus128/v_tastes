import { createTastesApi } from '@tastes/firebase-client';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
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
import flagFrance from '../../../assets/onboarding/flag-france.png';
import flagItaly from '../../../assets/onboarding/flag-italy.png';
import flagMonaco from '../../../assets/onboarding/flag-monaco.png';
import flagPortugal from '../../../assets/onboarding/flag-portugal.png';
import flagSpain from '../../../assets/onboarding/flag-spain.png';
import flagSwitzerland from '../../../assets/onboarding/flag-switzerland.png';
import flagUae from '../../../assets/onboarding/flag-uae.png';
import flagUk from '../../../assets/onboarding/flag-uk.png';
import inviteContacts from '../../../assets/onboarding/invite-contacts.png';
import inviteMessage from '../../../assets/onboarding/invite-message.png';
import invitePeople from '../../../assets/onboarding/invite-people.png';
import inviteShare from '../../../assets/onboarding/invite-share.png';
import permissionContacts from '../../../assets/onboarding/permission-contacts.png';
import permissionLocation from '../../../assets/onboarding/permission-location.png';
import permissionNotifications from '../../../assets/onboarding/permission-notifications.png';
import placeSelected from '../../../assets/onboarding/place-selected.png';
import placeUnselected from '../../../assets/onboarding/place-unselected.png';
import placeSearch from '../../../assets/onboarding/place-search.png';
import placeTuning from '../../../assets/onboarding/place-tuning.png';
import ratingStar from '../../../assets/onboarding/rating-star.png';
import readyCollage from '../../../assets/onboarding/ready-collage.png';
import restaurantPhoto from '../../../assets/onboarding/restaurant.png';
import searchClose from '../../../assets/onboarding/search-close.png';
import startRating from '../../../assets/onboarding/start-rating.png';
import step1Indicator from '../../../assets/onboarding/step-1.png';
import step2Indicator from '../../../assets/onboarding/step-2.png';
import step3Indicator from '../../../assets/onboarding/step-3.png';
import styleDark from '../../../assets/onboarding/style-dark.png';
import styleLight from '../../../assets/onboarding/style-light.png';
import styleSelected from '../../../assets/onboarding/style-selected.png';
import styleUnselected from '../../../assets/onboarding/style-unselected.png';
import { functions } from '../../infrastructure/firebase';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { onboardingTheme as theme } from './theme';

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
  onComplete: () => Promise<void>;
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
  invited: boolean;
}

const cities = [
  [flagMonaco, 'Monaco', 'Monaco'],
  [flagUk, 'London', 'United Kingdom'],
  [flagFrance, 'Paris', 'France'],
  [flagFrance, 'Nice', 'France'],
  [flagFrance, 'Cannes', 'France'],
  [flagItaly, 'Milan', 'Italy'],
  [flagSpain, 'Barcelona', 'Spain'],
  [flagSwitzerland, 'Geneva', 'Switzerland'],
  [flagUae, 'Dubai', 'UAE'],
  [flagPortugal, 'Lisbon', 'Portugal'],
] as const;
const countryFlags: Record<string, ImageSourcePropType> = {
  AE: flagUae,
  CH: flagSwitzerland,
  ES: flagSpain,
  FR: flagFrance,
  GB: flagUk,
  IT: flagItaly,
  MC: flagMonaco,
  PT: flagPortugal,
};

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
const knownPlaceQueries = new Set([...placeFilters.map(({ label }) => label.toLowerCase()), 'friends']);
const stepIndicators = [step1Indicator, step2Indicator, step3Indicator] as const;
const fallbackContacts: ContactCandidate[] = [
  { id: 'alex', name: 'Alex Carter', handle: '@alexc', invited: false },
  { id: 'sofia', name: 'Sofia Rossi', handle: '@sofiar', invited: true },
  { id: 'liam', name: 'Liam Walsh', handle: '@liamw', invited: false },
  { id: 'emma', name: 'Emma Dubois', handle: '@emmad', invited: false },
  { id: 'noah', name: 'Noah Bianchi', handle: '@noahb', invited: false },
];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function slug(name: string) {
  return `@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}`;
}

function Header({ onBack, onSkip }: { onBack: () => void; onSkip?: () => void }) {
  return <><BackButton onPress={onBack} />{onSkip ? <Pressable onPress={onSkip} style={styles.skip}><Text style={styles.skipText}>Skip</Text></Pressable> : null}</>;
}

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return <View style={styles.stepHeader}>
    <View style={styles.stepRow}><Text style={styles.stepLabel}>Step {step}</Text><Image source={stepIndicators[step - 1]} style={styles.stepIndicator} /></View>
    <Text style={[styles.title, styles.stepTitle]}>{title}</Text>
    <Text style={[styles.subtitle, styles.stepSubtitle]}>{subtitle}</Text>
  </View>;
}

function PermissionScreen({ icon, title, subtitle, button, onBack, onSkip, onPress }: {
  icon: ImageSourcePropType; title: string; subtitle: string; button: string; onBack: () => void; onSkip: () => void; onPress: () => void;
}) {
  return <PatternScreen>
    <Header onBack={onBack} onSkip={onSkip} />
    <View style={styles.permissionContent}>
      <Image source={icon} style={styles.permissionIcon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.subtitle, styles.permissionSubtitle, styles.permissionBodyText]}>{subtitle}</Text>
    </View>
    <PrimaryButton label={button} onPress={onPress} style={styles.bottomButton} />
  </PatternScreen>;
}

export function PostSignupOnboardingFlow({
  onAuthenticationRequired,
  onComplete,
}: PostSignupOnboardingFlowProps) {
  const api = useMemo(() => createTastesApi(functions), []);
  const [screen, setScreen] = useState<Screen>('profile');
  const [history, setHistory] = useState<Screen[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('London');
  const [cityFlag, setCityFlag] = useState<ImageSourcePropType>(flagUk);
  const [citySearch, setCitySearch] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [dish, setDish] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('Restaurant');
  const [placeLoading, setPlaceLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [automatic, setAutomatic] = useState(true);
  const [contacts, setContacts] = useState(fallbackContacts);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      await api.createUserProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        city,
      });
      navigate('dish');
    } catch (error) {
      if (isUnauthenticated(error)) {
        await onAuthenticationRequired();
        return;
      }
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Try again.');
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
    setTimeout(() => setPlaceLoading(false), 700);
  }

  async function requestContacts() {
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status === 'granted') {
      const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name] });
      const mapped = result.data.filter((item) => item.name).slice(0, 20).map((item) => ({
        id: item.id,
        name: item.name,
        handle: slug(item.name),
        invited: false,
      }));
      if (mapped.length) setContacts(mapped);
      navigate('contacts');
      return;
    }
    navigate('invite');
  }

  async function requestNotifications() {
    await Notifications.requestPermissionsAsync();
    navigate('ready');
  }

  async function shareInvite() {
    await Share.share({ message: 'Join me on Tastes: https://tastes.app/invite' });
  }

  async function finishOnboarding() {
    setBusy(true);
    try {
      await onComplete();
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
    const filtered = cities.filter((item) => item[1].toLowerCase().includes(citySearch.toLowerCase()));
    return <PatternScreen>
      <Header onBack={back} />
      <View style={styles.listPage}>
        <Text style={styles.listTitle}>Select city</Text>
        <TextInput autoFocus value={citySearch} onChangeText={setCitySearch} placeholder="Search" placeholderTextColor={theme.colors.placeholder} style={styles.search} />
        <ScrollView keyboardShouldPersistTaps="handled">
          {filtered.map(([flag, name, country]) => <Pressable key={name} onPress={() => { setCity(name); setCityFlag(flag); back(); }} style={styles.cityRow}>
            <Image source={flag} style={styles.cityFlag} /><Text style={styles.cityName}>{name}</Text><Text style={styles.cityCountry}>{country}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
    </PatternScreen>;
  }

  if (screen === 'profile') {
    return <PatternScreen>
      <View style={styles.profilePage}>
        <Text style={styles.title}>Create your profile</Text>
        <Text style={[styles.subtitle, styles.profileSubtitle]}>Choose a username and add a photo so others can recognize you</Text>
        <Pressable accessibilityLabel="Add profile photo" onPress={() => setPhotoSheet(true)} style={styles.photo}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoImage} /> : <Image source={addPhoto} style={styles.addPhotoIcon} />}
        </Pressable>
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your Name" placeholderTextColor={theme.colors.placeholder} style={styles.field} />
        <TextInput value={username} autoCapitalize="none" onChangeText={setUsername} placeholder="Username" placeholderTextColor={theme.colors.placeholder} style={styles.field} />
        <Pressable onPress={() => navigate('city')} style={styles.fieldRow}><Text style={styles.locationLabel}>Location</Text><View style={styles.locationSelection}><Text style={styles.locationValue}>{city}</Text><Image source={cityFlag} style={styles.locationFlag} /><Image source={chevronRight} style={styles.locationChevron} /></View></Pressable>
      </View>
      <PrimaryButton label="Continue" loading={busy} onPress={saveProfile} style={styles.bottomButton} />
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
    </PatternScreen>;
  }

  if (screen === 'dish') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('location')} />
      <StepHeader step={1} title="Your favourite dish!" subtitle={commonSubtitle} />
      <ScrollView contentContainerStyle={styles.pills}>
        {dishes.map((item) => <Pressable key={item.label} onPress={() => setDish(item.label)} style={[styles.pill, dish === item.label && styles.pillSelected]}><View style={styles.pillContent}><Text style={[styles.pillText, dish === item.label && styles.pillTextSelected]}>{item.label}</Text><Image source={item.icon} style={[styles.dishIcon, dish !== item.label && styles.dishIconDimmed]} /></View></Pressable>)}
      </ScrollView>
      {!dish ? <Text style={styles.helper}>Select at least one to continue</Text> : null}
      <PrimaryButton label="Continue" disabled={!dish} onPress={() => navigate('location')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'location') return <PermissionScreen icon={permissionLocation} title="Discover places near you" subtitle="Allow location access so Tastes can show the best spots around you." button="Allow Location" onBack={back} onSkip={enterPlaces} onPress={requestLocation} />;
  if (screen === 'locationDenied') return <PermissionScreen icon={permissionLocation} title="Location is off" subtitle="Turn on location in Settings to discover places and friends near you." button="Open Settings" onBack={back} onSkip={enterPlaces} onPress={() => Linking.openSettings()} />;

  if (screen === 'place') {
    const normalizedPlaceQuery = placeQuery.trim().toLowerCase();
    const noResults = !placeLoading
      && normalizedPlaceQuery.length > 0
      && !knownPlaceQueries.has(normalizedPlaceQuery)
      && !'gemini750 restaurant'.includes(normalizedPlaceQuery);
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('style')} />
      <StepHeader step={2} title="Choose your favourite place" subtitle={commonSubtitle} />
      <View style={styles.placesCard}>
        <View style={styles.placeHeader}>
          <View style={styles.placeSearchRow}>
            <View style={styles.placeSearch}>
              <Image source={placeSearch} style={styles.placeSearchIcon} />
              <TextInput value={placeQuery} onChangeText={setPlaceQuery} placeholder="Search places" placeholderTextColor="rgba(255,255,255,0.5)" style={styles.placeSearchInput} />
              {placeQuery.length > 0 ? <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setPlaceQuery('')} style={styles.placeClear}><Image source={searchClose} style={styles.placeClearIcon} /></Pressable> : <View style={styles.placeClearSpacer} />}
            </View>
            <Image source={placeTuning} style={styles.tuningIcon} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {placeFilters.map(({ icon, label }) => {
              const active = normalizedPlaceQuery === label.toLowerCase();
              return <Pressable accessibilityRole="button" key={label} onPress={() => setPlaceQuery(label)} style={[styles.filter, active && styles.filterActive]}>
                <Image source={icon} style={[styles.filterIcon, !active && styles.filterDimmed]} />
                <Text style={[styles.filterText, !active && styles.filterDimmed]}>{label}</Text>
              </Pressable>;
            })}
            <Pressable accessibilityRole="button" onPress={() => setPlaceQuery('Friends')} style={[styles.filter, normalizedPlaceQuery === 'friends' && styles.filterActive]}>
              <Image source={filterFriends} style={[styles.filterIcon, normalizedPlaceQuery !== 'friends' && styles.filterDimmed]} />
              <Text style={[styles.filterText, normalizedPlaceQuery !== 'friends' && styles.filterDimmed]}>Friends</Text>
            </Pressable>
          </ScrollView>
        </View>
        {placeLoading ? <ScrollView style={styles.placeList} showsVerticalScrollIndicator={false}>{[1, 2, 3].map((item) => <View key={item} style={styles.venue}><View style={styles.venueMain}><View style={styles.skeletonImage} /><View style={styles.venueCopy}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /><View style={styles.skeletonShort} /></View></View><View style={styles.skeletonTags} /></View>)}</ScrollView> : noResults ? <View style={styles.empty}><Image source={emptySearch} style={styles.emptyIcon} /><Text style={styles.emptyTitle}>No places found</Text><Text style={styles.emptyText}>Try a different search — we're adding new spots in your city every week.</Text></View> : <ScrollView style={styles.placeList} showsVerticalScrollIndicator={false}>{[1, 2, 3].map((item) => {
          const venueId = `gemini-${item}`;
          const selected = place === venueId;
          return <Pressable key={venueId} onPress={() => setPlace(venueId)} style={[styles.venue, selected && styles.venueSelected]}>
            <Image source={selected ? placeSelected : placeUnselected} style={styles.venueSelection} />
            <View style={styles.venueMain}>
              <Image source={restaurantPhoto} resizeMode="cover" style={styles.venueImage} />
              <View style={styles.venueCopy}>
                <Text numberOfLines={1} style={styles.venueTitle}>Gemini750 Restaurant</Text>
                <Text numberOfLines={1} style={styles.venueAddress}>742 Evergreen Terrace, Apartment 12B, Springfield, IL 62704, United States of America</Text>
                <View style={styles.ratingRow}><View style={styles.ratingTag}><Image source={ratingStar} style={styles.ratingStar} /><Text style={styles.ratingValue}>2.0</Text></View><Text style={styles.reviews}>34 reviews</Text></View>
              </View>
            </View>
            <View style={styles.venueTagsRow}><View style={styles.venueTag}><View style={styles.venueTagContent}><Text style={styles.venueTagText}>Italian</Text><Image source={flagItaly} style={styles.venueFlag} /></View></View><View style={styles.venueTag}><Text style={styles.venueTagText}>$$</Text></View><View style={styles.venueTag}><Text style={styles.venueTagText}>1,2 km</Text></View></View>
          </Pressable>;
        })}</ScrollView>}
      </View>
      <LinearGradient pointerEvents="none" colors={['rgba(8,8,8,0)', '#161616', '#161616']} locations={[0, 0.58, 1]} style={styles.placeFooterGradient} />
      <PrimaryButton label="Continue" disabled={!place} onPress={() => navigate('style')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'style') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('contactsPermission')} />
      <StepHeader step={3} title="Choose Your Style" subtitle="Switch between dark and light mode anytime" />
      <View style={styles.styleCard}>
        <View style={styles.previews}>
          {[false, true].map((dark) => <Pressable key={String(dark)} onPress={() => setDarkMode(dark)} style={styles.previewChoice}>
            <View style={[styles.phonePreview, dark ? styles.previewDark : styles.previewLight]}><Image source={dark ? styleDark : styleLight} resizeMode="cover" style={styles.phonePreviewImage} /></View>
            <Text style={styles.previewLabel}>{dark ? 'Dark' : 'Light'}</Text><Image source={darkMode === dark ? styleSelected : styleUnselected} style={styles.styleSelection} />
          </Pressable>)}
        </View>
        <View style={styles.automaticRow}><Text style={styles.automaticText}>Automatic</Text><Switch value={automatic} onValueChange={setAutomatic} trackColor={{ false: '#333', true: theme.colors.accent }} thumbColor="#fff" /></View>
      </View>
      <PrimaryButton label="Continue" onPress={() => navigate('contactsPermission')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'contactsPermission') return <PermissionScreen icon={permissionContacts} title="Find your friends" subtitle="Connect your contacts to find people you know already on Tastes." button="Allow Contacts" onBack={back} onSkip={() => navigate('invite')} onPress={requestContacts} />;

  if (screen === 'contacts') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('invite')} />
      <View style={styles.listPage}><Text style={styles.listTitle}>Invite from contacts</Text><Text style={styles.listSubtitle}>Tap Invite to bring friends to Tastes.</Text>
        <ScrollView>{contacts.map((contact, index) => <View key={contact.id} style={styles.contactRow}>
          <View style={[styles.avatar, { backgroundColor: ['#263854', '#24504c', '#4b315d', '#5a4427', '#2f5438'][index % 5] }]}><Text style={styles.avatarText}>{initials(contact.name)}</Text></View>
          <View style={styles.contactCopy}><Text style={styles.contactName}>{contact.name}</Text><Text style={styles.contactHandle}>{contact.handle}</Text></View>
          <Pressable onPress={() => setContacts((items) => items.map((item) => item.id === contact.id ? { ...item, invited: true } : item))} disabled={contact.invited} style={[styles.inviteButton, contact.invited && styles.invitedButton]}><Text style={styles.inviteText}>{contact.invited ? 'Invited' : 'Invite'}</Text></Pressable>
        </View>)}</ScrollView>
      </View><PrimaryButton label="Done" onPress={() => navigate('invite')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'invite') {
    return <PatternScreen>
      <Header onBack={back} onSkip={() => navigate('notifications')} />
      <View style={styles.invitePage}><Image source={invitePeople} style={styles.peopleIcon} /><Text style={styles.title}>Invite your friends</Text><Text style={[styles.subtitle, styles.permissionSubtitle]}>Add 3 friends and see their ratings and recommendations</Text>
        {invitedCount ? <><Text style={styles.progressText}>{Math.min(invitedCount, 3)} of 3 friends invited</Text><View style={styles.progressDots}>{[0, 1, 2].map((index) => <View key={index} style={[styles.progressDot, index < Math.min(invitedCount, 3) && styles.progressDotActive]} />)}</View></> : null}
        <View style={styles.inviteActions}><Pressable onPress={shareInvite} style={styles.actionRow}><Image source={inviteShare} style={styles.actionIcon} /><Text style={styles.actionText}>Share your invite link</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable><Pressable onPress={shareInvite} style={styles.actionRow}><Image source={inviteMessage} style={styles.actionIcon} /><Text style={styles.actionText}>Invite friend via text</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable><Pressable onPress={() => navigate('contacts')} style={styles.actionRow}><Image source={inviteContacts} style={styles.actionIcon} /><Text style={styles.actionText}>Invite from your contacts</Text><Image source={chevronRight} style={styles.actionChevron} /></Pressable></View>
      </View><PrimaryButton label="Continue" onPress={() => navigate('notifications')} style={styles.bottomButton} />
    </PatternScreen>;
  }

  if (screen === 'notifications') return <PermissionScreen icon={permissionNotifications} title="Stay in the loop" subtitle="Get notified when friends post, invite you, or react to your reviews." button="Turn on Notifications" onBack={back} onSkip={() => navigate('ready')} onPress={requestNotifications} />;

  return <LinearGradient colors={['#560E0B', '#080808']} style={styles.ready}>
    <Image source={readyCollage} resizeMode="contain" style={styles.reviewCollage} />
    <View style={styles.readyCopy}><Text style={styles.title}>You're ready!</Text><Text style={[styles.subtitle, styles.permissionSubtitle]}>Write your first 3 reviews to unlock personalized recommendations</Text></View>
    <PrimaryButton icon={startRating} label="Start rating" loading={busy} onPress={finishOnboarding} style={styles.readyButton} />
  </LinearGradient>;
}

const styles = StyleSheet.create({
  skip: { position: 'absolute', top: 58, right: 16, zIndex: 3, padding: 8 },
  skipText: { color: theme.colors.muted, fontSize: 14 },
  title: { color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bottomButton: { position: 'absolute', left: 36, right: 36, bottom: Platform.OS === 'ios' ? 24 : 18 },
  stepHeader: { position: 'absolute', top: 118, left: 16, right: 16, alignItems: 'center' },
  stepRow: { height: 17, flexDirection: 'row', gap: 7, alignItems: 'center' },
  stepLabel: { color: '#fff', fontSize: 14, lineHeight: 17, fontWeight: '400', letterSpacing: 0.6 },
  stepIndicator: { width: 39, height: 6 },
  stepTitle: { marginTop: 7, fontSize: 24, lineHeight: 29, letterSpacing: 0.6 },
  stepSubtitle: { marginTop: 7, fontSize: 15, lineHeight: 18, letterSpacing: -0.41 },
  permissionContent: { position: 'absolute', top: 132, left: 26, right: 26, alignItems: 'center' },
  permissionIcon: { width: 60, height: 60, marginBottom: 25 },
  permissionSubtitle: { marginTop: 8, maxWidth: 320 },
  permissionBodyText: { color: 'rgba(255,255,255,0.5)' },
  profilePage: { paddingHorizontal: 20, paddingTop: 126, alignItems: 'center' },
  profileSubtitle: { marginTop: 8, width: 285 },
  photo: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#45474b', marginTop: 22, marginBottom: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' },
  photoImage: { width: '100%', height: '100%', borderRadius: 59 },
  addPhotoIcon: { width: 28, height: 28 },
  field: { width: '100%', height: 53, borderBottomWidth: 1, borderBottomColor: theme.colors.hairline, color: '#fff', fontSize: 15, paddingHorizontal: 4 },
  fieldRow: { width: '100%', height: 53, borderBottomWidth: 1, borderBottomColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  locationLabel: { color: theme.colors.placeholder, fontSize: 15 },
  locationValue: { color: theme.colors.muted, fontSize: 15 },
  locationSelection: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationFlag: { width: 18, height: 18 },
  locationChevron: { width: 8, height: 16, marginLeft: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 16, paddingBottom: Platform.OS === 'ios' ? 30 : 18 },
  sheetWrap: { gap: 9 },
  sheet: { backgroundColor: '#1c1c1f', borderRadius: 14, overflow: 'hidden' },
  sheetAction: { height: 56, alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#353535' },
  sheetText: { color: '#fff', fontSize: 16 },
  destructive: { color: '#e34840', fontSize: 16 },
  cancel: { height: 56, alignItems: 'center', justifyContent: 'center' },
  listPage: { flex: 1, paddingTop: 126, paddingHorizontal: 16, paddingBottom: 90 },
  listTitle: { color: '#fff', fontSize: 23, lineHeight: 28, fontWeight: '700', marginBottom: 14 },
  listSubtitle: { color: theme.colors.muted, fontSize: 13, marginTop: -7, marginBottom: 16 },
  search: { height: 44, borderRadius: 10, backgroundColor: '#171717', paddingHorizontal: 14, color: '#fff', fontSize: 14 },
  cityRow: { height: 49, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.hairline, flexDirection: 'row', alignItems: 'center' },
  cityFlag: { width: 20, height: 20, marginRight: 14 },
  cityName: { color: '#fff', fontSize: 15, flex: 1 },
  cityCountry: { color: '#747474', fontSize: 13 },
  pills: { paddingHorizontal: 20, paddingTop: 212, paddingBottom: 145, gap: 8 },
  pill: { height: 45, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center' },
  pillSelected: { backgroundColor: theme.colors.accent },
  pillText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '400' },
  pillTextSelected: { color: '#fff' },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dishIcon: { width: 18, height: 18 },
  dishIconDimmed: { opacity: 0.5 },
  helper: { position: 'absolute', bottom: 90, alignSelf: 'center', color: theme.colors.muted, fontSize: 12 },
  placesCard: { position: 'absolute', top: 212, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderTopWidth: 1, borderTopColor: '#45474b', backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  placeHeader: { height: 105, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 16, gap: 12, backgroundColor: '#161616' },
  placeSearchRow: { height: 39, flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeSearch: { flex: 1, height: 39, borderRadius: 22, paddingLeft: 10, paddingRight: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  placeSearchIcon: { width: 24, height: 24 },
  placeSearchInput: { flex: 1, height: 39, paddingHorizontal: 8, paddingVertical: 0, color: '#fff', fontSize: 16 },
  placeClear: { width: 24, height: 24 },
  placeClearIcon: { width: 24, height: 24, opacity: 0.8 },
  placeClearSpacer: { width: 24, height: 24 },
  tuningIcon: { width: 24, height: 24 },
  filters: { height: 28, gap: 6 },
  filter: { height: 28, borderRadius: 14, paddingHorizontal: 8, gap: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#161616', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  filterActive: { borderColor: 'rgba(255,255,255,0.28)', backgroundColor: '#282828' },
  filterIcon: { width: 14, height: 14 },
  filterText: { color: '#fff', fontSize: 13, lineHeight: 20, fontWeight: '500', letterSpacing: -0.23 },
  filterDimmed: { opacity: 0.5 },
  placeList: { flex: 1 },
  venue: { height: 188, paddingHorizontal: 16, paddingVertical: 12, gap: 9, borderBottomWidth: 1, borderBottomColor: '#45474b', backgroundColor: '#161616' },
  venueSelected: { backgroundColor: '#282828' },
  venueSelection: { position: 'absolute', zIndex: 2, top: 15, right: 17, width: 22, height: 22 },
  venueMain: { height: 122, flexDirection: 'row', alignItems: 'center', gap: 16 },
  venueImage: { width: 122, height: 122, borderRadius: 12 },
  venueCopy: { flex: 1, paddingRight: 18, justifyContent: 'center' },
  venueTitle: { color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: -0.41 },
  venueAddress: { color: theme.colors.muted, fontSize: 13, letterSpacing: -0.24, marginTop: 6 },
  ratingRow: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 15 },
  ratingTag: { height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { width: 14, height: 14 },
  ratingValue: { color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: -0.23 },
  reviews: { color: 'rgba(216,221,232,0.4)', fontSize: 14, letterSpacing: -0.24 },
  venueTagsRow: { height: 33, flexDirection: 'row', alignItems: 'center', gap: 7 },
  venueTag: { height: 33, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  venueTagContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueTagText: { color: '#fff', fontSize: 15, lineHeight: 20, letterSpacing: -0.24 },
  venueFlag: { width: 18, height: 18 },
  skeletonImage: { width: 122, height: 122, borderRadius: 12, backgroundColor: '#242424' },
  skeletonTitle: { width: '72%', height: 14, backgroundColor: '#303030', borderRadius: 4 },
  skeletonLine: { width: '94%', height: 10, backgroundColor: '#272727', borderRadius: 4, marginTop: 10 },
  skeletonShort: { width: '52%', height: 28, backgroundColor: '#272727', borderRadius: 14, marginTop: 15 },
  skeletonTags: { width: 205, height: 33, backgroundColor: '#242424', borderRadius: 17 },
  placeFooterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 94 },
  empty: { alignItems: 'center', paddingHorizontal: 45, paddingTop: 118 },
  emptyIcon: { width: 44, height: 44 },
  emptyTitle: { color: '#fff', fontWeight: '600', fontSize: 16, marginTop: 12 },
  emptyText: { color: '#777', textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 7 },
  styleCard: { position: 'absolute', top: 196, left: 16, right: 16, backgroundColor: '#161616', borderRadius: 17, padding: 20 },
  previews: { flexDirection: 'row', gap: 18 },
  previewChoice: { flex: 1, alignItems: 'center' },
  phonePreview: { width: 104, height: 176, borderRadius: 12, borderWidth: 3, overflow: 'hidden' },
  previewLight: { backgroundColor: '#efefed', borderColor: '#bbb' },
  previewDark: { backgroundColor: '#090909', borderColor: '#4b4b4b' },
  phonePreviewImage: { width: '100%', height: '100%', borderRadius: 8 },
  previewLabel: { color: '#fff', fontSize: 13, marginTop: 10 },
  styleSelection: { width: 24, height: 24, marginTop: 8 },
  automaticRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#353535', marginTop: 20, paddingTop: 13 },
  automaticText: { color: '#fff', fontSize: 15 },
  contactRow: { height: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.hairline },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  contactCopy: { flex: 1, marginLeft: 11 },
  contactName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  contactHandle: { color: '#777', fontSize: 11, marginTop: 2 },
  inviteButton: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: theme.colors.accent },
  invitedButton: { backgroundColor: '#292929' },
  inviteText: { color: '#fff', fontSize: 11 },
  invitePage: { paddingTop: 131, paddingHorizontal: 18, alignItems: 'center' },
  peopleIcon: { width: 118, height: 46, marginBottom: 22 },
  progressText: { color: '#e0453c', fontSize: 12, fontWeight: '600', marginTop: 12 },
  progressDots: { height: 8, flexDirection: 'row', gap: 6, marginTop: 7 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#282828' },
  progressDotActive: { backgroundColor: theme.colors.accent },
  inviteActions: { width: '100%', gap: 9, marginTop: 30 },
  actionRow: { height: 46, borderRadius: 23, backgroundColor: '#1e1e1e', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17 },
  actionIcon: { width: 18, height: 18, marginRight: 12 },
  actionText: { color: '#fff', fontSize: 13, flex: 1 },
  actionChevron: { width: 8, height: 16, opacity: 0.7 },
  ready: { flex: 1 },
  reviewCollage: { width: 402, height: 288, marginTop: 170, alignSelf: 'center' },
  readyCopy: { alignItems: 'center', paddingHorizontal: 32, marginTop: 24 },
  readyButton: { marginHorizontal: 36, marginTop: 24 },
});
