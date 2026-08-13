import type { ProfileExtrasResult, RewardProgress } from '@tastes/contracts';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import birthdayLocked from '../../../assets/rewards/birthday-keeper-locked.png';
import cityLocked from '../../../assets/rewards/city-hopper-locked.png';
import reviewLocked from '../../../assets/rewards/review-rookie-locked.png';
import reviewUnlocked from '../../../assets/rewards/review-rookie.png';
import socialLocked from '../../../assets/rewards/social-starter-locked.png';
import spreadDetail from '../../../assets/rewards/spread-word-detail.png';
import spreadLocked from '../../../assets/rewards/spread-word-locked.png';
import closeIcon from '../../../assets/favourites/close-folder.png';
import BackIcon from '../../../assets/leaderboard/back.svg';
import rewardPattern from '../../../assets/onboarding/pattern.png';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { SideSlideScreen, type SideSlideScreenHandle } from '../../ui/SideSlideScreen';

export type ProfileExtra = 'followers' | 'following' | 'rewards' | 'rewardDetails' | 'notifications' | 'achievement' | null;

type RewardView = RewardProgress & {
  lockedImage: ImageSourcePropType;
  detailImage: ImageSourcePropType;
  current: number;
  target: number;
};

const REWARD_COPY = 'One answer is that Truth pertains to the possibility that an event will occur. If true – it must occur and if false, it cannot occur.';
const REWARD_PRESENTATION = [
  { name: 'Review Rookie', lockedImage: reviewLocked, detailImage: reviewUnlocked, current: 10, target: 10 },
  { name: 'Social Starter', lockedImage: socialLocked, detailImage: socialLocked, current: 4, target: 10 },
  { name: 'Birthday Keeper', lockedImage: birthdayLocked, detailImage: birthdayLocked, current: 3, target: 10 },
  { name: 'Spread the Word', lockedImage: spreadLocked, detailImage: spreadDetail, current: 7, target: 10 },
  { name: 'City Hopper', lockedImage: cityLocked, detailImage: cityLocked, current: 5, target: 10 },
] as const;

function rewardViews(data: ProfileExtrasResult | null): RewardView[] {
  return REWARD_PRESENTATION.map((item, index) => {
    const apiReward = data?.rewards[index];
    const progress = apiReward?.progress ?? item.current / item.target;
    return {
      id: apiReward?.id ?? `reward-${index}`,
      name: apiReward?.name || item.name,
      description: apiReward?.description || REWARD_COPY,
      progress,
      completed: apiReward?.completed ?? progress >= 1,
      xp: apiReward?.xp ?? 0,
      lockedImage: item.lockedImage,
      detailImage: item.detailImage,
      current: apiReward ? Math.min(item.target, Math.round(progress * item.target)) : item.current,
      target: item.target,
    };
  });
}

