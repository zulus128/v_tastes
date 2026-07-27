import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import avatarA from '../../../assets/leaderboard/avatar-a.png';
import avatarB from '../../../assets/leaderboard/avatar-b.jpg';
import avatarC from '../../../assets/leaderboard/avatar-c.png';
import avatarD from '../../../assets/leaderboard/avatar-d.png';
import backIcon from '../../../assets/leaderboard/back.png';
import emptyFriendsIcon from '../../../assets/leaderboard/empty-friends.png';
import infoIcon from '../../../assets/leaderboard/info.png';
import inviteIcon from '../../../assets/leaderboard/xp-invite.png';
import locationIcon from '../../../assets/leaderboard/xp-location.png';
import photoIcon from '../../../assets/leaderboard/xp-photo.png';
import reviewIcon from '../../../assets/leaderboard/xp-review.png';

type LeaderboardState = 'loading' | 'content' | 'empty';
type Period = 'month' | 'allTime';

type LeaderboardScreenProps = {
  initialState?: Exclude<LeaderboardState, 'loading'>;
  onBack: () => void;
};

type RankedPerson = {
  avatar: ImageSourcePropType;
  handle: string;
  movement?: 'up' | 'down';
  name: string;
  rank: number;
  xp: number;
};

const people: RankedPerson[] = [
  { rank: 4, name: 'Jane Cooper', handle: '@nickname2321', xp: 235, avatar: avatarA, movement: 'up' },
  { rank: 5, name: 'Maria Kaine', handle: '@mariaa2', xp: 125, avatar: avatarC, movement: 'down' },
  { rank: 6, name: 'Jane Cooper', handle: '@nickname2321', xp: 95, avatar: avatarB },
  { rank: 7, name: 'Maria Kaine', handle: '@mariaa2', xp: 93, avatar: avatarC },
];

const podium = [
  { rank: 2, name: 'Jane Cooper', handle: '@nickname2321', xp: 432, avatar: avatarA },
  { rank: 1, name: 'Jane Cooper', handle: '@nickname2321', xp: 482, avatar: avatarB },
  { rank: 3, name: 'Jane Cooper', handle: '@nickname2321', xp: 422, avatar: avatarD },
];

export function LeaderboardScreen({ initialState = 'content', onBack }: LeaderboardScreenProps) {
  const [screenState, setScreenState] = useState<LeaderboardState>('loading');
  const [period, setPeriod] = useState<Period>('month');
  const [showXp, setShowXp] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setScreenState(initialState), 900);
    return () => clearTimeout(timer);
  }, [initialState]);

  return (
    <View style={styles.screen}>
      <ImageBackground source={pattern} resizeMode="cover" imageStyle={styles.pattern} style={StyleSheet.absoluteFill} />
      <LeaderboardHeader onBack={onBack} onInfo={() => setShowXp(true)} />

      {screenState === 'loading' ? <LoadingState /> : null}
      {screenState === 'empty' ? <EmptyState /> : null}
      {screenState === 'content' ? (
        <ContentState period={period} onChangePeriod={setPeriod} />
      ) : null}

      <HowXpSheet visible={showXp} onClose={() => setShowXp(false)} />
    </View>
  );
}

function LeaderboardHeader({ onBack, onInfo }: { onBack: () => void; onInfo: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Pressable accessibilityLabel="Back" hitSlop={8} onPress={onBack} style={({ pressed }) => [styles.headerControl, styles.headerLeft, pressed && styles.pressed]}>
          <Image source={backIcon} resizeMode="contain" style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Pressable accessibilityLabel="How to earn XP" hitSlop={8} onPress={onInfo} style={({ pressed }) => [styles.headerControl, styles.headerRight, pressed && styles.pressed]}>
          <Image source={infoIcon} resizeMode="contain" style={styles.infoIcon} />
        </Pressable>
      </View>
      <View style={styles.audienceSwitch}>
        <View style={styles.audienceSelected}><Text style={styles.audienceSelectedText}>Friends</Text></View>
        <Pressable onPress={() => Alert.alert('Local leaderboard', 'Coming soon')} style={styles.audienceOption}>
          <Text style={styles.audienceText}>Local</Text>
          <View style={styles.soonBadge}><Text style={styles.soonText}>Soon</Text></View>
        </Pressable>
      </View>
    </View>
  );
}

