import type { ProfileExtrasResult } from '@tastes/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SearchIcon from '../../../assets/profile/followers-search.svg';
import TrashIcon from '../../../assets/profile/followers-trash.svg';
import VoiceIcon from '../../../assets/profile/followers-voice.svg';
import BackIcon from '../../../assets/leaderboard/back.svg';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { SideSlideScreen, type SideSlideScreenHandle } from '../../ui/SideSlideScreen';

export type ProfileExtra = 'followers' | 'following' | 'notifications' | null;

export function ProfileExtras({
  onClose,
  onOpenProfile,
  own = false,
  screen,
  targetUserId,
  visible,
}: {
  onClose: () => void;
  onOpenProfile: (userId: string, following: boolean) => void;
  own?: boolean;
  screen: ProfileExtra;
  targetUserId?: string;
  visible: boolean;
}) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [enabled, setEnabled] = useState(true);
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [data, setData] = useState<ProfileExtrasResult | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [removingFollowerId, setRemovingFollowerId] = useState<string | null>(null);
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
      setPeopleSearch('');
      setRemovingFollowerId(null);
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
      : 'Notifications';
  const connections = data?.[screen === 'following' ? 'following' : 'followers'] ?? [];
  const normalizedSearch = peopleSearch.trim().toLocaleLowerCase();
  const visibleConnections = normalizedSearch
    ? connections.filter((person) => `${person.displayName} ${person.username ?? ''}`.toLocaleLowerCase().includes(normalizedSearch))
    : connections;

  const confirmRemoveFollower = (userId: string, displayName: string) => {
    Alert.alert('Remove follower?', `${displayName} will no longer follow you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setRemovingFollowerId(userId);
          void api.removeFollower({ followerUserId: userId })
            .then(() => setData((current) => current ? {
              ...current,
              followers: current.followers.filter((person) => person.userId !== userId),
            } : current))
            .catch(() => Alert.alert('Could not remove follower', 'Please try again.'))
            .finally(() => setRemovingFollowerId(null));
        },
      },
    ]);
  };

  return (
    <SideSlideScreen onRequestClose={onClose} ref={slide} visible={visible}>
      <View style={styles.screen}>
        <View style={[styles.header, { height: responsiveSize(screen === 'followers' || screen === 'following' ? 106 : 60) + insets.top, paddingTop: insets.top }, (screen === 'followers' || screen === 'following') && styles.peopleHeader]}>
          <View style={[styles.headerTitleRow, { paddingLeft: responsiveSize(6) + insets.left, paddingRight: responsiveSize(6) + insets.right }]}>
            <Pressable accessibilityLabel="Back" onPress={() => slide.current?.close()} style={styles.headerButton}>
              <BackIcon color={colors.text} height={responsiveSize(16)} width={responsiveSize(9)} />
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.headerButton} />
          </View>
          {screen === 'followers' || screen === 'following' ? (
            <View style={styles.searchField}>
              <SearchIcon color={colors.text} height={responsiveSize(24)} width={responsiveSize(24)} />
              <TextInput
                accessibilityLabel={`Search ${title.toLocaleLowerCase()}`}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPeopleSearch}
                placeholder="Search"
                placeholderTextColor={colors.placeholder}
                style={styles.searchInput}
                value={peopleSearch}
              />
              <Pressable accessibilityLabel="Voice search" hitSlop={8} style={styles.voiceButton}>
                <VoiceIcon color={colors.text} height={responsiveSize(24)} width={responsiveSize(24)} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {screen === 'followers' || screen === 'following' ? (
          <ScrollView contentContainerStyle={[styles.peopleList, { paddingBottom: Math.max(responsiveSize(30), insets.bottom) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!data ? <ActivityIndicator color={colors.primary} style={styles.peopleLoading} /> : visibleConnections.map((person) => (
              <View key={person.userId} style={styles.person}>
                <Pressable
                  accessibilityLabel={`Open ${person.displayName}'s profile`}
                  accessibilityRole="button"
                  onPress={() => onOpenProfile(person.userId, person.following)}
                  style={({ pressed }) => [styles.personLink, pressed && styles.pressed]}
                >
                  {person.photoUrl ? <Image source={{ uri: person.photoUrl }} style={styles.avatarImage} /> : (
                    <View style={styles.avatar}><Text style={styles.avatarText}>{person.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text></View>
                  )}
                  <View style={styles.personCopy}><Text numberOfLines={1} style={styles.personName}>{person.displayName}</Text><Text numberOfLines={1} style={styles.handle}>{person.username ? `@${person.username}` : ''}</Text></View>
                </Pressable>
                {screen === 'followers' && own ? (
                  <Pressable
                    accessibilityLabel={`Remove ${person.displayName}`}
                    disabled={removingFollowerId === person.userId}
                    onPress={() => confirmRemoveFollower(person.userId, person.displayName)}
                    style={styles.removeFollower}
                  >
                    {removingFollowerId === person.userId ? <ActivityIndicator color={colors.text} size="small" /> : <TrashIcon color={colors.text} height={responsiveSize(25)} width={responsiveSize(24)} />}
                  </Pressable>
                ) : null}
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
        ) : null}
      </View>
    </SideSlideScreen>
  );
}

function Setting({ disabled = false, label, onChange, styles, value }: { disabled?: boolean; label: string; onChange: (value: boolean) => void; styles: ReturnType<typeof createStyles>; value: boolean }) {
  return <View style={[styles.setting, disabled && styles.disabledSetting]}><Text style={styles.settingLabel}>{label}</Text><Switch disabled={disabled} onValueChange={onChange} thumbColor="#FFFFFF" trackColor={{ false: '#353535', true: '#B82F29' }} value={value} /></View>;
}

function createStyles(colors: ThemeColors) {
  return responsiveStyleSheet({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { height: 60, paddingTop: 0, backgroundColor: colors.background, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' },
    peopleHeader: { height: 106 },
    headerTitleRow: { height: 60, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center' },
    headerButton: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    searchField: { height: 39, marginHorizontal: 16, marginBottom: 12, paddingLeft: 10, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 44, backgroundColor: colors.surfaceRaised },
    searchInput: { flex: 1, height: 39, padding: 0, color: colors.text, fontSize: 16, lineHeight: 22, letterSpacing: -0.41 },
    voiceButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    peopleList: { paddingBottom: 30 },
    peopleLoading: { marginTop: 32 },
    person: { height: 76, paddingHorizontal: 16, flexDirection: 'row', gap: 7, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
    personLink: { flex: 1, height: '100%', flexDirection: 'row', gap: 7, alignItems: 'center' },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    avatarImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceRaised },
    avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    personCopy: { flex: 1, height: 38, justifyContent: 'center', gap: 4 },
    personName: { color: colors.text, fontSize: 15, lineHeight: 18, fontWeight: '600', letterSpacing: -0.41 },
    handle: { color: colors.textSecondary, fontSize: 13, lineHeight: 16, letterSpacing: -0.24 },
    removeFollower: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    settings: { paddingHorizontal: 16, paddingBottom: 30 },
    notificationGap: { height: 14 },
    setting: { height: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
    disabledSetting: { opacity: 0.45 },
    settingLabel: { flex: 1, color: colors.text, fontSize: 15 },
    pressed: { opacity: 0.7 },
  });
}