export function ProfileExtras({
  onClose,
  screen,
  targetUserId,
  visible,
}: {
  onClose: () => void;
  screen: ProfileExtra;
  targetUserId?: string;
  visible: boolean;
}) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top, insets.bottom), [colors, insets.bottom, insets.top]);
  const [enabled, setEnabled] = useState(true);
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [data, setData] = useState<ProfileExtrasResult | null>(null);
  const [detailReward, setDetailReward] = useState<RewardView | null>(null);
  const [achievementReward, setAchievementReward] = useState<RewardView | null>(null);
  const slide = useRef<SideSlideScreenHandle>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void api.getProfileExtras(targetUserId ? { targetUserId } : {})
      .then((result) => {
        if (!active) return;
        setData(result.data);
        const preferences = result.data.notificationPreferences;
        setEnabled(preferences.enabled);
        setPush(preferences.push);
        setEmail(preferences.email);
        setSms(preferences.sms);
      })
      .catch(() => Alert.alert('Could not load profile details', 'Please try again.'));
    return () => { active = false; };
  }, [api, targetUserId, visible]);

  useEffect(() => {
    if (!visible) {
      setDetailReward(null);
      setAchievementReward(null);
    }
  }, [visible]);

  const savePreferences = (next: { enabled: boolean; push: boolean; email: boolean; sms: boolean }) => {
    setEnabled(next.enabled);
    setPush(next.push);
    setEmail(next.email);
    setSms(next.sms);
    void api.updateNotificationPreferences(next)
      .catch(() => Alert.alert('Could not save notification settings', 'Please try again.'));
  };

  const title = screen === 'followers' ? 'Followers'
    : screen === 'following' ? 'Following'
      : screen === 'notifications' ? 'Notifications'
        : 'Rewards';

  return (
    <SideSlideScreen onRequestClose={onClose} ref={slide} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={() => slide.current?.close()} style={styles.headerButton}>
            <BackIcon height={16} width={9} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerButton} />
        </View>

        {screen === 'followers' || screen === 'following' ? (
          <ScrollView contentContainerStyle={styles.peopleList}>
            <Text style={styles.sectionLabel}>{screen.toUpperCase()} ({data?.[screen].length ?? 0})</Text>
            {!data ? <ActivityIndicator color={colors.primary} /> : data[screen].map((person) => (
              <View key={person.userId} style={styles.person}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{person.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View>
                <View style={styles.personCopy}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.handle}>{person.username ? `@${person.username}` : ''}</Text></View>
                <Pressable onPress={() => void (person.following ? api.unfollowUser({ targetUserId: person.userId }) : api.followUser({ targetUserId: person.userId })).then(() => setData((current) => current ? { ...current, [screen]: current[screen].map((candidate) => candidate.userId === person.userId ? { ...candidate, following: !candidate.following } : candidate) } : current))} style={[styles.follow, person.following && styles.following]}>
                  <Text style={styles.followText}>{person.following ? 'Following' : 'Follow'}</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : screen === 'notifications' ? (
          <ScrollView contentContainerStyle={styles.settings}>
            <Setting label="Enable notifications" onChange={(value) => savePreferences({ enabled: value, push, email, sms })} styles={styles} value={enabled} />
            <View style={styles.notificationGap} />
            <Setting disabled={!enabled} label="Push notifications" onChange={(value) => savePreferences({ enabled, push: value, email, sms })} styles={styles} value={push} />
            <Setting disabled={!enabled} label="SMS notifications" onChange={(value) => savePreferences({ enabled, push, email, sms: value })} styles={styles} value={sms} />
          </ScrollView>
        ) : (
          <RewardsList
            data={data}
            onPress={(reward) => reward.completed ? setAchievementReward(reward) : setDetailReward(reward)}
            styles={styles}
          />
        )}

        <RewardDetailsModal onClose={() => setDetailReward(null)} reward={detailReward} styles={styles} />
        <AchievementModal
          onClose={() => setAchievementReward(null)}
          onViewAll={() => setAchievementReward(null)}
          reward={achievementReward}
          styles={styles}
        />
      </View>
    </SideSlideScreen>
  );
}

function RewardsList({ data, onPress, styles }: { data: ProfileExtrasResult | null; onPress: (reward: RewardView) => void; styles: ReturnType<typeof createStyles> }) {
  return (
    <ScrollView contentContainerStyle={styles.rewards} showsVerticalScrollIndicator={false}>
      <View style={styles.levelTag}>
        <Text style={styles.levelPrefix}>Current level:</Text>
        <Text style={styles.levelName}>{(data?.level ?? 1) <= 1 ? 'Newbie' : `Level ${data?.level}`}</Text>
      </View>
      <View style={styles.rewardList}>
        {rewardViews(data).map((reward) => (
          <Pressable key={reward.id} onPress={() => onPress(reward)} style={({ pressed }) => [styles.rewardRow, pressed && styles.pressed]}>
            <Image source={reward.lockedImage} style={styles.rewardImage} />
            <View style={styles.rewardCopy}>
              <Text style={styles.rewardName}>{reward.name}</Text>
              <Text numberOfLines={2} style={styles.rewardDescription}>{reward.description}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function RewardDetailsModal({ onClose, reward, styles }: { onClose: () => void; reward: RewardView | null; styles: ReturnType<typeof createStyles> }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={reward !== null}>
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.detailSheet}>
          <SheetHeader onClose={onClose} styles={styles}>Reward details</SheetHeader>
          <View style={styles.detailContent}>
            <Image source={reward?.detailImage} style={styles.detailImage} />
            <ProgressCount current={reward?.current ?? 0} styles={styles} target={reward?.target ?? 10} />
            <Text style={styles.detailName}>{reward?.name}</Text>
            <Text style={styles.detailCopy}>{reward?.description}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AchievementModal({ onClose, onViewAll, reward, styles }: { onClose: () => void; onViewAll: () => void; reward: RewardView | null; styles: ReturnType<typeof createStyles> }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={reward !== null}>
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <ImageBackground imageStyle={styles.achievementPatternImage} source={rewardPattern} style={styles.achievementSheet}>
          <SheetHeader onClose={onClose} styles={styles}>Achievement unlocked !</SheetHeader>
          <View style={styles.achievementBody}>
            <View style={styles.achievementCard}>
              <Image source={reward?.name === 'Review Rookie' ? reviewUnlocked : reward?.detailImage} style={styles.achievementImage} />
              <View style={styles.achievementCopy}>
                <ProgressCount current={reward?.target ?? 10} styles={styles} target={reward?.target ?? 10} />
                <Text style={styles.rewardName}>{reward?.name}</Text>
                <Text numberOfLines={2} style={styles.rewardDescription}>{reward?.description}</Text>
              </View>
            </View>
            <Pressable onPress={onViewAll} style={styles.viewAllButton}><Text style={styles.viewAllText}>View all rewards</Text></Pressable>
          </View>
        </ImageBackground>
      </View>
    </Modal>
  );
}

function SheetHeader({ children, onClose, styles }: { children: ReactNode; onClose: () => void; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.sheetHeader}>
      <Text style={styles.sheetTitle}>{children}</Text>
      <Pressable accessibilityLabel="Close" onPress={onClose}><Image source={closeIcon} style={styles.closeIcon} /></Pressable>
    </View>
  );
}

function ProgressCount({ current, styles, target }: { current: number; styles: ReturnType<typeof createStyles>; target: number }) {
  return <Text style={styles.progressCount}><Text style={styles.progressCurrent}>{current}</Text> / {target}</Text>;
}

function Setting({ disabled = false, label, onChange, styles, value }: { disabled?: boolean; label: string; onChange: (value: boolean) => void; styles: ReturnType<typeof createStyles>; value: boolean }) {
  return <View style={[styles.setting, disabled && styles.disabledSetting]}><Text style={styles.settingLabel}>{label}</Text><Switch disabled={disabled} onValueChange={onChange} thumbColor="#FFFFFF" trackColor={{ false: '#353535', true: '#B82F29' }} value={value} /></View>;
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#161616' },
    header: { height: safeTop + 60, paddingTop: safeTop, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#080808', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    headerButton: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    sectionLabel: { marginTop: 18, marginBottom: 8, color: colors.textMuted, fontSize: 12 },
    peopleList: { paddingHorizontal: 16, paddingBottom: 30 },
    person: { height: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    avatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    personCopy: { flex: 1, marginLeft: 11 },
    personName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    handle: { marginTop: 3, color: colors.textSecondary, fontSize: 12 },
    follow: { minWidth: 82, height: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    following: { borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' },
    followText: { color: colors.text, fontSize: 12, fontWeight: '600' },
    settings: { paddingHorizontal: 16, paddingBottom: 30 },
    notificationGap: { height: 14 },
    setting: { height: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
    disabledSetting: { opacity: 0.45 },
    settingLabel: { flex: 1, color: colors.text, fontSize: 15 },
    rewards: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(30, safeBottom) },
    levelTag: { height: 38, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 100, backgroundColor: 'rgba(184,47,41,0.10)' },
    levelPrefix: { color: '#FFFFFF', opacity: 0.5, fontSize: 14, letterSpacing: -0.41 },
    levelName: { color: '#B82F29', fontSize: 16, fontWeight: '600', letterSpacing: -0.23 },
    rewardList: { marginTop: 16, gap: 12 },
    rewardRow: { height: 132, padding: 24, flexDirection: 'row', gap: 16, alignItems: 'center', borderWidth: 1, borderColor: '#45474B', borderRadius: 16 },
    rewardImage: { width: 84, height: 84, resizeMode: 'contain' },
    rewardCopy: { flex: 1, gap: 7 },
    rewardName: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.24 },
    rewardDescription: { color: '#AAB2C5', fontSize: 14, lineHeight: 18, letterSpacing: -0.41 },
    pressed: { opacity: 0.7 },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
    detailSheet: { height: 450 + safeBottom, paddingBottom: Math.max(30, safeBottom), borderTopWidth: 1, borderTopColor: '#45474B', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#161616', overflow: 'hidden' },
    sheetHeader: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.45 },
    closeIcon: { width: 30, height: 30 },
    detailContent: { paddingHorizontal: 16, gap: 16, alignItems: 'center' },
    detailImage: { width: 120, height: 120, resizeMode: 'contain' },
    progressCount: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.41 },
    progressCurrent: { color: '#B82F29' },
    detailName: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.24 },
    detailCopy: { maxWidth: 370, color: '#AAB2C5', fontSize: 14, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
    achievementSheet: { paddingBottom: Math.max(30, safeBottom), borderTopWidth: 1, borderTopColor: '#45474B', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#161616' },
    achievementPatternImage: { opacity: 0.18, resizeMode: 'repeat' },
    achievementBody: { paddingHorizontal: 16, gap: 24, alignItems: 'center' },
    achievementCard: { width: '100%', height: 132, padding: 24, flexDirection: 'row', gap: 16, alignItems: 'center', borderWidth: 1, borderColor: '#45474B', borderRadius: 16, backgroundColor: '#080808' },
    achievementImage: { width: 84, height: 84, resizeMode: 'contain' },
    achievementCopy: { flex: 1, gap: 6 },
    viewAllButton: { width: 330, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#4C1816', borderRadius: 36, backgroundColor: '#B82F29' },
    viewAllText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
  });
}
