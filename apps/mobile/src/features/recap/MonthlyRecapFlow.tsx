import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import type { User } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import areasIcon from '../../../assets/recap/areas.png';
import arrowIcon from '../../../assets/recap/arrow.png';
import avatar from '../../../assets/recap/avatar.png';
import copyIcon from '../../../assets/recap/copy.png';
import followersIcon from '../../../assets/recap/followers.png';
import instagramIcon from '../../../assets/recap/instagram.png';
import lockIcon from '../../../assets/recap/lock.png';
import placesIcon from '../../../assets/recap/places.png';
import saveIcon from '../../../assets/recap/save.png';
import CloseCircle from '../../../assets/recap/story/close-circle.svg';
import CloseX from '../../../assets/recap/story/close-x.svg';
import foodBurger from '../../../assets/recap/story/food-burger.png';
import foodCupcake from '../../../assets/recap/story/food-cupcake.png';
import foodPizza from '../../../assets/recap/story/food-pizza.png';
import foodRamen from '../../../assets/recap/story/food-ramen.png';
import mapChoice from '../../../assets/recap/story/map-choice.png';
import mapPin from '../../../assets/recap/story/map-pin.png';
import mapResult from '../../../assets/recap/story/map-result.png';
import placeDining from '../../../assets/recap/story/place-dining.png';
import placeGarden from '../../../assets/recap/story/place-garden.png';
import placeLounge from '../../../assets/recap/story/place-lounge.png';
import placeTerrace from '../../../assets/recap/story/place-terrace.jpg';
import shareRaysLight from '../../../assets/recap/story/share-rays-light.png';
import shareRays from '../../../assets/recap/story/share-rays.png';
import ShareGlyph from '../../../assets/recap/story/share.svg';
import starsBackground from '../../../assets/recap/story/stars-background.png';
import TastesMouth from '../../../assets/recap/story/tastes-mouth.svg';
import { TastesLogo } from '../../ui/FigmaIcons';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type RecapStep =
  | 'loading'
  | 'lowData'
  | 'intro'
  | 'placeGuess'
  | 'placeResult'
  | 'areaGuess'
  | 'areaResult'
  | 'ratingGuess'
  | 'ratingFeedback'
  | 'ranking'
  | 'favorites'
  | 'followers'
  | 'comparison'
  | 'share';

type MonthlyRecapFlowProps = {
  mode?: 'ready' | 'lowData';
  onClose: () => void;
  user?: User;
};

type Place = {
  image: ImageSourcePropType;
  title: string;
  address: string;
  rating: string;
};

const month = 'June';
const shareMessage = 'My June Tastes recap: 15 places visited, 2 new areas explored, and 132 new followers.';
const places: Place[] = [
  { image: placeTerrace, title: 'Gemini750 Restaurant', address: '2972 Westheimer Rd. Santa Ana…', rating: '5.0' },
  { image: placeDining, title: 'Gemini750 Restaurant', address: '2972 Westheimer Rd. Santa Ana…', rating: '3.0' },
  { image: placeGarden, title: 'Gemini750 Restaurant', address: '2972 Westheimer Rd. Santa Ana…', rating: '2.6' },
  { image: placeLounge, title: 'Gemini750 Restaurant', address: '2972 Westheimer Rd. Santa Ana…', rating: '2.0' },
  { image: placeTerrace, title: 'Gemini750 Restaurant', address: '2972 Westheimer Rd. Santa Ana…', rating: '2.0' },
];

const progressByStep: Partial<Record<RecapStep, number>> = {
  placeGuess: 1,
  placeResult: 1,
  areaGuess: 2,
  areaResult: 2,
  ratingGuess: 3,
  ratingFeedback: 3,
  ranking: 4,
  favorites: 5,
  followers: 6,
  comparison: 7,
};

