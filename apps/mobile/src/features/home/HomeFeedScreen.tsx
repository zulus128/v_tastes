import type { FeedItem } from '@tastes/contracts';
import { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ErrorState, ListFooter, LoadingState, Screen } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useFeed } from './api';
import avatar from '../../../assets/home/avatar.png';

function FeedCard({ item, onComments }: { item: FeedItem; onComments: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <Image source={avatar} style={styles.avatar} />
        <View style={styles.authorCopy}>
          <Text style={styles.author}>{item.authorDisplayName}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.rating}>{'★'.repeat(Math.round(item.rating))}</Text>
      </View>
      <Text style={styles.venue}>{item.venueName}</Text>
      <Text style={styles.review}>{item.text}</Text>
      <View style={styles.metrics}>
        <Text style={styles.metric}>♥ {item.reactionCount}</Text>
        <Pressable onPress={onComments}>
          <Text style={styles.metric}>◯ {item.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function HomeFeedScreen({
  onOpenComments,
  onOpenLeaderboard,
}: {
  onOpenComments: (reviewId: string) => void;
  onOpenLeaderboard: () => void;
}) {
  const [scope, setScope] = useState<'friends' | 'local'>('friends');
  const query = useFeed(scope);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={onOpenLeaderboard} style={styles.headerIcon}><Text style={styles.headerIconText}>◫</Text></Pressable>
          <Text style={styles.logo}>tastes</Text>
          <View style={styles.headerIcon}><Text style={styles.headerIconText}>♢</Text></View>
        </View>
        <View style={styles.switcher}>
          {(['friends', 'local'] as const).map((value) => (
            <Pressable key={value} onPress={() => setScope(value)} style={[styles.switch, scope === value && styles.switchActive]}>
              <Text style={[styles.switchText, scope === value && styles.switchTextActive]}>
                {value === 'friends' ? 'Friends' : 'Local'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {query.isPending ? <LoadingState label="Loading your feed…" /> : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          contentContainerStyle={[styles.content, items.length === 0 && styles.emptyContent]}
          data={items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No posts here yet.</Text>}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => <FeedCard item={item} onComments={() => onOpenComments(item.id)} />}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 157, paddingTop: 54, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: theme.colors.background },
  headerTop: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerIconText: { color: theme.colors.text, fontSize: 23 },
  logo: { color: theme.colors.text, fontSize: 21, fontWeight: '800' },
  switcher: { height: 40, marginTop: 7, padding: 4, flexDirection: 'row', borderRadius: theme.radius.pill, backgroundColor: 'rgba(223,223,233,0.12)' },
  switch: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  switchActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: '#C4CAD7', opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: theme.colors.surface, opacity: 1, fontWeight: '700' },
  list: { flex: 1 },
  content: { padding: 15, gap: 16 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: theme.colors.textMuted, textAlign: 'center', fontSize: 15 },
  card: { gap: 12, padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorCopy: { flex: 1, paddingLeft: 10 },
  author: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  date: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  rating: { color: '#D33B35', fontSize: 14 },
  venue: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  review: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 20 },
  metrics: { paddingTop: 10, flexDirection: 'row', gap: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  metric: { color: theme.colors.textMuted, fontSize: 13 },
});