function ContentState({ period, onChangePeriod }: { period: Period; onChangePeriod: (period: Period) => void }) {
  return (
    <>
      <View style={styles.periodSwitch}>
        <PeriodButton active={period === 'month'} label="Month" onPress={() => onChangePeriod('month')} />
        <PeriodButton active={period === 'allTime'} label="All-time" onPress={() => onChangePeriod('allTime')} />
      </View>
      <Text style={styles.periodNudge}>
        🏅 {period === 'month' ? 'Month ends in 12 days · Top 3 earn a badge' : 'All-time ranking'}
      </Text>
      <View style={styles.podium}>
        {podium.map((person) => <PodiumPerson key={person.rank} person={person} />)}
      </View>
      <ScrollView style={styles.rankingList} contentContainerStyle={styles.rankingListContent} showsVerticalScrollIndicator={false}>
        {(period === 'month' ? people : [...people].sort((a, b) => b.xp - a.xp)).map((person) => (
          <RankingRow key={`${period}-${person.rank}`} person={person} />
        ))}
      </ScrollView>
      <CurrentUser />
    </>
  );
}

function PeriodButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.periodOption, active && styles.periodSelected]}>
      <Text style={[styles.periodText, active && styles.periodSelectedText]}>{label}</Text>
    </Pressable>
  );
}

function PodiumPerson({ person }: { person: (typeof podium)[number] }) {
  const winner = person.rank === 1;
  const rankStyle = person.rank === 1 ? styles.rank1 : person.rank === 2 ? styles.rank2 : styles.rank3;
  return (
    <View style={[styles.podiumPerson, winner && styles.winner]}>
      <View style={styles.podiumAvatarWrap}>
        <Image source={person.avatar} style={[styles.podiumAvatar, winner && styles.winnerAvatar]} />
        <View style={[styles.rankBadge, rankStyle]}>
          <Text style={styles.rankBadgeText}>{person.rank}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.podiumName}>{person.name}</Text>
      <Text numberOfLines={1} style={styles.podiumHandle}>{person.handle}</Text>
      <Text style={styles.podiumXp}>{person.xp} XP</Text>
    </View>
  );
}

function RankingRow({ person }: { person: RankedPerson }) {
  return (
    <View style={styles.rankingRow}>
      <Text style={styles.rowRank}>{person.rank}</Text>
      <Image source={person.avatar} style={styles.rowAvatar} />
      <View style={styles.rowIdentity}>
        <Text style={styles.rowName}>{person.name}</Text>
        <Text style={styles.rowHandle}>{person.handle}</Text>
      </View>
      <Text style={styles.rowXp}>{person.xp} XP</Text>
      {person.movement ? (
        <Text style={person.movement === 'up' ? styles.movementUp : styles.movementDown}>
          {person.movement === 'up' ? '▲' : '▼'}
        </Text>
      ) : null}
    </View>
  );
}

function CurrentUser() {
  return (
    <View style={styles.currentUser}>
      <Text style={styles.rowRank}>54</Text>
      <Image source={avatarC} style={styles.rowAvatar} />
      <View style={styles.rowIdentity}>
        <Text style={styles.rowName}>Maria Kaine</Text>
        <Text style={styles.rowHandle}>@mariaa2</Text>
      </View>
      <Text style={styles.currentXp}>12 XP</Text>
      <Text style={styles.nextPlace}>▲ 8 XP to #53</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Image source={emptyFriendsIcon} resizeMode="contain" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>No friends ranked yet</Text>
      <Text style={styles.emptyCopy}>Add friends to see who's topping the Tastes charts this week.</Text>
      <Pressable onPress={() => Alert.alert('Add friends', 'Friend search will open here.')} style={({ pressed }) => [styles.addFriends, pressed && styles.pressed]}>
        <Text style={styles.addFriendsText}>Add friends</Text>
      </Pressable>
    </View>
  );
}

