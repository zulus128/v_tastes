import type { LeaderboardEntry } from '@tastes/contracts';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ErrorState, ListFooter, LoadingState, Screen } from '../../ui/components';
import { theme } from '../../ui/theme';
import { useLeaderboard } from './api';

function RankingRow({ item }: { item: LeaderboardEntry }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{item.rank}</Text>
      <View style={styles.avatar}><Text style={styles.initial}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>
      <Text numberOfLines={1} style={styles.name}>{item.displayName}</Text>
      <Text style={styles.xp}>{item.xp} XP</Text>
    </View>
  );
}

export function PaginatedLeaderboardScreen({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<'month' | 'allTime'>('month');
  const query = useLeaderboard(period);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.back}><Text style={styles.info}>ⓘ</Text></View>
      </View>
      <View style={styles.period}>
        {(['month', 'allTime'] as const).map((value) => (
          <Pressable key={value} onPress={() => setPeriod(value)} style={[styles.periodButton, period === value && styles.periodActive]}>
            <Text style={[styles.periodText, period === value && styles.periodTextActive]}>{value === 'month' ? 'Month' : 'All-time'}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.nudge}>{period === 'month' ? '🏅 Month leaders · Top 3 earn a badge' : 'All-time ranking'}</Text>
      {query.isPending ? <LoadingState label="Loading leaderboard…" /> : query.isError ? (
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          contentContainerStyle={[styles.content, items.length === 0 && styles.emptyContent]}
          data={items}
          keyExtractor={(item) => item.userId}
          ListEmptyComponent={<Text style={styles.empty}>No friends ranked yet.</Text>}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => <RankingRow item={item} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 102, paddingTop: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.background },
  back: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { color: theme.colors.text, fontSize: 38, lineHeight: 39, fontWeight: '300' },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '700' },
  info: { color: theme.colors.text, fontSize: 18 },
  period: { height: 40, margin: 12, padding: 4, flexDirection: 'row', borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised },
  periodButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  periodActive: { backgroundColor: '#D9DDE5' },
  periodText: { color: theme.colors.textMuted },
  periodTextActive: { color: theme.colors.surface, fontWeight: '700' },
  nudge: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 8 },
  content: { paddingBottom: 24 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  empty: { color: theme.colors.textMuted, textAlign: 'center', padding: 32 },
  row: { height: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, backgroundColor: 'rgba(22,22,22,0.88)' },
  rank: { width: 24, color: theme.colors.textMuted, textAlign: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#54332D' },
  initial: { color: theme.colors.text, fontWeight: '700' },
  name: { flex: 1, color: theme.colors.text, fontWeight: '600' },
  xp: { color: theme.colors.textMuted },
});
