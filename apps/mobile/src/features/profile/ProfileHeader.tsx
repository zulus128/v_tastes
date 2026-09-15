import { useMemo } from 'react';
import { ActivityIndicator, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import lightPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import darkPattern from '../../../assets/onboarding/pattern-screen.png';
import followIcon from '../../../assets/profile/follow.png';
import messageIcon from '../../../assets/profile/message.png';
import BackIcon from '../../../assets/leaderboard/back.svg';
import SettingsIcon from '../../../assets/profile/settings.svg';
import ShareIcon from '../../../assets/profile/share.svg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { PatternBackgroundLift } from '../../ui/components';
import { cityFlag } from '../onboarding/CityPicker';
import type { ProfileData } from './api';
import { ProfileAvatar } from './avatar';
import type { TasteHighlight } from './profileHighlights';

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
  blocked,
  followPending,
  following,
  onAvatarPress,
  onMessage,
  onFollowers,
  onFollowing,
  onToggleFollow,
  own,
  profile,
  reviewCount,
  tasteHighlights,
  uploadingPhoto,
}: {
  blocked: boolean;
  followPending: boolean;
  following: boolean;
  onAvatarPress: () => void;
  onMessage: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onToggleFollow: () => void;
  own: boolean;
  profile: ProfileData;
  reviewCount: number;
  tasteHighlights: readonly TasteHighlight[];
  uploadingPhoto: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ImageBackground
      imageStyle={[styles.heroPattern, { opacity: isDark ? 1 : 0.06 }]}
      resizeMode="cover"
      source={isDark ? darkPattern : lightPattern}
      style={[styles.hero, { backgroundColor: colors.canvas }]}
    >
      <PatternBackgroundLift />
      <Pressable disabled={!own || uploadingPhoto} onPress={onAvatarPress} style={styles.avatarWrap}>
        <ProfileAvatar profile={profile} style={styles.avatar} />
        {uploadingPhoto ? (
          <View style={styles.avatarBusy}><ActivityIndicator color="#FFFFFF" /></View>
        ) : null}
      </Pressable>
      <Text style={styles.name}>{profile.displayName}</Text>
      {profile.city ? (
        <View style={styles.cityPill}>
          <Text style={styles.cityText}>{profile.city}</Text>
          <Image source={cityFlag(profile.city)} style={styles.cityFlag} />
        </View>
      ) : null}
      {!blocked ? <>
      <View style={styles.stats}>
        <Stat label="Reviews" value={profile.reviewCount || reviewCount} />
        <View style={styles.statDivider} />
        <Stat label="Followers" onPress={onFollowers} value={profile.followerCount} />
        <View style={styles.statDivider} />
        <Stat label="Following" onPress={onFollowing} value={profile.followingCount} />
      </View>
      {profile.bio ? <Text numberOfLines={3} style={styles.bio}>{profile.bio}</Text> : null}
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
          <Pressable
            onPress={onMessage}
            style={[styles.messageAction, { backgroundColor: isDark ? '#161616' : colors.canvas }]}
          >
            <View style={styles.actionLabel}>
              <Image source={messageIcon} style={styles.messageIcon} />
              <Text style={[styles.messageActionText, { color: isDark ? '#FFFFFF' : colors.text }]}>Message</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.highlights}>
        <Text style={styles.highlightsTitle}>Taste highlights</Text>
        <View style={styles.highlightTiles}>
          {tasteHighlights.map((highlight) => (
            <View key={highlight.id} style={styles.highlight}>
              <View style={styles.highlightIcon}><Text style={styles.highlightEmoji}>{highlight.emoji}</Text></View>
              <Text numberOfLines={1} style={styles.highlightLabel}>{highlight.label}</Text>
              <Text ellipsizeMode="tail" numberOfLines={2} style={styles.highlightValue}>{highlight.value}</Text>
              <Text numberOfLines={1} style={styles.highlightMeta}>{highlight.meta}</Text>
            </View>
          ))}
        </View>
      </View>
      </> : null}
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
        {own ? <SettingsIcon color={colors.text} width={responsiveSize(16.9641)} height={responsiveSize(17.9167)} /> : <BackIcon color={colors.text} width={responsiveSize(9)} height={responsiveSize(16)} />}
      </Pressable>
      <Text numberOfLines={1} style={styles.username}>
        {profile.username ? `@${profile.username}` : profile.displayName}
      </Text>
      <Pressable accessibilityLabel="Share profile" onPress={onShare} style={styles.topAction}>
          <ShareIcon color={colors.text} width={responsiveSize(18.1673)} height={responsiveSize(18.1667)} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => responsiveStyleSheet({
  hero: { width: '100%', zIndex: 1, alignSelf: 'stretch', paddingBottom: 26, borderBottomWidth: 1, borderBottomColor: colors.border, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
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
  name: { marginTop: 10, color: colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.24, textAlign: 'center' },
  cityPill: { minHeight: 30, marginTop: 8, paddingHorizontal: 12, flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  cityText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  cityFlag: { width: 16, height: 16 },
  bio: { marginTop: 8, marginHorizontal: 38, color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  stats: { height: 50, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  publicActions: { marginTop: 13, paddingHorizontal: 16, flexDirection: 'row', gap: 10 },
  followAction: { flex: 1, height: 45, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9312B' },
  followingAction: { backgroundColor: '#8E2824' },
  actionLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followIcon: { width: 24, height: 24 },
  messageIcon: { width: 20, height: 20 },
  followActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.7 },
  messageAction: { flex: 1, height: 45, borderWidth: 1, borderColor: '#C9312B', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  messageActionText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.6 },
  highlights: { minHeight: 166, marginTop: 14, marginHorizontal: 16, paddingTop: 16, paddingBottom: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  highlightsTitle: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '600', textAlign: 'center' },
  highlightTiles: { marginTop: 14, paddingHorizontal: 10, flexDirection: 'row', gap: 6 },
  highlight: { flex: 1, minWidth: 0, alignItems: 'center' },
  highlightIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceRaised },
  highlightEmoji: { fontSize: 18, lineHeight: 22 },
  highlightLabel: { marginTop: 6, color: colors.textSecondary, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  highlightValue: { minHeight: 28, marginTop: 2, color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  highlightMeta: { marginTop: 2, color: colors.textMuted, fontSize: 8, lineHeight: 10, textAlign: 'center' },
});

const staticStyles = responsiveStyleSheet({
  stat: { width: 90, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '600' },
  statLabel: { marginTop: 2, fontSize: 13 },
});
