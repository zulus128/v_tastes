import type { ChatMessage, ConversationParticipant } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AccessibilityInfo,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SendIcon from '../../../assets/ai/send.svg';
import lightDialogPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import dialogPattern from '../../../assets/onboarding/pattern-screen.png';
import { firestore } from '../../infrastructure/firebase';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { useIsVisualAudit, useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { PatternBackgroundLift, Screen } from '../../ui/components';
import { useProfile } from '../profile/api';
import { subscribeConversationDetails, useConversationMessages } from './realtime';
import { activitySchedule, activitySubtitle } from './presentation';

type ActivityChatMember = Pick<ConversationParticipant, 'userId' | 'displayName' | 'photoUrl'>;

type ActivityChatDetails = {
  address: string;
  imageUrl: string | null;
  members: Map<string, ActivityChatMember>;
  startsAt: string | null;
  title: string;
};

function memberFromProfile(userId: string, profile: DocumentData | undefined): ActivityChatMember {
  return {
    userId,
    displayName: typeof profile?.displayName === 'string' ? profile.displayName : 'Tastes user',
    photoUrl: typeof profile?.photoUrl === 'string' ? profile.photoUrl : null,
  };
}

function useActivityChatDetails(activityId: string | null): ActivityChatDetails | null {
  const [details, setDetails] = useState<ActivityChatDetails | null>(null);
  useEffect(() => {
    setDetails(null);
    if (!activityId) return undefined;
    let active = true;
    return onSnapshot(doc(firestore, 'activities', activityId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const participantIds = Array.isArray(data.participantIds)
        ? data.participantIds.filter((value): value is string => typeof value === 'string')
        : [];
      const venueId = typeof data.venueId === 'string' ? data.venueId : '';
      const startsAt = data.startsAt && typeof data.startsAt.toDate === 'function'
        ? data.startsAt.toDate().toISOString()
        : typeof data.startsAt === 'string' ? data.startsAt : null;
      void Promise.all([
        venueId ? getDoc(doc(firestore, 'venues', venueId)) : Promise.resolve(null),
        ...participantIds.map((id) => getDoc(doc(firestore, 'users', id))),
      ]).then(([venue, ...profiles]) => {
        if (!active) return;
        const venueData = venue?.data();
        setDetails({
          address: typeof venueData?.address === 'string' ? venueData.address : typeof venueData?.city === 'string' ? venueData.city : '',
          imageUrl: typeof venueData?.imageUrl === 'string' ? venueData.imageUrl : typeof data.imageUrl === 'string' ? data.imageUrl : null,
          members: new Map(participantIds.map((id, index) => [id, memberFromProfile(id, profiles[index]?.data())])),
          startsAt,
          title: typeof venueData?.name === 'string' ? venueData.name : String(data.venueName ?? 'Activity'),
        });
      });
    });
  }, [activityId]);
  return details;
}

function keyboardEasing(event: KeyboardEvent) {
  if (event.easing === 'easeIn') return Easing.in(Easing.ease);
  if (event.easing === 'easeOut') return Easing.out(Easing.ease);
  if (event.easing === 'linear') return Easing.linear;
  return Easing.inOut(Easing.ease);
}

function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  item,
  mine,
  read,
  sender,
  showAvatar,
  showSender,
  styles,
}: {
  item: ChatMessage;
  mine: boolean;
  read: boolean;
  sender?: Pick<ConversationParticipant, 'displayName' | 'photoUrl'>;
  showAvatar: boolean;
  showSender: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const senderName = item.senderDisplayName ?? sender?.displayName ?? 'Tastes user';
  const senderPhotoUrl = item.senderPhotoUrl ?? sender?.photoUrl ?? null;
  const bubble = (
    <View style={[styles.bubble, showAvatar && styles.groupBubble, mine ? styles.mineBubble : styles.theirBubble]}>
      <Text style={[styles.messageText, mine && styles.mineText]}>{item.text}</Text>
      <Text style={[styles.messageTime, mine && styles.mineTime]}>{messageTime(item.createdAt)}</Text>
    </View>
  );
  return (
    <View style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}>
      {showAvatar ? (
        <View style={[styles.groupMessage, mine && styles.mineGroupMessage]}>
          {senderPhotoUrl ? (
            <Image source={{ uri: senderPhotoUrl }} style={styles.messageAvatar} />
          ) : (
            <View style={styles.messageAvatarFallback}>
              <Text style={styles.messageAvatarInitial}>{senderName.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={[styles.groupMessageContent, mine && styles.mineGroupMessageContent]}>
            {showSender ? <Text numberOfLines={1} style={[styles.senderName, mine && styles.mineSenderName]}>{senderName}</Text> : null}
            {bubble}
          </View>
        </View>
      ) : bubble}
      {read ? <Text style={styles.readReceipt}>Read</Text> : null}
    </View>
  );
}

function TypingIndicator({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const progress = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.forEach((value) => value.setValue(0.65));
      return undefined;
    }
    const animations = progress.map((value, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 140),
      Animated.timing(value, {
        duration: 280,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        duration: 280,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.delay((2 - index) * 140),
    ])));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [progress, reduceMotion]);

  return (
    <View
      accessibilityLabel="Someone is typing"
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
      style={[styles.messageRow, styles.theirRow]}
    >
      <View style={styles.typingBubble}>
        {progress.map((value, index) => (
          <Animated.View
            key={index}
            style={[
              styles.typingDot,
              {
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] }),
                transform: [{
                  translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
                }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

type ChatListItem =
  | { kind: 'typing' }
  | { kind: 'message'; message: ChatMessage };

export function ChatScreen({
  conversationId,
  onBack,
  onOpenActivityDetails,
  onOpenGroupDetails,
  userId,
}: {
  conversationId: string;
  onBack: () => void;
  onOpenActivityDetails: (activityId: string) => void;
  onOpenGroupDetails: (groupId: string) => void;
  userId: string;
}) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const api = useTastesApi();
  const visualAudit = useIsVisualAudit();
  const { profile: currentUserProfile } = useProfile(userId, 'You');
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
  const [groupMembers, setGroupMembers] = useState<Map<string, ConversationParticipant>>(new Map());
  const [activity, setActivity] = useState<{ id: string; title: string } | null>(null);
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);
  const [readByCount, setReadByCount] = useState(0);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [conversationError, setConversationError] = useState<Error | null>(null);
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(responsiveSize(44));
  const [sending, setSending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('message'));
  const lastMarkedRead = useRef<string | null>(null);
  const typingActive = useRef(false);
  const typingStatusAvailable = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<ChatListItem>>(null);
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const listItems = useMemo<ChatListItem[]>(() => [
    ...(someoneTyping ? [{ kind: 'typing' } as const] : []),
    ...messageItems.map((message) => ({ kind: 'message' as const, message })),
  ], [messageItems, someoneTyping]);
  const ownSender = currentUserProfile
    ? { displayName: currentUserProfile.displayName, photoUrl: currentUserProfile.photoUrl }
    : { displayName: 'You', photoUrl: null };
  const activityDetails = useActivityChatDetails(activity?.id ?? null);
  const chatMembers = activity ? activityDetails?.members ?? new Map() : groupMembers;

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const subscription = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const overlap = Math.max(0, windowHeight - event.endCoordinates.screenY);
      Animated.timing(keyboardOffset, {
        duration: event.duration || 250,
        easing: keyboardEasing(event),
        toValue: -overlap,
        useNativeDriver: true,
      }).start();
      if (overlap > 0) requestAnimationFrame(() => listRef.current?.scrollToOffset({ animated: false, offset: 0 }));
    });
    return () => subscription.remove();
  }, [keyboardOffset, windowHeight]);

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
    visualAudit,
  ), [api, conversationId, userId, visualAudit]);

  useEffect(() => {
    if (!groupTitle) {
      setGroupMembers(new Map());
      return undefined;
    }
    let active = true;
    void api.getGroup({ groupId: conversationId })
      .then((result) => {
        if (!active) return;
        setGroupMembers(new Map(result.data.members.map((member) => [member.userId, member])));
      })
      .catch(() => {
        if (active) setGroupMembers(new Map());
      });
    return () => {
      active = false;
    };
  }, [api, conversationId, groupTitle]);

  useEffect(() => {
    typingStatusAvailable.current = true;
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      // Typing presence is best-effort. The conversation may be deleted while
      // this screen is closing, so never let cleanup create an unhandled promise.
      if (typingActive.current) void api.setTypingStatus({ conversationId, typing: false }).catch(() => undefined);
    };
  }, [api, conversationId]);

  function updateTypingStatus(typing: boolean) {
    if (!typingStatusAvailable.current) return;
    void api.setTypingStatus({ conversationId, typing }).catch((error) => {
      // A stale/deleted conversation is already handled by the screen's
      // realtime and history subscriptions. Typing status must not show a
      // React Native error overlay for this non-critical race.
      if ((error as { code?: string }).code === 'not-found') {
        typingStatusAvailable.current = false;
        return;
      }
      setConversationError(error instanceof Error ? error : new Error('Could not update typing status.'));
    });
  }

  function updateText(value: string) {
    if (!text && value) setIdempotencyKey(createIdempotencyKey('message'));
    setText(value);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (!value.trim()) {
      if (typingActive.current) updateTypingStatus(false);
      typingActive.current = false;
      return;
    }
    if (!typingActive.current) updateTypingStatus(true);
    typingActive.current = true;
    typingTimer.current = setTimeout(() => {
      typingActive.current = false;
      updateTypingStatus(false);
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
      updateTypingStatus(false);
      setIdempotencyKey(createIdempotencyKey('message'));
    } catch (error) {
      Alert.alert('Could not send message', apiErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  const error = conversationError ?? realtimeMessages.error ?? messageHistory.error;
  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { minHeight: responsiveSize(64) + insets.top, paddingTop: responsiveSize(8) + insets.top, paddingLeft: responsiveSize(14) + insets.left, paddingRight: responsiveSize(14) + insets.right }] }>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={activity
            ? 'Open activity details'
            : groupTitle
              ? 'Open group details'
              : undefined}
          disabled={!activity && !groupTitle}
          onPress={() => {
            if (activity) onOpenActivityDetails(activity.id);
            else if (groupTitle) onOpenGroupDetails(conversationId);
          }}
          style={styles.headerIdentity}
        >
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.headerName}>{activityDetails?.title ?? activity?.title ?? groupTitle ?? participant?.displayName ?? 'Conversation'}</Text>
            {activity ? <Text numberOfLines={1} style={styles.headerMeta}>{activitySubtitle(activityDetails?.startsAt ?? null, activityDetails?.members.size ?? 0)}</Text> : null}
            {groupTitle ? <Text numberOfLines={1} style={styles.headerMeta}>{groupMembers.size} members</Text> : null}
          </View>
          {groupTitle && groupMembers.size > 0 ? (
            <View style={styles.headerAvatarStack}>
              {[...groupMembers.values()].slice(0, 2).map((member, index) => member.photoUrl ? (
                <Image key={member.userId} source={{ uri: member.photoUrl }} style={[styles.headerStackedAvatar, { marginLeft: index ? responsiveSize(-10) : 0 }]} />
              ) : (
                <View key={member.userId} style={[styles.headerStackedAvatar, styles.headerAvatarFallback, { marginLeft: index ? responsiveSize(-10) : 0 }]}><Text style={styles.headerInitial}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>
              ))}
            </View>
          ) : participant?.photoUrl ? (
            <Image source={{ uri: participant.photoUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerInitial}>{activity ? '◷' : groupTitle ? groupTitle.slice(0, 1).toUpperCase() : participant?.displayName.slice(0, 1).toUpperCase() ?? 'T'}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Animated.View style={[styles.chatBody, Platform.OS === 'ios' && { transform: [{ translateY: keyboardOffset }] }]}>
      {activity && activityDetails ? (
        <Pressable accessibilityLabel="Open activity details" onPress={() => onOpenActivityDetails(activity.id)} style={styles.activityCard}>
          {activityDetails.imageUrl ? <Image source={{ uri: activityDetails.imageUrl }} style={styles.activityImage} /> : <View style={styles.activityImageFallback}><Text style={styles.activityImageInitial}>{activityDetails.title.slice(0, 1)}</Text></View>}
          <View style={styles.activityCopy}>
            <Text numberOfLines={1} style={styles.activityTitle}>{activityDetails.title}</Text>
            {activitySchedule(activityDetails.startsAt) ? <Text numberOfLines={1} style={styles.activitySchedule}>{activitySchedule(activityDetails.startsAt)}</Text> : null}
            <Text numberOfLines={1} style={styles.activityAddress}>{activityDetails.address}</Text>
          </View>
          <Text style={styles.goingChip}>{activityDetails.members.size} going</Text>
        </Pressable>
      ) : null}

      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.08 }}
        resizeMode="stretch"
        source={isDark ? dialogPattern : lightDialogPattern}
        style={[styles.patternBody, { backgroundColor: colors.canvas }]}
      >
        <PatternBackgroundLift />
        {realtimeMessages.loading && messageHistory.isPending ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : error && messageItems.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.stateTitle}>Could not load conversation</Text>
            <Text style={styles.stateCopy}>{error.message}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.messages}
            contentContainerStyle={[styles.messagesContent, listItems.length === 0 && styles.emptyMessages]}
            data={listItems}
            initialNumToRender={16}
            inverted={listItems.length > 0}
            keyExtractor={(item) => item.kind === 'typing' ? 'typing-indicator' : item.message.id}
            maxToRenderPerBatch={12}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <View style={styles.emptyState}>
                <Text style={styles.stateTitle}>Start the conversation</Text>
                <Text style={styles.stateCopy}>{activity ? 'Plan the activity with everyone here.' : `Say hello to ${participant?.displayName ?? 'your connection'}.`}</Text>
              </View>
            )}
            ListFooterComponent={messageHistory.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: responsiveSize(16) }} /> : null}
            onEndReached={() => {
              if (messageHistory.hasNextPage && !messageHistory.isFetchingNextPage) void messageHistory.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            windowSize={9}
            renderItem={({ item, index }) => {
              if (item.kind === 'typing') return <TypingIndicator styles={styles} />;
              const olderItem = listItems[index + 1];
              const startsSenderGroup = olderItem?.kind !== 'message'
                || olderItem.message.senderId !== item.message.senderId;
              return (
                <MessageBubble
                  item={item.message}
                  mine={item.message.senderId === userId}
                  read={item.message.senderId === userId && item.message.id === lastMessageId && readByCount > 0}
                  sender={item.message.senderId === userId ? ownSender : chatMembers.get(item.message.senderId)}
                  showAvatar={Boolean(groupTitle || activity) && item.message.senderId !== userId}
                  showSender={Boolean(groupTitle || activity) && item.message.senderId !== userId && startsSenderGroup}
                  styles={styles}
                />
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ImageBackground>

      <View style={[styles.composer, { minHeight: responsiveSize(62) + insets.bottom, paddingBottom: Math.max(responsiveSize(8), insets.bottom), paddingLeft: responsiveSize(12) + insets.left, paddingRight: responsiveSize(12) + insets.right }] }>
        <TextInput
          blurOnSubmit={false}
          editable={!sending && !conversationError}
          maxLength={4_000}
          multiline
          onChangeText={updateText}
          onContentSizeChange={(event) => setInputHeight(Math.max(responsiveSize(44), Math.min(responsiveSize(118), event.nativeEvent.contentSize.height)))}
          placeholder="Message"
          placeholderTextColor={colors.placeholder}
          scrollEnabled={inputHeight >= responsiveSize(118)}
          style={[styles.input, { height: inputHeight }]}
          value={text}
        />
        <Pressable
          accessibilityLabel="Send message"
          disabled={!text.trim() || sending || Boolean(conversationError)}
          onPress={() => void send()}
          style={({ pressed }) => [styles.send, (!text.trim() || sending) && styles.sendDisabled, pressed && styles.sendPressed]}
        >
          {sending ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <SendIcon height={responsiveSize(16.667)} width={responsiveSize(16.667)} />}
        </Pressable>
      </View>
      </Animated.View>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return responsiveStyleSheet({
    screen: { flex: 1 },
    chatBody: { flex: 1 },
    patternBody: { flex: 1 },
    header: { minHeight: 64, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline, backgroundColor: colors.background === '#080808' ? colors.background : colors.surface },
    back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: '300', marginTop: -3 },
    headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    headerAvatar: { width: 40, height: 40, marginRight: 2, borderRadius: 20, backgroundColor: colors.skeleton },
    headerAvatarFallback: { width: 40, height: 40, marginRight: 2, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    headerInitial: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    headerCopy: { flex: 1, marginLeft: 4, marginRight: 8, alignItems: 'center' },
    headerName: { color: colors.text, fontSize: 17, fontWeight: '500', textAlign: 'center' },
    headerMeta: { color: colors.textSecondary, marginTop: 1, fontSize: 11, textAlign: 'center' },
    headerAvatarStack: { minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end' },
    headerStackedAvatar: { width: 30, height: 30, borderWidth: 1.5, borderColor: colors.background, borderRadius: 15, backgroundColor: colors.skeleton },
    activityCard: { minHeight: 72, marginHorizontal: 16, marginVertical: 8, padding: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface },
    activityImage: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.skeleton },
    activityImageFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    activityImageInitial: { color: colors.onPrimary, fontSize: 18, fontWeight: '700' },
    activityCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
    activityTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    activitySchedule: { color: colors.textSecondary, marginTop: 2, fontSize: 12 },
    activityAddress: { color: colors.textSecondary, marginTop: 3, fontSize: 12 },
    goingChip: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, overflow: 'hidden', color: colors.primary, backgroundColor: 'rgba(230,57,70,0.16)', fontSize: 11, fontWeight: '600' },
    messages: { flex: 1 },
    messagesContent: { paddingHorizontal: 14, paddingVertical: 12 },
    emptyMessages: { flexGrow: 1 },
    emptyState: { flex: 1, padding: 34, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: 1 }] },
    messageRow: { width: '100%', marginVertical: 3 },
    mineRow: { alignItems: 'flex-end' },
    theirRow: { alignItems: 'flex-start' },
    groupMessage: { width: '88%', flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
    mineGroupMessage: { flexDirection: 'row-reverse' },
    groupMessageContent: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
    mineGroupMessageContent: { alignItems: 'flex-end' },
    senderName: { maxWidth: '100%', marginLeft: 10, marginBottom: 3, color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    mineSenderName: { marginLeft: 0, marginRight: 10, textAlign: 'right' },
    messageAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.skeleton },
    messageAvatarFallback: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    messageAvatarInitial: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
    bubble: { maxWidth: '82%', minWidth: 72, paddingLeft: 13, paddingRight: 16, paddingTop: 9, paddingBottom: 6, borderRadius: 19 },
    groupBubble: { maxWidth: '100%' },
    mineBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
    theirBubble: { backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 5 },
    typingBubble: { height: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 19, borderBottomLeftRadius: 5, backgroundColor: colors.surfaceRaised },
    typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textMuted },
    messageText: { color: colors.text, fontSize: 16, lineHeight: 21 },
    mineText: { color: colors.onPrimary },
    messageTime: { color: colors.textMuted, marginTop: 3, fontSize: 10, textAlign: 'right' },
    mineTime: { color: 'rgba(255,255,255,0.70)' },
    readReceipt: { color: colors.textMuted, marginTop: 2, marginRight: 4, fontSize: 10 },
    composer: { minHeight: 62, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, backgroundColor: colors.background },
    input: { flex: 1, minHeight: 44, maxHeight: 118, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, borderRadius: 22, color: colors.text, backgroundColor: colors.surfaceRaised, fontSize: 16 },
    send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    sendDisabled: { opacity: 0.45 },
    sendPressed: { backgroundColor: colors.primaryPressed },
    center: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
    stateTitle: { color: colors.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
    stateCopy: { color: colors.textMuted, marginTop: 7, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  });
}
