import type { FeedItem } from '@tastes/contracts';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ErrorState, ListFooter, Screen } from '../../ui/components';
import { NotificationsGlyph, StatsGlyph, TastesLogo } from '../../ui/FigmaIcons';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useFeed } from './api';
import {
  HomeFeedEmptyState,
  HomeFeedLoadingState,
  HomeFeedOfflineState,
} from './HomeFeedStates';
import avatar from '../../../assets/home/avatar.png';

function isOfflineError(error: Error) {
  const code = (error as Error & { code?: string }).code;
  return code === 'unavailable' || code === 'deadline-exceeded';
}

function FeedCard({ item, onComments }: { item: FeedItem; onComments: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  onExplore,
  onOpenComments,
  onOpenLeaderboard,
}: {
  onExplore: () => void;
  onOpenComments: (reviewId: string) => void;
  onOpenLeaderboard: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [scope, setScope] = useState<'friends' | 'local'>('friends');
  const query = useFeed(scope);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen background="homeFeed">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            accessibilityLabel="Open leaderboard"
            onPress={onOpenLeaderboard}
            style={styles.headerIcon}
          >
            <StatsGlyph />
          </Pressable>
          <TastesLogo />
          <View style={styles.headerIcon}>
            <NotificationsGlyph />
          </View>
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
      {query.isPending ? <HomeFeedLoadingState /> : query.isError && items.length === 0 ? (
        isOfflineError(query.error) ? (
          <HomeFeedOfflineState onRetry={() => void query.refetch()} />
        ) : (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        )
      ) : items.length === 0 ? (
        <HomeFeedEmptyState onAction={onExplore} scope={scope} />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={items}
          keyExtractor={(item) => item.id}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => <FeedCard item={item} onComments={() => onOpenComments(item.id)} />}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: { height: 157, paddingTop: 54, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.background },
  headerTop: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  switcher: { height: 40, marginTop: 7, padding: 4, flexDirection: 'row', borderRadius: theme.radius.pill, backgroundColor: colors.surfaceRaised },
  switch: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  switchActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: colors.textSecondary, opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: '#161616', opacity: 1, fontWeight: '700' },
  list: { flex: 1 },
  content: { padding: 15, gap: 16 },
  card: { gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: theme.radius.lg, backgroundColor: colors.surface },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorCopy: { flex: 1, paddingLeft: 10 },
  author: { color: colors.text, fontSize: 14, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rating: { color: '#D33B35', fontSize: 14 },
  venue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  review: { color: colors.text, opacity: 0.78, fontSize: 14, lineHeight: 20 },
  metrics: { paddingTop: 10, flexDirection: 'row', gap: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metric: { color: colors.textMuted, fontSize: 13 },
});