function LoadingState() {
  return (
    <>
      <View style={styles.podiumSkeleton}>
        <View style={styles.skeletonPodiumSmall} />
        <View style={styles.skeletonPodiumLarge} />
        <View style={styles.skeletonPodiumSmall} />
      </View>
      <View style={styles.loadingRows}>
        {Array.from({ length: 5 }, (_, index) => (
          <View key={index} style={styles.loadingRow}>
            <View style={styles.skeletonRank} />
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonText}>
              <View style={styles.skeletonLine} />
              <View style={styles.skeletonLineShort} />
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function HowXpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const actions = [
    { icon: reviewIcon, label: 'Write a review', xp: '+50 XP' },
    { icon: photoIcon, label: 'Add dish photos', xp: '+15 XP' },
    { icon: locationIcon, label: 'Check in at a place', xp: '+20 XP' },
    { icon: reviewIcon, label: 'Get a like on your review', xp: '+5 XP' },
    { icon: inviteIcon, label: 'Invite a friend', xp: '+100 XP' },
  ];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>How to earn XP</Text>
          <Pressable accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={styles.sheetClose}>
            <Text style={styles.sheetCloseText}>×</Text>
          </Pressable>
          <View style={styles.xpActions}>
            {actions.map((action) => (
              <View key={action.label} style={styles.xpRow}>
                <Image source={action.icon} resizeMode="contain" style={styles.xpIcon} />
                <Text style={styles.xpLabel}>{action.label}</Text>
                <Text style={styles.xpValue}>{action.xp}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.gotIt, pressed && styles.pressed]}>
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#161616' },
  pattern: { opacity: 0.16 },
  header: {
    position: 'absolute',
    zIndex: 4,
    top: 0,
    left: 0,
    right: 0,
    height: 157,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#080808',
    alignItems: 'center',
    gap: 7,
  },
  titleRow: { width: '100%', height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43 },
  headerControl: { position: 'absolute', top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerLeft: { left: 6 },
  headerRight: { right: 6 },
  backIcon: { width: 9, height: 16 },
  infoIcon: { width: 22, height: 22 },
  audienceSwitch: {
    width: 370,
    height: 40,
    padding: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(223,223,233,0.12)',
    flexDirection: 'row',
  },
  audienceSelected: { flex: 1, borderRadius: 18, backgroundColor: '#D9DDE5', alignItems: 'center', justifyContent: 'center' },
  audienceSelectedText: { color: '#080808', fontSize: 13, fontWeight: '700' },
  audienceOption: { flex: 1, borderRadius: 18, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  audienceText: { color: 'rgba(196,202,215,0.5)', fontSize: 13 },
  soonBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, backgroundColor: '#B82F29' },
  soonText: { color: '#FFFFFF', fontSize: 11 },
  periodSwitch: {
    position: 'absolute',
    zIndex: 2,
    top: 157,
    alignSelf: 'center',
    padding: 3,
    borderRadius: 18,
    backgroundColor: '#292929',
    flexDirection: 'row',
    gap: 2,
  },
  periodOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 15 },
  periodSelected: { backgroundColor: '#FFFFFF' },
  periodText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500' },
  periodSelectedText: { color: '#1A1A1A' },
  periodNudge: {
    position: 'absolute',
    top: 197,
    left: 16,
    right: 16,
    color: 'rgba(255,255,255,0.60)',
    fontSize: 12,
    textAlign: 'center',
  },
  podium: { position: 'absolute', top: 239, left: 16, right: 16, height: 190, flexDirection: 'row', alignItems: 'flex-start' },
  podiumPerson: { flex: 1, paddingTop: 34, paddingHorizontal: 4, alignItems: 'center', gap: 4 },
  winner: { paddingTop: 0 },
  podiumAvatarWrap: { position: 'relative' },
  podiumAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#888888' },
  winnerAvatar: { width: 76, height: 76, borderRadius: 38, borderColor: '#B82F29' },
  rankBadge: { position: 'absolute', top: -10, right: -7, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  rank1: { backgroundColor: '#B82F29', borderRadius: 6 },
  rank2: { backgroundColor: '#666666', borderRadius: 6 },
  rank3: { backgroundColor: '#D46300', borderRadius: 6 },
  rankBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  podiumName: { width: '100%', color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  podiumHandle: { width: '100%', color: '#D9D9D9', fontSize: 12, textAlign: 'center' },
  podiumXp: { color: '#AAB2C5', fontSize: 16 },
  rankingList: { position: 'absolute', top: 429, left: 0, right: 0, bottom: 76, backgroundColor: 'rgba(22,22,22,0.78)' },
  rankingListContent: { paddingBottom: 8 },
  rankingRow: {
    height: 76,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#45474B',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  rowRank: { width: 35, color: '#FFFFFF', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowIdentity: { flex: 1, gap: 4 },
  rowName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  rowHandle: { color: '#D9D9D9', fontSize: 13 },
  rowXp: { color: '#AAB2C5', fontSize: 16, fontWeight: '500' },
  movementUp: { color: '#4DBF73', fontSize: 11 },
  movementDown: { color: '#B82F29', fontSize: 11 },
  currentUser: {
    position: 'absolute',
    zIndex: 3,
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#45474B',
    backgroundColor: '#B82F29',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  currentXp: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nextPlace: { color: '#4DBF73', fontSize: 11, fontWeight: '600' },
  emptyState: { position: 'absolute', top: 300, left: 31, right: 31, alignItems: 'center', gap: 14 },
  emptyIcon: { width: 60, height: 60 },
  emptyTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { maxWidth: 340, color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 18, textAlign: 'center' },
  addFriends: { marginTop: 0, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  addFriendsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  podiumSkeleton: { position: 'absolute', top: 200, left: 85, width: 232, height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletonPodiumSmall: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#292929' },
  skeletonPodiumLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#292929' },
  loadingRows: { position: 'absolute', top: 380, left: 16, right: 16, gap: 16 },
  loadingRow: { height: 56, flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonRank: { width: 20, height: 14, borderRadius: 4, backgroundColor: '#292929' },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#292929' },
  skeletonText: { flex: 1, gap: 6 },
  skeletonLine: { width: 120, height: 12, borderRadius: 6, backgroundColor: '#2E2E2E' },
  skeletonLineShort: { width: 70, height: 10, borderRadius: 5, backgroundColor: '#242424' },
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { height: 446, borderRadius: 22, backgroundColor: '#242426', paddingHorizontal: 24, paddingTop: 28 },
  sheetHandle: { position: 'absolute', top: 10, left: '50%', marginLeft: -17, width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  sheetTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  sheetClose: { position: 'absolute', top: 6, right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 11, color: '#FFFFFF', fontSize: 19, lineHeight: 19, textAlign: 'center' },
  xpActions: { marginTop: 25 },
  xpRow: { height: 60, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center' },
  xpIcon: { width: 20, height: 20 },
  xpLabel: { flex: 1, marginLeft: 18, color: '#FFFFFF', fontSize: 16 },
  xpValue: { color: '#B82F29', fontSize: 16, fontWeight: '600' },
  gotIt: { height: 50, marginTop: 9, borderRadius: 25, backgroundColor: '#B82F29', alignItems: 'center', justifyContent: 'center' },
  gotItText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
