import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithCustomToken, updateProfile } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import apple from '../../../assets/onboarding/apple.png';
import google from '../../../assets/onboarding/google.png';
import hero from '../../../assets/onboarding/hero.jpg';
import heroRate from '../../../assets/onboarding/hero-rate.png';
import heroFollow from '../../../assets/onboarding/hero-follow.png';
import pattern from '../../../assets/onboarding/pattern.png';
import { auth } from '../../infrastructure/firebase';
import { useTastesApi } from '../../session/SessionProvider';
import { TastesLogo } from '../../ui/FigmaIcons';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet, responsiveValue, useResponsiveMetrics } from '../../ui/responsive';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { countries, defaultCountry, type Country } from './countries';
import { verificationFailureState } from './otp-errors';
import { toE164PhoneNumber } from './phone-number';

export type OnboardingScreen = 'entry' | 'consent' | 'phone' | 'country' | 'otp';
type OtpState = 'idle' | 'incorrect' | 'expired' | 'locked' | 'failure' | 'sign-in-failed';

WebBrowser.maybeCompleteAuthSession();

interface Challenge {
  id: string;
  expiresAt: string;
  resendAvailableAt: string;
  localCode?: string;
}

const visualAuditChallenge: Challenge = {
  id: 'visual-audit-challenge',
  expiresAt: '2099-01-01T00:00:00.000Z',
  resendAvailableAt: '2000-01-01T00:00:00.000Z',
  localCode: '1234',
};

function errorDetails(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return {};
  const details = (error as { details?: unknown }).details;
  return typeof details === 'object' && details !== null ? details as Record<string, unknown> : {};
}

function displayPhone(country: Country, digits: string): string {
  return `${country.callingCode} ${digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()}`;
}

function useOnboardingStyles() {
  const { colors } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const { scale } = useResponsiveMetrics();
  const insets = useSafeAreaInsets();
  const compact = height <= 700 || width <= 340;
  const bottomGutter = Math.max(compact ? 12 : 24, insets.bottom / scale);
  return useMemo(() => createStyles(colors, compact, bottomGutter), [colors, compact, bottomGutter]);
}

function useAuthScrollLayout(styles: ReturnType<typeof useOnboardingStyles>) {
  const { scale } = useResponsiveMetrics();
  const insets = useSafeAreaInsets();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // KeyboardAvoidingView can leave much less space than the window height.
  // Spend that space on the form before retaining the Figma top whitespace.
  const paddingTop = viewportHeight > 0 && contentHeight > 0
    ? Math.max(
      insets.top + responsiveValue(8, scale),
      Math.min(styles.authScrollContent.paddingTop, viewportHeight - contentHeight - styles.authScrollContent.paddingBottom),
    )
    : styles.authScrollContent.paddingTop;
  return {
    contentContainerStyle: [styles.authScrollContent, { paddingTop }],
    onViewportLayout: (event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height),
    onContentLayout: (event: LayoutChangeEvent) => setContentHeight(event.nativeEvent.layout.height),
  };
}

