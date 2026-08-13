import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { storage } from '../../infrastructure/firebase';
import { captureException } from '../../infrastructure/observability';
import { ErrorState, ListFooter, Screen } from '../../ui/components';
import { NotificationsGlyph, StatsGlyph, TastesLogo } from '../../ui/FigmaIcons';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { FeedItem, ReportReason } from '@tastes/contracts';
import {
  useFeed,
  useFeedReactionState,
  useHideReview,
  useReactToReview,
  useLatestFeedItem,
  useReportReview,
} from './api';
import {
  HomeFeedEmptyState,
  HomeFeedLoadingState,
  HomeFeedOfflineState,
} from './HomeFeedStates';
import avatar from '../../../assets/home/avatar.png';
import { useDiscoverFeed } from '../discover/api';
import { useAuthenticatedUserId } from '../../session/SessionProvider';

const tagLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

const reportReasons = ['Spam', 'Inappropriate', 'Harassment', 'Misinformation', 'Hate', 'Safety risk', 'Something else'] as const;

function DishPhoto({ photoPath }: { photoPath?: string }) {
  const [uri, setUri] = useState<string>();
  const normalizedPath = photoPath?.trim().replace(/^\/+|\/+$/g, '');

  useEffect(() => {
    let active = true;
    if (!normalizedPath) {
      setUri(undefined);
      return () => {
        active = false;
      };
    }

    let download: Promise<string>;
    try {
      const photoRef = ref(storage, normalizedPath);
      if (!photoRef.fullPath.replace(/\//g, '')) throw { code: 'storage/invalid-root-operation' };
      download = getDownloadURL(photoRef);
    } catch (error) {
      if ((error as { code?: string }).code !== 'storage/invalid-root-operation')
        captureException(error, { operation: 'load-review-dish-photo', photoPath: normalizedPath });
      setUri(undefined);
      return () => {
        active = false;
      };
    }

    void download
      .then((nextUri) => {
        if (active) setUri(nextUri);
      })
      .catch((error) => {
        if ((error as { code?: string }).code === 'storage/invalid-root-operation') {
          if (active) setUri(undefined);
          return;
        }
        captureException(error, { operation: 'load-review-dish-photo', photoPath: normalizedPath });
        if (active) setUri(undefined);
      });
    return () => {
      active = false;
    };
  }, [normalizedPath]);

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
  isReactionActive,
  onShare,
  onLongPress,
}: {
  item: FeedItem;
  onComments: () => void;
  onReaction: () => void;
  reactionDisabled: boolean;
  isReactionActive: boolean;
  onShare: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Persisted query caches and reviews created before Increment 2 do not have
  // the new arrays. Keep those records renderable while the cache refreshes.
  const dishReviews = item.dishReviews ?? [];
  const tags = item.tags ?? [];
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.card}>
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
          <Text style={[
            styles.metric,
            isReactionActive ? styles.metricActive : undefined,
            reactionDisabled ? styles.metricDisabled : undefined,
          ]}>
            ♥ {item.reactionCount}
          </Text>
        </Pressable>
        <Pressable onPress={onComments}>
          <Text style={styles.metric}>◯ {item.commentCount}</Text>
        </Pressable>
        <Pressable onPress={onShare}>
          <Text style={styles.metric}>↗</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function ActionSheet({
  actions,
  onCancel,
}: {
  actions: Array<{ label: string; destructive?: boolean; onPress: () => void }>;
  onCancel: () => void;
}) {
  return (
    <View style={overlayStyles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={overlayStyles.sheet}>
        <View style={overlayStyles.sheetGroup}>
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={[overlayStyles.sheetAction, index > 0 && overlayStyles.sheetDivider]}
            >
              <Text style={[overlayStyles.sheetActionText, action.destructive && overlayStyles.destructive]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onCancel} style={overlayStyles.sheetCancel}>
          <Text style={overlayStyles.sheetCancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReportSheet({
  selectedReason,
  onSelectReason,
  onSubmit,
  onCancel,
  details,
  onDetailsChange,
  submitting,
}: {
  selectedReason: string;
  onSelectReason: (reason: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  details: string;
  onDetailsChange: (value: string) => void;
  submitting: boolean;
}) {
  const showDetails = selectedReason === 'Something else';
  return (
    <View style={overlayStyles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={overlayStyles.reportSheet}>
        <Text style={overlayStyles.sheetTitle}>Why are you reporting this post?</Text>
        {reportReasons.map((reason) => (
          <Pressable
            key={reason}
            onPress={() => onSelectReason(reason)}
            style={overlayStyles.reportRow}
          >
            <Text style={overlayStyles.reportReason}>{reason}</Text>
            <Text style={overlayStyles.reportRadio}>{selectedReason === reason ? '◉' : '◯'}</Text>
          </Pressable>
        ))}
        {showDetails ? (
          <View style={overlayStyles.detailsWrapper}>
            <TextInput
              value={details}
              onChangeText={(value) => onDetailsChange(value.slice(0, 300))}
              placeholder="Please provide details (optional)"
              placeholderTextColor="#9DA3AD"
              multiline
              style={overlayStyles.detailsInput}
            />
            <Text style={overlayStyles.detailsCounter}>{details.length}/300</Text>
          </View>
        ) : null}
        <View style={overlayStyles.reportFooter}>
          <Pressable disabled={submitting} onPress={onSubmit} style={[overlayStyles.primaryButton, submitting && overlayStyles.disabledButton]}>
            <Text style={overlayStyles.primaryButtonText}>{submitting ? 'Submitting…' : 'Submit report'}</Text>
          </Pressable>
          <Pressable style={overlayStyles.secondaryButton} onPress={onCancel}>
            <Text style={overlayStyles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function HomeFeedScreen({
  onExplore,
  onOpenComments,
  onOpenLeaderboard,
  onOpenNotifications,
  onOpenPlace,
}: {
  onExplore: () => void;
  onOpenComments: (reviewId: string) => void;
  onOpenLeaderboard: () => void;
  onOpenNotifications?: () => void;
  onOpenPlace: (venueId: string) => void;
}) {
  const userId = useAuthenticatedUserId();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [scope, setScope] = useState<'friends' | 'local'>('friends');
  const query = useFeed(scope);
  const latestFeedQuery = useLatestFeedItem(scope);
  const recommendationQuery = useDiscoverFeed(userId);
  const reactionMutation = useReactToReview();
  const hideMutation = useHideReview();
  const reportMutation = useReportReview();
  const { data: reactionState = {} } = useFeedReactionState();
  const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({});
  const [menuReviewId, setMenuReviewId] = useState<string | null>(null);
  const [recommendationMenu, setRecommendationMenu] = useState(false);
  const [recommendationHidden, setRecommendationHidden] = useState(false);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ReportReason>(reportReasons[0] as ReportReason);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasNewPosts = Boolean(items[0]?.id && latestFeedQuery.data?.id && items[0].id !== latestFeedQuery.data.id);

  useEffect(() => () => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
  }, []);

  function showToast(message: string) {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 1800);
  }

  const handleReactionPress = async (item: FeedItem) => {
    if (pendingReactions[item.id]) {
      return;
    }
    setPendingReactions((prev) => ({ ...prev, [item.id]: true }));

    try {
      await reactionMutation.mutateAsync(item.id);
    } catch {
      Alert.alert('Reaction unavailable', 'Unable to update reaction right now. Please try again.');
    } finally {
      setPendingReactions((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleSharePress = async (item: FeedItem) => {
    try {
      await Share.share({
        message: `${item.authorDisplayName} · ${item.venueName}\n${item.text.slice(0, 120)}`,
      });
    } catch {
      Alert.alert('Share unavailable', 'Unable to open share options right now.');
    }
  };

  const handleHidePress = async (itemId: string) => {
    setMenuReviewId(null);
    try {
      await hideMutation.mutateAsync(itemId);
      showToast('Post hidden');
    } catch {
      Alert.alert('Could not hide post', 'Please try again.');
    }
  };

  const handleReportSubmit = async () => {
    if (!reportReviewId) {
      return;
    }
    const reviewId = reportReviewId;
    try {
      await reportMutation.mutateAsync({
        reviewId,
        reason: selectedReason,
        details: reportDetails || undefined,
      });
      setReportReviewId(null);
      setSelectedReason(reportReasons[0] as ReportReason);
      setReportDetails('');
      setReportSent(true);
    } catch {
      Alert.alert('Could not send report', 'Please try again.');
      setReportReviewId(reviewId);
    }
  };

  const handleRefreshNewPosts = async () => {
    await query.refetch();
  };

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
          <Pressable
            accessibilityLabel="Open notifications"
            onPress={onOpenNotifications}
            style={styles.headerIcon}
          >
            <NotificationsGlyph />
          </Pressable>
        </View>
        <View style={styles.switcher}>
          {(['friends', 'local'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setScope(value)}
              style={[styles.switch, scope === value && styles.switchActive]}
            >
              <Text style={[styles.switchText, scope === value && styles.switchTextActive]}>
                {value === 'friends' ? 'Friends' : 'Local'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {hasNewPosts ? (
        <Pressable onPress={() => { void handleRefreshNewPosts(); }} style={styles.newPostsBanner}>
          <Text style={styles.newPostsText}>↑ New posts</Text>
        </Pressable>
      ) : null}
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
          initialNumToRender={6}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={6}
          ListHeaderComponent={!recommendationHidden && recommendationQuery.data?.forYou[0] ? <Pressable onLongPress={() => setRecommendationMenu(true)} onPress={() => onOpenPlace(recommendationQuery.data!.forYou[0]!.id)} style={styles.recommendation}><Image source={recommendationQuery.data.forYou[0].imageUrl ? { uri: recommendationQuery.data.forYou[0].imageUrl } : avatar} style={styles.recommendationImage} /><View style={styles.recommendationCopy}><Text style={styles.recommendationEyebrow}>RECOMMENDED FOR YOU</Text><Text style={styles.recommendationTitle}>{recommendationQuery.data.forYou[0].name}</Text><Text style={styles.recommendationMeta}>{recommendationQuery.data.forYou[0].category} · ★ {recommendationQuery.data.forYou[0].rating?.toFixed(1)}</Text><Text style={styles.recommendationReason}>Because it matches your tastes and saves</Text></View></Pressable> : null}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          onEndReachedThreshold={0.45}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onComments={() => onOpenComments(item.id)}
              isReactionActive={Boolean(reactionState[item.id])}
              reactionDisabled={Boolean(pendingReactions[item.id])}
              onReaction={() => {
                void handleReactionPress(item);
              }}
              onShare={() => {
                void handleSharePress(item);
              }}
              onLongPress={() => setMenuReviewId(item.id)}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      )}
      {toast ? (
        <View style={overlayStyles.toast}>
          <Text style={overlayStyles.toastText}>✓  {toast}</Text>
        </View>
      ) : null}
      {menuReviewId ? (
        <ActionSheet
          actions={[
            { label: 'Why am I seeing this?', onPress: () => {
              setMenuReviewId(null);
              showToast('Shown because it matches your tastes');
            } },
            { label: 'Report post', destructive: true, onPress: () => {
              setReportReviewId(menuReviewId);
              setMenuReviewId(null);
            } },
            { label: hideMutation.isPending ? 'Hiding…' : 'Not interested', onPress: () => {
              void handleHidePress(menuReviewId);
            } },
          ]}
          onCancel={() => setMenuReviewId(null)}
        />
      ) : null}
      {recommendationMenu ? <ActionSheet actions={[{ label: 'Why am I seeing this?', onPress: () => { setRecommendationMenu(false); showToast('Based on your tastes, ratings and saves'); } }, { label: 'Not interested', destructive: true, onPress: () => { setRecommendationMenu(false); setRecommendationHidden(true); showToast('Recommendation hidden'); } }]} onCancel={() => setRecommendationMenu(false)} /> : null}
      {reportReviewId ? (
        <ReportSheet
          selectedReason={selectedReason}
          onSelectReason={(reason) => setSelectedReason(reason as ReportReason)}
          onSubmit={() => void handleReportSubmit()}
          onCancel={() => {
            setReportReviewId(null);
            setSelectedReason(reportReasons[0] as ReportReason);
            setReportDetails('');
          }}
          details={reportDetails}
          onDetailsChange={(value) => setReportDetails(value)}
          submitting={reportMutation.isPending}
        />
      ) : null}
      {reportSent ? <View style={overlayStyles.sentScreen}><View style={overlayStyles.sentMark}><Text style={overlayStyles.sentCheck}>✓</Text></View><Text style={overlayStyles.sentTitle}>Report sent</Text><Text style={overlayStyles.sentCopy}>Thanks for helping keep Tastes safe. Our team will review this shortly.</Text><Pressable onPress={() => setReportSent(false)} style={overlayStyles.sentDone}><Text style={overlayStyles.sentDoneText}>Done</Text></Pressable></View> : null}
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
  newPostsBanner: { position: 'absolute', top: 152, left: 16, right: 16, zIndex: 3, alignSelf: 'center', alignItems: 'center', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#161616CC' },
  newPostsText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  content: { padding: 15, gap: 16 },
  recommendation: { minHeight: 142, marginBottom: 2, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surface },
  recommendationImage: { width: 128, alignSelf: 'stretch' },
  recommendationCopy: { flex: 1, padding: 14, justifyContent: 'center', gap: 5 },
  recommendationEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '700' },
  recommendationTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  recommendationMeta: { color: colors.text, fontSize: 12 },
  recommendationReason: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
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
  metricActive: { color: colors.text, fontWeight: '700' },
  metricDisabled: { opacity: 0.5 },
});

const stylesStatic = StyleSheet.create({
  dishPhoto: { width: 124, height: 84, backgroundColor: '#ECEEF2' },
  dishPhotoPlaceholder: { width: 124, height: 84, backgroundColor: '#ECEEF2' },
});

const overlayStyles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, justifyContent: 'flex-end', padding: 8, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.64)' },
  sheet: { gap: 8 },
  sheetGroup: { overflow: 'hidden', borderRadius: 16, backgroundColor: '#272727' },
  sheetAction: { height: 54, alignItems: 'center', justifyContent: 'center' },
  sheetDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#484848' },
  sheetActionText: { color: '#fff', fontSize: 17 },
  destructive: { color: '#FF453A' },
  sheetCancel: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#272727' },
  sheetCancelText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  reportSheet: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 8, borderRadius: 16, backgroundColor: '#272727' },
  sheetTitle: { color: '#fff', fontSize: 19, fontWeight: '700', marginBottom: 6 },
  reportRow: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#414141' },
  reportReason: { color: '#fff', fontSize: 16 },
  reportRadio: { color: '#fff', fontSize: 18 },
  reportFooter: { flexDirection: 'row', gap: 8, marginTop: 8 },
  detailsInput: { height: 96, marginTop: 4, borderRadius: 12, padding: 10, backgroundColor: '#3a3a3a', color: '#fff' },
  detailsWrapper: { },
  detailsCounter: { color: '#9DA3AD', fontSize: 12, marginTop: 4, textAlign: 'right' },
  primaryButton: { flex: 1, height: 42, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { flex: 1, height: 42, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3e3e3e' },
  secondaryButtonText: { color: '#fff', fontWeight: '600' },
  disabledButton: { opacity: 0.7 },
  toast: { position: 'absolute', zIndex: 40, top: 168, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: '#303030' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sentScreen: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#161616' },
  sentMark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  sentCheck: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  sentTitle: { marginTop: 24, color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  sentCopy: { marginTop: 10, maxWidth: 320, color: '#A6A8AD', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  sentDone: { position: 'absolute', left: 36, right: 36, bottom: 34, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  sentDoneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
