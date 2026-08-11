import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import burgerBadge from '../../../assets/profile/burger-lover.png';
import cityBadge from '../../../assets/profile/city-explorer.png';
import followIcon from '../../../assets/profile/follow.png';
import levelBadge from '../../../assets/profile/level.png';
import matchaBadge from '../../../assets/profile/matcha-hunter.png';
import messageIcon from '../../../assets/profile/message.png';
import tiramisuBadge from '../../../assets/profile/tiramisu.png';
import BackIcon from '../../../assets/leaderboard/back.svg';
import SettingsIcon from '../../../assets/profile/settings.svg';
import ShareIcon from '../../../assets/profile/share.svg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { ProfileData } from './api';
import { profileAvatarSource } from './avatar';

const badgeAssets = [levelBadge, burgerBadge, tiramisuBadge, matchaBadge, cityBadge];
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
  followPending,
  following,
  onAvatarPress,
  onBack,
  onMessage,
  onFollowers,
  onFollowing,
  onRewards,
  onShare,
  onSettings,
  onToggleFollow,
  own,
  profile,
  reviewCount,
  uploadingPhoto,
}: {
  followPending: boolean;
  following: boolean;
  onAvatarPress: () => void;
  onBack: () => void;
  onMessage: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onRewards: () => void;
  onShare: () => void;
  onSettings: () => void;
  onToggleFollow: () => void;
  own: boolean;
  profile: ProfileData;
  reviewCount: number;
  uploadingPhoto: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chips = [
    profile.city ? `${profile.city} 📍` : null,
    profile.favoriteCuisines[0] ? `${profile.favoriteCuisines[0]} ❤️` : null,
    profile.favoriteCuisines[1] ? `${profile.favoriteCuisines[1]} 🍽️` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <View style={styles.hero}>
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
          {chips.map((chip) => <Text key={chip} style={styles.chip}>{chip}</Text>)}
        </ScrollView>
      ) : null}
      <Pressable accessibilityLabel="Open rewards" onPress={onRewards} style={styles.badges}>
        {badgeAssets.map((asset, index) => (
          <View key={badgeLabels[index]} style={styles.badge}>
            <Image resizeMode="contain" source={asset} style={styles.badgeImage} />
          </View>
        ))}
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  hero: { paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
  topBar: { height: 102, paddingTop: 48, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background },
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
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 39, overflow: 'hidden', backgroundColor: '#161616', color: colors.text, fontSize: 14 },
  badges: { height: 86, marginTop: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { width: 68, height: 84, alignItems: 'center', justifyContent: 'center' },
  badgeImage: { width: 68, height: 84 },
});

const staticStyles = StyleSheet.create({
  stat: { width: 90, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '600' },
  statLabel: { marginTop: 2, fontSize: 13 },
});
