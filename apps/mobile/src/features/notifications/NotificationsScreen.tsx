import type { AppNotification, AppRequest } from '@tastes/contracts';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useTastesApi } from '../../session/SessionProvider';

const glyphs: Record<AppNotification['kind'], string> = {
  comment: '◌',
  follow: '+',
  invite: '◷',
  reward: '★',
  system: 'T',
};

function ago(iso: string) { const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000)); return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`; }

export function NotificationsScreen({ onBack, onOpenTarget }: { onBack: () => void; onOpenTarget: (item: AppNotification) => void }) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [requests, setRequests] = useState<AppRequest[]>([]);
  const [tab, setTab] = useState<'activity' | 'badges'>('activity');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const visible = items.filter((item) => (tab === 'badges' ? item.kind === 'reward' : item.kind !== 'reward') && (!normalized || `${item.title} ${item.body}`.toLowerCase().includes(normalized)));
  const visibleRequests = tab === 'activity' ? requests.filter((item) => !normalized || `${item.title} ${item.body} ${item.senderName}`.toLowerCase().includes(normalized)) : [];
  useEffect(() => { let active = true; void Promise.all([api.listNotifications(), api.listRequests()]).then(([notifications, pendingRequests]) => { if (active) { setItems(notifications.data); setRequests(pendingRequests.data); } }).catch(() => Alert.alert('Could not load notifications', 'Please try again.')).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [api]);

  async function open(item: AppNotification) { if (item.unread) { setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: false } : candidate)); try { await api.markNotificationRead({ notificationId: item.id }); } catch { setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: true } : candidate)); Alert.alert('Could not mark notification as read', 'Please try again.'); } } onOpenTarget(item); }
  async function clear() { await api.clearNotifications(); setItems([]); }
  async function respond(item: AppRequest, response: 'accepted' | 'declined') { await api.respondToRequest({ requestId: item.id, response }); setRequests((current) => current.filter((candidate) => candidate.id !== item.id)); }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.headerButton}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.title}>Notifications</Text>
          <Pressable accessibilityLabel="Clear all notifications" disabled={items.length === 0} onPress={() => void clear()} style={styles.headerButton}>
            <Text style={[styles.clear, items.length === 0 && styles.disabled]}>Clear all</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Text style={styles.searchGlyph}>⌕</Text>
          <TextInput onChangeText={setQuery} placeholder="Search notifications" placeholderTextColor={colors.placeholder} style={styles.searchInput} value={query} />
        </View>
        <View style={styles.tabs}>{(['activity', 'badges'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.activeTab]}><Text style={[styles.tabText, tab === value && styles.activeTabText]}>{value === 'activity' ? 'Activity' : 'Badges'}</Text></Pressable>)}</View>
      </View>

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} /> : <FlatList
        contentContainerStyle={[styles.content, visible.length === 0 && visibleRequests.length === 0 && styles.emptyContent]}
        data={visible}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={visibleRequests.length > 0 ? <View>{visibleRequests.map((item) => <View key={item.id} style={[styles.row, styles.requestRow]}><View style={[styles.avatar, styles.requestAvatar]}><Text style={styles.requestAvatarText}>+</Text></View><View style={styles.copy}><Text style={styles.rowTitle}>{item.senderName}</Text><Text style={styles.body}>{item.body}</Text><View style={styles.requestActions}><Pressable onPress={() => void respond(item, 'accepted')} style={styles.accept}><Text style={styles.acceptText}>Accept</Text></Pressable><Pressable onPress={() => void respond(item, 'declined')} style={styles.decline}><Text style={styles.declineText}>Decline</Text></Pressable></View></View></View>)}</View> : null}
        ListEmptyComponent={visibleRequests.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✓</Text></View>
            <Text style={styles.emptyTitle}>{query ? 'Nothing found' : 'You’re all caught up'}</Text>
            <Text style={styles.emptyBody}>{query ? 'Try another search.' : 'New reactions, invitations and updates will appear here.'}</Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void open(item)}
            style={({ pressed }) => [styles.row, item.unread && styles.unreadRow, pressed && styles.pressed]}
          >
            <View style={[styles.avatar, item.unread && styles.avatarUnread]}><Text style={styles.avatarText}>{glyphs[item.kind]}</Text></View>
            <View style={styles.copy}>
              <View style={styles.heading}><Text style={[styles.rowTitle, item.unread && styles.rowTitleUnread]}>{item.title}</Text><Text style={styles.time}>{ago(item.createdAt)}</Text></View>
              <Text numberOfLines={2} style={styles.body}>{item.body}</Text>
            </View>
            {item.unread ? <View style={styles.dot} /> : null}
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />}
    </View>
  );
}

function createStyles(colors: ThemeColors, safeTop: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { paddingTop: safeTop, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.background },
    titleRow: { height: 54, flexDirection: 'row', alignItems: 'center' },
    headerButton: { width: 64, height: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: '300' },
    title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
    clear: { color: colors.primary, fontSize: 12, textAlign: 'right' },
    disabled: { opacity: 0.4 },
    search: { height: 39, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 44, backgroundColor: colors.surfaceRaised },
    searchGlyph: { marginRight: 8, color: colors.textSecondary, fontSize: 22 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
    tabs: { height: 38, marginTop: 12, padding: 3, borderRadius: 20, flexDirection: 'row', backgroundColor: colors.surfaceRaised },
    tab: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    activeTab: { backgroundColor: colors.primary },
    tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    activeTabText: { color: colors.onPrimary },
    content: { paddingBottom: 30 },
    emptyContent: { flexGrow: 1 },
    row: { minHeight: 96, paddingHorizontal: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    unreadRow: { backgroundColor: 'rgba(184,47,41,0.08)' },
    pressed: { opacity: 0.72 },
    avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    avatarUnread: { backgroundColor: colors.primary },
    avatarText: { color: colors.text, fontSize: 19, fontWeight: '700' },
    copy: { flex: 1, marginLeft: 12 },
    heading: { flexDirection: 'row', alignItems: 'flex-start' },
    rowTitle: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '500' },
    rowTitleUnread: { fontWeight: '700' },
    time: { marginLeft: 8, color: colors.textMuted, fontSize: 12 },
    body: { marginTop: 5, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    dot: { width: 7, height: 7, marginLeft: 8, borderRadius: 4, backgroundColor: colors.primary },
    requestRow: { alignItems: 'flex-start' },
    requestAvatar: { backgroundColor: colors.primary },
    requestAvatarText: { color: colors.onPrimary, fontSize: 22, fontWeight: '800' },
    requestActions: { marginTop: 10, flexDirection: 'row', gap: 8 },
    accept: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.primary },
    acceptText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
    decline: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.surfaceRaised },
    declineText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    empty: { flex: 1, paddingHorizontal: 48, alignItems: 'center', justifyContent: 'center' },
    emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    emptyIconText: { color: colors.primary, fontSize: 30, fontWeight: '800' },
    emptyTitle: { marginTop: 18, color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
    emptyBody: { marginTop: 8, color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
}