export function MonthlyRecapFlow({ mode = 'ready', onClose, user }: MonthlyRecapFlowProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [step, setStep] = useState<RecapStep>('loading');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [placeGuess, setPlaceGuess] = useState<number | null>(null);
  const [areaGuess, setAreaGuess] = useState<'Belgravia' | 'Mayfair' | null>(null);
  const [ratingGuess, setRatingGuess] = useState(1);

  useEffect(() => {
    if (step !== 'loading') return;
    const timer = setTimeout(() => setStep(mode === 'lowData' ? 'lowData' : 'intro'), 1200);
    return () => clearTimeout(timer);
  }, [mode, step]);

  useEffect(() => {
    if (placeGuess === null || step !== 'placeGuess') return;
    const timer = setTimeout(() => setStep('placeResult'), 420);
    return () => clearTimeout(timer);
  }, [placeGuess, step]);

  useEffect(() => {
    if (step !== 'ratingFeedback') return;
    const timer = setTimeout(() => setStep('ranking'), 1100);
    return () => clearTimeout(timer);
  }, [step]);

  async function shareRecap(channel: string) {
    if (channel === 'Copy link') {
      await Clipboard.setStringAsync(`https://tastes.app/recap/${month.toLowerCase()}`);
      Alert.alert('Link copied');
      return;
    }
    await Share.share({ message: shareMessage, title: 'Monthly Recap' });
  }

  const progress = progressByStep[step];
  const usesStarsBackground = step === 'placeGuess' || step === 'placeResult';
  const storyBackground = usesStarsBackground ? starsBackground : pattern;
  const backgroundGradient = isDark
    ? (['#560E0B', '#260706', '#080808'] as const)
    : (['#F2EFEA', '#F2EFEA', '#F2EFEA'] as const);

  return (
    <View style={styles.screen}>
      <StatusBar style={isDark || step === 'share' ? 'light' : 'dark'} />
      <LinearGradient colors={backgroundGradient} locations={[0, 0.52, 1]} style={StyleSheet.absoluteFill} />
      <ImageBackground
        source={storyBackground}
        resizeMode="cover"
        imageStyle={[styles.pattern, usesStarsBackground && styles.starsPattern]}
        style={StyleSheet.absoluteFill}
      >
        {progress ? <StoryProgress completed={progress} /> : null}
        <CloseButton
          color={!isDark && step === 'share' ? '#FFFFFF' : colors.text}
          onPress={() => setConfirmingClose(true)}
        />

        {step === 'loading' ? <LoadingScreen /> : null}
        {step === 'lowData' ? <LowDataScreen onExplore={onClose} /> : null}
        {step === 'intro' ? <IntroScreen onNext={() => setStep('placeGuess')} /> : null}
        {step === 'placeGuess' ? <PlaceGuessScreen selected={placeGuess} onSelect={setPlaceGuess} /> : null}
        {step === 'placeResult' ? <PlaceResultScreen onNext={() => setStep('areaGuess')} /> : null}
        {step === 'areaGuess' ? (
          <AreaGuessScreen onSelect={(value) => { setAreaGuess(value); setStep('areaResult'); }} />
        ) : null}
        {step === 'areaResult' ? (
          <AreaResultScreen guessed={areaGuess ?? 'Mayfair'} onNext={() => setStep('ratingGuess')} />
        ) : null}
        {step === 'ratingGuess' ? (
          <RatingGuessScreen selected={ratingGuess} onChange={setRatingGuess} onSelect={() => setStep('ratingFeedback')} />
        ) : null}
        {step === 'ratingFeedback' ? <RatingFeedbackScreen correct={ratingGuess === 1} /> : null}
        {step === 'ranking' ? <RankingScreen onNext={() => setStep('favorites')} /> : null}
        {step === 'favorites' ? <FavoritesScreen onNext={() => setStep('followers')} /> : null}
        {step === 'followers' ? <FollowersScreen onNext={() => setStep('comparison')} /> : null}
        {step === 'comparison' ? <ComparisonScreen onNext={() => setStep('share')} /> : null}
        {step === 'share' ? <ShareCard user={user} onShare={shareRecap} /> : null}
      </ImageBackground>

      <CloseConfirmation
        visible={confirmingClose}
        onKeepWatching={() => setConfirmingClose(false)}
        onLeave={onClose}
      />
    </View>
  );
}

function CloseButton({ color, onPress }: { color?: string; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <Pressable
      accessibilityLabel="Close recap"
      accessibilityRole="button"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
    >
      <CloseCircle color={color ?? colors.text} height={24} width={24} />
      <CloseX color={color ?? colors.text} height={7} style={styles.closeX} width={7} />
    </Pressable>
  );
}

function StoryProgress({ completed }: { completed: number }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.progress}>
      {Array.from({ length: 7 }, (_, index) => (
        <View key={index} style={[styles.progressSegment, index >= completed && styles.progressPending]} />
      ))}
    </View>
  );
}

function LoadingScreen() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.centerContent}>
      <ActivityIndicator color={colors.text} size="large" style={styles.loader} />
      <Text style={styles.centerTitle}>Crunching your month…</Text>
      <Text style={styles.centerSubtitle}>We're putting together your {month} recap.</Text>
    </View>
  );
}

function LowDataScreen({ onExplore }: { onExplore: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <View style={styles.centerContent}>
        <Image source={lockIcon} resizeMode="contain" style={styles.lockIcon} />
        <Text style={styles.centerTitle}>Your recap isn't ready yet</Text>
        <Text style={styles.centerSubtitle}>Visit a few more places this month to unlock your {month} recap.</Text>
      </View>
      <RecapButton label="Explore places" onPress={onExplore} />
    </>
  );
}

function IntroScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <View style={styles.introHeader}>
        <Text style={styles.introTitle}>Your Month in</Text>
        <View style={styles.tastesTiles}>
          {'tastes'.split('').map((letter, index) => (
            <View key={`${letter}-${index}`} style={[styles.letterTile, index % 2 === 0 && styles.letterTilePink]}>
              <Text style={styles.letterTileText}>{letter}</Text>
            </View>
          ))}
        </View>
        <TastesMouth height={57} width={80} />
      </View>
      <View style={styles.introCollage}>
        <TiltedPhoto source={placeGarden} style={styles.introPhotoLeft} rating="2.5" />
        <TiltedPhoto source={placeTerrace} style={styles.introPhotoRight} rating="4.5" />
        <TiltedPhoto source={placeDining} style={styles.introPhotoBottom} rating="3.5" />
      </View>
      <Text style={styles.introCaption}>Here’s what you explored this month</Text>
      <RecapButton label="See my stats" onPress={onNext} />
    </>
  );
}

