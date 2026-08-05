import { createTastesApi } from '@tastes/firebase-client';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithCustomToken } from 'firebase/auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import apple from '../../../assets/onboarding/apple.png';
import google from '../../../assets/onboarding/google.png';
import hero from '../../../assets/onboarding/hero.jpg';
import pattern from '../../../assets/onboarding/pattern.png';
import { auth, functions } from '../../infrastructure/firebase';
import { TastesLogo } from '../../ui/FigmaIcons';
import { useAppTheme, type ThemeColors } from '../../ui/ThemeProvider';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { countries, defaultCountry, type Country } from './countries';
import { verificationFailureState } from './otp-errors';
import { toE164PhoneNumber } from './phone-number';

type Screen = 'entry' | 'consent' | 'phone' | 'country' | 'otp';
type OtpState = 'idle' | 'incorrect' | 'expired' | 'locked' | 'failure' | 'sign-in-failed';

interface Challenge {
  id: string;
  expiresAt: string;
  resendAvailableAt: string;
  localCode?: string;
}

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
  const compact = height <= 700 || width <= 340;
  return useMemo(() => createStyles(colors, compact), [colors, compact]);
}

export function OnboardingFlow() {
  const api = useMemo(() => createTastesApi(functions), []);
  const [screen, setScreen] = useState<Screen>('entry');
  const [country, setCountry] = useState(defaultCountry);
  const [countrySearch, setCountrySearch] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [pendingCustomToken, setPendingCustomToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const otpInput = useRef<TextInput>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setScreen('consent'), 1_250);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!challenge) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [challenge]);

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
  if (screen === 'consent') return <ConsentScreen onPhone={() => setScreen('phone')} />;
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
    <LinearGradient colors={isDark ? ['#560E0B', '#000000'] : ['#F7E8E4', '#F2EFEA']} style={styles.fullScreen}>
      <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.entryPattern} style={styles.centered}>
        <TastesLogo width={189} />
      </ImageBackground>
    </LinearGradient>
  );
}

function ConsentScreen({ onPhone }: { onPhone: () => void }) {
  const { colors, isDark } = useAppTheme();
  const { height, width } = useWindowDimensions();
  const styles = useOnboardingStyles();
  const compact = height <= 700 || width <= 340;
  const panelHeight = compact ? 390 : 414;
  const heroHeight = height - panelHeight;
  const heroScale = Math.min(1, heroHeight / 387);
  const pinTop = (top: number) => top * heroScale - (1 - heroScale) * 34;
  const pinPositions = [
    { left: width * 0.17, top: pinTop(109) },
    { left: width * 0.70, top: pinTop(121) },
    { left: width * 0.31, top: pinTop(287) },
    { left: width * 0.81, top: pinTop(319) },
  ];
  const unavailable = (provider: string) => Alert.alert(`${provider} sign-in`, 'This provider is not configured in the local test build yet.');
  return (
    <View style={styles.fullScreen}>
      <View style={[styles.heroLayer, { height: heroHeight }]}>
        <Image source={hero} resizeMode="cover" style={styles.hero} />
        <RatingPin label="4.5" scale={heroScale} style={pinPositions[0]} />
        <RatingPin label="5.0" scale={heroScale} style={pinPositions[1]} />
        <RatingPin label="4.2" scale={heroScale} style={pinPositions[2]} />
        <RatingPin label="3.5" scale={heroScale} style={pinPositions[3]} />
      </View>
      <LinearGradient colors={isDark ? ['#560E0B', '#000000', '#000000'] : ['#F7E8E4', colors.canvas, colors.canvas]} locations={[0, 0.43, 1]} style={[styles.consentPanel, { height: panelHeight }]}>
        <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.panelPattern} style={styles.consentPanelBackground}>
          <ScrollView bounces={false} contentContainerStyle={styles.consentScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.consentPrimary}>
              <TastesLogo width={compact ? 80 : 98} />
              <View style={styles.consentCopy}>
                <Text style={styles.consentTitle}>Discover the best places!</Text>
                <Text style={styles.consentSubtitle}>Rate dishes and restaurants to get personalized recommendations</Text>
                <View style={styles.pager}><View style={styles.pagerActive} /><View style={styles.pagerDot} /><View style={styles.pagerDot} /></View>
              </View>
              <PrimaryButton label="Continue with Phone" onPress={onPhone} style={styles.fullWidth} />
            </View>
            <View style={styles.socialSection}>
              <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} /></View>
              <View style={styles.socialRow}>
                <SocialButton icon={google} label="Google" onPress={() => unavailable('Google')} />
                {/* apple.png is a white silhouette; tint it so it's visible against the button's own surface color in either theme. */}
                <SocialButton icon={apple} label="Apple" onPress={() => unavailable('Apple')} tint={colors.text} />
              </View>
              <Text style={styles.legal}>By continuing you agree to our <Text style={styles.legalLink}>Terms of Service</Text> & <Text style={styles.legalLink}>Privacy Policy</Text></Text>
            </View>
          </ScrollView>
        </ImageBackground>
      </LinearGradient>
    </View>
  );
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
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullScreen}>
      <PatternScreen>
        <BackButton onPress={props.onBack} />
        <View style={styles.authKeyboardLayout}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.authScroll}
          >
            <View style={styles.authContent}>
              <Text style={styles.authTitle}>Your phone number</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.9} numberOfLines={1} style={styles.authSubtitle}>We use your number to personalize your experience</Text>
              <View style={[styles.phoneRow, props.error ? styles.phoneRowError : null]}>
                <Pressable onPress={props.onCountry} style={styles.countrySelector}>
                  <Text style={styles.flag}>{props.country.flag}</Text><Text style={styles.callingCode}>{props.country.callingCode}</Text><Text style={styles.chevron}>⌄</Text>
                </Pressable>
                <View style={styles.phoneDivider} />
                <TextInput
                  autoFocus
                  keyboardType="phone-pad"
                  onChangeText={props.onChange}
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
            contentContainerStyle={styles.authScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.authScroll}
          >
            <Pressable onPress={() => props.inputRef.current?.focus()} style={styles.otpContent}>
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

