import type { Comment } from '@tastes/contracts';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { ErrorState, ListFooter, LoadingState, Screen } from '../../ui/components';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useAddComment, useComments } from './api';

function CommentRow({ item }: { item: Comment }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.avatar}><Text style={styles.initial}>{item.authorDisplayName.slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.copy}>
        <View style={styles.meta}>
          <Text style={styles.author}>{item.authorDisplayName}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.text}>{item.text}</Text>
      </View>
    </View>
  );
}

export function PaginatedCommentsScreen({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('comment'));
  const query = useComments(reviewId);
  const mutation = useAddComment(reviewId);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function submit() {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    await mutation.mutateAsync({ idempotencyKey, text: value });
    setText('');
    setIdempotencyKey(createIdempotencyKey('comment'));
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
          data={items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No comments yet. Be the first.</Text>}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => <CommentRow item={item} />}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          editable={!mutation.isPending}
          maxLength={1_000}
          onChangeText={(value) => {
            if (!text && value) setIdempotencyKey(createIdempotencyKey('comment'));
            setText(value);
          }}
          onSubmitEditing={() => void submit()}
          placeholder="Add comment"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={text}
        />
        <Pressable disabled={!text.trim() || mutation.isPending} onPress={() => void submit()} style={styles.send}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
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
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#45312E' },
  initial: { color: colors.onPrimary, fontWeight: '700' },
  copy: { flex: 1, gap: 6 },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  author: { color: colors.text, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12 },
  text: { color: colors.text, opacity: 0.82, lineHeight: 19 },
  composer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.background },
  input: { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: theme.radius.pill, color: colors.text, backgroundColor: colors.surfaceRaised },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendText: { color: colors.onPrimary, fontSize: 23, fontWeight: '700' },
});