function TiltedPhoto({ source, rating, style }: { source: ImageSourcePropType; rating: string; style: object }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={[styles.tiltedPhoto, style]}>
      <Image source={source} style={styles.tiltedPhotoImage} />
      <View style={styles.ratingPin}><Text style={styles.ratingPinText}>{rating}</Text></View>
    </View>
  );
}

function PlaceGuessScreen({ selected, onSelect }: { selected: number | null; onSelect: (value: number) => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.questionContent}>
      <ScreenHeading title={"How many places do you think\nyou've visited this month"} subtitle="Take a guess!" />
      <View style={styles.answerList}>
        {[15, 5, 1].map((value) => (
          <Pressable
            key={value}
            accessibilityState={{ selected: selected === value }}
            onPress={() => onSelect(value)}
            style={({ pressed }) => [
              styles.answerCard,
              selected !== null && selected !== value && styles.answerCardMuted,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.answerNumber}>{value}</Text>
            <Text style={styles.answerUnit}>{value === 1 ? 'place' : 'places'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PlaceResultScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <Text style={styles.resultTitle}>You guessed it!</Text>
      <View style={styles.placeResultBadge}>
        <View style={styles.resultBadge}><Text style={styles.resultBadgeNumber}>5</Text><Text style={styles.resultBadgeUnit}>places</Text></View>
      </View>
      <View style={styles.placeSheet}>
        <ScrollView contentContainerStyle={styles.placeList} showsVerticalScrollIndicator={false}>
          {places.map((place, index) => <PlaceCard key={`${place.title}-${index}`} place={place} compact />)}
        </ScrollView>
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function AreaGuessScreen({ onSelect }: { onSelect: (value: 'Belgravia' | 'Mayfair') => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <View style={styles.areaHeading}><ScreenHeading title="What area you been to more?" subtitle="Choose one 👇" /></View>
      <Pressable onPress={() => onSelect('Belgravia')} style={styles.areaOptionTop}>
        <Text style={styles.areaOption}>★  Belgravia</Text><View style={styles.areaRule} />
      </Pressable>
      <Image source={mapChoice} resizeMode="contain" style={styles.choiceMap} />
      <Pressable onPress={() => onSelect('Mayfair')} style={styles.areaOptionBottom}>
        <View style={styles.areaRule} /><Text style={styles.areaOption}>★  Mayfair</Text>
      </Pressable>
    </>
  );
}

function AreaResultScreen({ guessed, onNext }: { guessed: string; onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const correct = guessed === 'Belgravia';
  return (
    <>
      <View style={[styles.feedbackPill, correct && styles.feedbackPillCorrect]}>
        <Text style={[styles.feedbackPillText, correct && styles.feedbackPillTextCorrect]}>
          {correct ? 'You got it! Belgravia' : `Almost! You guessed ${guessed}`}
        </Text>
      </View>
      <View style={styles.resultMapWrap}>
        <Image source={mapResult} resizeMode="contain" style={styles.resultMap} />
        <Image source={mapPin} resizeMode="contain" style={styles.mapPin} />
      </View>
      <View style={styles.areaResultCopy}>
        <Text style={styles.areaResultTitle}>You explored</Text>
        <View style={styles.resultBadge}><Text style={styles.resultBadgeNumber}>3</Text><Text style={styles.resultBadgeUnit}>areas</Text></View>
        <Text style={styles.areaResultPlace}>In Belgravia</Text>
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function RatingGuessScreen({
  selected,
  onChange,
  onSelect,
}: {
  selected: number;
  onChange: (index: number) => void;
  onSelect: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const cards = [placeDining, placeLounge, placeGarden];
  return (
    <>
      <View style={styles.ratingHeading}><ScreenHeading title={"Which place you give\nhighest rating?"} subtitle="Tap your guess 👇" /></View>
      <View style={styles.ratingCarousel}>
        {cards.map((source, index) => (
          <Pressable key={index} onPress={() => onChange(index)} style={[styles.ratingThumb, selected === index && styles.ratingThumbSelected]}>
            <Image source={source} style={styles.ratingImage} />
          </Pressable>
        ))}
      </View>
      <View style={styles.ratingArc}>
        <View style={styles.ratingCategory}><Text style={styles.ratingCategoryGlyph}>☕</Text></View>
        <View style={styles.ratingCategoryMain}><Text style={[styles.ratingCategoryGlyph, styles.ratingCategoryGlyphMain]}>🍴</Text></View>
        <View style={styles.ratingCategory}><Text style={styles.ratingCategoryGlyph}>▽</Text></View>
      </View>
      <View style={styles.ratingCopy}>
        <Text style={styles.ratingPlaceTitle}>Joe’s Shanghai Soup{'\n'}Dumpling Restaurant</Text>
        <Text style={styles.ratingAddress}>2972 Westheimer Rd. Santa An…</Text>
      </View>
      <RecapButton label="Select" leading="✓" onPress={onSelect} />
    </>
  );
}

function RatingFeedbackScreen({ correct }: { correct: boolean }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <Text style={styles.ratingFeedback}>{correct ? 'You got it!' : 'Almost!'}</Text>
      <View style={styles.ratingFeedbackImage}>
        <Image source={placeLounge} style={styles.ratingImage} />
        <View style={[styles.feedbackMark, !correct && styles.feedbackMarkWrong]}>
          <Text style={styles.feedbackMarkText}>{correct ? '✓' : '×'}</Text>
        </View>
      </View>
      <View style={styles.ratingArc}>
        <View style={styles.ratingCategory}><Text style={styles.ratingCategoryGlyph}>☕</Text></View>
        <View style={styles.ratingCategoryMain}><Text style={[styles.ratingCategoryGlyph, styles.ratingCategoryGlyphMain]}>🍴</Text></View>
        <View style={styles.ratingCategory}><Text style={styles.ratingCategoryGlyph}>▽</Text></View>
      </View>
      <View style={styles.ratingCopy}>
        <Text style={styles.ratingPlaceTitle}>Joe’s Shanghai Soup{'\n'}Dumpling Restaurant</Text>
        <Text style={styles.ratingAddress}>2972 Westheimer Rd. Santa An…</Text>
      </View>
    </>
  );
}

function RankingScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <View style={styles.rankingHeading}><ScreenHeading title="Here’s how they ranked" subtitle="See how they scored" /></View>
      <View style={styles.rankingList}>
        {places.slice(0, 3).map((place, index) => <PlaceCard key={index} place={place} />)}
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function PlaceCard({ place, compact = false }: { place: Place; compact?: boolean }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={[styles.placeCard, compact && styles.placeCardCompact]}>
      <View style={[styles.placeImageWrap, compact && styles.placeImageCompact]}>
        <Image source={place.image} style={styles.placeImage} />
        {!compact ? <RatingTag value={place.rating} /> : null}
      </View>
      <View style={styles.placeCardCopy}>
        <Text numberOfLines={2} style={styles.placeTitle}>{place.title}</Text>
        {compact ? <RatingTag value="2.0" /> : <Text numberOfLines={1} style={styles.placeAddress}>{place.address}</Text>}
      </View>
    </View>
  );
}

function RatingTag({ value }: { value: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return <View style={styles.ratingTag}><Text style={styles.ratingTagText}>★ {value}</Text></View>;
}

function FavoritesScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const dishes = [
    ['Grilled Salmon with Lemon', '5.0', foodRamen],
    ['Sushi Roll', '4.6', placeGarden],
    ['Grilled Salmon with Lemon', '4.2', foodRamen],
  ] as const;
  return (
    <>
      <Image source={foodCupcake} style={styles.foodCupcake} />
      <Image source={foodBurger} style={styles.foodBurger} />
      <Image source={foodPizza} style={styles.foodPizza} />
      <Image source={foodRamen} style={styles.foodRamen} />
      <View style={styles.favoriteHeading}><ScreenHeading title={"Your favorite\ndish this month"} subtitle="Here are your top 3 picks" /></View>
      <View style={styles.dishList}>
        {dishes.map(([name, rating, source], index) => (
          <View key={`${name}-${index}`} style={styles.dishRow}>
            <Image source={source} style={styles.dishAvatar} />
            <Text style={styles.dishName}>{name}</Text>
            <RatingTag value={rating} />
          </View>
        ))}
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function FollowersScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const people = [['AC', '#4C698F'], ['SR', '#23766E'], ['LW', '#79507D'], ['ED', '#9A7544']] as const;
  return (
    <>
      <View style={styles.followersContent}>
        <View style={styles.avatarStack}>
          {people.map(([initials, color], index) => (
            <View key={initials} style={[styles.initialAvatar, { backgroundColor: color, marginLeft: index ? -12 : 0 }]}>
              <Text style={styles.initialText}>{initials}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.followerCount}>+132</Text>
        <Text style={styles.followerCaption}>new followers in {month}</Text>
        <Text style={styles.followerFootnote}>Including Alex, Sofia &amp; 130 others</Text>
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function ComparisonScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <>
      <View style={styles.comparisonContent}>
        <ScreenHeading title="June vs May" subtitle="See how they scored" />
        <View style={styles.comparisonTable}>
          <ComparisonRow label="Places visited" value="15" delta="↑ 4" positive />
          <ComparisonRow label="New areas explored" value="2" delta="↑ 1" positive />
          <ComparisonRow label="Reviews written" value="9" delta="↓ 2" />
        </View>
      </View>
      <RecapButton label="Next" showArrow={false} onPress={onNext} />
    </>
  );
}

function ComparisonRow({ label, value, delta, positive = false }: { label: string; value: string; delta: string; positive?: boolean }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <View style={styles.comparisonResult}>
        <Text style={styles.comparisonValue}>{value}</Text>
        <View style={[styles.deltaChip, positive ? styles.positiveChip : styles.negativeChip]}>
          <Text style={[styles.deltaText, positive ? styles.positiveText : styles.negativeText]}>{delta}</Text>
        </View>
      </View>
    </View>
  );
}

function ShareCard({ onShare, user }: { onShare: (channel: string) => void; user?: User }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const profileSource: ImageSourcePropType = user?.photoURL ? { uri: user.photoURL } : avatar;

  if (!isDark) {
    return (
      <View style={styles.shareContentLight}>
        <Image source={shareRaysLight} resizeMode="cover" style={styles.shareRaysLight} />
        <View style={styles.shareIdentityLight}>
          <Image source={profileSource} style={styles.profileAvatarLight} />
          <TastesLogo width={110} />
        </View>
        <Text style={styles.recapTitleLight}>Monthly Recap</Text>
        <View style={styles.metricsLight}>
          <Metric icon={placesIcon} label="Places visited" value="15" />
          <Metric icon={areasIcon} label="New neighborhoods explored" value="2" />
          <Metric icon={followersIcon} label="Followers gained" value="132" />
        </View>
        <View style={styles.favoriteCards}>
          <ShareFavoriteCard image={placeLounge} label="Favorite place" rating="5.0" />
          <ShareFavoriteCard image={foodRamen} label="Favorite dish" rating="4.5" />
        </View>
        <RecapButton label="Share now" shareIcon showArrow={false} onPress={() => onShare('Share now')} />
      </View>
    );
  }

  return (
    <View style={styles.shareContent}>
      <Image source={shareRays} resizeMode="cover" style={styles.shareRays} />
      <View style={styles.shareIdentity}>
        <Image source={profileSource} style={styles.profileAvatar} />
        <TastesLogo width={110} />
      </View>
      <Text style={styles.recapTitle}>Monthly Recap</Text>
      <View style={styles.metrics}>
        <Metric icon={placesIcon} label="Places visited" value="15" />
        <Metric icon={areasIcon} label="New neighborhoods explored" value="2" />
        <Metric icon={followersIcon} label="Followers gained" value="132" />
      </View>
      <Text style={styles.shareHeading}>Share your recap</Text>
      <View style={styles.shareOptions}>
        <ShareOption icon={instagramIcon} label="Instagram Stories" onPress={() => onShare('Instagram Stories')} />
        <ShareOption icon={copyIcon} label="Copy link" onPress={() => onShare('Copy link')} />
        <ShareOption icon={saveIcon} label="Save image" onPress={() => onShare('Save image')} />
      </View>
    </View>
  );
}

function ShareFavoriteCard({
  image,
  label,
  rating,
}: {
  image: ImageSourcePropType;
  label: string;
  rating: string;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.favoriteCard}>
      <View style={styles.favoriteCardImageWrap}>
        <Image source={image} style={styles.favoriteCardImage} />
        <View style={styles.favoriteCardRating}>
          <Text style={styles.favoriteCardRatingText}>★ {rating}</Text>
        </View>
      </View>
      <Text style={styles.favoriteCardLabel}>{label}</Text>
      <Text numberOfLines={3} style={styles.favoriteCardTitle}>
        Joe’s Shanghai Soup Dumpling Restaurant
      </Text>
    </View>
  );
}

function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.screenHeading}>
      <Text style={styles.screenHeadingTitle}>{title}</Text>
      <Text style={styles.screenHeadingSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Metric({ icon, label, value }: { icon: ImageSourcePropType; label: string; value: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabel}>
        <Image source={icon} resizeMode="contain" style={styles.metricIcon} />
        <Text style={styles.metricText}>{label}</Text>
      </View>
      <View style={styles.metricBadge}><Text style={styles.metricValue}>{value}</Text></View>
    </View>
  );
}

function ShareOption({ icon, label, onPress }: { icon: ImageSourcePropType; label: string; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]}>
      <View style={styles.shareOptionLabel}>
        <Image
          source={icon}
          resizeMode="contain"
          style={[styles.shareIcon, label !== 'Instagram Stories' && styles.shareUtilityIcon]}
        />
        <Text style={styles.shareText}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function RecapButton({
  label,
  leading,
  onPress,
  shareIcon = false,
  showArrow = true,
}: {
  label: string;
  leading?: string;
  onPress: () => void;
  shareIcon?: boolean;
  showArrow?: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
      {shareIcon ? <ShareGlyph height={20} width={20} /> : null}
      {leading ? <Text style={styles.ctaLeading}>{leading}</Text> : null}
      <Text style={styles.ctaLabel}>{label}</Text>
      {showArrow ? <Image source={arrowIcon} resizeMode="contain" style={styles.arrow} /> : null}
    </Pressable>
  );
}

function CloseConfirmation({
  visible,
  onKeepWatching,
  onLeave,
}: {
  visible: boolean;
  onKeepWatching: () => void;
  onLeave: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onKeepWatching}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Leave recap?</Text>
          <Text style={styles.sheetCopy}>You can watch your {month} recap again anytime from your profile.</Text>
          <Pressable onPress={onKeepWatching} style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
            <Text style={styles.keepLabel}>Keep watching</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={onLeave}><Text style={styles.leaveLabel}>Leave</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (_colors: ThemeColors, isDark: boolean) => {
  const text = isDark ? '#FFFFFF' : '#080808';
  const secondaryText = isDark ? '#AAB2C5' : '#677083';
  const subtleText = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(8,8,8,0.6)';
  const faintText = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(8,8,8,0.45)';
  const hairline = isDark ? 'rgba(255,255,255,0.2)' : '#E4E4E4';
  const softHairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(8,8,8,0.08)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E4E4E4';
  const cardSurface = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.78)';

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: isDark ? '#080808' : '#F2EFEA' },
  pattern: { opacity: isDark ? 0.18 : 0.04 },
  starsPattern: { opacity: isDark ? 0.18 : 0.25 },
  closeButton: {
    position: 'absolute',
    zIndex: 20,
    top: 64,
    right: 15,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: { position: 'absolute' },
  progress: { position: 'absolute', zIndex: 10, top: 102, left: 16, right: 16, height: 3, flexDirection: 'row', gap: 4 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: text },
  progressPending: { opacity: isDark ? 0.25 : 0.18 },
  centerContent: { position: 'absolute', top: '43%', left: 21, right: 21, alignItems: 'center', gap: 14 },
  loader: { width: 60, height: 60 },
  lockIcon: { width: 47, height: 60, tintColor: text },
  centerTitle: { color: text, fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  centerSubtitle: { maxWidth: 360, color: secondaryText, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  introHeader: { position: 'absolute', top: 122, left: 16, right: 16, alignItems: 'center' },
  introTitle: { color: text, fontSize: 28, fontWeight: '700', letterSpacing: 0.6, marginBottom: 16 },
  tastesTiles: { flexDirection: 'row', gap: 8 },
  letterTile: { width: 31, height: 47, borderRadius: 6, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  letterTilePink: { backgroundColor: '#FF9EB1' },
  letterTileText: { color: '#080808', fontSize: 26, fontWeight: '700' },
  introCollage: { position: 'absolute', top: 294, left: 0, right: 0, height: 420 },
  tiltedPhoto: { position: 'absolute', borderRadius: 8 },
  tiltedPhotoImage: { width: '100%', height: '100%', borderRadius: 8 },
  introPhotoLeft: { left: 22, top: 80, width: 120, height: 120, transform: [{ rotate: '8deg' }] },
  introPhotoRight: { right: 22, top: 30, width: 145, height: 145, transform: [{ rotate: '-7deg' }] },
  introPhotoBottom: { left: '30%', top: 235, width: 145, height: 145, transform: [{ rotate: '8deg' }] },
  ratingPin: { position: 'absolute', top: -25, alignSelf: 'center', backgroundColor: '#AD3324', borderWidth: 1, borderColor: isDark ? '#FFFFFF' : '#282828', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6 },
  ratingPinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  introCaption: { position: 'absolute', left: 16, right: 16, bottom: 101, color: secondaryText, fontSize: 16, textAlign: 'center' },
  questionContent: { position: 'absolute', top: 263, left: 16, right: 16 },
  screenHeading: { alignItems: 'center', gap: 8 },
  screenHeadingTitle: { color: text, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  screenHeadingSubtitle: { color: secondaryText, fontSize: 16, lineHeight: 18, textAlign: 'center' },
  answerList: { marginTop: 15, gap: 7 },
  answerCard: { height: 69, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: isDark ? 'rgba(184,47,41,0.48)' : 'rgba(133,45,41,0.72)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  answerCardMuted: { opacity: 0.3 },
  answerNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '600' },
  answerUnit: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  resultTitle: { position: 'absolute', top: 117, left: 16, right: 16, color: text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  placeResultBadge: { position: 'absolute', top: 160, left: 0, right: 0, alignItems: 'center' },
  resultBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FF9EB1', borderRadius: 42, paddingHorizontal: 32, paddingVertical: 10 },
  resultBadgeNumber: { color: '#080808', fontSize: 32, fontWeight: '700' },
  resultBadgeUnit: { color: '#080808', fontSize: 18, fontWeight: '600' },
  placeSheet: { position: 'absolute', top: 235, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: isDark ? '#FFFFFF' : '#E4E4E4', backgroundColor: isDark ? 'rgba(15,5,5,0.75)' : 'rgba(255,255,255,0.82)', overflow: 'hidden' },
  placeList: { padding: 16, paddingBottom: 110, gap: 8 },
  placeCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeCardCompact: { minHeight: 120, borderRadius: 10, borderWidth: 1, borderColor: cardBorder, backgroundColor: cardSurface, padding: 10, gap: 24 },
  placeImageWrap: { width: 134, height: 134, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  placeImageCompact: { width: 100, height: 100 },
  placeImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeCardCopy: { flex: 1, alignItems: 'flex-start', gap: 8 },
  placeTitle: { color: text, fontSize: 16, lineHeight: 21, fontWeight: '600' },
  placeAddress: { color: secondaryText, fontSize: 14 },
  ratingTag: { backgroundColor: '#D8332D', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  ratingTagText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  areaHeading: { position: 'absolute', top: 133, left: 16, right: 16 },
  areaOptionTop: { position: 'absolute', top: 303, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaOptionBottom: { position: 'absolute', top: 593, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  areaOption: { color: text, fontSize: 18, fontWeight: '600' },
  areaRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(8,8,8,0.22)' },
  choiceMap: { position: 'absolute', top: 340, left: '-30%', width: '160%', height: 260 },
  feedbackPill: { position: 'absolute', top: 129, alignSelf: 'center', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(226,174,77,0.5)', backgroundColor: 'rgba(226,174,77,0.18)', paddingHorizontal: 16, paddingVertical: 8 },
  feedbackPillCorrect: { borderColor: 'rgba(77,191,115,0.5)', backgroundColor: 'rgba(77,191,115,0.18)' },
  feedbackPillText: { color: '#E2AE4D', fontSize: 14, fontWeight: '500' },
  feedbackPillTextCorrect: { color: '#4DBF73' },
  resultMapWrap: { position: 'absolute', top: 226, left: -98, right: -98, height: 363, alignItems: 'center', justifyContent: 'center' },
  resultMap: { width: '100%', height: '100%' },
  mapPin: { position: 'absolute', width: 134, height: 134 },
  areaResultCopy: { position: 'absolute', top: 613, left: 65, right: 65, alignItems: 'center', gap: 13 },
  areaResultTitle: { color: text, fontSize: 24, fontWeight: '700' },
  areaResultPlace: { color: secondaryText, fontSize: 18, fontWeight: '600' },
  ratingHeading: { position: 'absolute', top: 135, left: 40, right: 40 },
  ratingCarousel: { position: 'absolute', top: 266, left: -94, right: -94, height: 254, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18 },
  ratingThumb: { width: 154, height: 208, borderRadius: 8, overflow: 'hidden', opacity: 0.45, transform: [{ rotate: '-8deg' }] },
  ratingThumbSelected: { width: 226, height: 254, opacity: 1, transform: [{ rotate: '0deg' }] },
  ratingImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  ratingArc: { position: 'absolute', top: 546, left: 30, right: 30, height: 106, borderTopWidth: 5, borderColor: '#B82F29', borderRadius: 180, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 9 },
  ratingCategory: { width: 55, height: 55, borderRadius: 28, backgroundColor: isDark ? '#3A0C0B' : 'rgba(184,47,41,0.1)', borderWidth: 1, borderColor: isDark ? cardBorder : 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  ratingCategoryMain: { width: 74, height: 74, marginTop: -46, borderRadius: 37, backgroundColor: '#B82F29', borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  ratingCategoryGlyph: { color: '#FFFFFF', fontSize: 22 },
  ratingCategoryGlyphMain: { color: '#FFFFFF' },
  ratingCopy: { position: 'absolute', top: 637, left: 88, right: 88, alignItems: 'center', gap: 10 },
  ratingPlaceTitle: { color: text, fontSize: 17, lineHeight: 22, fontWeight: '500', textAlign: 'center' },
  ratingAddress: { color: secondaryText, fontSize: 15, textAlign: 'center' },
  ratingFeedback: { position: 'absolute', top: 188, left: 40, right: 40, color: text, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  ratingFeedbackImage: { position: 'absolute', top: 266, alignSelf: 'center', width: 226, height: 254, borderRadius: 8, overflow: 'hidden' },
  feedbackMark: { position: 'absolute', alignSelf: 'center', top: '42%', width: 42, height: 42, borderRadius: 21, backgroundColor: '#2FB65B', alignItems: 'center', justifyContent: 'center' },
  feedbackMarkWrong: { backgroundColor: isDark ? '#161616' : '#080808' },
  feedbackMarkText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  rankingHeading: { position: 'absolute', top: 135, left: 40, right: 40 },
  rankingList: { position: 'absolute', top: 220, left: 16, right: 16, gap: 16 },
  favoriteHeading: { position: 'absolute', top: 256, left: 102, right: 102 },
  foodCupcake: { position: 'absolute', top: 122, left: -5, width: 105, height: 105, resizeMode: 'contain', transform: [{ rotate: '18deg' }] },
  foodBurger: { position: 'absolute', top: 104, right: -5, width: 145, height: 120, resizeMode: 'contain', transform: [{ rotate: '-8deg' }] },
  foodPizza: { position: 'absolute', top: 344, left: -38, width: 155, height: 190, resizeMode: 'contain' },
  foodRamen: { position: 'absolute', top: 360, right: -42, width: 155, height: 155, resizeMode: 'contain', transform: [{ rotate: '-18deg' }] },
  dishList: { position: 'absolute', top: 503, left: 16, right: 16 },
  dishRow: { minHeight: 64, borderBottomWidth: 1, borderBottomColor: hairline, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  dishAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: isDark ? '#FFFFFF' : '#E4E4E4' },
  dishName: { flex: 1, color: text, fontSize: 15, fontWeight: '600' },
  followersContent: { position: 'absolute', top: 314, left: 21, right: 21, alignItems: 'center', gap: 14 },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  initialAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: isDark ? '#5D1715' : '#F2EFEA', alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  followerCount: { color: text, fontSize: 52, lineHeight: 58, fontWeight: '700' },
  followerCaption: { color: subtleText, fontSize: 16, lineHeight: 21 },
  followerFootnote: { color: faintText, fontSize: 13, lineHeight: 18 },
  comparisonContent: { position: 'absolute', top: 135, left: 16, right: 16 },
  comparisonTable: { marginTop: 16 },
  comparisonRow: { minHeight: 57, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: softHairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  comparisonLabel: { color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(8,8,8,0.85)', fontSize: 16 },
  comparisonResult: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  comparisonValue: { minWidth: 18, color: text, fontSize: 20, fontWeight: '700', textAlign: 'right' },
  deltaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  positiveChip: { backgroundColor: 'rgba(77,191,115,0.18)' },
  negativeChip: { backgroundColor: 'rgba(184,47,41,0.18)' },
  deltaText: { fontSize: 13, fontWeight: '600' },
  positiveText: { color: '#4DBF73' },
  negativeText: { color: '#B82F29' },
  cta: { position: 'absolute', zIndex: 15, left: 35, right: 35, bottom: 24, height: 54, borderRadius: 36, borderWidth: 5, borderColor: isDark ? '#4C1816' : '#FFFFFF', backgroundColor: '#B82F29', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  ctaLeading: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  arrow: { width: 20, height: 12 },
  shareContentLight: { flex: 1, overflow: 'hidden' },
  shareRaysLight: { position: 'absolute', top: -134, left: -31, width: 464, height: 440 },
  shareIdentityLight: { position: 'absolute', top: 102, left: 16, right: 16, alignItems: 'center', gap: 12 },
  profileAvatarLight: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: '#FFFFFF' },
  recapTitleLight: { position: 'absolute', top: 320, left: 16, right: 16, color: '#080808', fontSize: 20, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  metricsLight: { position: 'absolute', top: 348, left: 16, right: 16 },
  favoriteCards: { position: 'absolute', top: 536, left: 16, right: 16, flexDirection: 'row', gap: 8 },
  favoriteCard: { flex: 1, minWidth: 0, height: 235, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', gap: 3 },
  favoriteCardImageWrap: { width: '100%', height: 140, borderRadius: 8, overflow: 'hidden' },
  favoriteCardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  favoriteCardRating: { position: 'absolute', left: 0, bottom: 0, height: 22, paddingHorizontal: 8, borderTopRightRadius: 8, backgroundColor: '#B82F29', alignItems: 'center', justifyContent: 'center' },
  favoriteCardRatingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  favoriteCardLabel: { marginTop: 3, color: 'rgba(8,8,8,0.5)', fontSize: 13, lineHeight: 18 },
  favoriteCardTitle: { color: '#080808', fontSize: 14, lineHeight: 18, fontWeight: '500' },
  shareContent: { flex: 1, paddingTop: 102, paddingHorizontal: 16, overflow: 'hidden' },
  shareRays: { position: 'absolute', top: -134, left: -31, width: '126%', height: 440, opacity: isDark ? 1 : 0.14 },
  shareIdentity: { alignItems: 'center', gap: 12 },
  profileAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: isDark ? '#FFFFFF' : '#E4E4E4' },
  recapTitle: { marginTop: 29, color: text, fontSize: 20, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  metrics: { marginTop: 0 },
  metricRow: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricIcon: { width: 20, height: 20 },
  metricText: { color: text, fontSize: 16 },
  metricBadge: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#FF9EB1', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#080808', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  shareHeading: { marginTop: 14, color: subtleText, fontSize: 15, fontWeight: '600' },
  shareOptions: { marginTop: 18, gap: 10 },
  shareOption: { minHeight: 50, paddingHorizontal: 18, borderRadius: 25, borderWidth: 1, borderColor: cardBorder, backgroundColor: isDark ? '#161616' : '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shareOptionLabel: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareIcon: { width: 20, height: 20 },
  shareUtilityIcon: { tintColor: text },
  shareText: { color: text, fontSize: 16 },
  chevron: { color: secondaryText, fontSize: 28, fontWeight: '300', marginTop: -2 },
  pressed: { opacity: 0.78 },
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 18, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { height: 236, borderRadius: 22, backgroundColor: isDark ? '#242424' : '#FFFFFF', alignItems: 'center', paddingHorizontal: 16 },
  handle: { marginTop: 10, width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#555555' : '#D6D6D6' },
  sheetTitle: { marginTop: 14, color: text, fontSize: 18, fontWeight: '600' },
  sheetCopy: { marginTop: 8, maxWidth: 310, color: secondaryText, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  keepButton: { alignSelf: 'stretch', height: 50, marginTop: 18, borderRadius: 25, backgroundColor: '#B82F29', alignItems: 'center', justifyContent: 'center' },
  keepLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    leaveLabel: { marginTop: 16, color: secondaryText, fontSize: 16 },
  });
};
