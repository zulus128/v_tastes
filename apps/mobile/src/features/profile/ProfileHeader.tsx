import { useMemo } from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import lightPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import darkPattern from '../../../assets/onboarding/pattern-screen.png';
import BurgerBadge from '../../../assets/profile/reward-burger.svg';
import CityBadge from '../../../assets/profile/reward-city.svg';
import followIcon from '../../../assets/profile/follow.png';
import LevelBadge from '../../../assets/profile/reward-level.svg';
import MatchaBadge from '../../../assets/profile/reward-matcha.svg';
import messageIcon from '../../../assets/profile/message.png';
import TiramisuBadge from '../../../assets/profile/reward-tiramisu.svg';
import BackIcon from '../../../assets/leaderboard/back.svg';
import SettingsIcon from '../../../assets/profile/settings.svg';
import ShareIcon from '../../../assets/profile/share.svg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { PatternBackgroundLift } from '../../ui/components';
import { cityFlag } from '../onboarding/CityPicker';
import type { ProfileData } from './api';
import { profileAvatarSource } from './avatar';

const badgeAssets = [LevelBadge, BurgerBadge, TiramisuBadge, MatchaBadge, CityBadge];
const badgeLabels = ['Level', 'Burger Lover', 'Tiramisu Connaisseur', 'Matcha Hunter', 'City Explorer'];

