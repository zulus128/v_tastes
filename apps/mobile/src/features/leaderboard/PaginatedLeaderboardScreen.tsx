import type { LeaderboardEntry } from '@tastes/contracts';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import backIcon from '../../../assets/leaderboard/back.png';
import emptyFriendsIcon from '../../../assets/leaderboard/empty-friends.png';
import infoIcon from '../../../assets/leaderboard/info.png';
import inviteIcon from '../../../assets/leaderboard/xp-invite.png';
import locationIcon from '../../../assets/leaderboard/xp-location.png';
import photoIcon from '../../../assets/leaderboard/xp-photo.png';
import reviewIcon from '../../../assets/leaderboard/xp-review.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import { useAuthenticatedUserId } from '../../session/SessionProvider';
import { PatternBackgroundLift } from '../../ui/components';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { UserAvatar } from '../profile/avatar';
import { useLeaderboard } from './api';

type Period = 'month' | 'allTime';

function handleFor(item: LeaderboardEntry) {
  return item.username ? `@${item.username}` : `@${item.displayName.toLowerCase().replace(/\s+/g, '')}`;
}

function RankingRow({
  item,
  styles,
}: {
  item: LeaderboardEntry;
  styles: ReturnType<typeof createStyles>;
}) {
  const movement = item.rank === 4 ? 'up' : item.rank === 5 ? 'down' : null;
  return (
    <View style={styles.rankingRow}>
      <Text style={styles.rowRank}>{item.rank}</Text>
      <UserAvatar displayName={item.displayName} photoUrl={item.photoUrl} style={styles.rowAvatar} />
      <View style={styles.rowIdentity}>
        <Text numberOfLines={1} style={styles.rowName}>{item.displayName}</Text>
        <Text numberOfLines={1} style={styles.rowHandle}>{handleFor(item)}</Text>
      </View>
      <Text style={styles.rowXp}>{item.xp} XP</Text>
      {movement ? (
        <Text style={movement === 'up' ? styles.movementUp : styles.movementDown}>
          {movement === 'up' ? '▲' : '▼'}
        </Text>
      ) : null}
    </View>
  );
}

function PodiumPerson({
  person,
  styles,
}: {
  person: LeaderboardEntry;
  styles: ReturnType<typeof createStyles>;
}) {
  const winner = person.rank === 1;
  const rankStyle = person.rank === 1 ? styles.rank1 : person.rank === 2 ? styles.rank2 : styles.rank3;
  return (
    <View style={[styles.podiumPerson, winner && styles.winner]}>
      <View style={styles.podiumAvatarWrap}>
        <UserAvatar
          displayName={person.displayName}
          photoUrl={person.photoUrl}
          style={[styles.podiumAvatar, winner && styles.winnerAvatar]}
        />
        <View style={[styles.rankBadge, rankStyle]}>
          <Text style={styles.rankBadgeText}>{person.rank}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.podiumName}>{person.displayName}</Text>
      <Text numberOfLines={1} style={styles.podiumHandle}>{handleFor(person)}</Text>
      <Text style={styles.podiumXp}>{person.xp} XP</Text>
    </View>
  );
}

function PeriodButton({
  active,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.periodOption, active && styles.periodSelected]}>
      <Text style={[styles.periodText, active && styles.periodSelectedText]}>{label}</Text>
    </Pressable>
  );
}