export function OnboardingFlow({ initialScreen, visualAudit = false }: { initialScreen?: OnboardingScreen; visualAudit?: boolean } = {}) {
  const api = useTastesApi();
  const [screen, setScreen] = useState<OnboardingScreen>(initialScreen ?? 'entry');
  const [country, setCountry] = useState(defaultCountry);
  const [countrySearch, setCountrySearch] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(() => visualAudit && initialScreen === 'otp' ? '7700900123' : '');
  const [phoneError, setPhoneError] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(() => visualAudit && initialScreen === 'otp' ? visualAuditChallenge : null);
  const [otpCode, setOtpCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [pendingCustomToken, setPendingCustomToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const otpInput = useRef<TextInput>(null);
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const selectedGoogleClientId = Platform.select({ ios: googleIosClientId, android: googleAndroidClientId, default: googleWebClientId });
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: selectedGoogleClientId ?? googleWebClientId ?? 'not-configured.apps.googleusercontent.com',
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    webClientId: googleWebClientId,
  });

  useEffect(() => {
    if (initialScreen) return undefined;
    const timeout = setTimeout(() => setScreen('consent'), 1_250);
    return () => clearTimeout(timeout);
  }, [initialScreen]);

  useEffect(() => {
    if (!challenge) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [challenge]);

  useEffect(() => {
    if (visualAudit || googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params.id_token;
    if (!idToken) {
      Alert.alert('Google sign-in failed', 'Google did not return an identity token.');
      return;
    }
    setBusy(true);
    void signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
      .catch((error: unknown) => Alert.alert('Google sign-in failed', error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setBusy(false));
  }, [googleResponse, visualAudit]);

  const signInWithGoogle = async () => {
    if (visualAudit) return;
    if (!selectedGoogleClientId && !googleWebClientId) {
      Alert.alert('Google sign-in needs configuration', 'Add an OAuth client ID to EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID or EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.');
      return;
    }
    if (!googleRequest) return;
    await promptGoogle();
  };

  const signInWithApple = async () => {
    if (visualAudit) return;
    if (Platform.OS !== 'ios' || !await AppleAuthentication.isAvailableAsync()) {
      Alert.alert('Apple sign-in unavailable', 'Sign in with Apple is available on supported Apple devices.');
      return;
    }
    setBusy(true);
    try {
      const result = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!result.identityToken) throw new Error('Apple did not return an identity token.');
      const credentialUser = await signInWithCredential(auth, new OAuthProvider('apple.com').credential({ idToken: result.identityToken }));
      const providerName = [result.fullName?.givenName, result.fullName?.familyName]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(' ')
        .trim();
      if (providerName && !credentialUser.user.displayName) {
        await updateProfile(credentialUser.user, { displayName: providerName });
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple sign-in failed', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resendSeconds = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1_000))
    : 0;
  const isExpired = challenge ? Date.parse(challenge.expiresAt) <= now : false;

  const filteredCountries = countries.filter((item) => {
    const query = countrySearch.trim().toLowerCase();
    return !query
      || item.name.toLowerCase().includes(query)
      || item.code.toLowerCase().includes(query)
      || item.callingCode.includes(query);
  });

  async function requestCode() {
    const phoneNumber = toE164PhoneNumber(country, phoneDigits);
    if (!phoneNumber) {
      setPhoneError('Enter a valid phone number');
      return;
    }

    Keyboard.dismiss();
    if (visualAudit) {
      setChallenge(visualAuditChallenge);
      setNow(Date.now());
      setOtpCode('');
      setOtpState('idle');
      setPendingCustomToken(null);
      setScreen('otp');
      setTimeout(() => otpInput.current?.focus(), 250);
      return;
    }
    setBusy(true);
    setPhoneError('');
    try {
      const result = await api.requestPhoneOtp({ phoneNumber });
      setChallenge({
        id: result.data.challengeId,
        expiresAt: result.data.expiresAt,
        resendAvailableAt: result.data.resendAvailableAt,
        localCode: result.data.localCode,
      });
      setNow(Date.now());
      setOtpCode('');
      setOtpState('idle');
      setPendingCustomToken(null);
      setScreen('otp');
      setTimeout(() => otpInput.current?.focus(), 250);
    } catch (error) {
      const details = errorDetails(error);
      if (details.reason === 'resend-too-soon' && typeof details.resendAvailableAt === 'string') {
        setChallenge((current) => current ? { ...current, resendAvailableAt: details.resendAvailableAt as string } : current);
      } else {
        setPhoneError(error instanceof Error ? error.message : 'Could not send the code');
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if ((!challenge && !pendingCustomToken) || otpCode.length !== 4) return;
    if (visualAudit) {
      setOtpState(otpCode === visualAuditChallenge.localCode ? 'idle' : 'incorrect');
      return;
    }
    setBusy(true);
    setOtpState('idle');
    let customToken = pendingCustomToken;
    try {
      if (!customToken) {
        if (!challenge) return;
        const result = await api.verifyPhoneOtp({ challengeId: challenge.id, code: otpCode });
        customToken = result.data.customToken;
        setPendingCustomToken(customToken);
      }
      await signInWithCustomToken(auth, customToken);
      setPendingCustomToken(null);
    } catch (error) {
      if (customToken) {
        setOtpState('sign-in-failed');
        return;
      }
      setOtpState(verificationFailureState(errorDetails(error).reason));
    } finally {
      setBusy(false);
    }
  }

  if (screen === 'entry') return <EntryScreen />;
  if (screen === 'consent') return <ConsentScreen busy={busy} onApple={signInWithApple} onGoogle={signInWithGoogle} onPhone={() => setScreen('phone')} />;
  if (screen === 'country') {
    return (
      <CountryScreen
        countries={filteredCountries}
        query={countrySearch}
        onQueryChange={setCountrySearch}
        onBack={() => setScreen('phone')}
        onSelect={(nextCountry) => {
          setCountry(nextCountry);
          setScreen('phone');
        }}
      />
    );
  }
  if (screen === 'phone') {
    return (
      <PhoneScreen
        busy={busy}
        country={country}
        digits={phoneDigits}
        error={phoneError}
        onBack={() => setScreen('consent')}
        onChange={(value) => {
          setPhoneDigits(value.replace(/\D/g, '').slice(0, 15));
          setPhoneError('');
        }}
        onCountry={() => setScreen('country')}
        onContinue={requestCode}
      />
    );
  }

  return (
    <OtpScreen
      busy={busy}
      code={otpCode}
      inputRef={otpInput}
      localCode={challenge?.localCode}
      phone={displayPhone(country, phoneDigits)}
      resendSeconds={resendSeconds}
      state={isExpired && otpState === 'idle' ? 'expired' : otpState}
      onBack={() => setScreen('phone')}
      onChange={(value) => {
        setOtpCode(value.replace(/\D/g, '').slice(0, 4));
        setOtpState('idle');
      }}
      onContinue={verifyCode}
      onResend={requestCode}
    />
  );
}

function EntryScreen() {
  const { isDark } = useAppTheme();
  const styles = useOnboardingStyles();
  return (
    <LinearGradient colors={isDark ? ['#560E0B', '#000000'] : ['#F2EFEA', '#F2EFEA']} style={styles.fullScreen}>
      <ImageBackground
        source={pattern}
        resizeMode="cover"
        imageStyle={{ opacity: isDark ? 0.04 : 0.05, tintColor: isDark ? '#FFFFFF' : '#000000' }}
        style={styles.centered}
      >
        <TastesLogo width={responsiveSize(189)} />
      </ImageBackground>
    </LinearGradient>
  );
}

function ConsentScreen({ busy, onApple, onGoogle, onPhone }: { busy: boolean; onApple: () => void; onGoogle: () => void; onPhone: () => void }) {
  const { colors, isDark } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const { scale: layoutScale } = useResponsiveMetrics();
  const styles = useOnboardingStyles();
  const compact = height <= 700 || width <= 340;
  const landscape = width > height;
  const heroWidth = landscape
    ? Math.min(width * 0.46, Math.max(width * 0.38, responsiveValue(220, layoutScale)))
    : width;
  const panelWidth = width - heroWidth;
  const panelHeight = landscape ? height : Math.min(height, responsiveValue(compact ? 390 : 414, layoutScale));
  const heroHeight = landscape ? height : height - panelHeight;
  const heroOverflow = responsiveValue(48, layoutScale);
  const heroScale = Math.max(0, Math.min(1, heroHeight / responsiveValue(387, layoutScale)));
  const pinTop = (top: number) => responsiveValue(top, layoutScale) * heroScale
    - (1 - heroScale) * responsiveValue(34, layoutScale)
    - heroOverflow / 2;
  const pinPositions = [
    { left: heroWidth * 0.17, top: pinTop(109) },
    { left: heroWidth * 0.70, top: pinTop(121) },
    { left: heroWidth * 0.31, top: pinTop(287) },
    { left: heroWidth * 0.81, top: pinTop(319) },
  ];
  const slides = [
    { image: hero, title: 'Discover the best places!', subtitle: 'Rate dishes and restaurants to get personalized\nrecommendations' },
    { image: heroRate, title: 'Rate what you eat', subtitle: 'Score dishes and places in seconds — your taste profile builds itself.' },
    { image: heroFollow, title: 'Follow people you trust', subtitle: 'Build a feed from people whose taste you know you can trust.' },
  ];
  return <ScrollView horizontal pagingEnabled bounces={false} showsHorizontalScrollIndicator={false} style={styles.consentCarousel}>
    {slides.map((slide, index) => <View key={slide.title} style={[styles.fullScreen, { width }]}>
      <View style={[styles.heroLayer, landscape ? { bottom: 0, right: undefined, width: heroWidth } : null, { height: heroHeight }]}>
        <Image source={slide.image} resizeMode="cover" style={[styles.hero, { height: heroHeight + heroOverflow, top: -heroOverflow }]} />
        <RatingPin label="4.5" scale={heroScale} style={pinPositions[0]} />
        <RatingPin label="5.0" scale={heroScale} style={pinPositions[1]} />
        <RatingPin label="4.2" scale={heroScale} style={pinPositions[2]} />
        <RatingPin label="3.5" scale={heroScale} style={pinPositions[3]} />
      </View>
      <LinearGradient colors={isDark ? ['#560E0B', '#000000', '#000000'] : ['#F7E8E4', colors.canvas, colors.canvas]} locations={[0, 0.43, 1]} style={[styles.consentPanel, landscape ? styles.consentPanelLandscape : null, landscape ? { left: heroWidth, width: panelWidth } : null, { height: panelHeight }]}>
        <ImageBackground source={pattern} resizeMode="cover" imageStyle={isDark ? styles.panelPatternDark : styles.panelPattern} style={styles.consentPanelBackground}>
          <SafeAreaView edges={landscape ? ['right', 'bottom'] : ['left', 'right', 'bottom']} style={styles.consentPanelBackground}>
            <ScrollView bounces={false} contentContainerStyle={styles.consentScrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.consentPrimary}>
                <TastesLogo width={responsiveValue(compact ? 80 : 98, layoutScale)} />
                <View style={styles.consentCopy}>
                  <Text style={styles.consentTitle}>{slide.title}</Text>
                  <Text adjustsFontSizeToFit minimumFontScale={0.9} numberOfLines={2} style={styles.consentSubtitle}>{slide.subtitle}</Text>
                  <View style={styles.pager}>{slides.map((_, dot) => <View key={dot} style={dot === index ? styles.pagerActive : styles.pagerDot} />)}</View>
                </View>
                <PrimaryButton label="Continue with Phone" onPress={onPhone} style={styles.fullWidth} />
              </View>
              <View style={styles.socialSection}>
                <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} /></View>
                <View style={styles.socialRow}>
                  <SocialButton icon={google} label="Google" onPress={busy ? () => undefined : onGoogle} />
                  <SocialButton icon={apple} label="Apple" onPress={busy ? () => undefined : onApple} tint={colors.text} />
                </View>
                <Text style={styles.legal}>By continuing you agree to our <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://tastesapp.com/terms')} style={styles.legalLink}>Terms of Service</Text> & <Text accessibilityRole="link" onPress={() => void Linking.openURL('https://tastesapp.com/privacy')} style={styles.legalLink}>Privacy Policy</Text></Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </ImageBackground>
      </LinearGradient>
    </View>)}
  </ScrollView>;
}

function RatingPin({ label, scale, style }: { label: string; scale: number; style: { left: number; top: number } }) {
  const styles = useOnboardingStyles();
  return (
    <View style={[styles.ratingPin, style, { transform: [{ scale }] }]}>
      <View style={styles.ratingBubble}><Text style={styles.ratingLabel}>{label}</Text></View>
      <View style={styles.ratingPointer} />
      <Text style={styles.ratingStar}>★</Text>
    </View>
  );
}

function SocialButton({ icon, label, onPress, tint }: { icon: number; label: string; onPress: () => void; tint?: string }) {
  const styles = useOnboardingStyles();
  return <Pressable onPress={onPress} style={styles.socialButton}><Image source={icon} style={[styles.socialIcon, tint ? { tintColor: tint } : null]} /><Text style={styles.socialLabel}>{label}</Text></Pressable>;
}

function PhoneScreen(props: {
  busy: boolean;
  country: Country;
  digits: string;
  error: string;
  onBack: () => void;
  onChange: (value: string) => void;
  onCountry: () => void;
  onContinue: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useOnboardingStyles();
  const scrollLayout = useAuthScrollLayout(styles);
  const [focused, setFocused] = useState(false);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullScreen}>
      <PatternScreen>
        <BackButton onPress={props.onBack} />
        <View style={styles.authKeyboardLayout}>
          <ScrollView
            bounces={false}
            contentContainerStyle={scrollLayout.contentContainerStyle}
            keyboardShouldPersistTaps="handled"
            onLayout={scrollLayout.onViewportLayout}
            showsVerticalScrollIndicator={false}
            style={styles.authScroll}
            testID="onboarding-phone-scroll"
          >
            <View onLayout={scrollLayout.onContentLayout} style={styles.authContent} testID="onboarding-phone-content">
              <Text style={styles.authTitle}>Your phone number</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.9} numberOfLines={1} style={styles.authSubtitle}>We use your number to personalize your experience</Text>
              <View style={[styles.phoneRow, (focused || props.digits) ? styles.phoneRowFocused : null, props.error ? styles.phoneRowError : null]}>
                <Pressable onPress={props.onCountry} style={styles.countrySelector}>
                  <Text style={styles.flag}>{props.country.flag}</Text><Text style={styles.callingCode}>{props.country.callingCode}</Text><Text style={styles.chevron}>⌄</Text>
                </Pressable>
                <View style={styles.phoneDivider} />
                <TextInput
                  autoFocus
                  keyboardType="phone-pad"
                  onChangeText={props.onChange}
                  onBlur={() => setFocused(false)}
                  onFocus={() => setFocused(true)}
                  placeholder="Phone number"
                  placeholderTextColor={colors.placeholder}
                  style={styles.phoneInput}
                  textContentType="telephoneNumber"
                  value={props.digits}
                />
              </View>
              {props.error ? <Text style={[styles.errorText, styles.phoneErrorText]}>{props.error}</Text> : null}
            </View>
          </ScrollView>
          <View style={styles.authButtonArea}>
            <PrimaryButton label="Continue" loading={props.busy} onPress={props.onContinue} />
          </View>
        </View>
      </PatternScreen>
    </KeyboardAvoidingView>
  );
}

function CountryScreen(props: {
  countries: Country[];
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
  onSelect: (country: Country) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useOnboardingStyles();
  return (
    <PatternScreen>
      <BackButton onPress={props.onBack} />
      <View style={styles.countryContent}>
        <Text style={styles.countryTitle}>Select country</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={props.onQueryChange}
          placeholder="Search"
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          value={props.query}
        />
        <FlatList
          data={props.countries}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <Pressable onPress={() => props.onSelect(item)} style={styles.countryRow}>
              <View style={styles.countryName}><Text style={styles.countryFlag}>{item.flag}</Text><Text style={styles.countryLabel}>{item.name}</Text></View>
              <Text style={styles.countryCode}>{item.callingCode}</Text>
            </Pressable>
          )}
          style={styles.countryList}
        />
      </View>
    </PatternScreen>
  );
}

function OtpScreen(props: {
  busy: boolean;
  code: string;
  inputRef: React.RefObject<TextInput | null>;
  localCode?: string;
  phone: string;
  resendSeconds: number;
  state: OtpState;
  onBack: () => void;
  onChange: (value: string) => void;
  onContinue: () => void;
  onResend: () => void;
}) {
  const styles = useOnboardingStyles();
  const scrollLayout = useAuthScrollLayout(styles);
  const error = props.state === 'incorrect'
    ? 'Incorrect code. Try again.'
    : props.state === 'expired'
      ? 'Your code has expired'
      : props.state === 'locked'
        ? 'Too many attempts. Resend code.'
        : props.state === 'sign-in-failed'
          ? 'Code accepted, but sign-in failed. Try again.'
          : props.state === 'failure'
            ? 'Could not verify code. Try again.'
            : '';
  const canResend = props.resendSeconds === 0;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullScreen}>
      <PatternScreen>
        <BackButton onPress={props.onBack} />
        <View style={styles.authKeyboardLayout}>
          <ScrollView
            bounces={false}
            contentContainerStyle={scrollLayout.contentContainerStyle}
            keyboardShouldPersistTaps="handled"
            onLayout={scrollLayout.onViewportLayout}
            showsVerticalScrollIndicator={false}
            style={styles.authScroll}
            testID="onboarding-otp-scroll"
          >
            <Pressable onLayout={scrollLayout.onContentLayout} onPress={() => props.inputRef.current?.focus()} style={styles.otpContent} testID="onboarding-otp-content">
              <Text style={styles.authTitle}>Enter code</Text>
              <Text style={styles.authSubtitle}>A verification code has been sent to{`\n`}<Text style={styles.phoneSent}>{props.phone}</Text></Text>
              <View style={styles.otpRow}>
                {[0, 1, 2, 3].map((index) => <View key={index} style={[styles.otpCell, error ? styles.otpCellError : null]}><Text style={styles.otpDigit}>{props.code[index] ?? ''}</Text></View>)}
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {props.resendSeconds > 0 && !error ? <Text style={styles.resendMuted}>Resend code in 0:{String(props.resendSeconds).padStart(2, '0')}</Text> : null}
              {canResend ? <Pressable disabled={props.busy} onPress={props.onResend}><Text style={styles.resendLink}>Resend code</Text></Pressable> : null}
              {props.localCode ? <Text style={styles.localCode}>Local test code: {props.localCode}</Text> : null}
              <TextInput
                ref={props.inputRef}
                caretHidden
                keyboardType="number-pad"
                maxLength={4}
                onChangeText={props.onChange}
                style={styles.hiddenOtpInput}
                textContentType="oneTimeCode"
                value={props.code}
              />
            </Pressable>
          </ScrollView>
          <View style={styles.authButtonArea}>
            <PrimaryButton disabled={props.code.length !== 4 || props.state === 'expired' || props.state === 'locked'} label="Continue" loading={props.busy} onPress={props.onContinue} />
          </View>
        </View>
      </PatternScreen>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors, compact: boolean, bottomGutter: number) => responsiveStyleSheet({
  fullScreen: { flex: 1, backgroundColor: colors.background },
  consentCarousel: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroLayer: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  hero: { position: 'absolute', left: 0, right: 0, width: '100%' },
  ratingPin: { position: 'absolute', zIndex: 0, width: 44, height: 68, alignItems: 'center' },
  ratingBubble: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.2, borderColor: colors.onPrimary, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ratingLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  ratingPointer: { width: 12, height: 12, backgroundColor: colors.primary, borderRightWidth: 1.2, borderBottomWidth: 1.2, borderColor: colors.onPrimary, transform: [{ rotate: '45deg' }], marginTop: -7 },
  ratingStar: { color: colors.onPrimary, fontSize: 10, marginTop: 3 },
  consentPanel: { position: 'absolute', zIndex: 1, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  consentPanelLandscape: { top: 0, right: undefined, borderTopRightRadius: 0, borderBottomLeftRadius: 24, borderTopWidth: 0, borderLeftWidth: 1 },
  consentPanelBackground: { flex: 1 },
  consentScrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: compact ? 14 : 24, justifyContent: 'space-between' },
  panelPattern: { opacity: 0.06 },
  panelPatternDark: { opacity: 0.04, tintColor: '#FFFFFF' },
  consentPrimary: { gap: compact ? 12 : 24, alignItems: 'center' },
  consentCopy: { gap: 8, alignItems: 'center' },
  consentTitle: { color: colors.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.24 },
  consentSubtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
  pager: { height: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pagerActive: { width: 15, height: 6, borderRadius: 3, backgroundColor: colors.text },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
  fullWidth: { width: '100%' },
  socialSection: { gap: compact ? 8 : 12, marginTop: compact ? 12 : 20 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { color: colors.textSecondary, fontSize: 15 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: { flex: 1, height: compact ? 42 : 44, borderRadius: 36, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  socialIcon: { width: 20, height: 20, resizeMode: 'contain' },
  socialLabel: { color: colors.text, fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  legal: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  legalLink: { color: colors.text },
  authKeyboardLayout: { flex: 1 },
  authScroll: { flex: 1 },
  authScrollContent: { flexGrow: 1, paddingTop: compact ? 112 : 170, paddingHorizontal: 16, paddingBottom: 16 },
  authContent: { width: '100%', alignItems: 'center' },
  authTitle: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  authSubtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center', marginTop: 7 },
  phoneSent: { color: colors.text },
  phoneRow: { width: '100%', height: 60, marginTop: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 16, backgroundColor: '#1A1A1C', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  phoneRowFocused: { borderWidth: 2, borderColor: '#E63946' },
  phoneRowError: { borderWidth: 2, borderColor: '#E63946' },
  countrySelector: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flag: { color: colors.text, fontSize: 18 },
  callingCode: { color: colors.text, fontSize: 17 },
  chevron: { color: colors.placeholder, fontSize: 16 },
  phoneDivider: { width: 1, height: 20, marginLeft: 10, marginRight: 11, backgroundColor: colors.hairline },
  phoneInput: { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 0 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6, textAlign: 'center' },
  phoneErrorText: { width: '100%', textAlign: 'left' },
  authButtonArea: { paddingHorizontal: 36, paddingBottom: bottomGutter },
  countryContent: { flex: 1, paddingTop: compact ? 100 : 130, paddingHorizontal: 16 },
  countryTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  search: { height: 44, marginTop: 19, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  countryList: { marginTop: 16 },
  countryRow: { height: 47, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  countryName: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countryFlag: { fontSize: 20 },
  countryLabel: { color: colors.text, fontSize: 16 },
  countryCode: { color: colors.textMuted, fontSize: 16 },
  otpContent: { width: '100%', minHeight: 190, alignItems: 'center' },
  otpRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  otpCell: { width: 40, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  otpCellError: { borderColor: colors.danger },
  otpDigit: { color: colors.text, fontSize: 17 },
  resendMuted: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  resendLink: { color: colors.primary, fontSize: 12, marginTop: 8 },
  localCode: { color: colors.textSecondary, fontSize: 11, marginTop: 8 },
  hiddenOtpInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
