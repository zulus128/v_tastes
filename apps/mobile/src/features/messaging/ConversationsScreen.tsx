import type { ConversationSummary } from '@tastes/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityInviteModal } from '../activities/ActivityInviteModal';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useConversationInbox } from './realtime';
import { NewDialogSheet } from './NewDialogSheet';
import { useTastesApi } from '../../session/SessionProvider';

function relativeTime(iso: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ConversationRow({
  conversation,
  onOpen,
  styles,
}: {
  conversation: ConversationSummary;
  onOpen: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const participant = conversation.otherParticipant;
  const title = conversation.kind === 'activity'
    ? conversation.title ?? 'Activity'
    : participant?.displayName ?? 'Tastes user';
  const unread = conversation.unreadCount > 0;
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {participant?.photoUrl ? (
        <Image source={{ uri: participant.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{conversation.kind === 'activity' ? '◷' : title.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowCopy}>
        <View style={styles.rowHeading}>
          <Text numberOfLines={1} style={[styles.name, unread && styles.unreadName]}>{title}</Text>
          <Text style={[styles.time, unread && styles.unreadTime]}>{relativeTime(conversation.updatedAt)}</Text>
        </View>
        <View style={styles.previewRow}>
          <Text numberOfLines={1} style={[styles.preview, unread && styles.unreadPreview]}>
            {conversation.kind === 'activity' || conversation.lastMessage?.senderId === participant?.userId ? '' : conversation.lastMessage ? 'You: ' : ''}
            {conversation.lastMessage?.text ?? (conversation.kind === 'activity' ? 'Activity created' : 'Conversation started')}
          </Text>
          {unread ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(conversation.unreadCount, 99)}</Text></View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function ConversationsScreen({
  onNewActivity,
  onNewGroup,
  onOpenConversation,
  onOpenRequests,
  userId,
}: {
  onNewActivity: () => void;
  onNewGroup: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenRequests: () => void;
  userId: string;
}) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [search, setSearch] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [suppressedInviteId, setSuppressedInviteId] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  useEffect(() => { let active = true; void api.listRequests().then((response) => { if (active) setRequestCount(response.data.length); }).catch(() => { if (active) Alert.alert('Could not load requests', 'Open Requests to try again.'); }); return () => { active = false; }; }, [api]);
  const inbox = useConversationInbox(userId);
  const pendingInvitation = inbox.data.find((conversation) => (
    conversation.kind === 'activity'
    && conversation.invitationStatus === 'pending'
    && conversation.activityId !== suppressedInviteId
  ));
  const pendingActivityId = pendingInvitation?.activityId ?? null;
  const closeInvitation = useCallback(() => {
    if (pendingActivityId) setSuppressedInviteId(pendingActivityId);
  }, [pendingActivityId]);
  const normalizedSearch = search.trim().toLowerCase();
  const conversations = inbox.data.filter((conversation) => (
    !normalizedSearch
    || conversation.title?.toLowerCase().includes(normalizedSearch)
    || conversation.otherParticipant?.displayName.toLowerCase().includes(normalizedSearch)
    || conversation.otherParticipant?.username?.toLowerCase().includes(normalizedSearch)
  ));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.headerButton} />
          <Text style={styles.title}>Dialog</Text>
          <Pressable accessibilityLabel="New dialog" onPress={() => setNewDialogOpen(true)} style={styles.headerButton}>
            <View style={styles.addCircle}><Text style={styles.addText}>+</Text></View>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput autoCorrect={false} onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.placeholder} style={styles.searchInput} value={search} />
          </View>
          <Pressable onPress={onOpenRequests}><Text style={styles.requests}>Requests {requestCount > 0 ? <Text style={styles.requestsCount}>({requestCount})</Text> : null}</Text></Pressable>
        </View>
      </View>
      {inbox.loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : inbox.error && inbox.data.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>Could not load messages</Text>
          <Text style={styles.stateCopy}>{inbox.error.message}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.listContent, conversations.length === 0 && styles.emptyContent]}
          data={conversations}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <View style={styles.empty}>
              <View style={styles.emptyGlyph}><Text style={styles.emptyGlyphText}>···</Text></View>
              <Text style={styles.stateTitle}>{search ? 'No conversations found' : 'No messages yet'}</Text>
              <Text style={styles.stateCopy}>
                {search ? 'Try another name or username.' : 'Conversations with mutual followers will appear here.'}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ConversationRow conversation={item} onOpen={() => onOpenConversation(item.id)} styles={styles} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
      <NewDialogSheet
        onClose={() => setNewDialogOpen(false)}
        onNewActivity={onNewActivity}
        onNewGroup={onNewGroup}
        onOpenConversation={onOpenConversation}
        visible={newDialogOpen}
      />
      <ActivityInviteModal
        activityId={pendingActivityId}
        onClose={closeInvitation}
        userId={userId}
        visible={Boolean(pendingActivityId)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, safeTop: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { paddingTop: safeTop, paddingBottom: 12, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.background },
    titleRow: { height: 51, flexDirection: 'row', alignItems: 'center' },
    title: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center', letterSpacing: -0.4 },
    headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    addCircle: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.text, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, addText: { color: colors.text, fontSize: 19, lineHeight: 19, fontWeight: '300' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    searchBox: { flex: 1, height: 39, paddingHorizontal: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised },
    searchIcon: { color: colors.textSecondary, fontSize: 22, marginRight: 8, marginTop: -2 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
    requests: { color: colors.textSecondary, fontSize: 14 }, requestsCount: { color: colors.primary },
    listContent: { paddingTop: 10, paddingBottom: 24 },
    emptyContent: { flexGrow: 1 },
    row: { minHeight: 82, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
    rowPressed: { backgroundColor: colors.surfaceRaised },
    avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.skeleton },
    avatarFallback: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    avatarInitial: { color: colors.onPrimary, fontSize: 21, fontWeight: '700' },
    rowCopy: { flex: 1, height: 64, marginLeft: 13, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
    rowHeading: { flexDirection: 'row', alignItems: 'center' },
    name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
    unreadName: { fontWeight: '800' },
    time: { color: colors.textMuted, marginLeft: 10, fontSize: 12 },
    unreadTime: { color: colors.primary, fontWeight: '700' },
    previewRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center' },
    preview: { flex: 1, color: colors.textMuted, fontSize: 14 },
    unreadPreview: { color: colors.textSecondary, fontWeight: '600' },
    badge: { minWidth: 21, height: 21, marginLeft: 8, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '800' },
    center: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, paddingHorizontal: 42, alignItems: 'center', justifyContent: 'center' },
    emptyGlyph: { width: 68, height: 68, marginBottom: 18, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    emptyGlyphText: { color: colors.primary, fontSize: 27, fontWeight: '800', marginTop: -10 },
    stateTitle: { color: colors.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
    stateCopy: { color: colors.textMuted, marginTop: 7, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
}
