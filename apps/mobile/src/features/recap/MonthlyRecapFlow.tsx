import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Pressable,
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
import { TastesLogo } from '../../ui/FigmaIcons';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type RecapStep = 'loading' | 'lowData' | 'followers' | 'comparison' | 'share';

type MonthlyRecapFlowProps = {
  mode?: 'ready' | 'lowData';
  onClose: () => void;
};

const shareMessage = 'My June Tastes recap: 15 places visited, 2 new areas explored, and 132 new followers.';

export function MonthlyRecapFlow({ mode = 'ready', onClose }: MonthlyRecapFlowProps) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [step, setStep] = useState<RecapStep>('loading');
  const [confirmingClose, setConfirmingClose] = useState(false);

  useEffect(() => {
    if (step !== 'loading') return;
    const timer = setTimeout(() => setStep(mode === 'lowData' ? 'lowData' : 'followers'), 1600);
    return () => clearTimeout(timer);
  }, [mode, step]);

  async function shareRecap(channel: string) {
    if (channel === 'Copy link') {
      await Clipboard.setStringAsync('https://tastes.app/recap/june');
      Alert.alert('Link copied');
      return;
    }
    await Share.share({
      message: shareMessage,
      title: 'Monthly Recap',
    });
  }

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={isDark ? ['#560E0B', '#260706', '#080808'] : ['#F7E8E4', '#F2EFEA', '#F2EFEA']}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.pattern} style={StyleSheet.absoluteFill}>
        {(step === 'followers' || step === 'comparison') ? (
          <StoryProgress completed={step === 'followers' ? 6 : 7} />
        ) : null}

        <Pressable
          accessibilityLabel="Close recap"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => setConfirmingClose(true)}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeGlyph}>×</Text>
        </Pressable>

        {step === 'loading' ? <LoadingScreen /> : null}
        {step === 'lowData' ? <LowDataScreen onExplore={onClose} /> : null}
        {step === 'followers' ? <FollowersScreen onNext={() => setStep('comparison')} /> : null}
        {step === 'comparison' ? <ComparisonScreen onNext={() => setStep('share')} /> : null}
        {step === 'share' ? <ShareCard onShare={shareRecap} /> : null}
      </ImageBackground>

      <CloseConfirmation
        visible={confirmingClose}
        onKeepWatching={() => setConfirmingClose(false)}
        onLeave={onClose}
      />
    </View>
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
      <Text style={styles.centerSubtitle}>We're putting together your June recap.</Text>
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
        <Text style={styles.centerSubtitle}>
          Visit a few more places this month to unlock your June recap.
        </Text>
      </View>
      <RecapButton label="Explore places" onPress={onExplore} />
    </>
  );
}

function FollowersScreen({ onNext }: { onNext: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const people = [
    ['AC', '#4C698F'],
    ['SR', '#865E88'],
    ['LW', '#4D7B65'],
    ['ED', '#9A7544'],
  ] as const;

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
        <Text style={styles.followerCaption}>new followers in June</Text>
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
        <Text style={styles.comparisonTitle}>June vs May</Text>
        <Text style={styles.comparisonSubtitle}>See how they scored</Text>
        <View style={styles.comparisonTable}>
          <ComparisonRow label="Places visited" value="15" delta="↑ 4" positive />
          <ComparisonRow label="New areas explored" value="2" delta="↑ 1" positive />
          <ComparisonRow label="Reviews written" value="9" delta="↓ 2" />
        </View>
      </View>
      <RecapButton label="Next" onPress={onNext} />
    </>
  );
}