const createStyles = (colors: ThemeColors, compact: boolean) => StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // pattern.png is dark linework on a transparent field, meant as a faint
  // texture (Figma uses ~4-8% opacity here), not a bold full-strength layer.
  entryPattern: { opacity: 0.06 },
  heroLayer: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  hero: { width: '100%', height: '100%' },
  ratingPin: { position: 'absolute', zIndex: 0, width: 44, height: 68, alignItems: 'center' },
  ratingBubble: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.2, borderColor: colors.onPrimary, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ratingLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  ratingPointer: { width: 12, height: 12, backgroundColor: colors.primary, borderRightWidth: 1.2, borderBottomWidth: 1.2, borderColor: colors.onPrimary, transform: [{ rotate: '45deg' }], marginTop: -7 },
  ratingStar: { color: colors.onPrimary, fontSize: 10, marginTop: 3 },
  consentPanel: { position: 'absolute', zIndex: 1, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  consentPanelBackground: { flex: 1 },
  consentScrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: compact ? 14 : 24, justifyContent: 'space-between' },
  panelPattern: { opacity: 0.06 },
  consentPrimary: { gap: compact ? 12 : 24, alignItems: 'center' },
  consentCopy: { gap: 8, alignItems: 'center' },
  consentTitle: { color: colors.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.24 },
  consentSubtitle: { color: colors.textSecondary, fontSize: 16, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
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
  phoneRow: { width: '100%', height: 44, marginTop: 17, borderBottomWidth: 1, borderBottomColor: colors.text, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  phoneRowError: { borderBottomColor: colors.danger },
  countrySelector: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flag: { color: colors.text, fontSize: 18 },
  callingCode: { color: colors.text, fontSize: 17 },
  chevron: { color: colors.placeholder, fontSize: 16 },
  phoneDivider: { width: 1, height: 20, marginLeft: 10, marginRight: 11, backgroundColor: colors.hairline },
  phoneInput: { flex: 1, color: colors.text, fontSize: 17, paddingVertical: 0 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6, textAlign: 'center' },
  phoneErrorText: { width: '100%', textAlign: 'left' },
  authButtonArea: { paddingHorizontal: 36, paddingBottom: compact ? 12 : 24 },
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
