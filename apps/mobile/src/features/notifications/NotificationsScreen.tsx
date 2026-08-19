import type { AppNotification, AppRequest } from '@tastes/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import backIcon from '../../../assets/onboarding/back.png';
import notificationIcon from '../../../assets/onboarding/permission-notifications.png';
import patternDark from '../../../assets/onboarding/pattern-screen.png';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type NotificationTab = 'activity' | 'badges';
type FeedEntry =
  | { id: string; createdAt: string; type: 'notification'; item: AppNotification }
  | { id: string; createdAt: string; type: 'request'; item: AppRequest };

const kindGlyphs: Record<AppNotification['kind'], string> = {
  comment: '○',
  follow: '+',
  invite: '↗',
  reward: '★',
  system: '%',
};

/** One glyph per catalog group, so a like never looks like a moderation notice. */
const groupGlyphs: Partial<Record<NonNullable<AppNotification['group']>, string>> = {
  follows: '+',
  likesComments: '♥',
  friendsActivity: '○',
  messages: '✉',
  rewards: '★',
  recap: '☾',
  savedPlaces: '◎',
  reminders: '↻',
  moderation: '!',
  account: '⚿',
  promotions: '%',
};

function glyphFor(item: AppNotification): string {
  return (item.group ? groupGlyphs[item.group] : undefined) ?? kindGlyphs[item.kind] ?? '○';
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'T';
}

function dateLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function NotificationsScreen({
  onBack,
  onOpenTarget,
}: {
  onBack: () => void;
  onOpenTarget: (item: AppNotification) => void;
}) {
  const api = useTastesApi();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top, isDark), [colors, insets.top, isDark]);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [requests, setRequests] = useState<AppRequest[]>([]);
  const [tab, setTab] = useState<NotificationTab>('activity');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const feed = useMemo<FeedEntry[]>(() => {
    const notifications = items
      .filter((item) => tab === 'badges' ? item.kind === 'reward' : item.kind !== 'reward')
      .map((item): FeedEntry => ({ id: `notification-${item.id}`, createdAt: item.createdAt, type: 'notification', item }));
    const pending = tab === 'activity'
      ? requests.map((item): FeedEntry => ({ id: `request-${item.id}`, createdAt: item.createdAt, type: 'request', item }))
      : [];
    return [...pending, ...notifications].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [items, requests, tab]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listNotifications({ limit: 20 }), api.listRequests()])
      .then(([notifications, pendingRequests]) => {
        if (!active) return;
        setItems(notifications.data.items);
        setNextCursor(notifications.data.nextCursor);
        setRequests(pendingRequests.data);
      })
      .catch(() => Alert.alert('Could not load notifications', 'Please try again.'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function loadMore() {
    if (!nextCursor || loadingMore || tab === 'badges') return;
    setLoadingMore(true);
    try {
      const response = await api.listNotifications({ cursor: nextCursor, limit: 20 });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...response.data.items.filter((item) => !known.has(item.id))];
      });
      setNextCursor(response.data.nextCursor);
    } catch {
      Alert.alert('Could not load more notifications', 'Please try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function open(item: AppNotification) {
    if (item.unread) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: false } : candidate));
      try {
        await api.markNotificationRead({ notificationId: item.id });
      } catch {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, unread: true } : candidate));
        Alert.alert('Could not mark notification as read', 'Please try again.');
      }
    }
    onOpenTarget(item);
  }

  async function clear() {
    if (clearing || items.length === 0) return;
    setClearing(true);
    try {
      await api.clearNotifications();
      setItems([]);
      setNextCursor(null);
    } catch {
      Alert.alert('Could not clear notifications', 'Please try again.');
    } finally {
      setClearing(false);
    }
  }

  async function respond(item: AppRequest, response: 'accepted' | 'declined') {
    if (respondingId) return;
    setRespondingId(item.id);
    try {
      await api.respondToRequest({ requestId: item.id, response });
      setRequests((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch {
      Alert.alert('Could not update request', 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  }

  function renderRequest(item: AppRequest) {
    const busy = respondingId === item.id;
    return (
      <View style={styles.requestRow}>
        <View style={styles.avatar}><Text style={styles.avatarInitials}>{initials(item.senderName)}</Text></View>
        <View style={styles.requestCopy}>
          <Text numberOfLines={1} style={styles.rowTitle}>{item.senderName}</Text>
          <Text numberOfLines={1} style={styles.body}>{item.body || item.title}</Text>
        </View>
        <View style={styles.requestActions}>
          <Pressable
            accessibilityLabel={`Accept request from ${item.senderName}`}
            disabled={busy}
            onPress={() => void respond(item, 'accepted')}
            style={({ pressed }) => [styles.actionButton, styles.accept, (busy || pressed) && styles.pressed]}
          >
            <Text style={styles.actionText}>Accept</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Decline request from ${item.senderName}`}
            disabled={busy}
            onPress={() => void respond(item, 'declined')}
            style={({ pressed }) => [styles.actionButton, styles.decline, (busy || pressed) && styles.pressed]}
          >
            <Text style={styles.actionText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderNotification(item: AppNotification) {
    const promotional = item.group === 'promotions' || (!item.group && item.kind === 'system');
    const emblem = item.actorName
      ? initials(item.actorName)
      : item.kind === 'system' || item.kind === 'reward'
        ? glyphFor(item)
        : initials(item.title);
    return (
      <Pressable
        accessibilityLabel={`${item.title}. ${item.body}`}
        onPress={() => void open(item)}
        style={({ pressed }) => [styles.row, promotional && styles.promotionRow, pressed && styles.pressed]}
      >
        <View style={[styles.avatar, promotional && styles.promotionAvatar, item.unread && !promotional && styles.avatarUnread]}>
          <Text style={[styles.avatarGlyph, promotional && styles.promotionGlyph]}>{emblem}</Text>
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.rowTitle, item.unread && styles.rowTitleUnread]}>{item.title}</Text>
          <Text numberOfLines={promotional ? 2 : 1} style={styles.body}>{item.body}</Text>
        </View>
        {!promotional ? <Text style={styles.time}>{dateLabel(item.createdAt)}</Text> : null}
      </Pressable>
    );
  }

  const hasClearableItems = items.length > 0;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Pressable accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={styles.backButton}>
            <Image source={backIcon} style={styles.backIcon} />
          </Pressable>
          <Text style={styles.title}>Notifications</Text>
          <Pressable
            accessibilityLabel="Clear all notifications"
            disabled={!hasClearableItems || clearing}
            onPress={() => void clear()}
            style={styles.clearButton}
          >
            <Text style={[styles.clear, !hasClearableItems && styles.disabled]}>{clearing ? 'Clearing…' : '✓ Clear all'}</Text>
          </Pressable>
        </View>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(['activity', 'badges'] as const).map((value) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              key={value}
              onPress={() => setTab(value)}
              style={[styles.tab, tab === value && styles.activeTab]}
            >
              <Text style={[styles.tabText, tab === value && styles.activeTabText]}>{value === 'activity' ? 'Activity' : 'Badges'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : feed.length === 0 ? (
        <ImageBackground imageStyle={styles.emptyPatternImage} resizeMode="cover" source={patternDark} style={styles.emptyBackground}>
          <View style={styles.empty}>
            <Image source={notificationIcon} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyBody}>We’ll notify you when something{`\n`}new happens</Text>
          </View>
        </ImageBackground>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={feed}
          initialNumToRender={12}
          keyExtractor={(entry) => entry.id}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
          maxToRenderPerBatch={12}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => item.type === 'request' ? renderRequest(item.item) : renderNotification(item.item)}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, isDark: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: {
      zIndex: 2,
      paddingTop: safeTop,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.background,
    },
    titleRow: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    backButton: { position: 'absolute', left: -10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backIcon: { width: 24, height: 24, tintColor: colors.text },
    title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    clearButton: { position: 'absolute', right: -8, minWidth: 84, height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
    clear: { color: colors.textSecondary, fontSize: 14, letterSpacing: -0.24 },
    disabled: { opacity: 0.42 },
    tabs: { height: 40, padding: 4, borderRadius: 100, flexDirection: 'row', backgroundColor: isDark ? 'rgba(223,223,233,0.12)' : colors.surfaceRaised },
    tab: { flex: 1, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
    activeTab: { backgroundColor: isDark ? '#D9DDE5' : colors.text },
    tabText: { color: isDark ? '#C4CAD7' : colors.textMuted, opacity: 0.5, fontSize: 13, lineHeight: 18 },
    activeTabText: { color: isDark ? '#000000' : colors.background, opacity: 1, fontWeight: '700' },
    loading: { marginTop: 60 },
    content: { paddingBottom: 30 },
    row: {
      minHeight: 80,
      paddingHorizontal: 16,
      paddingVertical: 20,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.canvas,
    },
    requestRow: {
      minHeight: 80,
      paddingHorizontal: 16,
      paddingVertical: 20,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.canvas,
    },
    promotionRow: { minHeight: 88, paddingVertical: 16, backgroundColor: isDark ? 'rgba(184,47,41,0.10)' : 'rgba(184,47,41,0.07)', borderColor: '#5D1209' },
    pressed: { opacity: 0.72 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    avatarUnread: { borderWidth: 1, borderColor: colors.primary },
    avatarInitials: { color: colors.text, fontSize: 12, fontWeight: '700' },
    avatarGlyph: { color: colors.textSecondary, fontSize: 16, fontWeight: '700' },
    promotionAvatar: { backgroundColor: colors.primary },
    promotionGlyph: { color: colors.onPrimary, fontSize: 20 },
    requestCopy: { flex: 1, minWidth: 0, marginLeft: 7 },
    copy: { flex: 1, minWidth: 0, marginLeft: 7 },
    rowTitle: { color: colors.text, fontSize: 15, lineHeight: 18, fontWeight: '600', letterSpacing: -0.41 },
    rowTitleUnread: { fontWeight: '700' },
    body: { marginTop: 2, color: colors.textSecondary, fontSize: 14, lineHeight: 18, letterSpacing: -0.41 },
    time: { marginLeft: 16, color: colors.textSecondary, opacity: 0.4, fontSize: 14, letterSpacing: -0.24 },
    requestActions: { marginLeft: 8, flexDirection: 'row', gap: 8 },
    actionButton: { height: 36, paddingHorizontal: 14, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
    accept: { backgroundColor: colors.primary },
    decline: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.canvas },
    actionText: { color: colors.text, fontSize: 13, fontWeight: '500', letterSpacing: 0.6 },
    emptyBackground: { flex: 1, backgroundColor: colors.canvas },
    emptyPatternImage: { opacity: isDark ? 1 : 0.08 },
    empty: { flex: 1, width: 240, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', transform: [{ translateY: -20 }] },
    emptyIcon: { width: 60, height: 60, tintColor: colors.text },
    emptyTitle: { marginTop: 24, color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.24, textAlign: 'center' },
    emptyBody: { marginTop: 8, color: colors.textSecondary, fontSize: 14, lineHeight: 18, letterSpacing: -0.41, textAlign: 'center' },
    footerLoader: { paddingVertical: 20 },
  });
}
