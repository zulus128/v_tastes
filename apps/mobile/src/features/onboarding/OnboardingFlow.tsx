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
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import apple from '../../../assets/onboarding/apple.png';
import google from '../../../assets/onboarding/google.png';
import hero from '../../../assets/onboarding/hero.jpg';
import logo from '../../../assets/onboarding/logo.png';
import pattern from '../../../assets/onboarding/pattern.png';
import { auth, functions } from '../../infrastructure/firebase';
import { BackButton, PatternScreen, PrimaryButton } from './components';
import { countries, type Country } from './countries';
import { onboardingTheme as theme } from './theme';

type Screen = 'entry' | 'consent' | 'phone' | 'country' | 'otp';
type OtpState = 'idle' | 'incorrect' | 'expired' | 'locked';

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

export function OnboardingFlow() {
  const api = useMemo(() => createTastesApi(functions), []);
  const [screen, setScreen] = useState<Screen>('entry');
  const [country, setCountry] = useState(countries[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpState, setOtpState] = useState<OtpState>('idle');
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
    return !query || item.name.toLowerCase().includes(query) || item.callingCode.includes(query);
  });

  async function requestCode() {
    const phoneNumber = `${country.callingCode}${phoneDigits.replace(/\D/g, '')}`;
    if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
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
    if (!challenge || otpCode.length !== 4) return;
    setBusy(true);
    setOtpState('idle');
    try {
      const result = await api.verifyPhoneOtp({ challengeId: challenge.id, code: otpCode });
      await signInWithCustomToken(auth, result.data.customToken);
    } catch (error) {
      const reason = errorDetails(error).reason;
      if (reason === 'code-expired') setOtpState('expired');
      else if (reason === 'max-attempts-reached') setOtpState('locked');
      else setOtpState('incorrect');
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
  return (
    <LinearGradient colors={['#560E0B', '#000000']} style={styles.fullScreen}>
      <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.entryPattern} style={styles.centered}>
        <Image source={logo} resizeMode="contain" style={styles.entryLogo} />
      </ImageBackground>
    </LinearGradient>
  );
}

function ConsentScreen({ onPhone }: { onPhone: () => void }) {
  const unavailable = (provider: string) => Alert.alert(`${provider} sign-in`, 'This provider is not configured in the local test build yet.');
  return (
    <View style={styles.fullScreen}>
      <Image source={hero} resizeMode="cover" style={styles.hero} />
      <RatingPin label="4.5" style={{ left: 66, top: 109 }} />
      <RatingPin label="5.0" style={{ left: 272, top: 121 }} />
      <RatingPin label="4.2" style={{ left: 121, top: 287 }} />
      <RatingPin label="3.5" style={{ left: 316, top: 319 }} />
      <LinearGradient colors={['#560E0B', '#000000', '#000000']} locations={[0, 0.43, 1]} style={styles.consentPanel}>
        <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.panelPattern} style={styles.consentPattern}>
          <View style={styles.consentPrimary}>
            <Image source={logo} resizeMode="contain" style={styles.smallLogo} />
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
              <SocialButton icon={apple} label="Apple" onPress={() => unavailable('Apple')} />
            </View>
            <Text style={styles.legal}>By continuing you agree to our <Text style={styles.legalLink}>Terms of Service</Text> & <Text style={styles.legalLink}>Privacy Policy</Text></Text>
          </View>
        </ImageBackground>
      </LinearGradient>
    </View>
  );
}

function RatingPin({ label, style }: { label: string; style: { left: number; top: number } }) {
  return (
    <View style={[styles.ratingPin, style]}>
      <View style={styles.ratingBubble}><Text style={styles.ratingLabel}>{label}</Text></View>
      <View style={styles.ratingPointer} />
      <Text style={styles.ratingStar}>★</Text>
    </View>
  );
}

function SocialButton({ icon, label, onPress }: { icon: number; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.socialButton}><Image source={icon} style={styles.socialIcon} /><Text style={styles.socialLabel}>{label}</Text></Pressable>;
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
  return (
    <PatternScreen>
      <BackButton onPress={props.onBack} />
      <View style={styles.authContent}>
        <Text style={styles.authTitle}>Your phone number</Text>
        <Text style={styles.authSubtitle}>We use your number to personalize your experience</Text>
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
            placeholderTextColor={theme.colors.placeholder}
            style={styles.phoneInput}
            textContentType="telephoneNumber"
            value={props.digits}
          />
        </View>
        {props.error ? <Text style={styles.errorText}>{props.error}</Text> : null}
      </View>
      <PrimaryButton label="Continue" loading={props.busy} onPress={props.onContinue} style={styles.authButton} />
    </PatternScreen>
  );
}