function LeaderboardHeader({
  audience,
  onBack,
  onInfo,
  onAudience,
  styles,
}: {
  audience: 'friends' | 'local';
  onBack: () => void;
  onInfo: () => void;
  onAudience: (audience: 'friends' | 'local') => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.headerControl, styles.headerLeft, pressed && styles.pressed]}
        >
          <Image source={backIcon} resizeMode="contain" style={styles.backIcon} />
        </Pressable>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Pressable
          accessibilityLabel="How to earn XP"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onInfo}
          style={({ pressed }) => [styles.headerControl, styles.headerRight, pressed && styles.pressed]}
        >
          <Image source={infoIcon} resizeMode="contain" style={styles.infoIcon} />
        </Pressable>
      </View>
      <View style={styles.audienceSwitch}>
        {(['friends', 'local'] as const).map((option) => (
          <Pressable key={option} onPress={() => onAudience(option)} style={audience === option ? styles.audienceSelected : styles.audienceOption}>
            <Text style={audience === option ? styles.audienceSelectedText : styles.audienceText}>{option === 'friends' ? 'Friends' : 'Local'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CurrentUserBar({
  current,
  preceding,
  styles,
}: {
  current: LeaderboardEntry;
  preceding?: LeaderboardEntry;
  styles: ReturnType<typeof createStyles>;
}) {
  const xpToNext = preceding ? Math.max(0, preceding.xp - current.xp) : 0;
  return (
    <View style={styles.currentUser}>
      <Text style={styles.currentRank}>{current.rank}</Text>
      <UserAvatar displayName={current.displayName} photoUrl={current.photoUrl} style={styles.rowAvatar} />
      <View style={styles.rowIdentity}>
        <Text numberOfLines={1} style={styles.currentName}>{current.displayName}</Text>
        <Text numberOfLines={1} style={styles.currentHandle}>{handleFor(current)}</Text>
      </View>
      <Text style={styles.currentXp}>{current.xp} XP</Text>
      {preceding ? <Text style={styles.nextPlace}>▲ {xpToNext} XP to #{preceding.rank}</Text> : null}
    </View>
  );
}

function HowXpSheet({
  onClose,
  styles,
  visible,
}: {
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
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
          <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.sheetClose}>
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

function LeaderboardLoadingState({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.loadingState}>
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
    </View>
  );
}

function LeaderboardEmptyState({ audience, onAddFriends, onEditProfile, styles }: { audience: 'friends' | 'local'; onAddFriends: () => void; onEditProfile: () => void; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.emptyState}>
      <Image source={emptyFriendsIcon} resizeMode="contain" style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>{audience === 'friends' ? 'No friends ranked yet' : 'No local rankings yet'}</Text>
      <Text style={styles.emptyCopy}>{audience === 'friends' ? "Add friends to see who's topping the Tastes charts this week." : 'Set your city in your profile to join the local leaderboard.'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={audience === 'friends' ? onAddFriends : onEditProfile}
        style={({ pressed }) => [styles.addFriends, pressed && styles.pressed]}
      >
        <Text style={styles.addFriendsText}>{audience === 'friends' ? 'Add friends' : 'Edit profile'}</Text>
      </Pressable>
    </View>
  );
}

export function PaginatedLeaderboardScreen({ onAddFriends, onBack, onEditProfile }: { onAddFriends: () => void; onBack: () => void; onEditProfile: () => void }) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top, insets.bottom), [colors, insets.bottom, insets.top]);
  const currentUserId = useAuthenticatedUserId();
  const [period, setPeriod] = useState<Period>('month');
  const [audience, setAudience] = useState<'friends' | 'local'>('friends');
  const [showXp, setShowXp] = useState(false);
  const query = useLeaderboard(period, audience);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const podiumByRank = items.slice(0, 3);
  const podium = podiumByRank.length === 3
    ? [podiumByRank[1], podiumByRank[0], podiumByRank[2]].filter((item): item is LeaderboardEntry => Boolean(item))
    : [];
  const current = items.find((item) => item.userId === currentUserId);
  const preceding = current ? items.find((item) => item.rank === current.rank - 1) : undefined;
  const ranking = items.slice(3).filter((item) => item.userId !== currentUserId);

  return (
    <ImageBackground
      imageStyle={[styles.pattern, !isDark && styles.patternLight]}
      source={pattern}
      resizeMode="cover"
      style={styles.screen}
    >
      <PatternBackgroundLift />
      <LeaderboardHeader audience={audience} onAudience={setAudience} onBack={onBack} onInfo={() => setShowXp(true)} styles={styles} />
      {!query.isPending && items.length > 0 ? (
        <View style={styles.periodArea}>
          <View style={styles.periodSwitch}>
            <PeriodButton active={period === 'month'} label="Month" onPress={() => setPeriod('month')} styles={styles} />
            <PeriodButton active={period === 'allTime'} label="All-time" onPress={() => setPeriod('allTime')} styles={styles} />
          </View>
          <Text style={styles.periodNudge}>
            🏅 {period === 'month' ? 'Month ends in 12 days · Top 3 earn a badge' : 'All-time ranking'}
          </Text>
        </View>
      ) : null}

      {query.isPending ? (
        <LeaderboardLoadingState styles={styles} />
      ) : query.isError && items.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Could not load the leaderboard</Text>
          <Text style={styles.stateCopy}>{query.error.message}</Text>
          <Pressable onPress={() => void query.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <LeaderboardEmptyState audience={audience} onAddFriends={onAddFriends} onEditProfile={onEditProfile} styles={styles} />
      ) : (
        <>
          <View style={styles.podium}>
            {podium.map((person) => (
              <PodiumPerson key={person.userId} person={person} styles={styles} />
            ))}
          </View>
          <FlatList
            contentContainerStyle={styles.rankingListContent}
            data={ranking}
            initialNumToRender={12}
            keyExtractor={(item) => item.userId}
            maxToRenderPerBatch={12}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            windowSize={7}
            refreshControl={(
              <RefreshControl
                refreshing={query.isRefetching && !query.isFetchingNextPage}
                onRefresh={() => void query.refetch()}
                tintColor={colors.primary}
              />
            )}
            renderItem={({ item }) => <RankingRow item={item} styles={styles} />}
            showsVerticalScrollIndicator={false}
            style={styles.rankingList}
          />
          {query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.pageLoader} /> : null}
          {current ? (
            <CurrentUserBar
              current={current}
              preceding={preceding}
              styles={styles}
            />
          ) : null}
        </>
      )}
      <HowXpSheet onClose={() => setShowXp(false)} styles={styles} visible={showXp} />
    </ImageBackground>
  );
}

const createStyles = (colors: ThemeColors, safeTop: number, safeBottom: number) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  pattern: { opacity: 0.16 },
  patternLight: { opacity: 0.07 },
  header: {
    zIndex: 3,
    paddingTop: safeTop,
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: colors.background,
    alignItems: 'center',
    gap: 7,
  },
  titleRow: { width: '100%', height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43 },
  headerControl: { position: 'absolute', top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerLeft: { left: 6 },
  headerRight: { right: 6 },
  backIcon: { width: 9, height: 16, tintColor: colors.text },
  infoIcon: { width: 22, height: 22, tintColor: colors.text },
  audienceSwitch: {
    alignSelf: 'stretch',
    height: 40,
    marginHorizontal: 12,
    padding: 4,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
  },
  audienceSelected: { flex: 1, borderRadius: 18, backgroundColor: '#D9DDE5', alignItems: 'center', justifyContent: 'center' },
  audienceSelectedText: { color: '#080808', fontSize: 13, fontWeight: '700' },
  audienceOption: { flex: 1, borderRadius: 18, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  audienceText: { color: colors.textMuted, fontSize: 13 },
  soonBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, backgroundColor: '#C8322D' },
  soonText: { color: '#FFFFFF', fontSize: 11 },
  periodArea: { zIndex: 2, alignItems: 'center' },
  periodSwitch: {
    marginTop: 12,
    padding: 3,
    borderRadius: 18,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    gap: 2,
  },
  periodOption: { minWidth: 96, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 15, alignItems: 'center' },
  periodSelected: { backgroundColor: '#FFFFFF' },
  periodText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  periodSelectedText: { color: '#1A1A1A' },
  periodNudge: { marginTop: 8, color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  podium: { height: 218, paddingHorizontal: 12, paddingTop: 27, flexDirection: 'row', alignItems: 'flex-start' },
  podiumPerson: { flex: 1, paddingTop: 31, paddingHorizontal: 3, alignItems: 'center', gap: 4 },
  winner: { paddingTop: 0 },
  podiumAvatarWrap: { position: 'relative' },
  podiumAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#888888' },
  winnerAvatar: { width: 76, height: 76, borderRadius: 38, borderColor: '#B82F29' },
  rankBadge: { position: 'absolute', top: -10, right: -7, width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rank1: { backgroundColor: '#B82F29' },
  rank2: { backgroundColor: '#666666' },
  rank3: { backgroundColor: '#D46300' },
  rankBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  podiumName: { width: '100%', color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  podiumHandle: { width: '100%', color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  podiumXp: { color: '#AAB2C5', fontSize: 16 },
  rankingList: { flex: 1, backgroundColor: colors.surface },
  rankingListContent: { paddingBottom: 8 },
  rankingRow: {
    height: 76,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  rowRank: { width: 28, color: colors.text, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowIdentity: { flex: 1, minWidth: 0, gap: 4 },
  rowName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowHandle: { color: colors.textMuted, fontSize: 13 },
  rowXp: { color: '#AAB2C5', fontSize: 16, fontWeight: '500' },
  movementUp: { color: '#4DBF73', fontSize: 11 },
  movementDown: { color: '#D33A32', fontSize: 11 },
  currentUser: {
    minHeight: 76 + safeBottom,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10 + safeBottom,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#C8322D',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  currentRank: { width: 28, color: '#FFFFFF', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  currentName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  currentHandle: { color: 'rgba(255,255,255,0.82)', fontSize: 13 },
  currentXp: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  nextPlace: { color: '#43D179', fontSize: 11, fontWeight: '600' },
  loadingState: { flex: 1 },
  podiumSkeleton: {
    position: 'absolute',
    top: 43,
    left: 85,
    width: 232,
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skeletonPodiumSmall: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.skeleton },
  skeletonPodiumLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.skeleton },
  loadingRows: { position: 'absolute', top: 223, left: 16, right: 16, gap: 16 },
  loadingRow: { height: 56, paddingVertical: 8, flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonRank: { width: 20, height: 14, borderRadius: 4, backgroundColor: colors.skeleton },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.skeleton },
  skeletonText: { flex: 1, gap: 6 },
  skeletonLine: { width: 120, height: 12, borderRadius: 6, backgroundColor: colors.skeleton },
  skeletonLineShort: { width: 70, height: 10, borderRadius: 5, backgroundColor: colors.skeletonMuted },
  emptyState: {
    position: 'absolute',
    top: safeTop + 246,
    left: 31,
    right: 31,
    alignItems: 'center',
    gap: 14,
  },
  emptyIcon: { width: 60, height: 60, tintColor: colors.text },
  emptyTitle: { width: '100%', color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyCopy: { width: '100%', color: colors.textMuted, fontSize: 15, lineHeight: 18, textAlign: 'center' },
  addFriends: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: '#B82F29' },
  addFriendsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  centerState: { flex: 1, minHeight: 280, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  stateCopy: { color: colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  retry: { marginTop: 4, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  pageLoader: { position: 'absolute', right: 16, bottom: 92 + safeBottom },
  scrim: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 16 + safeBottom, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { height: 446, borderRadius: 22, backgroundColor: '#242426', paddingHorizontal: 24, paddingTop: 28 },
  sheetHandle: { position: 'absolute', top: 10, left: '50%', marginLeft: -17, width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  sheetTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  sheetClose: { position: 'absolute', top: 6, right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30 },
  xpActions: { marginTop: 25 },
  xpRow: { height: 60, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center' },
  xpIcon: { width: 20, height: 20 },
  xpLabel: { flex: 1, marginLeft: 18, color: '#FFFFFF', fontSize: 16 },
  xpValue: { color: '#E2443D', fontSize: 16, fontWeight: '600' },
  gotIt: { height: 50, marginTop: 9, borderRadius: 25, backgroundColor: '#C8322D', alignItems: 'center', justifyContent: 'center' },
  gotItText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  pressed: { opacity: 0.75 },
});
