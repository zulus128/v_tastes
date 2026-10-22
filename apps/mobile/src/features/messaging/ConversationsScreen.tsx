import type { ConversationSummary } from '@tastes/contracts';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import lightDialogPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import DeleteActionIcon from '../../../assets/messaging/chat-delete-action.svg';
import PinActionIcon from '../../../assets/messaging/chat-pin-action.svg';
import PinnedStatusIcon from '../../../assets/messaging/chat-pinned-status.svg';
import dialogPattern from '../../../assets/onboarding/pattern-screen.png';
import SearchIcon from '../../../assets/profile/search.svg';
import { ActivityInviteModal } from '../activities/ActivityInviteModal';
import { UserAvatar } from '../profile/avatar';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { PatternBackgroundLift, Screen } from '../../ui/components';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import { useConversationInbox } from './realtime';
import { NewDialogSheet } from './NewDialogSheet';
import {
  activitySubtitle,
  compareConversations,
  conversationAvatarUrls,
  reservationCountdown,
} from './presentation';
import { useTastesApi } from '../../session/SessionProvider';
import { conversationHistoryQueryKey } from '../queryKeys';

function relativeTime(iso: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function DeleteConversationSheet({
  deleting,
  onClose,
  onDelete,
  visible,
}: {
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createDeleteSheetStyles(colors), [colors]);
  const sheet = useBottomSheetMotion({ onClose, visible });

  return (
    <Modal
      animationType="none"
      onRequestClose={sheet.close}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Keep chat"
          onPress={sheet.close}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheet.translateY }] },
          ]}
        >
          <View style={styles.dragArea} {...sheet.panHandlers}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.sheetTitle}>Delete this chat?</Text>
          <Text style={styles.sheetBody}>
            This chat will be deleted only for you.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={sheet.close}
            style={({ pressed }) => [
              styles.keepButton,
              pressed && styles.sheetButtonPressed,
            ]}
          >
            <Text style={styles.keepButtonText}>Keep chat</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={deleting}
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteConfirmButton,
              pressed && styles.sheetButtonPressed,
            ]}
          >
            {deleting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.deleteConfirmText}>Delete</Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ConversationRow({
  conversation,
  deleting,
  onCloseActions,
  onOpen,
  onOpenActions,
  onPin,
  onRequestDelete,
  pinning,
  swipeOpen,
  styles,
}: {
  conversation: ConversationSummary;
  deleting: boolean;
  onCloseActions: () => void;
  onOpen: () => void;
  onOpenActions: () => void;
  onPin: () => void;
  onRequestDelete: () => void;
  pinning: boolean;
  swipeOpen: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const participant = conversation.otherParticipant;
  const title =
    conversation.kind === 'activity'
      ? (conversation.title ?? 'Activity')
      : conversation.kind === 'group'
        ? `${conversation.title ?? 'Group'} · ${conversation.memberCount}`
        : (participant?.displayName ?? 'Tastes user');
  const unread = conversation.unreadCount > 0;
  const activity = conversation.kind === 'activity';
  const group = conversation.kind === 'group';
  const avatarUrls = conversationAvatarUrls(conversation);
  const countdown = activity
    ? reservationCountdown(conversation.activityStartsAt)
    : null;
  const senderPrefix =
    group && conversation.lastMessage?.senderDisplayName
      ? `${conversation.lastMessage.senderDisplayName}: `
      : conversation.kind === 'direct' &&
          conversation.lastMessage &&
          conversation.lastMessage.senderId !== participant?.userId
        ? 'You: '
        : '';
  const translateX = useMemo(() => new Animated.Value(0), []);
  const actionWidth = responsiveSize(116);
  const [actionsVisible, setActionsVisible] = useState(swipeOpen);
  const openThreshold = responsiveSize(42);
  const swipeStartThreshold = responsiveSize(8);
  const touchStart = useRef({ pageX: 0, pageY: 0, translateX: 0 });
  const touchPosition = useRef({ pageX: 0, pageY: 0 });
  const handlingSwipe = useRef(false);
  useEffect(() => {
    if (swipeOpen) setActionsVisible(true);
    Animated.spring(translateX, {
      toValue: swipeOpen ? -actionWidth : 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0,
    }).start(({ finished }) => {
      if (finished && !swipeOpen) setActionsVisible(false);
    });
  }, [actionWidth, swipeOpen, translateX]);
  const onTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent;
      handlingSwipe.current = false;
      touchPosition.current = { pageX, pageY };
      translateX.stopAnimation((value) => {
        touchStart.current = { pageX, pageY, translateX: value };
      });
    },
    [translateX],
  );
  const onTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent;
      touchPosition.current = { pageX, pageY };
      const dx = pageX - touchStart.current.pageX;
      const dy = pageY - touchStart.current.pageY;
      if (
        !handlingSwipe.current &&
        Math.abs(dx) > swipeStartThreshold &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        handlingSwipe.current = true;
        setActionsVisible(true);
      }
      if (!handlingSwipe.current) return;
      translateX.setValue(
        Math.max(-actionWidth, Math.min(0, touchStart.current.translateX + dx)),
      );
    },
    [actionWidth, swipeStartThreshold, translateX],
  );
  const onTouchEnd = useCallback(() => {
    if (!handlingSwipe.current) return;
    const dx = touchPosition.current.pageX - touchStart.current.pageX;
    const finalX = touchStart.current.translateX + dx;
    const shouldOpen = swipeOpen ? dx < openThreshold : finalX < -openThreshold;
    if (shouldOpen) onOpenActions();
    else onCloseActions();
    Animated.spring(translateX, {
      toValue: shouldOpen ? -actionWidth : 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 0,
    }).start();
  }, [
    actionWidth,
    onCloseActions,
    onOpenActions,
    openThreshold,
    swipeOpen,
    translateX,
  ]);
  return (
    <View style={styles.swipeRow}>
      <View
        accessibilityElementsHidden={!swipeOpen}
        importantForAccessibility={swipeOpen ? 'yes' : 'no-hide-descendants'}
        style={[
          styles.swipeActions,
          !actionsVisible && styles.hiddenSwipeActions,
        ]}
      >
        <Pressable
          accessibilityLabel={conversation.pinned ? 'Unpin chat' : 'Pin chat'}
          accessibilityRole="button"
          disabled={pinning}
          onPress={onPin}
          style={({ pressed }) => [
            styles.swipeActionButton,
            pressed && styles.swipeActionPressed,
          ]}
        >
          {pinning ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <PinActionIcon color="#FFFFFF" fill="#FFFFFF" />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete conversation with ${title}`}
          accessibilityRole="button"
          disabled={deleting}
          onPress={onRequestDelete}
          style={({ pressed }) => [
            styles.swipeActionButton,
            pressed && styles.swipeActionPressed,
          ]}
        >
          {deleting ? (
            <ActivityIndicator color="#B82F29" />
          ) : (
            <DeleteActionIcon color="#B82F29" fill="#B82F29" />
          )}
        </Pressable>
      </View>
      <Animated.View
        style={[styles.swipeContent, { transform: [{ translateX }] }]}
      >
        <Pressable
          accessibilityHint="Swipe left or press and hold for chat actions"
          accessibilityRole="button"
          delayLongPress={350}
          onLongPress={onOpenActions}
          onPress={() => {
            if (handlingSwipe.current) return;
            if (swipeOpen) onCloseActions();
            else onOpen();
          }}
          onTouchEnd={onTouchEnd}
          onTouchMove={onTouchMove}
          onTouchStart={onTouchStart}
          style={({ pressed }) => [
            styles.row,
            activity && styles.activityRow,
            pressed && styles.rowPressed,
          ]}
        >
          {activity || group ? (
            <View style={styles.avatarStack}>
              {avatarUrls[0] ? (
                <Image
                  source={{ uri: avatarUrls[0] }}
                  style={styles.stackedAvatarPrimary}
                />
              ) : (
                <UserAvatar
                  displayName={title}
                  photoUrl={null}
                  style={styles.stackedAvatarPrimary}
                />
              )}
              <UserAvatar
                displayName={conversation.lastMessage?.senderDisplayName}
                photoUrl={avatarUrls[1] ?? null}
                style={styles.stackedAvatarSecondary}
              />
            </View>
          ) : (
            <UserAvatar
              displayName={title}
              photoUrl={avatarUrls[0] ?? null}
              style={styles.avatar}
            />
          )}
          <View style={[styles.rowCopy, activity && styles.activityRowCopy]}>
            <View style={styles.rowHeading}>
              {activity ? (
                <Text style={styles.activityBadge}>ACTIVITY</Text>
              ) : null}
            </View>
            <View style={styles.rowHeading}>
              <Text
                numberOfLines={1}
                style={[styles.name, unread && styles.unreadName]}
              >
                {title}
              </Text>
              <Text
                style={[
                  styles.time,
                  (unread || countdown) && styles.unreadTime,
                ]}
              >
                {countdown ?? relativeTime(conversation.updatedAt)}
              </Text>
            </View>
            {activity ? (
              <Text numberOfLines={1} style={styles.activityMeta}>
                {activitySubtitle(
                  conversation.activityStartsAt,
                  conversation.memberCount,
                )}
              </Text>
            ) : null}
            <View style={styles.previewRow}>
              <Text
                numberOfLines={1}
                style={[styles.preview, unread && styles.unreadPreview]}
              >
                {senderPrefix}
                {conversation.lastMessage?.text ??
                  (conversation.kind === 'activity'
                    ? 'Activity created'
                    : conversation.kind === 'group'
                      ? 'Group created'
                      : 'Conversation started')}
              </Text>
              {conversation.pinned ? (
                <View
                  accessibilityLabel="Pinned chat"
                  style={styles.pinnedBadge}
                >
                  <PinnedStatusIcon color="#FFFFFF" fill="#FFFFFF" />
                </View>
              ) : null}
              {unread ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {Math.min(conversation.unreadCount, 99)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
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
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [suppressedInviteId, setSuppressedInviteId] = useState<string | null>(
    null,
  );
  const [requestCount, setRequestCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [swipedConversationId, setSwipedConversationId] = useState<
    string | null
  >(null);
  const [deleteCandidate, setDeleteCandidate] =
    useState<ConversationSummary | null>(null);
  const [pinnedOverrides, setPinnedOverrides] = useState<
    Record<string, boolean>
  >({});
  // This only feeds the badge count next to the Requests button, and the
  // inbox stays mounted behind other screens (e.g. an open chat), so a
  // transient failure here must fail quietly rather than interrupt whatever
  // screen the user is actually looking at. RequestsScreen alerts on its own
  // load failure since that one is a direct result of the user opening it.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void api
        .listRequests()
        .then((response) => {
          if (active) setRequestCount(response.data.length);
        })
        .catch(() => {
          if (active) setRequestCount(0);
        });
      return () => {
        active = false;
      };
    }, [api]),
  );
  const inbox = useConversationInbox(userId);
  const conversationHistory = useInfiniteQuery({
    queryKey: conversationHistoryQueryKey(userId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await api.listConversations({ cursor: pageParam, limit: 50 })).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const inboxItems = useMemo(() => {
    const byId = new Map<string, ConversationSummary>();
    conversationHistory.data?.pages
      .flatMap((page) => page.items)
      .forEach((conversation) => byId.set(conversation.id, conversation));
    inbox.data.forEach((conversation) =>
      byId.set(conversation.id, conversation),
    );
    return [...byId.values()]
      .map((conversation) => ({
        ...conversation,
        pinned: pinnedOverrides[conversation.id] ?? conversation.pinned,
      }))
      .sort((left, right) => compareConversations(left, right));
  }, [conversationHistory.data?.pages, inbox.data, pinnedOverrides]);
  const pendingInvitation = inboxItems.find(
    (conversation) =>
      conversation.kind === 'activity' &&
      conversation.invitationStatus === 'pending' &&
      conversation.activityId !== suppressedInviteId,
  );
  const pendingActivityId = pendingInvitation?.activityId ?? null;
  const closeInvitation = useCallback(() => {
    if (pendingActivityId) setSuppressedInviteId(pendingActivityId);
  }, [pendingActivityId]);
  const normalizedSearch = search.trim().toLowerCase();
  const conversations = inboxItems.filter(
    (conversation) =>
      !normalizedSearch ||
      conversation.title?.toLowerCase().includes(normalizedSearch) ||
      conversation.otherParticipant?.displayName
        .toLowerCase()
        .includes(normalizedSearch) ||
      conversation.otherParticipant?.username
        ?.toLowerCase()
        .includes(normalizedSearch),
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      setDeletingId(conversationId);
      try {
        await api.hideConversation({ conversationId });
        await conversationHistory.refetch();
        setDeleteCandidate(null);
        setSwipedConversationId(null);
      } catch {
        Alert.alert('Could not delete chat', 'Please try again.');
      } finally {
        setDeletingId(null);
      }
    },
    [api, conversationHistory],
  );

  const pinConversation = useCallback(
    async (conversation: ConversationSummary) => {
      const pinned = !conversation.pinned;
      setPinningId(conversation.id);
      setPinnedOverrides((current) => ({
        ...current,
        [conversation.id]: pinned,
      }));
      setSwipedConversationId(null);
      try {
        await api.setConversationPinned({
          conversationId: conversation.id,
          pinned,
        });
        await conversationHistory.refetch();
      } catch {
        setPinnedOverrides((current) => ({
          ...current,
          [conversation.id]: conversation.pinned,
        }));
        Alert.alert('Could not update chat', 'Please try again.');
      } finally {
        setPinningId(null);
      }
    },
    [api, conversationHistory],
  );

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.titleRow}>
          <View style={styles.headerButton} />
          <Text style={styles.title}>Chats</Text>
          <Pressable
            accessibilityLabel="New chat"
            onPress={() => setNewDialogOpen(true)}
            style={styles.headerButton}
          >
            <View style={styles.addCircle}>
              <Text style={styles.addText}>+</Text>
            </View>
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <SearchIcon
              color={colors.textSecondary}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
            <TextInput
              autoCorrect={false}
              onChangeText={setSearch}
              placeholder="Search"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              value={search}
            />
          </View>
          <Pressable
            accessibilityLabel={
              requestCount > 0 ? `Requests, ${requestCount} unread` : 'Requests'
            }
            onPress={onOpenRequests}
            style={styles.requestsButton}
          >
            <Text style={styles.requests}>Requests</Text>
            {requestCount > 0 ? (
              <View style={styles.requestsBadge}>
                <Text style={styles.requestsBadgeText}>
                  {Math.min(requestCount, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.08 }}
        resizeMode="stretch"
        source={isDark ? dialogPattern : lightDialogPattern}
        style={[styles.patternBody, { backgroundColor: colors.canvas }]}
      >
        <PatternBackgroundLift />
        {inbox.loading && conversationHistory.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (inbox.error ?? conversationHistory.error) &&
          inboxItems.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.stateTitle}>Could not load messages</Text>
            <Text style={styles.stateCopy}>
              {(inbox.error ?? conversationHistory.error)?.message}
            </Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              conversations.length === 0 && styles.emptyContent,
            ]}
            data={conversations}
            initialNumToRender={10}
            keyExtractor={(item) => item.id}
            maxToRenderPerBatch={10}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyGlyph}>
                  <Text style={styles.emptyGlyphText}>···</Text>
                </View>
                <Text style={styles.stateTitle}>
                  {search ? 'No conversations found' : 'No messages yet'}
                </Text>
                <Text style={styles.stateCopy}>
                  {search
                    ? 'Try another name or username.'
                    : 'Conversations with mutual followers will appear here.'}
                </Text>
              </View>
            }
            ListFooterComponent={
              conversationHistory.isFetchingNextPage ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ paddingVertical: responsiveSize(20) }}
                />
              ) : null
            }
            onEndReached={() => {
              if (
                conversationHistory.hasNextPage &&
                !conversationHistory.isFetchingNextPage
              )
                void conversationHistory.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            windowSize={7}
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                deleting={deletingId === item.id}
                onCloseActions={() => setSwipedConversationId(null)}
                onOpen={() => onOpenConversation(item.id)}
                onOpenActions={() => setSwipedConversationId(item.id)}
                onPin={() => void pinConversation(item)}
                onRequestDelete={() => setDeleteCandidate(item)}
                pinning={pinningId === item.id}
                swipeOpen={swipedConversationId === item.id}
                styles={styles}
              />
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ImageBackground>
      <DeleteConversationSheet
        deleting={Boolean(deleteCandidate && deletingId === deleteCandidate.id)}
        onClose={() => {
          if (deletingId) return;
          setDeleteCandidate(null);
          setSwipedConversationId(null);
        }}
        onDelete={() => {
          if (deleteCandidate) void deleteConversation(deleteCandidate.id);
        }}
        visible={deleteCandidate !== null}
      />
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
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  const isDark = colors.background === '#080808';
  return responsiveStyleSheet({
    screen: { flex: 1 },
    patternBody: { flex: 1 },
    header: {
      paddingTop: 0,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor:
        colors.background === '#080808' ? colors.background : colors.surface,
    },
    titleRow: { height: 51, flexDirection: 'row', alignItems: 'center' },
    title: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: -0.4,
    },
    headerButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addCircle: {
      width: 22,
      height: 22,
      borderWidth: 1.5,
      borderColor: colors.text,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: {
      color: colors.text,
      fontSize: 19,
      lineHeight: 19,
      fontWeight: '300',
    },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    requestsButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    searchBox: {
      flex: 1,
      height: 39,
      paddingHorizontal: 10,
      borderRadius: 20,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
      marginLeft: 8,
      paddingVertical: 0,
    },
    requests: { color: colors.textSecondary, fontSize: 14 },
    requestsBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    requestsBadgeText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '800',
    },
    listContent: { paddingTop: 10, paddingBottom: 24 },
    list: { flex: 1 },
    emptyContent: { flexGrow: 1 },
    swipeRow: {
      minHeight: 76,
      overflow: 'hidden',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: 'transparent',
    },
    swipeContent: { backgroundColor: 'transparent' },
    swipeActions: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 116,
      flexDirection: 'row',
      borderLeftWidth: 1,
      borderLeftColor: '#45474B',
      backgroundColor: '#282828',
    },
    hiddenSwipeActions: { opacity: 0 },
    swipeActionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swipeActionPressed: { backgroundColor: '#45474B' },
    row: {
      minHeight: 76,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    activityRow: { minHeight: 101 },
    rowPressed: { backgroundColor: colors.surfaceRaised },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.skeleton,
    },
    avatarStack: { width: 49, height: 57 },
    stackedAvatarPrimary: {
      width: 42,
      height: 42,
      borderRadius: 21,
    },
    stackedAvatarSecondary: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 30,
      height: 30,
      borderWidth: 2,
      borderColor: colors.canvas,
      borderRadius: 15,
      backgroundColor: colors.surfaceRaised,
    },
    rowCopy: { flex: 1, height: 64, marginLeft: 13, justifyContent: 'center' },
    activityRowCopy: { height: 86 },
    rowHeading: { flexDirection: 'row', alignItems: 'center' },
    name: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
    activityBadge: {
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
      overflow: 'hidden',
      color: colors.primary,
      backgroundColor: 'rgba(230,57,70,0.16)',
      fontSize: 9,
      fontWeight: '700',
    },
    activityMeta: { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
    unreadName: { fontWeight: '800' },
    time: {
      color: isDark ? '#677083' : colors.textMuted,
      marginLeft: 10,
      fontSize: 12,
    },
    unreadTime: { color: colors.primary, fontWeight: '700' },
    previewRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center' },
    preview: {
      flex: 1,
      color: isDark ? '#AAB2C5' : colors.textSecondary,
      fontSize: 14,
    },
    unreadPreview: { color: colors.textSecondary, fontWeight: '600' },
    pinnedBadge: {
      width: 16,
      height: 16,
      marginLeft: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      minWidth: 21,
      height: 21,
      marginLeft: 8,
      paddingHorizontal: 6,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    badgeText: { color: colors.onPrimary, fontSize: 11, fontWeight: '800' },
    center: {
      flex: 1,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      flex: 1,
      paddingHorizontal: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyGlyph: {
      width: 68,
      height: 68,
      marginBottom: 18,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    emptyGlyphText: {
      color: colors.primary,
      fontSize: 27,
      fontWeight: '800',
      marginTop: -10,
    },
    stateTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '700',
      textAlign: 'center',
    },
    stateCopy: {
      color: colors.textMuted,
      marginTop: 7,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
}

const createDeleteSheetStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    sheet: {
      paddingTop: 34,
      paddingHorizontal: 20,
      paddingBottom: 24,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    dragArea: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    handle: {
      position: 'absolute',
      top: 10,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '700',
      textAlign: 'center',
    },
    sheetBody: {
      marginTop: 8,
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    keepButton: {
      width: '100%',
      height: 48,
      marginTop: 24,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    keepButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    deleteConfirmButton: {
      width: '100%',
      minHeight: 44,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteConfirmText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    sheetButtonPressed: { opacity: 0.7 },
  });