function Stat({ label, onPress, value }: { label: string; onPress?: () => void; value: number }) {
  const { colors } = useAppTheme();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={staticStyles.stat}>
      <Text style={[staticStyles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[staticStyles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

export function ProfileHeader({
  favoritePlaceName,
  followPending,
  following,
  onAvatarPress,
  onMessage,
  onFollowers,
  onFollowing,
  onRewards,
  onToggleFollow,
  own,
  profile,
  reviewCount,
  uploadingPhoto,
}: {
  favoritePlaceName: string | null;
  followPending: boolean;
  following: boolean;
  onAvatarPress: () => void;
  onMessage: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onRewards: () => void;
  onToggleFollow: () => void;
  own: boolean;
  profile: ProfileData;
  reviewCount: number;
  uploadingPhoto: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const favoriteDishIcon = profile.favoriteDish?.toLocaleLowerCase().includes('sushi') ? '🍣' : '🍽️';
  const chips: Array<{ flag?: ReturnType<typeof cityFlag>; icon?: string; label: string }> = [];
  if (profile.city) chips.push({ flag: cityFlag(profile.city), label: profile.city });
  if (favoritePlaceName) chips.push({ icon: '❤️', label: favoritePlaceName });
  if (profile.favoriteDish) chips.push({ icon: favoriteDishIcon, label: profile.favoriteDish });

  return (
    <ImageBackground
      imageStyle={[styles.heroPattern, { opacity: isDark ? 1 : 0.06 }]}
      resizeMode="cover"
      source={isDark ? darkPattern : lightPattern}
      style={[styles.hero, { backgroundColor: colors.canvas }]}
    >
      <PatternBackgroundLift />
      <Pressable disabled={!own || uploadingPhoto} onPress={onAvatarPress} style={styles.avatarWrap}>
        <Image source={profileAvatarSource(profile)} style={styles.avatar} />
        {uploadingPhoto ? (
          <View style={styles.avatarBusy}><ActivityIndicator color="#FFFFFF" /></View>
        ) : null}
      </Pressable>
      <Text style={styles.name}>{profile.displayName}</Text>
      {profile.bio ? <Text numberOfLines={2} style={styles.bio}>{profile.bio}</Text> : null}
      <View style={styles.stats}>
        <Stat label="Reviews" value={profile.reviewCount || reviewCount} />
        <View style={styles.statDivider} />
        <Stat label="Followers" onPress={onFollowers} value={profile.followerCount} />
        <View style={styles.statDivider} />
        <Stat label="Following" onPress={onFollowing} value={profile.followingCount} />
      </View>
      {!own ? (
        <View style={styles.publicActions}>
          <Pressable
            disabled={followPending}
            onPress={onToggleFollow}
            style={[styles.followAction, following && styles.followingAction]}
          >
            {followPending ? <ActivityIndicator color="#FFFFFF" /> : (
              <View style={styles.actionLabel}>
                <Image source={followIcon} style={styles.followIcon} />
                <Text style={styles.followActionText}>{following ? 'Following' : 'Follow'}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={onMessage} style={styles.messageAction}>
            <View style={styles.actionLabel}>
              <Image source={messageIcon} style={styles.messageIcon} />
              <Text style={styles.messageActionText}>Message</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
      {chips.length > 0 ? (
        <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
          {chips.map((chip) => <View key={chip.label} style={styles.chip}><Text style={styles.chipText}>{chip.label}</Text>{chip.flag ? <Image source={chip.flag} style={styles.cityFlag} /> : null}{chip.icon ? <Text style={styles.chipIcon}>{chip.icon}</Text> : null}</View>)}
        </ScrollView>
      ) : null}
      <Pressable accessibilityLabel="Open rewards" onPress={onRewards} style={styles.badges}>
        {badgeAssets.map((BadgeArt, index) => (
          <View key={badgeLabels[index]} style={styles.badge}>
            <BadgeArt width={59} height={59} />
            <Text numberOfLines={2} style={styles.badgeLabel}>{badgeLabels[index]}</Text>
          </View>
        ))}
      </Pressable>
    </ImageBackground>
  );
}

export function ProfileTopBar({
  onBack,
  onSettings,
  onShare,
  own,
  profile,
}: {
  onBack: () => void;
  onSettings: () => void;
  onShare: () => void;
  own: boolean;
  profile: ProfileData;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityLabel={own ? 'Open settings' : 'Back'} onPress={own ? onSettings : onBack} style={styles.topAction}>
        {own ? <SettingsIcon width={20} height={20} /> : <BackIcon width={9} height={16} />}
      </Pressable>
      <Text numberOfLines={1} style={styles.username}>
        {profile.username ? `@${profile.username}` : profile.displayName}
      </Text>
      <Pressable accessibilityLabel="Share profile" onPress={onShare} style={styles.topAction}>
        <ShareIcon width={24} height={24} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  hero: { width: '100%', alignSelf: 'stretch', paddingBottom: 26, borderBottomWidth: 1, borderBottomColor: colors.border, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  heroPattern: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  topBar: {
    position: 'absolute',
    zIndex: 20,
    top: 0,
    right: 0,
    left: 0,
    height: 102,
    paddingTop: 48,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: colors.background,
  },
  topAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  username: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  avatarWrap: { width: 120, height: 120, marginTop: 18, alignSelf: 'center', borderRadius: 60 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceRaised },
  avatarBusy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  name: { marginTop: 10, color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  bio: { marginTop: 6, marginHorizontal: 38, color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  stats: { height: 50, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  publicActions: { marginTop: 13, paddingHorizontal: 16, flexDirection: 'row', gap: 10 },
  followAction: { flex: 1, height: 45, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9312B' },
  followingAction: { backgroundColor: '#8E2824' },
  actionLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followIcon: { width: 24, height: 24 },
  messageIcon: { width: 20, height: 20 },
  followActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.7 },
  messageAction: { flex: 1, height: 45, borderWidth: 1, borderColor: '#C9312B', borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161616' },
  messageActionText: { color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: 0.6 },
  chips: { minWidth: '100%', paddingHorizontal: 10, paddingTop: 14, gap: 6, justifyContent: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 39, overflow: 'hidden', backgroundColor: colors.surface },
  chipText: { color: colors.text, fontSize: 14 },
  chipIcon: { fontSize: 14, lineHeight: 18 },
  cityFlag: { width: 16, height: 16, transform: [{ translateY: -1 }] },
  badges: { height: 82, marginTop: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  badge: { width: 68, alignItems: 'center' },
  badgeLabel: { width: 72, marginTop: 4, color: colors.text, fontSize: 10, lineHeight: 10, fontWeight: '400', letterSpacing: -0.12, textAlign: 'center' },
});

const staticStyles = StyleSheet.create({
  stat: { width: 90, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '600' },
  statLabel: { marginTop: 2, fontSize: 13 },
});