function ComparisonRow({
  label,
  value,
  delta,
  positive = false,
}: {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
}) {
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

function ShareCard({ onShare }: { onShare: (channel: string) => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={styles.shareContent}>
      <View style={styles.shareIdentity}>
        <Image source={avatar} style={styles.profileAvatar} />
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
        <Image source={icon} resizeMode="contain" style={styles.shareIcon} />
        <Text style={styles.shareText}>{label}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function RecapButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
      <Text style={styles.ctaLabel}>{label}</Text>
      <Image source={arrowIcon} resizeMode="contain" style={styles.arrow} />
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
          <Text style={styles.sheetCopy}>
            You can watch your June recap again anytime from your profile.
          </Text>
          <Pressable onPress={onKeepWatching} style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
            <Text style={styles.keepLabel}>Keep watching</Text>
          </Pressable>
          <Pressable hitSlop={10} onPress={onLeave}>
            <Text style={styles.leaveLabel}>Leave</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  pattern: { opacity: isDark ? 0.16 : 0.05 },
  closeButton: {
    position: 'absolute',
    zIndex: 3,
    top: 64,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { color: colors.text, opacity: 0.72, fontSize: 22, fontWeight: '300', lineHeight: 24 },
  progress: {
    position: 'absolute',
    zIndex: 2,
    top: 102,
    left: 16,
    right: 16,
    height: 3,
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.text },
  progressPending: { opacity: 0.25 },
  centerContent: {
    position: 'absolute',
    top: '43%',
    left: 21,
    right: 21,
    alignItems: 'center',
    gap: 14,
  },
  loader: { width: 60, height: 60 },
  lockIcon: { width: 47, height: 60, tintColor: colors.text },
  centerTitle: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  centerSubtitle: { maxWidth: 340, color: colors.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  followersContent: {
    position: 'absolute',
    top: '36%',
    left: 21,
    right: 21,
    alignItems: 'center',
    gap: 14,
  },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  initialAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#5D1715',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  followerCount: { color: colors.text, fontSize: 52, lineHeight: 58, fontWeight: '700' },
  followerCaption: { color: colors.textMuted, fontSize: 16, lineHeight: 21 },
  followerFootnote: { color: colors.textMuted, opacity: 0.78, fontSize: 13, lineHeight: 18 },
  comparisonContent: { position: 'absolute', top: 135, left: 16, right: 16, alignItems: 'center' },
  comparisonTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: 0.6 },
  comparisonSubtitle: { marginTop: 7, color: colors.textSecondary, fontSize: 16, lineHeight: 22 },
  comparisonTable: { alignSelf: 'stretch', marginTop: 31 },
  comparisonRow: {
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comparisonLabel: { color: colors.text, opacity: 0.85, fontSize: 16 },
  comparisonResult: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  comparisonValue: { minWidth: 18, color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'right' },
  deltaChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  positiveChip: { backgroundColor: 'rgba(77,191,115,0.18)' },
  negativeChip: { backgroundColor: 'rgba(184,47,41,0.18)' },
  deltaText: { fontSize: 12, fontWeight: '600' },
  positiveText: { color: '#4DBF73' },
  negativeText: { color: '#E04A3F' },
  cta: {
    position: 'absolute',
    left: 35,
    right: 35,
    bottom: 24,
    height: 54,
    borderRadius: 36,
    borderWidth: 5,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaLabel: { color: colors.onPrimary, fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  arrow: { width: 20, height: 12 },
  shareContent: { flex: 1, paddingTop: 102, paddingHorizontal: 16 },
  shareIdentity: { alignItems: 'center', gap: 12 },
  profileAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.text },
  recapTitle: { marginTop: 29, color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  metrics: { marginTop: 0 },
  metricRow: {
    height: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricIcon: { width: 20, height: 20, tintColor: colors.text },
  metricText: { color: colors.text, opacity: 0.9, fontSize: 16 },
  metricBadge: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#FF9EB1', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#080808', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  shareHeading: { marginTop: 58, color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  shareOptions: { marginTop: 18, gap: 10 },
  shareOption: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareOptionLabel: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareIcon: { width: 20, height: 20, tintColor: colors.text },
  shareText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  chevron: { color: colors.textMuted, fontSize: 28, fontWeight: '300', marginTop: -2 },
  pressed: { opacity: 0.78 },
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 18, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    height: 236,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  handle: { marginTop: 10, width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { marginTop: 14, color: colors.text, fontSize: 18, fontWeight: '600' },
  sheetCopy: {
    marginTop: 8,
    maxWidth: 310,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
  },
  keepButton: {
    alignSelf: 'stretch',
    height: 50,
    marginTop: 18,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepLabel: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  leaveLabel: { marginTop: 16, color: colors.textMuted, fontSize: 16 },
});
