import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { formatDisplayDate } from '../../infrastructure/date';
import { LinearGradient } from 'expo-linear-gradient';
import ChatIcon from '../../../assets/comments/chat-round-outline.svg';
import HeartIcon from '../../../assets/comments/heart-outline.svg';
import ShareIcon from '../../../assets/comments/square-share-line-broken.svg';
import TopRatedDishesIcon from '../../../assets/place/top-rated-dishes.svg';
import RecommendationPlus from '../../../assets/home/recommendation-plus.svg';
import RecommendationPlusRing from '../../../assets/home/recommendation-plus-ring.svg';
import RecommendationStar from '../../../assets/home/recommendation-star.svg';
import { ErrorState, ListFooter, Screen } from '../../ui/components';
import { NotificationsGlyph, StatsGlyph, TastesLogo } from '../../ui/FigmaIcons';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { FeedItem, ReportReason } from '@tastes/contracts';
import {
  useFeed,
  useFeedReactionState,
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
import { useAuthenticatedUserId, useSession } from '../../session/SessionProvider';
import { useProfile } from '../profile/api';

const tagInfo: Record<string, { label: string; emoji?: string }> = {
  casual: { label: 'Casual' },
  'date-night': { label: 'Date night', emoji: '🌙' },
  birthday: { label: 'Birthday', emoji: '🎂' },
  children: { label: 'With children', emoji: '👶' },
};

const cuisineFlags: Record<string, string> = {
  french: '🇫🇷',
  italian: '🇮🇹',
  japanese: '🇯🇵',
  korean: '🇰🇷',
  mexican: '🇲🇽',
  spanish: '🇪🇸',
  thai: '🇹🇭',
  turkish: '🇹🇷',
  vietnamese: '🇻🇳',
};

function categoryLabel(category: string) {
  const flag = cuisineFlags[category.toLowerCase()];
  return flag ? `${category} ${flag}` : category;
}

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

  // Keep the full dish visible inside the fixed Figma tile. The default
  // `cover` mode trims the photo edges when its aspect ratio differs from the
  // tile, which is the slight side-cropping visible in the review carousel.
  return uri ? <Image resizeMode="cover" source={{ uri }} style={stylesStatic.dishPhoto} /> : <View style={stylesStatic.dishPhotoPlaceholder} />;
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
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [expanded, setExpanded] = useState(false);
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null);
  const dishReviews = item.dishReviews ?? [];
  const tags = item.tags ?? [];
  const primaryTag = tags[0] ? tagInfo[tags[0]] ?? { label: tags[0] } : null;
  const username = item.authorUsername
    ? `@${item.authorUsername}`
    : `@${item.authorDisplayName.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
  const isLongText = (item.text?.length ?? 0) > 120;

  return (
    <>
      <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.card}>
      <View style={styles.authorRow}>
        <Image
          source={item.authorPhotoUrl ? { uri: item.authorPhotoUrl } : avatar}
          style={styles.avatar}
        />
        <View style={styles.authorCopy}>
          <Text numberOfLines={1} style={styles.authorName}>{item.authorDisplayName}</Text>
          <Text numberOfLines={1} style={styles.authorHandle}>{username}</Text>
        </View>
        <Text style={styles.date}>{formatDisplayDate(item.createdAt)}</Text>
      </View>

      <View style={styles.venueSection}>
        <Text style={styles.venue}>{item.venueName}</Text>
        <View style={styles.ratingTagRow}>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Text
                key={star}
                style={[
                  styles.star,
                  star <= Math.round(item.rating) ? styles.starFilled : styles.starEmpty,
                ]}
              >
                ★
              </Text>
            ))}
          </View>
          {primaryTag ? (
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>
                {primaryTag.emoji ? `${primaryTag.emoji} ` : ''}{primaryTag.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {dishReviews.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.dishes}
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          scrollEnabled
          showsHorizontalScrollIndicator={false}
        >
          {dishReviews.map((dish, index) => (
            <Pressable
              key={dish.id}
              accessibilityLabel={`Open dish review for ${dish.title}`}
              onPress={(event) => {
                event.stopPropagation();
                setSelectedDishIndex(index);
              }}
              style={styles.dish}
            >
              <DishPhoto photoPath={dish.photoPath} />
              <LinearGradient
                colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.15)', 'transparent']}
                locations={[0, 0.55, 1]}
                style={styles.dishGradient}
              >
                <Text numberOfLines={2} style={styles.dishTitle}>
                  {dish.title}
                </Text>
              </LinearGradient>
              <View style={styles.dishRatingBadge}>
                <Text style={styles.dishRatingStar}>★</Text>
                <Text style={styles.dishRatingValue}>{dish.rating.toFixed(1)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {item.text ? (
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.reviewPressable}>
          <Text
            numberOfLines={expanded ? undefined : 2}
            style={styles.review}
          >
            {item.text}
            {!expanded && isLongText ? (
              <Text style={styles.seeMore}>  See more</Text>
            ) : null}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.metrics}>
        <View style={styles.metricsLeft}>
          <Pressable disabled={reactionDisabled} onPress={onReaction} style={styles.metricIconRow}>
            <HeartIcon color={isReactionActive ? colors.primary : colors.text} height={20} width={20} />
            <Text style={[styles.metric, isReactionActive ? styles.metricActive : undefined, reactionDisabled ? styles.metricDisabled : undefined]}>
              {item.reactionCount}
            </Text>
          </Pressable>
          <Pressable onPress={onComments} style={styles.metricIconRow}>
            <ChatIcon color={colors.text} height={20} width={20} />
            <Text style={styles.metric}>{item.commentCount}</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.metricIconRow}>
            <ShareIcon color={colors.text} height={20} width={20} />
          </Pressable>
        </View>
        {dishReviews.length > 0 ? (
          <Pressable
            accessibilityLabel="Open dish reviews"
            onPress={(event) => {
              event.stopPropagation();
              setSelectedDishIndex(0);
            }}
            style={styles.dishesButton}
          >
            <TopRatedDishesIcon color={colors.primary} height={13} width={15} />
            <Text style={styles.dishesButtonText}>Dishes ({dishReviews.length})</Text>
          </Pressable>
        ) : null}
      </View>
      </Pressable>
      <Modal
        animationType="slide"
        transparent
        visible={selectedDishIndex !== null}
        onRequestClose={() => setSelectedDishIndex(null)}
      >
        <View style={overlayStyles.dishReviewScrim}>
          <Pressable
            accessibilityLabel="Close dish review"
            onPress={() => setSelectedDishIndex(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={overlayStyles.dishReviewSheet}>
            <View style={overlayStyles.dishReviewHeader}>
              <Text style={overlayStyles.dishReviewTitle}>Dish Review</Text>
              <Pressable
                accessibilityLabel="Close dish review"
                hitSlop={10}
                onPress={() => setSelectedDishIndex(null)}
                style={overlayStyles.dishReviewClose}
              >
                <Text style={overlayStyles.dishReviewCloseText}>×</Text>
              </Pressable>
            </View>
            {selectedDishIndex !== null && dishReviews[selectedDishIndex] ? (
              <>
                <View style={overlayStyles.dishReviewPhoto}>
                  <DishPhoto photoPath={dishReviews[selectedDishIndex].photoPath} />
                  {dishReviews.length > 1 ? (
                    <View style={overlayStyles.dishReviewArrows} pointerEvents="box-none">
                      <Pressable
                        accessibilityLabel="Previous dish"
                        onPress={() => setSelectedDishIndex((selectedDishIndex - 1 + dishReviews.length) % dishReviews.length)}
                        style={overlayStyles.dishReviewArrow}
                      >
                        <Text style={overlayStyles.dishReviewArrowText}>‹</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Next dish"
                        onPress={() => setSelectedDishIndex((selectedDishIndex + 1) % dishReviews.length)}
                        style={overlayStyles.dishReviewArrow}
                      >
                        <Text style={overlayStyles.dishReviewArrowText}>›</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <View style={overlayStyles.dishReviewDescription}>
                  <View style={overlayStyles.dishReviewRating}>
                    <Text style={overlayStyles.dishReviewRatingStar}>★</Text>
                    <Text style={overlayStyles.dishReviewRatingValue}>{dishReviews[selectedDishIndex].rating.toFixed(1)}</Text>
                  </View>
                  <Text style={overlayStyles.dishReviewName}>{dishReviews[selectedDishIndex].title}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={overlayStyles.scrim}>
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
    </KeyboardAvoidingView>
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
  const { state } = useSession();
  const userId = useAuthenticatedUserId();
  const { profile } = useProfile(userId, state.user?.displayName ?? 'Tastes member');
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [scope, setScope] = useState<'friends' | 'local'>('friends');
  const query = useFeed(scope);
  const latestFeedQuery = useLatestFeedItem(scope);
  const recommendationQuery = useDiscoverFeed(userId);
  const reactionMutation = useReactToReview();
  const reportMutation = useReportReview();
  const { data: reactionState = {} } = useFeedReactionState();
  const [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>({});
  const [menuReviewId, setMenuReviewId] = useState<string | null>(null);
  const [blockedAuthorIds, setBlockedAuthorIds] = useState<Set<string>>(new Set());
  const [recommendationMenu, setRecommendationMenu] = useState(false);
  const [recommendationHidden, setRecommendationHidden] = useState(false);
  const [reportReviewId, setReportReviewId] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<ReportReason>(reportReasons[0] as ReportReason);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleItems = items.filter((item) => !blockedAuthorIds.has(item.authorId));
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

  const handleBlockPress = (itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    setMenuReviewId(null);
    if (!item) return;
    setBlockedAuthorIds((current) => {
      const next = new Set(current);
      next.add(item.authorId);
      return next;
    });
    showToast('User blocked');
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
        <HomeFeedEmptyState city={profile?.city} onAction={onExplore} scope={scope} />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={visibleItems}
          initialNumToRender={6}
          keyExtractor={(item) => item.id}
          maxToRenderPerBatch={6}
          ListHeaderComponent={!recommendationHidden && recommendationQuery.data?.forYou[0] ? (() => {
            const rec = recommendationQuery.data!.forYou[0]!;
            const priceDots = rec.priceLevel ? '$'.repeat(rec.priceLevel) : null;
            const distanceLabel = rec.distanceKm != null
              ? rec.distanceKm < 1
                ? `${Math.round(rec.distanceKm * 1000)} m`
                : `${rec.distanceKm.toFixed(1)} km`
              : null;
            return (
              <Pressable
                onLongPress={() => setRecommendationMenu(true)}
                onPress={() => onOpenPlace(rec.id)}
                style={styles.recommendation}
              >
                <View style={styles.recommendationHeader}>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>Recommended</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.recommendationMatch}>
                    <Text style={styles.recommendationMatchScore}>98% </Text>
                    {rec.category ? `match on your ${rec.category.toLowerCase()} taste` : 'match based on your tastes and saves'}
                  </Text>
                </View>

                <View style={styles.recommendationBody}>
                  <View style={styles.recommendationRow}>
                    <Image
                      source={rec.imageUrl ? { uri: rec.imageUrl } : avatar}
                      style={styles.recommendationImage}
                    />
                    <View style={styles.recommendationInfo}>
                      <Text numberOfLines={1} style={styles.recommendationTitle}>{rec.name}</Text>
                      {rec.address ? (
                        <Text numberOfLines={1} style={styles.recommendationAddress}>{rec.address}</Text>
                      ) : null}
                      {rec.rating != null ? (
                        <View style={styles.recommendationRatingRow}>
                          <View style={styles.recommendationRatingPill}>
                            <RecommendationStar height={14} width={14} />
                            <Text style={styles.recommendationRatingValue}>{rec.rating.toFixed(1)}</Text>
                          </View>
                          {rec.reviewCount != null ? (
                            <Text numberOfLines={1} style={styles.recommendationReviewCount}>{rec.reviewCount} reviews</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.recommendationAddIcon} pointerEvents="none">
                    <RecommendationPlusRing height={18} width={18} style={styles.recommendationPlusRing} />
                    <RecommendationPlus height={7} width={7} style={styles.recommendationPlus} />
                  </View>

                  {(rec.category || priceDots || distanceLabel) ? (
                    <View style={styles.recommendationTags}>
                      {rec.category ? <View style={styles.recTag}><Text style={styles.recTagText}>{categoryLabel(rec.category)}</Text></View> : null}
                      {priceDots ? <View style={styles.recTag}><Text style={styles.recTagText}>{priceDots}</Text></View> : null}
                      {distanceLabel ? <View style={styles.recTag}><Text style={styles.recTagText}>{distanceLabel.replace('.', ',')}</Text></View> : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })() : null}
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
            { label: 'Report post', destructive: true, onPress: () => {
              setReportReviewId(menuReviewId);
              setMenuReviewId(null);
            } },
            { label: 'Block this user', destructive: true, onPress: () => handleBlockPress(menuReviewId) },
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

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  header: { height: 157, paddingTop: 54, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.background },
  headerTop: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  switcher: { height: 40, marginTop: 7, padding: 4, flexDirection: 'row', borderRadius: theme.radius.pill, backgroundColor: isDark ? colors.surfaceRaised : '#F3F0EB' },
  switch: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.pill },
  switchActive: { backgroundColor: isDark ? '#D9DDE5' : '#262626' },
  switchText: { color: isDark ? colors.textSecondary : '#858585', opacity: isDark ? 0.5 : 1, fontSize: 13 },
  switchTextActive: { color: isDark ? '#161616' : '#FFFFFF', opacity: 1, fontWeight: '700' },
  newPostsBanner: { position: 'absolute', top: 152, left: 16, right: 16, zIndex: 3, alignSelf: 'center', alignItems: 'center', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#161616CC' },
  newPostsText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  content: { padding: 15, gap: 16 },
  recommendation: { height: 230, marginBottom: 2, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  recommendationHeader: { height: 42, position: 'relative', backgroundColor: isDark ? 'rgba(184,47,41,0.1)' : 'rgba(184,47,41,0.08)' },
  recommendedBadge: { position: 'absolute', top: 0, left: 0, width: 104, height: 42, alignItems: 'center', justifyContent: 'center', borderBottomRightRadius: 30, backgroundColor: '#B82F29' },
  recommendedBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '400', letterSpacing: -0.23 },
  recommendationMatch: { position: 'absolute', top: 11, left: 124, right: 13, color: isDark ? 'rgba(255,255,255,0.8)' : colors.textSecondary, fontSize: 13, lineHeight: 17, letterSpacing: -0.24 },
  recommendationMatchScore: { color: colors.text, fontWeight: '600' },
  recommendationBody: { height: 187, position: 'relative', backgroundColor: colors.surface },
  recommendationRow: { position: 'absolute', top: 14, left: 18, right: 28, height: 122, flexDirection: 'row', alignItems: 'center', gap: 17 },
  recommendationImage: { width: 122, height: 122, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  recommendationInfo: { flex: 1, minWidth: 0, gap: 6, justifyContent: 'center' },
  recommendationTitle: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 18, letterSpacing: -0.41 },
  recommendationAddress: { color: colors.textSecondary, fontSize: 14, lineHeight: 18, letterSpacing: -0.24 },
  recommendationRatingRow: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 4 },
  recommendationRatingPill: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: '#B82F29', gap: 3 },
  recommendationRatingValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', lineHeight: 17, letterSpacing: -0.23 },
  recommendationReviewCount: { flex: 1, color: colors.textSecondary, opacity: isDark ? 0.4 : 0.75, fontSize: 14, lineHeight: 18, letterSpacing: -0.24 },
  recommendationAddIcon: { position: 'absolute', top: 14, right: 13, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  recommendationPlusRing: { position: 'absolute' },
  recommendationPlus: { position: 'absolute' },
  recommendationTags: { position: 'absolute', left: 18, right: 18, bottom: 9, height: 33, flexDirection: 'row', alignItems: 'center', gap: 7 },
  recTag: { height: 33, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 40, backgroundColor: colors.surfaceRaised },
  recTagText: { color: colors.text, fontSize: 15, fontWeight: '400', lineHeight: 20, letterSpacing: -0.24 },
  card: { gap: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.canvas },
  authorCopy: { flex: 1, paddingLeft: 10, justifyContent: 'center', gap: 2 },
  authorName: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  authorHandle: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  date: { color: colors.textMuted, fontSize: 13 },
  venueSection: { gap: 6 },
  venue: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  ratingTagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starRow: { flexDirection: 'row', gap: 3 },
  star: { fontSize: 18, lineHeight: 20 },
  starFilled: { color: '#E53935' },
  starEmpty: { color: '#E53935', opacity: 0.2 },
  tagBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100, backgroundColor: isDark ? '#232326' : '#ECE9E2' },
  tagBadgeText: { color: colors.text, fontSize: 12, fontWeight: '500' },
  dishes: { gap: 10 },
  dish: { width: 148, height: 156, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surfaceRaised, position: 'relative' },
  dishGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 64, paddingHorizontal: 10, paddingTop: 8 },
  dishTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 17, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  dishRatingBadge: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.65)' },
  dishRatingStar: { color: '#FFFFFF', fontSize: 11 },
  dishRatingValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  reviewPressable: {},
  review: { color: colors.text, opacity: 0.88, fontSize: 14, lineHeight: 20 },
  seeMore: { color: colors.text, fontWeight: '700', opacity: 1 },
  metrics: { paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metricsLeft: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  metric: { color: colors.textMuted, fontSize: 13 },
  metricIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricActive: { color: colors.text, fontWeight: '700' },
  metricDisabled: { opacity: 0.5 },
  dishesButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: isDark ? '#232326' : '#ECE9E2' },
  dishesButtonText: { color: colors.text, fontSize: 12, fontWeight: '500' },
});

const stylesStatic = StyleSheet.create({
  dishPhoto: { width: '100%', height: '100%', backgroundColor: '#2C2C2E' },
  dishPhotoPlaceholder: { width: '100%', height: '100%', backgroundColor: '#2C2C2E' },
});

const overlayStyles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  dishReviewScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  dishReviewSheet: { paddingBottom: 30, borderTopWidth: 1, borderColor: '#45474B', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#161616' },
  dishReviewHeader: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dishReviewTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '600', letterSpacing: -0.45 },
  dishReviewClose: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  dishReviewCloseText: { color: '#FFFFFF', fontSize: 30, fontWeight: '300', lineHeight: 30 },
  dishReviewPhoto: { width: '100%', aspectRatio: 1, maxHeight: 434, paddingHorizontal: 16, position: 'relative' },
  dishReviewArrows: { position: 'absolute', top: '50%', left: 21, right: 21, flexDirection: 'row', justifyContent: 'space-between' },
  dishReviewArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,22,22,0.45)' },
  dishReviewArrowText: { color: '#FFFFFF', fontSize: 34, fontWeight: '300', lineHeight: 30 },
  dishReviewDescription: { width: '100%', paddingHorizontal: 16, paddingTop: 16, gap: 7 },
  dishReviewRating: { height: 28, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, borderRadius: 100, backgroundColor: '#B82F29' },
  dishReviewRatingStar: { color: '#FFFFFF', fontSize: 14 },
  dishReviewRatingValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  dishReviewName: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', lineHeight: 20, letterSpacing: -0.24 },
});
