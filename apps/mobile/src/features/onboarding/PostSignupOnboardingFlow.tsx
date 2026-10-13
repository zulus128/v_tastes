import {
  checkUsernameAvailabilityInputSchema,
  createUserProfileInputSchema,
  type CompleteOnboardingInput,
} from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { uploadJpegImageVariant } from '../../infrastructure/imageUpload';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import addPhoto from '../../../assets/onboarding/add-photo.png';
import tastesAppIcon from '../../../assets/icon.png';
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
import flagMonaco from '../../../assets/onboarding/flag-monaco.png';
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
import ratingStar from '../../../assets/onboarding/rating-star.png';
import readyCardDarkCenter from '../../../assets/onboarding/ready-card-dark-center.png';
import readyCardDarkLeft from '../../../assets/onboarding/ready-card-dark-left.png';
import readyCardDarkRight from '../../../assets/onboarding/ready-card-dark-right.png';
import readyCardLightCenter from '../../../assets/onboarding/ready-card-light-center.png';
import readyCardLightLeft from '../../../assets/onboarding/ready-card-light-left.png';
import readyCardLightRight from '../../../assets/onboarding/ready-card-light-right.png';
import searchClose from '../../../assets/onboarding/search-close.png';
import startRating from '../../../assets/onboarding/start-rating.png';
import readyPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import { auth } from '../../infrastructure/firebase';
import { syncPushNotifications } from '../../infrastructure/pushNotifications';
import { useTastesApi } from '../../session/SessionProvider';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { CityPicker, countryFlags } from './CityPicker';
import { buildCompletionInput } from './completion-input';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import {
  DESIGN_VIEWPORT,
  responsiveStyleSheet,
  useOrientationDimensions,
  useResponsiveMetrics,
} from '../../ui/responsive';

export type PostSignupScreen =
  | 'profile'
  | 'city'
  | 'birthday'
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

const previousPostSignupScreen: Partial<
  Record<PostSignupScreen, PostSignupScreen>
> = {
  city: 'profile',
  birthday: 'profile',
  dish: 'birthday',
  location: 'dish',
  locationDenied: 'location',
  place: 'location',
  style: 'place',
  contactsPermission: 'style',
  contacts: 'contactsPermission',
  invite: 'contactsPermission',
  notifications: 'invite',
};

interface PostSignupOnboardingFlowProps {
  initialScreen?: PostSignupScreen;
  onAuthenticationRequired: () => Promise<void>;
  onComplete: (
    input?: Partial<Omit<CompleteOnboardingInput, 'version'>>,
  ) => Promise<void>;
  visualAudit?: boolean;
}

function isUnauthenticated(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 'functions/unauthenticated' ||
    code === 'unauthenticated' ||
    message === 'Authentication is required.'
  );
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

const birthdayMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoBirthDate(day: number, month: number, year: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function BirthdayColumn({
  formatValue = String,
  label,
  month = false,
  onChange,
  selected,
  values,
}: {
  formatValue?: (value: number) => string;
  label: string;
  month?: boolean;
  onChange: (value: number) => void;
  selected: number;
  values: readonly number[];
}) {
  const styles = useOnboardingStyles();
  const { width, height } = useOrientationDimensions();
  const rowHeight = width > height ? 34 : 39;
  const wheelRef = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(selected));

  const alignSelectedRow = () =>
    wheelRef.current?.scrollTo({
      animated: false,
      y: index * rowHeight,
    });

  useEffect(alignSelectedRow, [index, rowHeight]);

  const selectVisibleRow = (offset: number) => {
    const nextIndex = Math.max(
      0,
      Math.min(values.length - 1, Math.round(offset / rowHeight)),
    );
    const nextValue = values[nextIndex];
    if (nextValue !== undefined && nextValue !== selected) onChange(nextValue);
  };

  return (
    <View style={[styles.birthdayColumn, month && styles.birthdayMonthColumn]}>
      <Text style={styles.birthdayColumnLabel}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.birthdayWheelContent}
        decelerationRate="fast"
        nestedScrollEnabled
        onContentSizeChange={alignSelectedRow}
        onMomentumScrollEnd={({ nativeEvent }) =>
          selectVisibleRow(nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={({ nativeEvent }) =>
          selectVisibleRow(nativeEvent.contentOffset.y)
        }
        ref={wheelRef}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={rowHeight}
        style={styles.birthdayWheel}
        testID={`onboarding-birthday-wheel-${label.toLowerCase()}`}
      >
        {values.map((item, itemIndex) => {
          const offset = itemIndex - index;
          return (
            <Pressable
              disabled={offset === 0}
              key={item}
              onPress={() => onChange(item)}
              style={styles.birthdayValue}
            >
              <Text
                style={[
                  offset === 0
                    ? styles.birthdaySelectedText
                    : styles.birthdayAdjacent,
                  Math.abs(offset) >= 2 && styles.birthdayFar,
                ]}
              >
                {formatValue(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function BirthdayMonthColumn({
  label,
  onChange,
  selected,
}: {
  label: string;
  onChange: (value: number) => void;
  selected: number;
}) {
  return (
    <BirthdayColumn
      formatValue={(value) => birthdayMonths[value] ?? ''}
      label={label}
      month
      onChange={onChange}
      selected={selected}
      values={birthdayMonths.map((_month, index) => index)}
    />
  );
}

function LazyVenueImage({
  source,
  testID,
}: {
  source: ImageSourcePropType;
  testID: string;
}) {
  const styles = useOnboardingStyles();
  const [loaded, setLoaded] = useState(false);

  return (
    <View style={styles.venueImagePlaceholder}>
      <Image
        fadeDuration={180}
        onLoad={() => setLoaded(true)}
        resizeMode="cover"
        source={source}
        style={[styles.venueImage, !loaded && styles.venueImageLoading]}
        testID={testID}
      />
    </View>
  );
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
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function slug(name: string) {
  return `@${name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 14)}`;
}

function useOnboardingStyles() {
  const { colors, isDark } = useAppTheme();
  const { width, height } = useOrientationDimensions();
  const { scale } = useResponsiveMetrics();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const bottomGutter = Math.max(
    Platform.OS === 'ios' ? 24 : 18,
    insets.bottom / scale,
  );
  return useMemo(
    () => createStyles(colors, isDark, landscape, bottomGutter),
    [colors, isDark, landscape, bottomGutter],
  );
}

function Header({
  onBack,
  onSkip,
}: {
  onBack: () => void;
  onSkip?: () => void;
}) {
  const styles = useOnboardingStyles();
  // Move the whole navigation row together: BackButton has a shared portrait
  // top offset, while landscape step content starts much closer to the top.
  return (
    <View pointerEvents="box-none" style={styles.header}>
      <BackButton onPress={onBack} />
      {onSkip ? (
        <Pressable onPress={onSkip} style={styles.skip}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StepProgress({
  complete = false,
  overlay = false,
  step,
}: {
  complete?: boolean;
  overlay?: boolean;
  step: number;
}) {
  const styles = useOnboardingStyles();
  return (
    <View
      accessibilityLabel={
        complete ? 'Onboarding complete' : `Step ${step} of 7`
      }
      style={[styles.stepProgress, overlay && styles.stepProgressOverlay]}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((index) => (
        <View
          key={index}
          style={[
            styles.stepSegment,
            complete || index < step
              ? styles.stepSegmentDone
              : index === step
                ? styles.stepSegmentCurrent
                : styles.stepSegmentUpcoming,
          ]}
        />
      ))}
    </View>
  );
}

function StepHeader({
  landscape = false,
  step,
  title,
  subtitle,
}: {
  landscape?: boolean;
  step: number;
  title: string;
  subtitle: string;
}) {
  const styles = useOnboardingStyles();
  return (
    <View style={[styles.stepHeader, landscape && styles.stepHeaderLandscape]}>
      <StepProgress step={step} />
      <Text style={[styles.title, styles.stepTitle]}>{title}</Text>
      <Text style={[styles.subtitle, styles.stepSubtitle]}>{subtitle}</Text>
    </View>
  );
}

function PermissionScreen({
  button,
  children,
  footnote,
  icon,
  onBack,
  onPress,
  onSkip,
  step,
  subtitle,
  title,
}: {
  button: string;
  children?: ReactNode;
  footnote?: string;
  icon: ImageSourcePropType;
  onBack: () => void;
  onPress: () => void;
  onSkip: () => void;
  step: number;
  subtitle: string;
  title: string;
}) {
  const styles = useOnboardingStyles();
  return (
    <PatternScreen>
      <Header onBack={onBack} onSkip={onSkip} />
      <StepProgress overlay step={step} />
      <ScrollView
        contentContainerStyle={styles.permissionContent}
        showsVerticalScrollIndicator={false}
        style={styles.permissionScroll}
        testID="onboarding-permission-scroll"
      >
        <Image source={icon} style={styles.permissionIcon} />
        <Text style={[styles.title, styles.permissionTitle]}>{title}</Text>
        <Text
          style={[
            styles.subtitle,
            styles.permissionSubtitle,
            styles.permissionBodyText,
          ]}
        >
          {subtitle}
        </Text>
        {children}
      </ScrollView>
      <PrimaryButton
        label={button}
        onPress={onPress}
        style={[
          styles.bottomButton,
          step === 6 && styles.contactsPermissionButton,
        ]}
      />
      {footnote ? (
        <Text style={styles.permissionFootnote}>{footnote}</Text>
      ) : null}
    </PatternScreen>
  );
}

function PeopleYouKnowTeaser({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  const { colors, isDark } = useAppTheme();
  const people = [
    { action: 'Following', detail: '4 mutual friends', name: 'Jonas Weber' },
    { action: 'Follow', detail: '2 mutual friends', name: 'Sofia Reyes' },
    { action: 'Follow', detail: 'In your contacts', name: 'Tom Hale' },
  ];
  return (
    <View style={styles.peopleTeaser} testID="onboarding-people-teaser">
      <Text style={styles.peopleTeaserTitle}>People you know</Text>
      <Text style={styles.peopleTeaserCount}>
        3 of your contacts are on Tastes
      </Text>
      <Svg
        accessibilityElementsHidden
        height={192}
        testID="onboarding-people-teaser-list"
        viewBox="0 0 338 192"
        width="100%"
      >
        <Defs>
          <Filter
            height="140%"
            id="people-teaser-blur"
            width="140%"
            x="-20%"
            y="-20%"
          >
            <FeGaussianBlur stdDeviation={3} />
          </Filter>
        </Defs>
        <G filter="url(#people-teaser-blur)">
          {people.map((person, index) => {
            const rowTop = index * 64;
            const muted = index === 0;
            return (
              <G
                key={person.name}
                testID={`onboarding-people-teaser-row-${index}`}
              >
                <Circle
                  cx={22}
                  cy={rowTop + 32}
                  fill="#777777"
                  opacity={0.58}
                  r={22}
                />
                <SvgText
                  fill={colors.text}
                  fontSize={15}
                  fontWeight="600"
                  x={56}
                  y={rowTop + 29}
                >
                  {person.name}
                </SvgText>
                <SvgText
                  fill={colors.textSecondary}
                  fontSize={13}
                  x={56}
                  y={rowTop + 48}
                >
                  {person.detail}
                </SvgText>
                <Rect
                  fill={
                    muted
                      ? isDark
                        ? '#2A2A2C'
                        : colors.surfaceMuted
                      : isDark
                        ? '#FFFFFF'
                        : colors.surfaceRaised
                  }
                  height={34}
                  rx={17}
                  width={100}
                  x={238}
                  y={rowTop + 15}
                />
                <SvgText
                  fill={muted ? colors.text : '#0A0A0A'}
                  fontSize={14}
                  fontWeight="500"
                  textAnchor="middle"
                  x={288}
                  y={rowTop + 37}
                >
                  {person.action}
                </SvgText>
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

function NotificationExamples({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.notificationExamples}>
      <NotificationExample
        detail="“The seabass. Go.”"
        meta="now"
        styles={styles}
        title="Amara rated Sabor ★ 4.9"
      />
      <NotificationExample
        detail="You have 2 mutual friends"
        meta="2m ago"
        styles={styles}
        title="Marco started following you"
      />
    </View>
  );
}

function NotificationExample({
  detail,
  meta,
  styles,
  title,
}: {
  detail: string;
  meta: string;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View
      style={styles.notificationCard}
      testID={`onboarding-notification-card-${meta}`}
    >
      <Image source={tastesAppIcon} style={styles.notificationIcon} />
      <View style={styles.notificationCopy}>
        <Text style={styles.notificationApp}>TASTES</Text>
        <Text numberOfLines={1} style={styles.notificationTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.notificationDetail}>
          {detail}
        </Text>
      </View>
      <Text style={styles.notificationMeta}>{meta}</Text>
    </View>
  );
}

const READY_COLLAGE_WIDTH = 402;
const READY_COLLAGE_HEIGHT = 288;

const readyCardFrames = [
  {
    key: 'left',
    left: 0,
    top: 36,
    width: 183,
    height: 216,
    radius: 13,
    assetWidth: 199,
    assetHeight: 248,
    assetLeft: 0,
    assetTop: -16,
  },
  {
    key: 'right',
    left: 216,
    top: 34,
    width: 186,
    height: 218,
    radius: 13,
    assetWidth: 202,
    assetHeight: 250,
    assetLeft: -16,
    assetTop: -16,
  },
  {
    key: 'center',
    left: 78,
    top: 9,
    width: 245,
    height: 268,
    radius: 16,
    assetWidth: 277,
    assetHeight: 288,
    assetLeft: -16,
    assetTop: -10,
  },
] as const;

function ReadyCollage({ dark, width }: { dark: boolean; width: number }) {
  const scale = width / READY_COLLAGE_WIDTH;
  const sources = dark
    ? [readyCardDarkLeft, readyCardDarkRight, readyCardDarkCenter]
    : [readyCardLightLeft, readyCardLightRight, readyCardLightCenter];

  return (
    <View
      style={{
        height: READY_COLLAGE_HEIGHT * scale,
        position: 'relative',
        width,
      }}
      testID="onboarding-ready-collage"
    >
      {readyCardFrames.map((frame, index) => (
        <View
          key={frame.key}
          style={{
            backgroundColor: dark ? '#161616' : '#FFFFFF',
            borderRadius: frame.radius * scale,
            height: frame.height * scale,
            left: frame.left * scale,
            position: 'absolute',
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.47,
            shadowRadius: 15 * scale,
            top: frame.top * scale,
            width: frame.width * scale,
            zIndex: index === 2 ? 2 : 1,
          }}
        >
          <View
            style={{
              borderRadius: frame.radius * scale,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <Image
              resizeMode="stretch"
              source={sources[index]}
              testID={`onboarding-ready-card-${frame.key}`}
              style={{
                height: frame.assetHeight * scale,
                left: frame.assetLeft * scale,
                position: 'absolute',
                top: frame.assetTop * scale,
                width: frame.assetWidth * scale,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PostSignupOnboardingFlow({
  initialScreen,
  onAuthenticationRequired,
  onComplete,
  visualAudit = false,
}: PostSignupOnboardingFlowProps) {
  const { colors, preference, resolvedTheme, setPreference } = useAppTheme();
  const { height: viewportHeight, width: viewportWidth } =
    useWindowDimensions();
  const orientation = useOrientationDimensions();
  const insets = useSafeAreaInsets();
  const { scale: layoutScale } = useResponsiveMetrics();
  const styles = useOnboardingStyles();
  const contentWidth = Math.max(0, viewportWidth - insets.left - insets.right);
  const collageWidth = Math.min(
    DESIGN_VIEWPORT.width * layoutScale,
    contentWidth,
  );
  const landscape = orientation.width > orientation.height;
  const usesCompactDishLayout = viewportHeight < 840 || viewportWidth < 360;
  const usesNarrowPlaceLayout = viewportWidth < 360;
  const api = useTastesApi();
  const [screen, setScreen] = useState<PostSignupScreen>(
    initialScreen ?? 'profile',
  );
  const [history, setHistory] = useState<PostSignupScreen[]>([]);
  const [displayName, setDisplayName] = useState(() =>
    visualAudit ? 'Alex Morgan' : (auth.currentUser?.displayName?.trim() ?? ''),
  );
  const [username, setUsername] = useState(() =>
    visualAudit ? 'alex.morgan' : '',
  );
  const [usernameTouched, setUsernameTouched] = useState(visualAudit);
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error'
  >(visualAudit ? 'available' : 'idle');
  const [city, setCity] = useState(visualAudit ? 'Monaco' : '');
  const [cityFlag, setCityFlag] = useState<ImageSourcePropType>(flagMonaco);
  const [bio, setBio] = useState('');
  const [birthDay, setBirthDay] = useState(15);
  const [birthMonth, setBirthMonth] = useState(3);
  const [birthYear, setBirthYear] = useState(1995);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);
  const photoSheetMotion = useBottomSheetMotion({
    onClose: () => setPhotoSheet(false),
    visible: photoSheet,
  });
  const [dish, setDish] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const placeRequestRef = useRef<Promise<void> | null>(null);
  const placesLoadedRef = useRef(visualAudit);
  const [availablePlaces, setAvailablePlaces] = useState<PlaceCandidate[]>(
    () =>
      visualAudit
        ? [
            {
              id: 'gemini',
              name: 'Gemini',
              address: '7 Rue Princesse Caroline, Monaco',
              image: placeGeminiPopular,
              rating: '4.8',
              reviews: '243 reviews',
              popular: true,
              category: 'Restaurant',
              price: '$$$',
              distance: '0.4 km',
            },
            {
              id: 'wasabi',
              name: 'Wasabi',
              address: '14 Avenue de la Costa, Monaco',
              image: placeWasabi,
              rating: '4.6',
              reviews: '187 reviews',
              popular: true,
              category: 'Japanese',
              price: '$$',
              distance: '0.7 km',
            },
            {
              id: 'terrace',
              name: 'The Terrace',
              address: '2 Avenue de Monte-Carlo, Monaco',
              image: placeGemini,
              rating: '4.5',
              reviews: '128 reviews',
              popular: false,
              category: 'Cafe',
              price: '$$',
              distance: '1.1 km',
            },
          ]
        : [],
  );
  const [darkMode, setDarkMode] = useState(resolvedTheme === 'dark');
  const [automatic, setAutomatic] = useState(preference === 'system');
  const [contacts, setContacts] = useState<ContactCandidate[]>(() =>
    visualAudit
      ? [
          {
            id: 'contact-1',
            name: 'Maya Thompson',
            handle: '@mayat',
            phoneNumber: null,
            invited: false,
            userId: 'maya',
            following: false,
          },
          {
            id: 'contact-2',
            name: 'Oliver Smith',
            handle: '@olivers',
            phoneNumber: null,
            invited: true,
            userId: 'oliver',
            following: true,
          },
          {
            id: 'contact-3',
            name: 'Sofia Rossi',
            handle: '+377 6 12 34 56 78',
            phoneNumber: '+377612345678',
            invited: false,
          },
        ]
      : [],
  );
  const [busy, setBusy] = useState(false);

  const loadPlaces = useCallback(() => {
    if (visualAudit || placesLoadedRef.current) return Promise.resolve();
    if (placeRequestRef.current) return placeRequestRef.current;

    setPlaceLoading(true);
    setPlaceError(null);
    const request = api
      .getVenues({ limit: 8 })
      .then((response) => {
        const mapped = response.data.items.map(
          (venue, index): PlaceCandidate => ({
            id: venue.id,
            name: venue.name,
            address: venue.address ?? venue.city,
            image: venue.imageUrl
              ? { uri: venue.imageUrl }
              : [placeGeminiPopular, placeWasabi, placeGemini][index % 3]!,
            rating: (venue.rating ?? 0).toFixed(1),
            reviews: `${venue.reviewCount ?? 0} reviews`,
            popular: venue.discoverTags?.includes('trending') ?? false,
            category: venue.category ?? 'Restaurant',
            price: '$'.repeat(venue.priceLevel ?? 2),
            distance: `${(venue.distanceKm ?? 0).toFixed(1)} km`,
          }),
        );
        setAvailablePlaces(mapped);
        placesLoadedRef.current = true;
      })
      .catch((error) => setPlaceError(apiErrorMessage(error)))
      .finally(() => {
        setPlaceLoading(false);
        placeRequestRef.current = null;
      });
    placeRequestRef.current = request;
    return request;
  }, [api, visualAudit]);

  useEffect(() => {
    if (screen === 'dish' || screen === 'location') void loadPlaces();
  }, [loadPlaces, screen]);

  useEffect(() => {
    const value = username.trim();
    if (!usernameTouched || value.length === 0) {
      setUsernameStatus('idle');
      return undefined;
    }
    if (
      !checkUsernameAvailabilityInputSchema.safeParse({ username: value })
        .success
    ) {
      setUsernameStatus('invalid');
      return undefined;
    }
    if (visualAudit) {
      setUsernameStatus('available');
      return undefined;
    }
    setUsernameStatus('checking');
    let active = true;
    const timeout = setTimeout(() => {
      void api
        .checkUsernameAvailability({ username: value })
        .then((response) => {
          if (active)
            setUsernameStatus(response.data.available ? 'available' : 'taken');
        })
        .catch(() => {
          if (active) setUsernameStatus('error');
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [api, username, usernameTouched, visualAudit]);

  function navigate(next: PostSignupScreen) {
    setHistory((items) => [...items, screen]);
    setScreen(next);
  }

  function back() {
    const previous = history.at(-1) ?? previousPostSignupScreen[screen];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setScreen(previous);
  }

  async function choosePhoto(camera: boolean) {
    setPhotoSheet(false);
    if (visualAudit) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        `Allow ${camera ? 'camera' : 'photo library'} access to add a profile photo.`,
      );
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  function validatedProfileInput(birthDate?: string) {
    if (displayName.trim().length < 2) {
      Alert.alert(
        'Complete your profile',
        'Add your name and username to continue.',
      );
      return null;
    }
    if (usernameStatus !== 'available') {
      setUsernameTouched(true);
      return null;
    }
    const input = {
      displayName: displayName.trim(),
      username: username.trim(),
      ...(city ? { city } : {}),
      bio: bio.trim(),
      ...(birthDate ? { birthDate } : {}),
    };
    const validation = createUserProfileInputSchema.safeParse(input);
    if (!validation.success) {
      Alert.alert('Check your profile', validation.error.issues[0].message);
      return null;
    }
    return validation.data;
  }

  function continueFromProfile() {
    if (validatedProfileInput()) navigate('birthday');
  }

  async function saveProfile(birthDate: string) {
    const profileInput = validatedProfileInput(birthDate);
    if (!profileInput) return;
    setBusy(true);
    try {
      let photoPath: string | undefined;
      let photoThumbnailPath: string | undefined;
      if (!visualAudit && photoUri && auth.currentUser) {
        photoPath = `profile-images/${auth.currentUser.uid}/avatar.jpg`;
        photoThumbnailPath = `profile-images/${auth.currentUser.uid}/avatar-thumbnail.jpg`;
        await Promise.all([
          uploadJpegImageVariant({
            actions: [{ resize: { width: 512, height: 512 } }],
            compress: 0.76,
            path: photoPath,
            uri: photoUri,
          }),
          uploadJpegImageVariant({
            actions: [{ resize: { width: 320, height: 320 } }],
            compress: 0.68,
            path: photoThumbnailPath,
            uri: photoUri,
          }),
        ]);
      }
      await api.createUserProfile({
        ...profileInput,
        ...(photoPath ? { photoPath } : {}),
        ...(photoThumbnailPath ? { photoThumbnailPath } : {}),
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
    if (visualAudit) {
      setCity('Monaco');
      setCityFlag(flagMonaco);
      enterPlaces();
      return;
    }
    const result = await Location.requestForegroundPermissionsAsync();
    if (!result.granted) {
      Alert.alert(
        'Location is off',
        'Enable location in Settings, or skip this step for now.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
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
    if (visualAudit) {
      setPlaceLoading(false);
      setPlaceError(null);
      return;
    }
    void loadPlaces();
  }

  async function requestContacts() {
    if (visualAudit) {
      navigate('contacts');
      return;
    }
    const permission = await Contacts.requestPermissionsAsync();
    if (permission.status === 'granted') {
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });
      const mapped = result.data
        .filter((item) => item.name)
        .slice(0, 20)
        .map((item) => ({
          id: item.id,
          name: item.name,
          handle: slug(item.name),
          phoneNumber: item.phoneNumbers?.[0]?.number ?? null,
          invited: false,
        }));
      const phoneNumbers = result.data
        .flatMap((item) => item.phoneNumbers ?? [])
        .flatMap((phone) => {
          const normalized = phone.number?.replace(/[\s()-]/g, '') ?? '';
          return /^\+[1-9]\d{7,14}$/.test(normalized) ? [normalized] : [];
        });
      const emails = result.data
        .flatMap((item) => item.emails ?? [])
        .flatMap((email) => (email.email ? [email.email] : []));
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
    if (visualAudit) {
      navigate('ready');
      return;
    }
    try {
      await syncPushNotifications(api, { requestPermission: true });
    } catch (error) {
      Alert.alert('Could not enable notifications', apiErrorMessage(error));
    } finally {
      navigate('ready');
    }
  }

  async function shareInvite() {
    if (visualAudit) return;
    await Share.share({
      message: 'Join me on Tastes: https://tastesapp.com/invite',
    });
  }

  async function textInvite(phoneNumber?: string | null) {
    if (visualAudit) return;
    const message = encodeURIComponent(
      'Join me on Tastes: https://tastesapp.com/invite',
    );
    const separator = Platform.OS === 'ios' ? '&' : '?';
    await Linking.openURL(
      `sms:${phoneNumber ?? ''}${separator}body=${message}`,
    );
  }

  async function inviteContact(contact: ContactCandidate) {
    if (visualAudit) {
      setContacts((items) =>
        items.map((item) =>
          item.id === contact.id ? { ...item, invited: true } : item,
        ),
      );
      return;
    }
    try {
      if (contact.userId)
        await api.followUser({ targetUserId: contact.userId });
      else if (contact.phoneNumber) await textInvite(contact.phoneNumber);
      else await shareInvite();
      setContacts((items) =>
        items.map((item) =>
          item.id === contact.id ? { ...item, invited: true } : item,
        ),
      );
    } catch (error) {
      Alert.alert('Could not open invite', apiErrorMessage(error));
    }
  }

  async function finishOnboarding() {
    setBusy(true);
    try {
      if (!visualAudit)
        await setPreference(automatic ? 'system' : darkMode ? 'dark' : 'light');
      await onComplete(
        buildCompletionInput({
          dish,
          place,
          invitedContactCount: invitedCount,
          appearance: automatic ? 'system' : darkMode ? 'dark' : 'light',
        }),
      );
    } catch (error) {
      if (isUnauthenticated(error)) {
        await onAuthenticationRequired();
        return;
      }
      Alert.alert(
        'Could not finish onboarding',
        error instanceof Error ? error.message : 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const commonSubtitle = 'Can be changed later in Settings';
  const invitedCount = contacts.filter((item) => item.invited).length;

  if (screen === 'city') {
    return (
      <PatternScreen>
        <Header onBack={back} />
        <CityPicker
          onSelect={(name, flag) => {
            setCity(name);
            setCityFlag(flag);
            back();
          }}
        />
      </PatternScreen>
    );
  }

  if (screen === 'profile') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.profileKeyboardAvoiding}
      >
        <PatternScreen>
          <View style={styles.profileKeyboardLayout}>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.profilePage}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.profileScroll}
              testID="onboarding-profile-scroll"
            >
              <StepProgress step={1} />
              <Text style={[styles.title, styles.profileTitle]}>
                Create your profile
              </Text>
              <Text style={[styles.subtitle, styles.profileSubtitle]}>
                This is how friends find you.
              </Text>
              <Pressable
                accessibilityLabel="Add profile photo"
                onPress={() => setPhotoSheet(true)}
                style={styles.photo}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photoImage} />
                ) : (
                  <Image source={addPhoto} style={styles.addPhotoIcon} />
                )}
                {photoUri ? (
                  <View style={styles.photoAddBadge}>
                    <Text style={styles.photoAddBadgeText}>+</Text>
                  </View>
                ) : null}
              </Pressable>
              <Text style={styles.profileIdentity}>
                {displayName || 'Your name'}{' '}
                {username ? `@${username}` : '@username'}
              </Text>
              <View
                style={styles.profileFieldsCard}
                testID="onboarding-profile-fields-card"
              >
                <View style={styles.profileField}>
                  <Text style={styles.profileFieldLabel}>Name</Text>
                  <TextInput
                    value={displayName}
                    maxLength={30}
                    onChangeText={setDisplayName}
                    placeholder="What your friends call you"
                    placeholderTextColor={colors.placeholder}
                    style={styles.profileFieldInput}
                  />
                </View>
                <View style={styles.profileSeparator} />
                <View style={styles.profileField}>
                  <Text style={styles.profileFieldLabel}>Username</Text>
                  <TextInput
                    value={username}
                    autoCapitalize="none"
                    maxLength={30}
                    onChangeText={(value) => {
                      setUsername(value);
                      setUsernameTouched(true);
                    }}
                    placeholder="@yourname"
                    placeholderTextColor={colors.placeholder}
                    style={styles.profileFieldInput}
                  />
                  {usernameStatus === 'checking' ? (
                    <Text style={styles.usernameChecking}>Checking…</Text>
                  ) : null}
                  {usernameStatus === 'available' ? (
                    <Text style={styles.usernameAvailable}>
                      ✓ This name is available
                    </Text>
                  ) : null}
                  {usernameStatus === 'taken' ? (
                    <Text style={styles.usernameTaken}>
                      ✗ That name is taken
                    </Text>
                  ) : null}
                  {usernameStatus === 'invalid' ? (
                    <Text style={styles.usernameTaken}>
                      ✗ Use letters, numbers, dots, or underscores only
                    </Text>
                  ) : null}
                  {usernameStatus === 'error' ? (
                    <Text style={styles.usernameTaken}>
                      ✗ Couldn’t check this name. Try again.
                    </Text>
                  ) : null}
                </View>
                <View style={styles.profileSeparator} />
                <Pressable
                  onPress={() => navigate('city')}
                  style={styles.profileField}
                >
                  <Text style={styles.profileFieldLabel}>Location</Text>
                  <View style={styles.locationSelection}>
                    <Text
                      style={[
                        styles.profileFieldInput,
                        !city && styles.profilePlaceholder,
                      ]}
                    >
                      {city || 'Select your city'}
                    </Text>
                    {city ? (
                      <Image source={cityFlag} style={styles.locationFlag} />
                    ) : null}
                    <Image
                      source={chevronRight}
                      style={styles.locationChevron}
                    />
                  </View>
                </Pressable>
                <View style={styles.profileSeparator} />
                <View style={[styles.profileField, styles.profileBioField]}>
                  <View style={styles.profileLabelRow}>
                    <Text style={styles.profileFieldLabel}>Bio</Text>
                    <Text style={styles.bioCounter}>{bio.length}/80</Text>
                  </View>
                  <TextInput
                    maxLength={80}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="What do you always order?"
                    placeholderTextColor={colors.placeholder}
                    style={styles.profileFieldInput}
                  />
                  <View style={styles.bioSuggestions}>
                    {[
                      'Ramen obsessive',
                      'Natural wine person',
                      'Will queue for a pastry',
                    ].map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        onPress={() => setBio(suggestion)}
                        style={styles.bioSuggestion}
                      >
                        <Text style={styles.bioSuggestionText}>
                          {suggestion}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={styles.profileButtonArea}>
              <PrimaryButton
                disabled={usernameStatus !== 'available'}
                label="Continue"
                loading={busy}
                onPress={continueFromProfile}
              />
              <Text style={styles.changeLater}>
                You can change all of this later.
              </Text>
            </View>
          </View>
          <Modal
            animationType="none"
            transparent
            visible={photoSheet}
            onRequestClose={photoSheetMotion.close}
          >
            <Pressable
              onPress={photoSheetMotion.close}
              style={styles.modalBackdrop}
            >
              <Animated.View
                style={[
                  styles.sheetWrap,
                  { transform: [{ translateY: photoSheetMotion.translateY }] },
                ]}
              >
                <View
                  style={styles.sheetDragArea}
                  {...photoSheetMotion.panHandlers}
                >
                  <View style={styles.sheetHandle} />
                </View>
                <View style={styles.sheet}>
                  <Pressable
                    onPress={() =>
                      photoSheetMotion.closeThen(() => void choosePhoto(true))
                    }
                    style={styles.sheetAction}
                  >
                    <Text style={styles.sheetText}>Take Photo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      photoSheetMotion.closeThen(() => void choosePhoto(false))
                    }
                    style={styles.sheetAction}
                  >
                    <Text style={styles.sheetText}>Choose from Library</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      photoSheetMotion.closeThen(() => setPhotoUri(null))
                    }
                    style={styles.sheetAction}
                  >
                    <Text style={styles.destructive}>Remove Photo</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={photoSheetMotion.close}
                  style={[styles.sheet, styles.cancel]}
                >
                  <Text style={styles.sheetText}>Cancel</Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          </Modal>
        </PatternScreen>
      </KeyboardAvoidingView>
    );
  }

  if (screen === 'birthday') {
    const maximumDay = daysInMonth(birthMonth, birthYear);
    const days = Array.from({ length: maximumDay }, (_, index) => index + 1);
    const currentYear = new Date().getFullYear();
    const years = Array.from(
      { length: 101 },
      (_, index) => currentYear - 15 - index,
    ).reverse();
    const safeDay = Math.min(birthDay, maximumDay);
    const selectedBirthDate = new Date(birthYear, birthMonth, safeDay);
    const ageCutoff = new Date();
    ageCutoff.setHours(23, 59, 59, 999);
    ageCutoff.setFullYear(ageCutoff.getFullYear() - 15);
    const birthdayEligible = selectedBirthDate <= ageCutoff;
    return (
      <PatternScreen>
        <Header onBack={back} />
        <StepProgress overlay step={1} />
        <View style={styles.birthdayPage}>
          <Text style={[styles.title, styles.birthdayTitle]}>
            When is your birthday?
          </Text>
          <Text style={[styles.subtitle, styles.birthdaySubtitle]}>
            We’ll use this to personalize your experience and confirm your age.
          </Text>
          <View style={styles.birthdayPicker}>
            <View
              pointerEvents="none"
              style={styles.birthdaySelectionBand}
              testID="onboarding-birthday-selection-band"
            />
            <BirthdayColumn
              label="DAY"
              onChange={setBirthDay}
              selected={safeDay}
              values={days}
            />
            <BirthdayMonthColumn
              label="MONTH"
              onChange={(value) => {
                setBirthMonth(value);
                setBirthDay((day) =>
                  Math.min(day, daysInMonth(value, birthYear)),
                );
              }}
              selected={birthMonth}
            />
            <BirthdayColumn
              label="YEAR"
              onChange={(value) => {
                setBirthYear(value);
                setBirthDay((day) =>
                  Math.min(day, daysInMonth(birthMonth, value)),
                );
              }}
              selected={birthYear}
              values={years}
            />
          </View>
          {!birthdayEligible ? (
            <Text style={styles.birthdayError}>
              You must be at least 15 years old.
            </Text>
          ) : null}
        </View>
        <PrimaryButton
          disabled={!birthdayEligible}
          label="Continue"
          loading={busy}
          onPress={() =>
            void saveProfile(isoBirthDate(safeDay, birthMonth, birthYear))
          }
          style={[styles.bottomButton, styles.birthdayButton]}
        />
      </PatternScreen>
    );
  }

  if (screen === 'dish') {
    return (
      <PatternScreen>
        <Header onBack={back} onSkip={() => navigate('location')} />
        <StepHeader
          landscape={landscape}
          step={2}
          title="Your favourite dish!"
          subtitle={commonSubtitle}
        />
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.pills}
          showsVerticalScrollIndicator={false}
          style={[
            styles.pillsPanel,
            usesCompactDishLayout && styles.pillsPanelCompact,
            landscape && styles.pillsPanelLandscape,
          ]}
        >
          {dishes.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => setDish(item.label)}
              style={[styles.pill, dish === item.label && styles.pillSelected]}
            >
              <View style={styles.pillContent}>
                <Text
                  style={[
                    styles.pillText,
                    dish === item.label && styles.pillTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
                <Image
                  source={item.icon}
                  style={[
                    styles.dishIcon,
                    dish !== item.label && styles.dishIconDimmed,
                  ]}
                />
              </View>
            </Pressable>
          ))}
        </ScrollView>
        {!dish ? (
          <Text style={styles.helper}>Select at least one to continue</Text>
        ) : null}
        <PrimaryButton
          label="Continue"
          disabled={!dish}
          onPress={() => navigate('location')}
          style={styles.bottomButton}
        />
      </PatternScreen>
    );
  }

  if (screen === 'location')
    return (
      <PermissionScreen
        step={3}
        icon={permissionLocation}
        title="See what’s good near you"
        subtitle="Find highly rated places nearby and recommendations from friends."
        button="Use My Location"
        footnote="Your precise location is never shown to other users. It’s only used to personalize nearby recommendations."
        onBack={back}
        onSkip={enterPlaces}
        onPress={requestLocation}
      >
        <View style={styles.locationPreview}>
          <View style={styles.locationRoadHorizontal} />
          <View style={styles.locationRoadVertical} />
          <View style={styles.locationPinRing}>
            <View style={styles.locationPin} />
          </View>
          <Text style={styles.locationPreviewLabel}>Places near you</Text>
        </View>
      </PermissionScreen>
    );
  if (screen === 'locationDenied')
    return (
      <PermissionScreen
        step={3}
        icon={permissionLocation}
        title="Location is off"
        subtitle="Turn on location in Settings to discover places and friends near you."
        button="Open Settings"
        onBack={back}
        onSkip={enterPlaces}
        onPress={() => Linking.openSettings()}
      />
    );

  if (screen === 'place') {
    const normalizedPlaceQuery = placeQuery.trim().toLowerCase();
    const filteredPlaces = availablePlaces.filter((candidate) => {
      return (
        !normalizedPlaceQuery ||
        candidate.name.toLowerCase().includes(normalizedPlaceQuery) ||
        candidate.category?.toLowerCase().includes(normalizedPlaceQuery)
      );
    });
    const noResults = !placeLoading && filteredPlaces.length === 0;
    return (
      <PatternScreen>
        <Header onBack={back} onSkip={() => navigate('style')} />
        <StepHeader
          landscape={landscape}
          step={4}
          title="Choose your favourite place"
          subtitle={commonSubtitle}
        />
        <View
          style={[
            styles.placesCard,
            usesNarrowPlaceLayout && styles.placesCardNarrow,
            landscape && styles.placesCardLandscape,
          ]}
          testID="onboarding-place-card"
        >
          <View
            pointerEvents="none"
            style={styles.placesCardOutline}
            testID="onboarding-place-card-outline"
          />
          <View style={styles.placeHeader}>
            <View style={styles.placeSearch}>
              <PlaceSearchIcon
                color={colors.text}
                style={styles.placeSearchIcon}
              />
              <TextInput
                value={placeQuery}
                onChangeText={setPlaceQuery}
                placeholder="Search places"
                placeholderTextColor={colors.placeholder}
                style={styles.placeSearchInput}
              />
              {placeQuery.length > 0 ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                  onPress={() => setPlaceQuery('')}
                  style={styles.placeClear}
                >
                  <Image source={searchClose} style={styles.placeClearIcon} />
                </Pressable>
              ) : (
                <View style={styles.placeClearSpacer} />
              )}
            </View>
          </View>
          {placeLoading ? (
            <ScrollView
              contentContainerStyle={styles.placeListContent}
              style={styles.placeList}
              showsVerticalScrollIndicator={false}
            >
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
            <ScrollView
              contentContainerStyle={styles.empty}
              keyboardShouldPersistTaps="handled"
              style={styles.placeList}
            >
              <Image source={emptySearch} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>Couldn’t load places</Text>
              <Text style={styles.emptyText}>{placeError}</Text>
              <Pressable onPress={enterPlaces}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </ScrollView>
          ) : noResults ? (
            <ScrollView
              contentContainerStyle={styles.empty}
              style={styles.placeList}
            >
              <Image source={emptySearch} style={styles.emptyIcon} />
              <Text style={styles.emptyTitle}>No places found</Text>
              <Text style={styles.emptyText}>
                Try a different search or clear a filter.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              contentContainerStyle={styles.placeListContent}
              data={filteredPlaces}
              initialNumToRender={4}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(item) => item.id}
              maxToRenderPerBatch={4}
              renderItem={({ item }) => {
                const selected = place === item.id;
                return (
                  <Pressable
                    onPress={() => setPlace(item.id)}
                    style={[styles.venue, selected && styles.venueSelected]}
                  >
                    <Image
                      source={selected ? placeSelected : placeUnselected}
                      style={styles.venueSelection}
                    />
                    <View style={styles.venueMainRow}>
                      <View style={styles.venueImageWrap}>
                        <LazyVenueImage
                          source={item.image}
                          testID={`onboarding-place-image-${item.id}`}
                        />
                        {item.popular ? (
                          <View style={styles.popularBadge}>
                            <Text style={styles.popularText}>Popular</Text>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={styles.venueCopy}
                        testID={`onboarding-place-copy-${item.id}`}
                      >
                        <View style={styles.venueDetails}>
                          <Text numberOfLines={1} style={styles.venueTitle}>
                            {item.name}
                          </Text>
                          <Text numberOfLines={2} style={styles.venueAddress}>
                            {item.address}
                          </Text>
                          <View style={styles.ratingRow}>
                            <View style={styles.ratingTag}>
                              <Image
                                source={ratingStar}
                                style={styles.ratingStar}
                              />
                              <Text style={styles.ratingValue}>
                                {item.rating}
                              </Text>
                            </View>
                            <Text numberOfLines={1} style={styles.reviews}>
                              {item.reviews}
                            </Text>
                          </View>
                        </View>
                        <View
                          style={styles.venueTagsRow}
                          testID={`onboarding-place-tags-${item.id}`}
                        >
                          <View style={styles.venueTag}>
                            <Text numberOfLines={1} style={styles.venueTagText}>
                              {item.category}
                            </Text>
                          </View>
                          <View style={styles.venueTag}>
                            <Text numberOfLines={1} style={styles.venueTagText}>
                              {item.price}
                            </Text>
                          </View>
                          <View style={styles.venueTag}>
                            <Text numberOfLines={1} style={styles.venueTagText}>
                              {item.distance}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
              style={styles.placeList}
              testID="onboarding-place-list"
              windowSize={3}
            />
          )}
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={
            resolvedTheme === 'dark'
              ? ['rgba(8,8,8,0)', colors.surface, colors.surface]
              : ['rgba(242,239,234,0)', colors.surface, colors.surface]
          }
          locations={[0, 0.58, 1]}
          style={styles.placeFooterGradient}
        />
        <PrimaryButton
          label="Continue"
          disabled={!place}
          onPress={() => navigate('style')}
          style={styles.bottomButton}
        />
      </PatternScreen>
    );
  }

  if (screen === 'style') {
    return (
      <PatternScreen>
        <Header onBack={back} onSkip={() => navigate('contactsPermission')} />
        <StepHeader
          landscape={landscape}
          step={5}
          title="Pick your look"
          subtitle="Switch anytime in Settings."
        />
        <View
          style={[
            styles.styleCardViewport,
            landscape && styles.styleCardLandscape,
          ]}
          testID="onboarding-appearance-viewport"
        >
          <ScrollView
            contentContainerStyle={styles.styleCardContent}
            showsVerticalScrollIndicator={false}
            testID="onboarding-appearance-scroll"
          >
            <View style={styles.previews}>
              {[false, true].map((dark) => (
                <Pressable
                  key={String(dark)}
                  onPress={() => {
                    setDarkMode(dark);
                    setAutomatic(false);
                    void setPreference(dark ? 'dark' : 'light');
                  }}
                  style={[
                    styles.previewChoice,
                    !automatic &&
                      darkMode === dark &&
                      styles.previewChoiceSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.abstractPreview,
                      dark ? styles.previewDark : styles.previewLight,
                    ]}
                  >
                    <View style={styles.previewTopRow}>
                      <View style={styles.previewBarShort} />
                      <View style={styles.previewDotAccent} />
                    </View>
                    <View style={styles.previewDotPurple} />
                    <View style={styles.previewBar} />
                    <LinearGradient
                      colors={['#FFAB2E', '#FF5A43']}
                      style={styles.previewGradient}
                    />
                    <Text style={styles.previewStars}>★★★★★</Text>
                    <View style={styles.previewBar} />
                    <View style={styles.previewBarShort} />
                  </View>
                  <View style={styles.previewLabelRow}>
                    <View
                      style={[
                        styles.radio,
                        !automatic && darkMode === dark && styles.radioSelected,
                      ]}
                    >
                      {!automatic && darkMode === dark ? (
                        <Text style={styles.radioCheck}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.previewLabel}>
                      {dark ? 'Dark' : 'Light'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={styles.automaticRow}>
              <View>
                <Text style={styles.automaticText}>Match my device</Text>
                <Text style={styles.automaticSubtitle}>
                  Follows your phone’s light/dark setting
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Match my device"
                accessibilityRole="switch"
                accessibilityState={{ checked: automatic }}
                hitSlop={8}
                onPress={() => {
                  const value = !automatic;
                  setAutomatic(value);
                  const currentIsDark = resolvedTheme === 'dark';
                  setDarkMode(currentIsDark);
                  void setPreference(
                    value ? 'system' : currentIsDark ? 'dark' : 'light',
                  );
                }}
                style={[
                  styles.appearanceSwitch,
                  automatic && styles.appearanceSwitchOn,
                ]}
              >
                <View style={styles.appearanceSwitchThumb} />
              </Pressable>
            </View>
            <Text style={styles.livePreviewCaption}>
              Live preview — the whole app changes as you tap.
            </Text>
          </ScrollView>
        </View>
        <PrimaryButton
          label="Continue"
          onPress={() => navigate('contactsPermission')}
          style={styles.bottomButton}
        />
      </PatternScreen>
    );
  }

  if (screen === 'contactsPermission')
    return (
      <PermissionScreen
        step={6}
        icon={permissionContacts}
        title="Find your people"
        subtitle="Your feed is only as good as who you follow."
        button="Allow Contacts"
        onBack={back}
        onSkip={() => navigate('invite')}
        onPress={requestContacts}
      >
        <PeopleYouKnowTeaser styles={styles} />
      </PermissionScreen>
    );

  if (screen === 'contacts') {
    return (
      <PatternScreen>
        <Header onBack={back} onSkip={() => navigate('invite')} />
        <StepProgress overlay step={6} />
        <View style={styles.listPage}>
          <Text style={styles.listTitle}>Friends from contacts</Text>
          <Text style={styles.listSubtitle}>
            Follow people already on Tastes or invite the rest.
          </Text>
          <ScrollView>
            {contacts.map((contact, index) => (
              <View key={contact.id} style={styles.contactRow}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: [
                        '#263854',
                        '#24504c',
                        '#4b315d',
                        '#5a4427',
                        '#2f5438',
                      ][index % 5],
                    },
                  ]}
                >
                  <Text style={styles.avatarText}>
                    {initials(contact.name)}
                  </Text>
                </View>
                <View style={styles.contactCopy}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactHandle}>{contact.handle}</Text>
                </View>
                <Pressable
                  onPress={() => inviteContact(contact)}
                  disabled={contact.invited}
                  style={[
                    styles.inviteButton,
                    contact.invited && styles.invitedButton,
                  ]}
                >
                  <Text style={styles.inviteText}>
                    {contact.userId
                      ? contact.invited
                        ? 'Following'
                        : 'Follow'
                      : contact.invited
                        ? 'Invited'
                        : 'Invite'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
        <PrimaryButton
          label="Done"
          onPress={() => navigate('invite')}
          style={styles.bottomButton}
        />
      </PatternScreen>
    );
  }

  if (screen === 'invite') {
    return (
      <PatternScreen>
        <Header onBack={back} onSkip={() => navigate('notifications')} />
        <StepProgress overlay step={6} />
        <ScrollView
          contentContainerStyle={styles.invitePage}
          showsVerticalScrollIndicator={false}
          style={styles.inviteScroll}
          testID="onboarding-invite-scroll"
        >
          <Image source={invitePeople} style={styles.peopleIcon} />
          <Text style={styles.title}>Invite your friends</Text>
          <Text style={[styles.subtitle, styles.permissionSubtitle]}>
            Add 3 friends and see their ratings and recommendations
          </Text>
          {!visualAudit && invitedCount ? (
            <>
              <Text style={styles.progressText}>
                {Math.min(invitedCount, 3)} of 3 friends invited
              </Text>
              <View style={styles.progressDots}>
                {[0, 1, 2].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.progressDot,
                      index < Math.min(invitedCount, 3) &&
                        styles.progressDotActive,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.inviteActions}>
            <Pressable onPress={shareInvite} style={styles.actionRow}>
              <Image source={inviteShare} style={styles.actionIcon} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionText}>Share your invite link</Text>
                <Text style={styles.actionSubtitle}>
                  Copy and share with your friends
                </Text>
              </View>
              <Image source={chevronRight} style={styles.actionChevron} />
            </Pressable>
            <Pressable onPress={() => textInvite()} style={styles.actionRow}>
              <Image source={inviteMessage} style={styles.actionIcon} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionText}>Invite friend via text</Text>
                <Text style={styles.actionSubtitle}>
                  Send an invite directly
                </Text>
              </View>
              <Image source={chevronRight} style={styles.actionChevron} />
            </Pressable>
            <Pressable onPress={requestContacts} style={styles.actionRow}>
              <Image source={inviteContacts} style={styles.actionIcon} />
              <View style={styles.actionCopy}>
                <Text style={styles.actionText}>Invite from your contacts</Text>
                <Text style={styles.actionSubtitle}>
                  Find friends already on Tastes
                </Text>
              </View>
              <Image source={chevronRight} style={styles.actionChevron} />
            </Pressable>
          </View>
        </ScrollView>
        <PrimaryButton
          label="Continue"
          onPress={() => navigate('notifications')}
          style={styles.bottomButton}
        />
      </PatternScreen>
    );
  }

  if (screen === 'notifications')
    return (
      <PermissionScreen
        step={7}
        icon={permissionNotifications}
        title="Stay in the loop"
        subtitle="Only the good stuff — when friends rate, follow, or reply."
        button="Turn on Notifications"
        footnote="Change these anytime in Settings."
        onBack={back}
        onSkip={() => navigate('ready')}
        onPress={requestNotifications}
      >
        <NotificationExamples styles={styles} />
      </PermissionScreen>
    );

  // Reserve at least half the row for the copy and action, including in a
  // nearly square window. The whole page can scroll if its height is limited.
  const landscapeCollageWidth = Math.max(
    0,
    Math.min(collageWidth, (contentWidth - 76 * layoutScale) * 0.46),
  );
  const readyIsDark = resolvedTheme === 'dark';
  return (
    <LinearGradient
      colors={
        readyIsDark
          ? ['#560E0B', '#080808']
          : ['rgba(184,47,41,0.7)', '#F2EFEA', '#F2EFEA']
      }
      locations={readyIsDark ? [0, 1] : [0, 0.42449, 1]}
      style={[
        styles.ready,
        { backgroundColor: readyIsDark ? '#080808' : '#F2EFEA' },
      ]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image
          resizeMode="stretch"
          source={readyPattern}
          style={[
            styles.readyPattern,
            { tintColor: readyIsDark ? '#FFFFFF' : '#000000' },
          ]}
          testID="onboarding-ready-pattern"
        />
      </View>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.ready}>
        <StepProgress complete overlay step={7} />
        <ScrollView
          contentContainerStyle={[
            styles.readyContent,
            landscape && styles.readyContentLandscape,
          ]}
          showsVerticalScrollIndicator={false}
          testID="onboarding-ready-scroll"
        >
          <ReadyCollage
            dark={readyIsDark}
            width={landscape ? landscapeCollageWidth : collageWidth}
          />
          <View
            style={[
              styles.readyActions,
              landscape && styles.readyActionsLandscape,
            ]}
          >
            <View
              style={[styles.readyCopy, landscape && styles.readyCopyLandscape]}
            >
              <Text style={styles.readyTitle}>You’re ready!</Text>
              <Text style={styles.readySubtitle}>
                Write your first 3 reviews to unlock personalized
                recommendations
              </Text>
            </View>
            <PrimaryButton
              buttonStyle={styles.readyButtonSurface}
              contentGap={8}
              icon={startRating}
              iconSize={24}
              label="Start rating"
              loading={busy}
              onPress={finishOnboarding}
              style={[
                styles.readyButton,
                landscape && styles.readyButtonLandscape,
              ]}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (
  colors: ThemeColors,
  isDark: boolean,
  landscape: boolean,
  bottomGutter: number,
) =>
  responsiveStyleSheet({
    header: {
      position: 'absolute',
      top: landscape ? -43 : 0,
      left: 0,
      right: 0,
      height: 102,
      zIndex: 3,
    },
    skip: { position: 'absolute', top: 58, right: 16, zIndex: 3, padding: 8 },
    skipText: { color: colors.textMuted, fontSize: 14 },
    title: {
      color: colors.text,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    bottomButton: {
      position: 'absolute',
      left: 36,
      right: 36,
      bottom: bottomGutter,
    },
    contactsPermissionButton: { bottom: landscape ? bottomGutter : 24 },
    stepHeader: {
      position: 'absolute',
      top: 66,
      left: 16,
      right: 16,
      alignItems: 'center',
    },
    stepHeaderLandscape: { top: 64 },
    stepProgress: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stepProgressOverlay: {
      position: 'absolute',
      top: 66,
      left: 0,
      right: 0,
      zIndex: 4,
      justifyContent: 'center',
    },
    stepSegment: { width: 26, height: 4, borderRadius: 2 },
    stepSegmentDone: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.82)',
    },
    stepSegmentCurrent: { backgroundColor: '#FF4757' },
    stepSegmentUpcoming: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
    },
    stepTitle: {
      marginTop: 44,
      fontSize: 24,
      lineHeight: 29,
      letterSpacing: 0.6,
    },
    stepSubtitle: {
      marginTop: 7,
      fontSize: 15,
      lineHeight: 18,
      letterSpacing: -0.41,
      color: colors.textSecondary,
    },
    permissionScroll: {
      position: 'absolute',
      top: landscape ? 80 : 130,
      left: 16,
      right: 16,
      bottom: Math.max(94, bottomGutter + 70),
    },
    permissionContent: { alignItems: 'center', paddingBottom: 16 },
    permissionIcon: {
      width: 60,
      height: 60,
      marginBottom: 24,
      tintColor: colors.text,
    },
    permissionTitle: { fontSize: 24, lineHeight: 29 },
    permissionSubtitle: {
      width: '100%',
      marginTop: 7,
      fontSize: 15,
      lineHeight: 18,
      textAlign: 'center',
    },
    permissionBodyText: {
      color: isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted,
    },
    permissionFootnote: {
      position: 'absolute',
      left: 36,
      right: 36,
      bottom: 4,
      color: colors.textMuted,
      fontSize: 11,
      textAlign: 'center',
    },
    birthdayPage: {
      flex: 1,
      paddingTop: landscape ? 92 : 204,
      paddingHorizontal: 16,
      alignItems: 'center',
    },
    birthdayTitle: {
      fontSize: landscape ? 27 : 32,
      lineHeight: landscape ? 33 : 39,
      fontWeight: '700',
      letterSpacing: -0.7,
    },
    birthdaySubtitle: {
      maxWidth: 330,
      marginTop: 15,
      color: isDark ? '#B9B9BE' : colors.textSecondary,
      fontSize: 17,
      lineHeight: 24,
      letterSpacing: -0.25,
      textAlign: 'center',
    },
    birthdayPicker: {
      width: '100%',
      maxWidth: 370,
      height: landscape ? 220 : 250,
      marginTop: landscape ? 22 : 36,
      overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: isDark ? '#292B2C' : colors.border,
      borderRadius: 22,
      backgroundColor: isDark ? 'rgba(8,9,9,0.88)' : 'rgba(255,255,255,0.92)',
    },
    birthdaySelectionBand: {
      position: 'absolute',
      zIndex: 0,
      top: landscape ? 106 : 123,
      left: 10,
      right: 10,
      height: landscape ? 34 : 39,
      borderWidth: 1,
      borderColor: isDark ? '#7D2B30' : '#EC8990',
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(116,40,44,0.42)' : '#FCE5E7',
      shadowColor: '#FF4757',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.2 : 0.08,
      shadowRadius: 8,
    },
    birthdayColumn: {
      zIndex: 1,
      flex: 1,
      height: '100%',
      paddingTop: landscape ? 10 : 17,
      paddingBottom: landscape ? 4 : 5,
      alignItems: 'center',
    },
    birthdayMonthColumn: {
      flex: 1.35,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.hairline,
    },
    birthdayColumnLabel: {
      height: 28,
      color: isDark ? '#D5D5DA' : colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      letterSpacing: 2.4,
    },
    birthdayWheel: {
      width: '100%',
      height: landscape ? 170 : 195,
      flexGrow: 0,
    },
    birthdayWheelContent: {
      paddingVertical: landscape ? 68 : 78,
    },
    birthdayValue: {
      width: '100%',
      height: landscape ? 34 : 39,
      alignItems: 'center',
      justifyContent: 'center',
    },
    birthdayAdjacent: {
      color: isDark ? '#8B8B90' : colors.textMuted,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '500',
    },
    birthdayFar: { opacity: 0.35 },
    birthdaySelectedText: {
      color: colors.text,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '600',
    },
    birthdayButton: { left: 26, right: 26, height: 42 },
    birthdayError: {
      marginTop: 14,
      color: colors.primary,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    locationPreview: {
      width: '100%',
      height: 178,
      marginTop: 38,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: isDark ? '#252626' : '#E9E7E1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationRoadHorizontal: {
      position: 'absolute',
      left: -20,
      right: -20,
      height: 24,
      backgroundColor: isDark ? '#343737' : '#F7F5EF',
      transform: [{ rotate: '-8deg' }],
    },
    locationRoadVertical: {
      position: 'absolute',
      top: -20,
      bottom: -20,
      width: 22,
      backgroundColor: isDark ? '#343737' : '#F7F5EF',
      transform: [{ rotate: '18deg' }],
    },
    locationPinRing: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(211,59,53,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationPin: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 4,
      borderColor: '#FFFFFF',
      backgroundColor: '#D33B35',
    },
    locationPreviewLabel: {
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      overflow: 'hidden',
      borderRadius: 10,
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      backgroundColor: colors.surface,
    },
    profileKeyboardAvoiding: { flex: 1 },
    profileKeyboardLayout: { flex: 1 },
    profileScroll: { flex: 1 },
    profilePage: {
      flexGrow: 1,
      paddingHorizontal: 16,
      paddingTop: landscape ? 24 : 66,
      paddingBottom: 16,
      alignItems: 'center',
    },
    profileButtonArea: {
      paddingHorizontal: 36,
      paddingBottom: bottomGutter,
      gap: 7,
    },
    profileSubtitle: { marginTop: 7, width: 285, fontSize: 15, lineHeight: 18 },
    profileTitle: {
      marginTop: 60,
      fontSize: 24,
      lineHeight: 29,
      letterSpacing: 0.6,
    },
    photo: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 18,
      marginBottom: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    photoImage: { width: '100%', height: '100%', borderRadius: 59 },
    photoAddBadge: {
      position: 'absolute',
      right: 3,
      bottom: 3,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#E63946',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoAddBadgeText: {
      color: '#FFFFFF',
      fontSize: 20,
      lineHeight: 22,
      fontWeight: '700',
    },
    addPhotoIcon: { width: 28, height: 28 },
    profileIdentity: {
      color: colors.textMuted,
      fontSize: 15,
      marginBottom: 18,
    },
    profileFieldsCard: {
      width: '100%',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.surface,
    },
    profileField: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
    profileBioField: { paddingBottom: 16, gap: 12 },
    profileFieldLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    profileFieldInput: {
      flex: 1,
      minHeight: 22,
      padding: 0,
      color: colors.text,
      fontSize: 16,
    },
    profilePlaceholder: { color: colors.placeholder },
    profileSeparator: { height: 1, backgroundColor: colors.hairline },
    profileLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
    bioCounter: { color: colors.placeholder, fontSize: 12 },
    usernameChecking: { color: colors.textMuted, fontSize: 12 },
    usernameAvailable: { color: '#3DDC97', fontSize: 12 },
    usernameTaken: { color: '#E63946', fontSize: 12 },
    bioSuggestions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    bioSuggestion: {
      height: 30,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 15,
      backgroundColor: colors.surfaceRaised,
      justifyContent: 'center',
    },
    bioSuggestionText: { color: colors.text, fontSize: 13 },
    changeLater: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
    field: {
      width: '100%',
      height: 53,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      color: colors.text,
      fontSize: 15,
      paddingHorizontal: 4,
    },
    fieldRow: {
      width: '100%',
      height: 53,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    locationLabel: { color: colors.placeholder, fontSize: 15 },
    locationValue: { color: colors.textMuted, fontSize: 15 },
    locationSelection: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    locationFlag: { width: 18, height: 18 },
    locationChevron: { width: 8, height: 16, marginLeft: 2 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
      padding: 16,
      paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    },
    sheetWrap: { gap: 9 },
    sheetDragArea: {
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      overflow: 'hidden',
    },
    sheetAction: {
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    sheetText: { color: colors.text, fontSize: 16 },
    destructive: { color: '#e34840', fontSize: 16 },
    cancel: { height: 56, alignItems: 'center', justifyContent: 'center' },
    listPage: {
      flex: 1,
      paddingTop: landscape ? 64 : 126,
      paddingHorizontal: 16,
      paddingBottom: Math.max(90, bottomGutter + 66),
    },
    listTitle: {
      color: colors.text,
      fontSize: 23,
      lineHeight: 28,
      fontWeight: '700',
      marginBottom: 14,
    },
    listSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: -7,
      marginBottom: 16,
    },
    search: {
      height: 44,
      borderRadius: 10,
      backgroundColor: colors.surfaceRaised,
      paddingHorizontal: 14,
      color: colors.text,
      fontSize: 14,
    },
    cityRow: {
      height: 49,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
      flexDirection: 'row',
      alignItems: 'center',
    },
    cityFlag: { width: 20, height: 20, marginRight: 14 },
    cityName: { color: colors.text, fontSize: 15, flex: 1 },
    cityCountry: { color: colors.textMuted, fontSize: 13 },
    pillsPanel: {
      position: 'absolute',
      top: 212,
      left: 0,
      right: 0,
      bottom: Math.max(110, bottomGutter + 86),
    },
    pillsPanelCompact: { top: 205 },
    pillsPanelLandscape: { top: 148 },
    pills: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
    pill: {
      height: 45,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillSelected: { backgroundColor: colors.primary },
    pillText: { color: colors.text, fontSize: 15, fontWeight: '400' },
    pillTextSelected: { color: colors.onPrimary },
    pillContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dishIcon: { width: 18, height: 18 },
    dishIconDimmed: { opacity: 1 },
    helper: {
      position: 'absolute',
      bottom: Math.max(90, bottomGutter + 66),
      alignSelf: 'center',
      color: colors.textMuted,
      fontSize: 12,
    },
    placesCard: {
      position: 'absolute',
      top: 188,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      backgroundColor: colors.canvas,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    placesCardOutline: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 24,
      zIndex: 1,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    placesCardNarrow: { top: 217 },
    placesCardLandscape: { top: 148 },
    placeHeader: {
      height: 65,
      paddingTop: 18,
      paddingBottom: 8,
      paddingHorizontal: 16,
      backgroundColor: colors.canvas,
    },
    placeSearchRow: {
      height: 39,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    placeSearch: {
      flex: 1,
      height: 39,
      borderRadius: 22,
      paddingLeft: 10,
      paddingRight: 8,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    placeSearchIcon: { width: 24, height: 24 },
    placeSearchInput: {
      flex: 1,
      height: 39,
      paddingHorizontal: 8,
      paddingVertical: 0,
      color: colors.text,
      fontSize: 16,
    },
    placeClear: { width: 24, height: 24 },
    placeClearIcon: { width: 24, height: 24, opacity: 0.8 },
    placeClearSpacer: { width: 24, height: 24 },
    tuningIcon: { width: 24, height: 24 },
    filters: { height: 28, gap: 6 },
    filter: {
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 8,
      gap: 3,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterActive: { backgroundColor: colors.surfaceRaised },
    filterIcon: { width: 14, height: 14 },
    filterText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
      letterSpacing: -0.23,
    },
    filterDimmed: { opacity: 0.5 },
    placeList: { flex: 1 },
    placeListContent: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: Math.max(110, bottomGutter + 86),
      gap: 12,
    },
    venue: {
      minHeight: 165,
      padding: 12,
      borderWidth: 1,
      borderColor: isDark ? '#2A2A2A' : colors.border,
      borderRadius: 16,
      backgroundColor: isDark ? '#1A1A1A' : colors.surface,
    },
    venueSelected: {
      borderWidth: 2,
      borderColor: '#D33B35',
      backgroundColor: isDark ? '#222222' : colors.surfaceRaised,
    },
    venueSelection: {
      position: 'absolute',
      zIndex: 2,
      top: 9,
      right: 9,
      width: 22,
      height: 22,
    },
    venueMainRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    venueImageWrap: {
      position: 'relative',
      width: 86,
      height: 86,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.skeletonMuted,
    },
    venueImagePlaceholder: { width: 86, height: 86 },
    venueImage: { width: 86, height: 86, borderRadius: 12 },
    venueImageLoading: { opacity: 0 },
    popularBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      height: 18,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    popularText: {
      color: colors.onPrimary,
      fontSize: 12,
      letterSpacing: -0.24,
    },
    venueCopy: { flex: 1, minWidth: 0, gap: 12 },
    venueDetails: { gap: 6, paddingRight: 24 },
    venueTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.41,
    },
    venueAddress: {
      minHeight: 30,
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 15,
      letterSpacing: -0.24,
    },
    ratingRow: {
      height: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 9,
    },
    ratingTag: {
      height: 28,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    ratingStar: { width: 14, height: 14 },
    ratingValue: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: -0.23,
    },
    reviews: { color: colors.textMuted, fontSize: 14, letterSpacing: -0.24 },
    venueTagsRow: {
      height: 33,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    venueTag: {
      height: 33,
      paddingHorizontal: 12,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.surfaceMuted : colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    venueTagContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    venueTagText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: -0.24,
    },
    venueFlag: { width: 14, height: 14, transform: [{ translateY: -1 }] },
    skeletonImage: {
      width: 86,
      height: 86,
      borderRadius: 12,
      backgroundColor: colors.skeletonMuted,
    },
    skeletonCopy: { flex: 1, minWidth: 0, gap: 12 },
    skeletonTitle: {
      width: '72%',
      height: 14,
      backgroundColor: colors.skeleton,
      borderRadius: 4,
    },
    skeletonLine: {
      width: '94%',
      height: 24,
      backgroundColor: colors.skeletonMuted,
      borderRadius: 4,
    },
    skeletonShort: {
      width: '52%',
      height: 28,
      backgroundColor: colors.skeletonMuted,
      borderRadius: 14,
    },
    skeletonTags: {
      width: '100%',
      height: 33,
      backgroundColor: colors.skeletonMuted,
      borderRadius: 17,
    },
    placeFooterGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: Math.max(94, bottomGutter + 70),
    },
    empty: {
      alignItems: 'center',
      paddingHorizontal: 45,
      paddingTop: landscape ? 24 : 118,
      paddingBottom: Math.max(110, bottomGutter + 86),
    },
    emptyIcon: { width: 44, height: 44 },
    emptyTitle: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 16,
      marginTop: 12,
    },
    emptyText: {
      color: colors.textMuted,
      textAlign: 'center',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
    },
    retryText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 14,
    },
    styleCardViewport: {
      position: 'absolute',
      top: 196,
      left: 16,
      right: 16,
      bottom: Math.max(94, bottomGutter + 70),
    },
    styleCardLandscape: { top: 148 },
    styleCardContent: { paddingTop: 20 },
    previews: { flexDirection: 'row', gap: 12 },
    previewChoice: {
      flex: 1,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    previewChoiceSelected: { borderWidth: 2, borderColor: '#FF4757' },
    abstractPreview: {
      width: '100%',
      height: 200,
      padding: 12,
      borderRadius: 12,
      gap: 8,
    },
    previewLight: { backgroundColor: '#F2F2F0' },
    previewDark: { backgroundColor: '#202020' },
    previewTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
    previewBar: {
      width: '62%',
      height: 6,
      borderRadius: 3,
      backgroundColor: '#777777',
      opacity: 0.35,
    },
    previewBarShort: {
      width: '34%',
      height: 6,
      borderRadius: 3,
      backgroundColor: '#777777',
      opacity: 0.35,
    },
    previewDotAccent: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#FF4757',
    },
    previewDotPurple: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#C447F2',
    },
    previewGradient: { height: 54, marginTop: 4, borderRadius: 9 },
    previewStars: { color: '#FF4757', fontSize: 13, letterSpacing: 1 },
    previewLabelRow: {
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    previewLabel: { color: colors.text, fontSize: 15 },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: '#FF4757', backgroundColor: '#D33B35' },
    radioCheck: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    automaticRow: {
      minHeight: 64,
      marginTop: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    automaticText: { color: colors.text, fontSize: 15 },
    automaticSubtitle: { marginTop: 4, color: colors.textMuted, fontSize: 12 },
    appearanceSwitch: {
      width: 51,
      height: 28,
      padding: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      borderRadius: 14,
      backgroundColor: colors.switchTrack,
    },
    appearanceSwitchOn: {
      justifyContent: 'flex-end',
      backgroundColor: colors.primary,
    },
    appearanceSwitchThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.switchThumb,
    },
    livePreviewCaption: {
      marginTop: 34,
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
    },
    peopleTeaser: {
      width: '100%',
      height: 272,
      marginTop: 42,
      paddingTop: 15,
      paddingHorizontal: 15,
      borderWidth: 1,
      borderColor: isDark ? '#2A2A2A' : colors.border,
      borderRadius: 18,
      backgroundColor: isDark ? '#1A1A1A' : colors.surface,
    },
    peopleTeaserTitle: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '600',
    },
    peopleTeaserCount: {
      marginTop: 3,
      marginBottom: 10,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 16,
    },
    notificationExamples: { width: '100%', marginTop: 42, gap: 12 },
    notificationCard: {
      minHeight: 78,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    notificationIcon: {
      width: 36,
      height: 36,
      overflow: 'hidden',
      borderRadius: 10,
      backgroundColor: '#D33B35',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationCopy: { flex: 1, marginLeft: 12, gap: 3 },
    notificationApp: { color: colors.textMuted, fontSize: 9 },
    notificationTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
    notificationDetail: { color: colors.textSecondary, fontSize: 13 },
    notificationMeta: {
      alignSelf: 'flex-start',
      color: colors.textMuted,
      fontSize: 10,
    },
    contactRow: {
      height: 62,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    contactCopy: { flex: 1, marginLeft: 11 },
    contactName: { color: colors.text, fontSize: 14, fontWeight: '600' },
    contactHandle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    inviteButton: {
      borderRadius: 16,
      paddingVertical: 7,
      paddingHorizontal: 13,
      backgroundColor: colors.primary,
    },
    invitedButton: { backgroundColor: colors.surfaceRaised },
    inviteText: { color: colors.onPrimary, fontSize: 11 },
    inviteScroll: {
      position: 'absolute',
      top: landscape ? 80 : 130,
      left: 0,
      right: 0,
      bottom: Math.max(94, bottomGutter + 70),
    },
    invitePage: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      alignItems: 'center',
    },
    peopleIcon: { width: 118, height: 46, marginBottom: 22 },
    inviteTitle: { fontSize: 24, lineHeight: 29, letterSpacing: 0.6 },
    progressText: {
      color: '#e0453c',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 12,
    },
    progressDots: { height: 8, flexDirection: 'row', gap: 6, marginTop: 7 },
    progressDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.surfaceRaised,
    },
    progressDotActive: { backgroundColor: colors.primary },
    inviteActions: { width: '100%', gap: 10, marginTop: 24 },
    actionRow: {
      minHeight: 64,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    actionIcon: {
      width: 18,
      height: 18,
      marginRight: 12,
      tintColor: colors.text,
    },
    actionCopy: { flex: 1, gap: 2 },
    actionText: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: -0.41,
      fontWeight: '600',
    },
    actionSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    actionChevron: { width: 8, height: 16, opacity: 0.7 },
    ready: { flex: 1 },
    readyPattern: { width: '100%', height: '100%', opacity: 0.04 },
    readyContent: {
      flexGrow: 1,
      paddingTop: 170,
      paddingBottom: 24,
      alignItems: 'center',
    },
    readyContentLandscape: {
      paddingTop: 16,
      paddingBottom: 16,
      paddingHorizontal: 24,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 28,
    },
    readyActions: { width: '100%', maxWidth: 370, alignItems: 'center' },
    readyActionsLandscape: { flex: 1, maxWidth: 330 },
    readyCopy: {
      width: '100%',
      minHeight: 72,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      marginTop: 24,
      paddingHorizontal: 16,
    },
    readyCopyLandscape: { marginTop: 0 },
    readyTitle: {
      width: '100%',
      color: colors.text,
      fontSize: 24,
      lineHeight: 29,
      fontWeight: '700',
      letterSpacing: 0.6,
      textAlign: 'center',
    },
    readySubtitle: {
      width: '100%',
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 18,
      letterSpacing: -0.41,
      textAlign: 'center',
    },
    readyButton: {
      width: '90%',
      maxWidth: 330,
      marginTop: 24,
      shadowOpacity: 0,
      elevation: 0,
    },
    readyButtonSurface: {
      backgroundColor: '#B82F29',
      borderWidth: 5,
      borderColor: isDark ? '#4C1816' : '#FFFFFF',
      shadowOpacity: 0,
      elevation: 0,
    },
    readyButtonLandscape: { width: '100%' },
  });
