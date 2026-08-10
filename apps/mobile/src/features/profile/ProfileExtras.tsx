import type { ProfileExtrasResult, RewardProgress } from '@tastes/contracts';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import burgerBadge from '../../../assets/profile/burger-lover.png';
import cityBadge from '../../../assets/profile/city-explorer.png';
import matchaBadge from '../../../assets/profile/matcha-hunter.png';
import tiramisuBadge from '../../../assets/profile/tiramisu.png';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useTastesApi } from '../../session/SessionProvider';

export type ProfileExtra = 'followers' | 'rewards' | 'rewardDetails' | 'notifications' | 'achievement' | null;

export function ProfileExtras({ onClose, screen, visible }: { onClose: () => void; screen: ProfileExtra; visible: boolean }) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [push, setPush] = useState(true);
  const [comments, setComments] = useState(true);
  const [followers, setFollowers] = useState(true);
  const [activities, setActivities] = useState(true);
  const [detail, setDetail] = useState<'rewardDetails' | 'achievement' | null>(null);
  const [data, setData] = useState<ProfileExtrasResult | null>(null);
  const [detailReward, setDetailReward] = useState<RewardProgress | null>(null);
  const activeScreen = detail ?? screen;
  const handleBack = () => detail ? setDetail(null) : onClose();
  useEffect(() => { if (!visible) return; let active = true; void api.getProfileExtras().then((result) => { if (!active) return; setData(result.data); const p = result.data.notificationPreferences; setPush(p.push); setComments(p.comments); setFollowers(p.followers); setActivities(p.activities); }).catch(() => Alert.alert('Could not load profile details', 'Please try again.')); return () => { active = false; }; }, [api, visible]);
  const savePreferences = (next: { push: boolean; comments: boolean; followers: boolean; activities: boolean }) => { setPush(next.push); setComments(next.comments); setFollowers(next.followers); setActivities(next.activities); void api.updateNotificationPreferences(next); };

  const title = activeScreen === 'followers' ? 'Followers'
    : activeScreen === 'notifications' ? 'Notifications'
      : activeScreen === 'rewardDetails' ? 'Reward details'
        : activeScreen === 'achievement' ? 'Achievement'
          : 'Rewards';

  return (
    <Modal animationType="slide" onRequestClose={handleBack} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}><Pressable onPress={handleBack} style={styles.headerButton}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>{title}</Text><View style={styles.headerButton} /></View>
        {activeScreen === 'followers' ? (
          <ScrollView contentContainerStyle={styles.peopleList}>
            <Text style={styles.section}>FOLLOWERS ({data?.followers.length ?? 0})</Text>
            {!data ? <ActivityIndicator color={colors.primary} /> : data.followers.map((person) => <View key={person.userId} style={styles.person}><View style={styles.avatar}><Text style={styles.avatarText}>{person.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View><View style={styles.personCopy}><Text style={styles.personName}>{person.displayName}</Text><Text style={styles.handle}>{person.username ? `@${person.username}` : ''}</Text></View><Pressable onPress={() => void (person.following ? api.unfollowUser({ targetUserId: person.userId }) : api.followUser({ targetUserId: person.userId })).then(() => setData((current) => current ? { ...current, followers: current.followers.map((candidate) => candidate.userId === person.userId ? { ...candidate, following: !candidate.following } : candidate) } : current))} style={[styles.follow, person.following && styles.following]}><Text style={styles.followText}>{person.following ? 'Following' : 'Follow'}</Text></Pressable></View>)}
          </ScrollView>
        ) : activeScreen === 'notifications' ? (
          <ScrollView contentContainerStyle={styles.settings}>
            <Text style={styles.section}>PUSH NOTIFICATIONS</Text>
            <Setting label="Allow push notifications" onChange={(value) => savePreferences({ push: value, comments, followers, activities })} styles={styles} value={push} />
            <Text style={styles.section}>ACTIVITY</Text>
            <Setting label="Comments and reactions" onChange={(value) => savePreferences({ push, comments: value, followers, activities })} styles={styles} value={comments} />
            <Setting label="New followers" onChange={(value) => savePreferences({ push, comments, followers: value, activities })} styles={styles} value={followers} />
            <Setting label="Invitations and reminders" onChange={(value) => savePreferences({ push, comments, followers, activities: value })} styles={styles} value={activities} />
          </ScrollView>
        ) : activeScreen === 'rewardDetails' || activeScreen === 'achievement' ? (
          <View style={styles.rewardDetail}><Image source={activeScreen === 'achievement' ? cityBadge : burgerBadge} style={styles.heroBadge} /><Text style={styles.rewardTitle}>{detailReward?.name ?? (activeScreen === 'achievement' ? 'City Explorer' : 'Burger Lover')}</Text><Text style={styles.rewardBody}>{detailReward?.description ?? 'Keep exploring places to complete this achievement.'}</Text><View style={styles.bigProgress}><View style={[styles.bigProgressFill, { width: `${(detailReward?.progress ?? 1) * 100}%` }]} /></View><Text style={styles.progressLabel}>{detailReward?.completed ? `Completed · ${detailReward.xp} XP earned` : `${Math.round((detailReward?.progress ?? 0) * 100)}% complete`}</Text></View>
        ) : (
          <ScrollView contentContainerStyle={styles.rewards}>
            <View style={styles.levelCard}><Text style={styles.levelEyebrow}>YOUR LEVEL</Text><Text style={styles.levelTitle}>Taste Explorer · Level {data?.level ?? '–'}</Text><Text style={styles.levelCopy}>{data?.xp ?? 0} XP</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${((data?.xp ?? 0) % 250) / 2.5}%` }]} /></View></View>
            <Text style={styles.section}>BADGES</Text>
            {(data?.rewards ?? []).map((reward, index) => <Pressable key={reward.id} onPress={() => { setDetailReward(reward); setDetail(reward.completed ? 'achievement' : 'rewardDetails'); }} style={styles.rewardRow}><Image source={[burgerBadge, tiramisuBadge, matchaBadge, cityBadge][index % 4]} style={styles.rewardImage} /><View style={styles.rewardCopy}><Text style={styles.rewardName}>{reward.name}</Text><Text style={styles.rewardDescription}>{reward.description}</Text><View style={styles.progress}><View style={[styles.progressFill, { width: `${reward.progress * 100}%` }]} /></View></View><Text style={styles.rewardPercent}>{Math.round(reward.progress * 100)}%</Text></Pressable>)}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Setting({ label, onChange, styles, value }: { label: string; onChange: (value: boolean) => void; styles: ReturnType<typeof createStyles>; value: boolean }) {
  return <View style={styles.setting}><Text style={styles.settingLabel}>{label}</Text><Switch onValueChange={onChange} thumbColor="#FFFFFF" trackColor={{ false: '#353535', true: '#B82F29' }} value={value} /></View>;
}

function createStyles(colors: ThemeColors, safeTop: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { height: safeTop + 60, paddingTop: safeTop, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background },
    headerButton: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: '300' },
    title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    section: { marginTop: 18, marginBottom: 8, color: colors.textMuted, fontSize: 12 },
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
    setting: { height: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
    settingLabel: { flex: 1, color: colors.text, fontSize: 15 },
    rewards: { padding: 16, paddingBottom: 40 },
    levelCard: { padding: 20, borderRadius: 20, backgroundColor: colors.surface },
    levelEyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800' },
    levelTitle: { marginTop: 8, color: colors.text, fontSize: 21, fontWeight: '800' },
    levelCopy: { marginTop: 6, color: colors.textSecondary, fontSize: 13 },
    progress: { height: 5, marginTop: 10, overflow: 'hidden', borderRadius: 3, backgroundColor: colors.surfaceRaised },
    progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
    rewardRow: { minHeight: 106, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rewardImage: { width: 66, height: 82, resizeMode: 'contain' },
    rewardCopy: { flex: 1, marginLeft: 8 },
    rewardName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    rewardDescription: { marginTop: 4, color: colors.textSecondary, fontSize: 12 },
    rewardPercent: { marginLeft: 9, color: colors.textMuted, fontSize: 11 },
    rewardDetail: { flex: 1, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center' },
    heroBadge: { width: 180, height: 210, resizeMode: 'contain' },
    rewardTitle: { marginTop: 10, color: colors.text, fontSize: 26, fontWeight: '800' },
    rewardBody: { marginTop: 12, color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    bigProgress: { width: '100%', height: 8, marginTop: 30, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.surfaceRaised },
    bigProgressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
    progressLabel: { marginTop: 10, color: colors.textMuted, fontSize: 13 },
  });
}
