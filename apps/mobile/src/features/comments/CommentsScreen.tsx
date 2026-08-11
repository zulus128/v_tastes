import type { Comment, ReportReason } from '@tastes/contracts';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { ErrorState, ListFooter, LoadingState, Screen } from '../../ui/components';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useAddComment, useComments, useDeleteComment, useReactToComment } from './api';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';

const commentReportReasons: Array<{ label: string; value: ReportReason }> = [
  { label: 'Spam or scam', value: 'Spam' },
  { label: 'Inappropriate content', value: 'Inappropriate' },
  { label: 'Harassment or bullying', value: 'Harassment' },
  { label: 'Hate speech or symbols', value: 'Hate' },
  { label: 'Violence or dangerous acts', value: 'Safety risk' },
  { label: 'False information', value: 'Misinformation' },
  { label: 'Something else', value: 'Something else' },
];

function CommentRow({ item, nested = false, onDelete, onReact, onReply, onReport }: { item: Comment; nested?: boolean; onDelete?: () => void; onReact: () => void; onReply: () => void; onReport: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onLongPress={() => Alert.alert(item.authorDisplayName, 'Comment options', [
      { text: 'Copy', onPress: () => void Clipboard.setStringAsync(item.text) },
      { text: 'Share', onPress: () => void Share.share({ message: `${item.authorDisplayName}: ${item.text}` }) },
      { text: 'Report', style: 'destructive', onPress: onReport },
      ...(onDelete ? [{ text: 'Delete', style: 'destructive' as const, onPress: onDelete }] : []),
      { text: 'Cancel', style: 'cancel' },
    ])} style={[styles.row, nested && styles.nestedRow]}>
      <View style={styles.avatar}><Text style={styles.initial}>{item.authorDisplayName.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.copy}>
        <View style={styles.meta}>
          <Text style={styles.author}>{item.authorDisplayName}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.text}>{item.text}</Text>
        <View style={styles.actions}>
          <Pressable onPress={onReact}><Text style={[styles.action, item.reacted && styles.actionActive]}>♥ {item.reactionCount || ''}</Text></Pressable>
          <Pressable onPress={onReply}><Text style={styles.action}>Reply</Text></Pressable>
          <Pressable onPress={() => void Share.share({ message: `${item.authorDisplayName}: ${item.text}` })}><Text style={styles.action}>Share</Text></Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export function PaginatedCommentsScreen({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const api = useTastesApi();
  const currentUserId = useAuthenticatedUserId();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('comment'));
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('Inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [hiddenReplies, setHiddenReplies] = useState<Set<string>>(new Set());
  const query = useComments(reviewId);
  const mutation = useAddComment(reviewId);
  const reaction = useReactToComment(reviewId);
  const deletion = useDeleteComment(reviewId);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const rootItems = items.filter((item) => !item.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  items.filter((item) => item.parentCommentId).forEach((item) => {
    const replies = repliesByParent.get(item.parentCommentId!) ?? [];
    replies.push(item);
    repliesByParent.set(item.parentCommentId!, replies);
  });

  async function submit() {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    await mutation.mutateAsync({ idempotencyKey, parentCommentId: replyTarget?.id ?? null, text: value });
    setText('');
    setReplyTarget(null);
    setIdempotencyKey(createIdempotencyKey('comment'));
  }

  async function submitReport() {
    if (!reportCommentId || reporting) return;
    setReporting(true);
    try {
      await api.reportComment({ idempotencyKey: createIdempotencyKey('comment-report'), reviewId, commentId: reportCommentId, reason: reportReason, details: reportDetails || undefined });
      setReportCommentId(null); setReportDetails(''); setReportReason('Inappropriate'); setReportSent(true);
    } catch { Alert.alert('Could not send report', 'Please try again.'); } finally { setReporting(false); }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>Comments</Text>
        <View style={styles.back} />
      </View>
      {query.isPending ? <LoadingState label="Loading comments…" /> : query.isError && items.length === 0 ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          contentContainerStyle={[styles.content, items.length === 0 && styles.emptyContent]}
          data={rootItems}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No comments yet. Be the first.</Text>}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const replies = repliesByParent.get(item.id) ?? [];
            const hidden = hiddenReplies.has(item.id);
            return <View><CommentRow item={item} onDelete={item.authorId === currentUserId ? () => deletion.mutate(item.id) : undefined} onReact={() => reaction.mutate({ commentId: item.id, idempotencyKey: createIdempotencyKey('comment-reaction') })} onReply={() => setReplyTarget(item)} onReport={() => setReportCommentId(item.id)} />
              {replies.length > 0 ? <Pressable onPress={() => setHiddenReplies((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} style={styles.repliesToggle}><Text style={styles.repliesToggleText}>{hidden ? `Show ${replies.length} replies` : 'Hide replies'}</Text></Pressable> : null}
              {!hidden ? replies.map((reply) => <CommentRow key={reply.id} item={reply} nested onDelete={reply.authorId === currentUserId ? () => deletion.mutate(reply.id) : undefined} onReact={() => reaction.mutate({ commentId: reply.id, idempotencyKey: createIdempotencyKey('comment-reaction') })} onReply={() => setReplyTarget(item)} onReport={() => setReportCommentId(reply.id)} />) : null}
            </View>;
          }}
        />
      )}
      <View style={styles.composer}>
        {replyTarget ? <View style={styles.replyBanner}><Text numberOfLines={1} style={styles.replyBannerText}>Replying to {replyTarget.authorDisplayName}</Text><Pressable onPress={() => setReplyTarget(null)}><Text style={styles.replyClose}>×</Text></Pressable></View> : null}
        <TextInput
          editable={!mutation.isPending}
          maxLength={1_000}
          onChangeText={(value) => {
            if (!text && value) setIdempotencyKey(createIdempotencyKey('comment'));
            setText(value);
          }}
          onSubmitEditing={() => void submit()}
          placeholder={replyTarget ? `Reply to ${replyTarget.authorDisplayName}` : 'Add comment'}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={text}
        />
        <Pressable disabled={!text.trim() || mutation.isPending} onPress={() => void submit()} style={styles.send}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
      <Modal animationType="slide" transparent visible={reportCommentId !== null} onRequestClose={() => setReportCommentId(null)}><View style={styles.reportScrim}><Pressable onPress={() => setReportCommentId(null)} style={StyleSheet.absoluteFill} /><View style={styles.reportSheet}><Text style={styles.reportTitle}>Why are you reporting this comment?</Text>{commentReportReasons.map((reason) => <Pressable key={reason.value} onPress={() => setReportReason(reason.value)} style={styles.reportRow}><Text style={styles.reportLabel}>{reason.label}</Text><Text style={styles.reportRadio}>{reportReason === reason.value ? '●' : '○'}</Text></Pressable>)}{reportReason === 'Something else' ? <View><TextInput maxLength={300} multiline onChangeText={setReportDetails} placeholder="Tell us what happened…" placeholderTextColor={colors.textMuted} style={styles.reportInput} value={reportDetails} /><Text style={styles.reportCounter}>{reportDetails.length}/300</Text></View> : null}<Pressable disabled={reporting} onPress={() => void submitReport()} style={styles.reportButton}><Text style={styles.reportButtonText}>{reporting ? 'Submitting…' : 'Submit report'}</Text></Pressable></View></View></Modal>
      <Modal animationType="fade" onRequestClose={() => setReportSent(false)} visible={reportSent}><View style={styles.sent}><View style={styles.sentIcon}><Text style={styles.sentCheck}>✓</Text></View><Text style={styles.sentTitle}>Report sent</Text><Text style={styles.sentCopy}>Thanks for helping keep Tastes safe. Our team will review this shortly.</Text><Pressable onPress={() => setReportSent(false)} style={styles.sentDone}><Text style={styles.sentDoneText}>Done</Text></Pressable></View></Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: { height: 102, paddingTop: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background },
  back: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 38, lineHeight: 39, fontWeight: '300' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  content: { paddingBottom: 88 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: colors.textMuted, textAlign: 'center', padding: 32 },
  row: { padding: 16, flexDirection: 'row', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.surface },
  nestedRow: { marginLeft: 46, paddingTop: 10, paddingBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#45312E' },
  initial: { color: colors.onPrimary, fontWeight: '700' },
  copy: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  author: { color: colors.text, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12 },
  text: { color: colors.text, opacity: 0.82, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 3 },
  action: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  actionActive: { color: colors.primary },
  repliesToggle: { marginLeft: 62, paddingVertical: 8 },
  repliesToggleText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 70, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background },
  replyBanner: { position: 'absolute', left: 16, right: 16, top: -30, height: 30, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  replyBannerText: { flex: 1, color: colors.textMuted, fontSize: 12 },
  replyClose: { color: colors.text, fontSize: 20 },
  input: { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: theme.radius.pill, color: colors.text, backgroundColor: colors.surfaceRaised },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendText: { color: colors.onPrimary, fontSize: 23, fontWeight: '700' },
  reportScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  reportSheet: { padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  reportTitle: { marginBottom: 8, color: colors.text, fontSize: 20, fontWeight: '700' },
  reportRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  reportLabel: { color: colors.text, fontSize: 15 },
  reportRadio: { color: colors.primary, fontSize: 18 },
  reportInput: { height: 88, marginTop: 12, padding: 12, borderRadius: 12, color: colors.text, backgroundColor: colors.surfaceRaised, textAlignVertical: 'top' },
  reportCounter: { marginTop: 4, color: colors.textMuted, fontSize: 12, textAlign: 'right' },
  reportButton: { height: 52, marginTop: 16, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  reportButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  sent: { flex: 1, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  sentIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sentCheck: { color: colors.onPrimary, fontSize: 34, fontWeight: '800' },
  sentTitle: { marginTop: 24, color: colors.text, fontSize: 24, fontWeight: '700' },
  sentCopy: { marginTop: 10, color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sentDone: { position: 'absolute', left: 36, right: 36, bottom: 34, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sentDoneText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});
