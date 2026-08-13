import type { ChatMessage, ConversationParticipant } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityInviteModal } from '../activities/ActivityInviteModal';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { subscribeConversationDetails, useConversationMessages } from './realtime';

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ item, mine, read, styles }: { item: ChatMessage; mine: boolean; read: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}>
      <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>
        <Text style={[styles.messageText, mine && styles.mineText]}>{item.text}</Text>
        <Text style={[styles.messageTime, mine && styles.mineTime]}>{messageTime(item.createdAt)}</Text>
      </View>
      {read ? <Text style={styles.readReceipt}>Read</Text> : null}
    </View>
  );
}

export function ChatScreen({
  conversationId,
  onBack,
  userId,
}: {
  conversationId: string;
  onBack: () => void;
  userId: string;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top, insets.bottom), [colors, insets.bottom, insets.top]);
  const api = useTastesApi();
  const realtimeMessages = useConversationMessages(conversationId, userId);
  const messageHistory = useInfiniteQuery({
    queryKey: ['messages', conversationId, 'history'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (
      await api.getMessages({ conversationId, cursor: pageParam, limit: 50 })
    ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const messageItems = useMemo(() => {
    const byId = new Map<string, ChatMessage>();
    messageHistory.data?.pages.flatMap((page) => page.items).forEach((message) => byId.set(message.id, message));
    realtimeMessages.data.forEach((message) => byId.set(message.id, message));
    return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messageHistory.data?.pages, realtimeMessages.data]);
  const [participant, setParticipant] = useState<ConversationParticipant | null>(null);
  const [activity, setActivity] = useState<{ id: string; title: string } | null>(null);
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [readByCount, setReadByCount] = useState(0);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [activityPreviewOpen, setActivityPreviewOpen] = useState(false);
  const [conversationError, setConversationError] = useState<Error | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('message'));
  const lastMarkedRead = useRef<string | null>(null);
  const typingActive = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeActivityPreview = useCallback(() => setActivityPreviewOpen(false), []);

  useEffect(() => subscribeConversationDetails(
    conversationId,
    userId,
    (details) => {
      setParticipant(details.participant);
      setActivity(details.kind === 'activity' && details.activityId
        ? { id: details.activityId, title: details.title ?? 'Activity' }
        : null);
      setGroupTitle(details.kind === 'group' ? details.title ?? 'Group' : null);
      setLastMessageId(details.lastMessageId);
      setReadByCount(details.readByCount);
      setSomeoneTyping(details.someoneTyping);
      setConversationError(null);
      if (details.unreadCount > 0 && details.lastMessageId && lastMarkedRead.current !== details.lastMessageId) {
        lastMarkedRead.current = details.lastMessageId;
        void api.markConversationRead({
          conversationId,
          throughMessageId: details.lastMessageId,
        }).catch((error) => {
          lastMarkedRead.current = null;
          setConversationError(error instanceof Error ? error : new Error('Could not mark the conversation as read.'));
        });
      }
    },
    setConversationError,
  ), [api, conversationId, userId]);

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingActive.current) void api.setTypingStatus({ conversationId, typing: false });
  }, [api, conversationId]);

  function updateText(value: string) {
    if (!text && value) setIdempotencyKey(createIdempotencyKey('message'));
    setText(value);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (!value.trim()) {
      if (typingActive.current) void api.setTypingStatus({ conversationId, typing: false });
      typingActive.current = false;
      return;
    }
    if (!typingActive.current) void api.setTypingStatus({ conversationId, typing: true });
    typingActive.current = true;
    typingTimer.current = setTimeout(() => {
      typingActive.current = false;
      void api.setTypingStatus({ conversationId, typing: false });
    }, 1_500);
  }

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await api.sendMessage({ conversationId, idempotencyKey, text: value });
      setText('');
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingActive.current = false;
      void api.setTypingStatus({ conversationId, typing: false });
      setIdempotencyKey(createIdempotencyKey('message'));
    } catch (error) {
      Alert.alert('Could not send message', apiErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const error = conversationError ?? realtimeMessages.error ?? messageHistory.error;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={activity ? 'Open activity details' : undefined}
          disabled={!activity}
          onPress={() => activity && setActivityPreviewOpen(true)}
          style={styles.headerIdentity}
        >
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.headerName}>{activity?.title ?? groupTitle ?? participant?.displayName ?? 'Conversation'}</Text>
            {someoneTyping ? <Text numberOfLines={1} style={styles.headerUsername}>Typing…</Text> : null}
          </View>
          {participant?.photoUrl ? (
            <Image source={{ uri: participant.photoUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerInitial}>{activity ? '◷' : groupTitle ? groupTitle.slice(0, 1).toUpperCase() : participant?.displayName.slice(0, 1).toUpperCase() ?? 'T'}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {realtimeMessages.loading && messageHistory.isPending ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error && messageItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>Could not load conversation</Text>
          <Text style={styles.stateCopy}>{error.message}</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[styles.messagesContent, messageItems.length === 0 && styles.emptyMessages]}
          data={messageItems}
          initialNumToRender={16}
          inverted={messageItems.length > 0}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={12}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={styles.stateTitle}>Start the conversation</Text>
              <Text style={styles.stateCopy}>{activity ? 'Plan the activity with everyone here.' : `Say hello to ${participant?.displayName ?? 'your connection'}.`}</Text>
            </View>
          )}
          ListFooterComponent={messageHistory.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 16 }} /> : null}
          onEndReached={() => {
            if (messageHistory.hasNextPage && !messageHistory.isFetchingNextPage) void messageHistory.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          windowSize={9}
          renderItem={({ item }) => <MessageBubble item={item} mine={item.senderId === userId} read={item.senderId === userId && item.id === lastMessageId && readByCount > 0} styles={styles} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          blurOnSubmit={false}
          editable={!sending && !conversationError}
          maxLength={4_000}
          multiline
          onChangeText={updateText}
          placeholder="Message"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={text}
        />
        <Pressable
          accessibilityLabel="Send message"
          disabled={!text.trim() || sending || Boolean(conversationError)}
          onPress={() => void send()}
          style={({ pressed }) => [styles.send, (!text.trim() || sending) && styles.sendDisabled, pressed && styles.sendPressed]}
        >
          {sending ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.sendText}>↑</Text>}
        </Pressable>
      </View>
      <ActivityInviteModal
        activityId={activity?.id ?? null}
        onClose={closeActivityPreview}
        userId={userId}
        visible={activityPreviewOpen && Boolean(activity)}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { minHeight: safeTop + 64, paddingTop: safeTop + 8, paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline, backgroundColor: colors.background },
    back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: '300', marginTop: -3 },
    headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    headerAvatar: { width: 40, height: 40, marginRight: 2, borderRadius: 20, backgroundColor: colors.skeleton },
    headerAvatarFallback: { width: 40, height: 40, marginRight: 2, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    headerInitial: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    headerCopy: { flex: 1, marginLeft: 4, marginRight: 8, alignItems: 'center' },
    headerName: { color: colors.text, fontSize: 17, fontWeight: '500', textAlign: 'center' },
    headerUsername: { color: colors.textMuted, marginTop: 1, fontSize: 11 },
    messagesContent: { paddingHorizontal: 14, paddingVertical: 12 },
    emptyMessages: { flexGrow: 1 },
    emptyState: { flex: 1, padding: 34, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: 1 }] },
    messageRow: { width: '100%', marginVertical: 3 },
    mineRow: { alignItems: 'flex-end' },
    theirRow: { alignItems: 'flex-start' },
    bubble: { maxWidth: '82%', minWidth: 72, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6, borderRadius: 19 },
    mineBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
    theirBubble: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 5 },
    messageText: { color: colors.text, fontSize: 16, lineHeight: 21 },
    mineText: { color: colors.onPrimary },
    messageTime: { color: colors.textMuted, marginTop: 3, fontSize: 10, textAlign: 'right' },
    mineTime: { color: 'rgba(255,255,255,0.70)' },
    readReceipt: { color: colors.textMuted, marginTop: 2, marginRight: 4, fontSize: 10 },
    composer: { minHeight: 62 + safeBottom, paddingTop: 8, paddingBottom: Math.max(8, safeBottom), paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, backgroundColor: colors.background },
    input: { flex: 1, minHeight: 44, maxHeight: 118, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, borderRadius: 22, color: colors.text, backgroundColor: colors.surfaceRaised, fontSize: 16 },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    sendDisabled: { opacity: 0.45 },
    sendPressed: { backgroundColor: colors.primaryPressed },
    sendText: { color: colors.onPrimary, fontSize: 25, lineHeight: 27, fontWeight: '700' },
    center: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
    stateTitle: { color: colors.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
    stateCopy: { color: colors.textMuted, marginTop: 7, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
}