function CountryScreen(props: {
  countries: Country[];
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
  onSelect: (country: Country) => void;
}) {
  return (
    <PatternScreen>
      <BackButton onPress={props.onBack} />
      <View style={styles.countryContent}>
        <Text style={styles.countryTitle}>Select country</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={props.onQueryChange}
          placeholder="Search"
          placeholderTextColor={theme.colors.placeholder}
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
  const error = props.state === 'incorrect' ? 'Incorrect code. Try again.' : props.state === 'expired' ? 'Your code has expired' : props.state === 'locked' ? 'Too many attempts. Resend code.' : '';
  const canResend = props.resendSeconds === 0;
  return (
    <PatternScreen>
      <BackButton onPress={props.onBack} />
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
      <PrimaryButton disabled={props.code.length !== 4 || props.state === 'expired' || props.state === 'locked'} label="Continue" loading={props.busy} onPress={props.onContinue} style={styles.authButton} />
    </PatternScreen>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  entryPattern: { opacity: 1 },
  entryLogo: { width: 189, height: 95 },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%', height: '63%' },
  ratingPin: { position: 'absolute', width: 44, height: 68, alignItems: 'center' },
  ratingBubble: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.2, borderColor: theme.colors.text, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  ratingLabel: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  ratingPointer: { width: 12, height: 12, backgroundColor: theme.colors.primary, borderRightWidth: 1.2, borderBottomWidth: 1.2, borderColor: theme.colors.text, transform: [{ rotate: '45deg' }], marginTop: -7 },
  ratingStar: { color: theme.colors.text, fontSize: 10, marginTop: 3 },
  consentPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 414, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: theme.colors.text, overflow: 'hidden' },
  consentPattern: { flex: 1, paddingHorizontal: 16, paddingVertical: 24, justifyContent: 'space-between' },
  panelPattern: { opacity: 1 },
  consentPrimary: { gap: 24, alignItems: 'center' },
  smallLogo: { width: 98, height: 49 },
  consentCopy: { gap: 8, alignItems: 'center' },
  consentTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.24 },
  consentSubtitle: { color: theme.colors.muted, fontSize: 16, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
  pager: { height: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pagerActive: { width: 15, height: 6, borderRadius: 3, backgroundColor: theme.colors.text },
  pagerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#737780' },
  fullWidth: { width: '100%' },
  socialSection: { gap: 12 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#45474B' },
  orText: { color: theme.colors.muted, fontSize: 15 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: { flex: 1, height: 44, borderRadius: 36, borderWidth: 1, borderColor: theme.colors.accent, backgroundColor: theme.colors.card, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  socialIcon: { width: 20, height: 20, resizeMode: 'contain' },
  socialLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  legal: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' },
  legalLink: { color: theme.colors.text },
  authContent: { position: 'absolute', left: 16, right: 16, top: 170, alignItems: 'center' },
  authTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  authSubtitle: { color: theme.colors.muted, fontSize: 15, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center', marginTop: 7 },
  phoneSent: { color: theme.colors.text },
  phoneRow: { width: '100%', height: 44, marginTop: 17, borderBottomWidth: 1, borderBottomColor: theme.colors.text, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  phoneRowError: { borderBottomColor: theme.colors.error },
  countrySelector: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flag: { color: theme.colors.text, fontSize: 18 },
  callingCode: { color: theme.colors.text, fontSize: 17 },
  chevron: { color: theme.colors.placeholder, fontSize: 16 },
  phoneDivider: { width: 1, height: 20, marginLeft: 10, marginRight: 11, backgroundColor: 'rgba(255,255,255,0.15)' },
  phoneInput: { flex: 1, color: theme.colors.text, fontSize: 17, paddingVertical: 0 },
  errorText: { color: theme.colors.error, fontSize: 12, marginTop: 6, textAlign: 'center' },
  authButton: { position: 'absolute', top: 409, left: 36, right: 36 },
  countryContent: { flex: 1, paddingTop: 130, paddingHorizontal: 16 },
  countryTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '700' },
  search: { height: 44, marginTop: 19, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.card, color: theme.colors.text, fontSize: 15 },
  countryList: { marginTop: 16 },
  countryRow: { height: 47, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)' },
  countryName: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countryFlag: { fontSize: 20 },
  countryLabel: { color: theme.colors.text, fontSize: 16 },
  countryCode: { color: 'rgba(255,255,255,0.45)', fontSize: 16 },
  otpContent: { position: 'absolute', left: 16, right: 16, top: 170, minHeight: 190, alignItems: 'center' },
  otpRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  otpCell: { width: 40, height: 44, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' },
  otpCellError: { borderColor: theme.colors.error },
  otpDigit: { color: theme.colors.text, fontSize: 17 },
  resendMuted: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 10 },
  resendLink: { color: theme.colors.accent, fontSize: 12, marginTop: 8 },
  localCode: { color: theme.colors.muted, fontSize: 11, marginTop: 8 },
  hiddenOtpInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
