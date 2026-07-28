import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FriendsEmptyIcon from '../../../assets/figma-icons/home-empty-friends.svg';
import LocalEmptyIcon from '../../../assets/figma-icons/home-empty-local.svg';
import OfflineIcon from '../../../assets/figma-icons/home-offline.svg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type FeedScope = 'friends' | 'local';

function useStyles() {
  const { colors } = useAppTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

export function HomeFeedEmptyState({
  onAction,
  scope,
}: {
  onAction: () => void;
  scope: FeedScope;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const friends = scope === 'friends';
  const Icon = friends ? FriendsEmptyIcon : LocalEmptyIcon;

  return (
    <View style={styles.centeredState}>
      <View style={[styles.stateContent, styles.emptyStateOffset]}>
        <Icon color={colors.text} width={60} height={60} />
        <Text style={styles.title}>
          {friends ? 'Your feed is quiet' : 'No posts in your city yet'}
        </Text>
        <Text style={styles.body}>
          {friends
            ? 'Follow friends to see their reviews and recommendations here.'
            : 'Be the first to review a place in Monaco — your post starts the feed.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>
            {friends ? 'Find friends' : 'Browse restaurants'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function HomeFeedOfflineState({ onRetry }: { onRetry: () => void }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
      <View style={styles.centeredState}>
      <View style={styles.stateContent}>
        <View style={styles.offlineIcon}>
          <OfflineIcon color={colors.text} width={53.75} height={53.75} />
        </View>
        <Text style={styles.title}>No connection</Text>
        <Text style={styles.body}>Check your internet connection and try again.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SkeletonPost() {
  const styles = useStyles();
  return (
    <View style={styles.skeletonPost}>
      <View style={styles.skeletonHeader}>
        <View style={styles.skeletonAvatar} />
        <View style={styles.skeletonIdentity}>
          <View style={styles.skeletonName} />
          <View style={styles.skeletonMeta} />
        </View>
      </View>
      <View style={styles.skeletonPhotos}>
        <View style={styles.skeletonPhoto} />
        <View style={styles.skeletonPhoto} />
        <View style={styles.skeletonPhoto} />
      </View>
      <View style={styles.skeletonLineLong} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

export function HomeFeedLoadingState() {
  const styles = useStyles();
  return (
    <View accessibilityLabel="Loading feed" style={styles.loading}>
      <SkeletonPost />
      <SkeletonPost />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContent: {
    width: 320,
    alignItems: 'center',
    gap: 14,
  },
  emptyStateOffset: {
    transform: [{ translateY: -14 }],
  },
  offlineIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    width: '100%',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  body: {
    width: '100%',
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 18,
    textAlign: 'center',
  },
  action: {
    minHeight: 42,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionPressed: {
    opacity: 0.78,
  },
  actionText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 18,
  },
  loading: {
    flex: 1,
    gap: 24,
    paddingTop: 28,
    paddingHorizontal: 16,
    backgroundColor: colors.canvas,
  },
  skeletonPost: {
    width: '100%',
    gap: 14,
  },
  skeletonHeader: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.skeleton,
  },
  skeletonIdentity: {
    gap: 6,
  },
  skeletonName: {
    width: 130,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.skeleton,
  },
  skeletonMeta: {
    width: 80,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.skeletonMuted,
  },
  skeletonPhotos: {
    flexDirection: 'row',
    gap: 9,
  },
  skeletonPhoto: {
    width: 110,
    height: 110,
    borderRadius: 10,
    backgroundColor: colors.skeletonMuted,
  },
  skeletonLineLong: {
    width: 330,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.skeletonMuted,
  },
  skeletonLineShort: {
    width: 250,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.skeletonMuted,
  },
});
