import type { FeedItem } from '@tastes/contracts';
import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { storage } from '../../infrastructure/firebase';
import { ErrorState, ListFooter, Screen } from '../../ui/components';
import { NotificationsGlyph, StatsGlyph, TastesLogo } from '../../ui/FigmaIcons';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useFeed, useReactToReview } from './api';
import {
  HomeFeedEmptyState,
  HomeFeedLoadingState,
  HomeFeedOfflineState,
} from './HomeFeedStates';
import avatar from '../../../assets/home/avatar.png';

const tagLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

function DishPhoto({ photoPath }: { photoPath: string }) {
  const [uri, setUri] = useState<string>();

  useEffect(() => {
    let active = true;
    void getDownloadURL(ref(storage, photoPath))
      .then((nextUri) => {
        if (active) setUri(nextUri);
      })
      .catch(() => {
        if (active) setUri(undefined);
      });
    return () => {
      active = false;
    };
  }, [photoPath]);

  return uri ? <Image source={{ uri }} style={stylesStatic.dishPhoto} /> : <View style={stylesStatic.dishPhotoPlaceholder} />;
}

function isOfflineError(error: Error) {
  const code = (error as Error & { code?: string }).code;
  return code === 'unavailable' || code === 'deadline-exceeded';
}

function FeedCard({
  item,
  onComments,
  onReaction,
  reactionDisabled,
}: {
  item: FeedItem;
  onComments: () => void;
  onReaction: () => void;
  reactionDisabled: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Persisted query caches and reviews created before Increment 2 do not have
  // the new arrays. Keep those records renderable while the cache refreshes.
  const dishReviews = item.dishReviews ?? [];
  const tags = item.tags ?? [];
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
      {dishReviews.length > 0 ? (
        <ScrollView contentContainerStyle={styles.dishes} horizontal showsHorizontalScrollIndicator={false}>
          {dishReviews.map((dish) => (
            <View key={dish.id} style={styles.dish}>
              <DishPhoto photoPath={dish.photoPath} />
              <View style={styles.dishCopy}>
                <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => <Text key={tag} style={styles.tag}>{tagLabels[tag] ?? tag}</Text>)}
        </View>
      ) : null}
      <View style={styles.metrics}>
        <Pressable disabled={reactionDisabled} onPress={onReaction}>
          <Text style={[styles.metric, reactionDisabled ? styles.metricDisabled : undefined]}>♥ {item.reactionCount}</Text>
        </Pressable>
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
  const reactionMutation = useReactToReview();
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
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onComments={() => onOpenComments(item.id)}
              reactionDisabled={reactionMutation.isPending}
              onReaction={() => {
                void reactionMutation.mutateAsync(item.id);
              }}
            />
          )}
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
  dishes: { gap: 10 },
  dish: { width: 126, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  dishCopy: { gap: 3, padding: 9 },
  dishTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  dishRating: { color: '#D33B35', fontSize: 12, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: colors.surfaceRaised, color: colors.textSecondary, fontSize: 12 },
  metrics: { paddingTop: 10, flexDirection: 'row', gap: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metric: { color: colors.textMuted, fontSize: 13 },
  metricDisabled: { opacity: 0.5 },
});

const stylesStatic = StyleSheet.create({
  dishPhoto: { width: 124, height: 84, backgroundColor: '#ECEEF2' },
  dishPhotoPlaceholder: { width: 124, height: 84, backgroundColor: '#ECEEF2' },
});
