import type { Comment, CommentReview, ReportReason } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { resolveStorageImageUrl } from '../../infrastructure/storageImage';
import { captureException } from '../../infrastructure/observability';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { formatDisplayDate } from '../../infrastructure/date';
import CaretDownIcon from '../../../assets/comments/caret-down.svg';
import ChatIcon from '../../../assets/comments/chat-round-outline.svg';
import HeartIcon from '../../../assets/comments/heart-outline.svg';
import ShareIcon from '../../../assets/comments/square-share-line-broken.svg';
import SendIcon from '../../../assets/ai/send.svg';
import avatarKristin from '../../../assets/discover/avatar-kristin.png';
import loungePhoto from '../../../assets/discover/lounge.png';
import restaurantPhoto from '../../../assets/discover/restaurant.png';
import sushiPhoto from '../../../assets/discover/sushi.jpg';
import {
  ErrorState,
  ListFooter,
  LoadingState,
  Screen,
} from '../../ui/components';
import { theme } from '../../ui/theme';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import {
  responsiveSize,
  responsiveStyleSheet,
  useOrientationDimensions,
} from '../../ui/responsive';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useReactToComment,
} from './api';
import {
  useAuthenticatedUserId,
  useTastesApi,
} from '../../session/SessionProvider';

const commentReportReasons: Array<{ label: string; value: ReportReason }> = [
  { label: 'Spam or scam', value: 'Spam' },
  { label: 'Inappropriate content', value: 'Inappropriate' },
  { label: 'Harassment or bullying', value: 'Harassment' },
  { label: 'Hate speech or symbols', value: 'Hate' },
  { label: 'Violence or dangerous acts', value: 'Safety risk' },
  { label: 'False information', value: 'Misinformation' },
  { label: 'Something else', value: 'Something else' },
];

const tagLabels: Record<string, string> = {
  'quick-bites': '⚡ Quick bites',
  casual: 'Casual',
  fancy: '🥂 Fancy',
  'night-out': '🌙 Night out',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

const seededDishPhotos = [sushiPhoto, restaurantPhoto, loungePhoto];

function commentShareUrl(reviewId: string, commentId: string) {
  return `https://tastesapp.com/reviews/${encodeURIComponent(reviewId)}/comments?commentId=${encodeURIComponent(commentId)}`;
}

function DishPhoto({
  fallbackSource,
  path,
  styles,
  url,
}: {
  fallbackSource?: ImageSourcePropType;
  path?: string;
  styles: ReturnType<typeof createStyles>;
  url?: string;
}) {
  const [state, setState] = useState<{ uri?: string; failed: boolean }>({
    uri: url,
    failed: false,
  });
  const normalizedPath = path?.trim().replace(/^\/+|\/+$/g, '');
  useEffect(() => {
    let active = true;
    if (url) {
      setState({ uri: url, failed: false });
      return () => {
        active = false;
      };
    }
    if (!normalizedPath) {
      setState({ failed: true });
      return () => {
        active = false;
      };
    }

    let download: Promise<string>;
    try {
      download = resolveStorageImageUrl(normalizedPath);
    } catch (error) {
      if (
        (error as { code?: string }).code !== 'storage/invalid-root-operation'
      )
        captureException(error, {
          operation: 'load-comments-review-photo',
          path: normalizedPath,
        });
      setState({ failed: true });
      return () => {
        active = false;
      };
    }

    setState({ failed: false });
    void download
      .then((uri) => {
        if (active) setState({ uri, failed: false });
      })
      .catch((error) => {
        if (
          (error as { code?: string }).code !== 'storage/invalid-root-operation'
        )
          captureException(error, {
            operation: 'load-comments-review-photo',
            path: normalizedPath,
          });
        if (active) setState({ failed: true });
      });
    return () => {
      active = false;
    };
  }, [normalizedPath, url]);
  if (state.uri)
    return (
      <Image
        resizeMode="cover"
        source={{ uri: state.uri }}
        style={styles.dishImage}
      />
    );
  if (fallbackSource && (!normalizedPath || state.failed))
    return (
      <Image
        resizeMode="cover"
        source={fallbackSource}
        style={styles.dishImage}
      />
    );
  return (
    <View style={styles.dishImageFallback}>
      {state.failed ? (
        <Text style={styles.dishImageFallbackText}>Photo unavailable</Text>
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

function RatingStars({
  rating,
  styles,
}: {
  rating: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <View
      style={styles.ratingStars}
      accessibilityLabel={`${clamped.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, clamped - star + 1));
        return (
          <View key={star} style={styles.ratingStarCell}>
            <Text style={[styles.reviewStars, styles.reviewEmptyStars]}>★</Text>
            {fill > 0 ? (
              <View
                style={[styles.ratingStarFill, { width: `${fill * 100}%` }]}
              >
                <Text style={styles.reviewStars}>★</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function MainReview({
  onReact,
  reacting,
  review,
}: {
  onReact: () => void;
  reacting: boolean;
  review: CommentReview;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dishModalHeight = Math.max(
    0,
    Math.min(responsiveSize(550), viewportHeight - insets.top),
  );
  const [selectedDish, setSelectedDish] = useState<
    CommentReview['dishReviews'][number] | null
  >(null);
  const dishSheet = useBottomSheetMotion({
    onClose: () => setSelectedDish(null),
    visible: selectedDish !== null,
  });
  const seededReview = review.id.startsWith('seed-own-');
  const selectedDishIndex = selectedDish
    ? review.dishReviews.findIndex((dish) => dish.id === selectedDish.id)
    : -1;
  return (
    <View style={styles.mainReview}>
      <View style={styles.reviewAuthorRow}>
        {review.authorPhotoUrl ? (
          <Image
            source={{ uri: review.authorPhotoUrl }}
            style={styles.reviewAvatar}
          />
        ) : seededReview ? (
          <Image source={avatarKristin} style={styles.reviewAvatar} />
        ) : (
          <View style={styles.reviewAvatarFallback}>
            <Text style={styles.reviewAvatarInitial}>
              {review.authorDisplayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.reviewAuthorCopy}>
          <Text style={styles.reviewAuthor}>{review.authorDisplayName}</Text>
          <Text style={styles.reviewUsername}>
            {review.authorUsername
              ? `@${review.authorUsername}`
              : 'Tastes member'}
          </Text>
        </View>
        <Text style={styles.reviewDate}>
          {formatDisplayDate(review.createdAt)}
        </Text>
      </View>
      <View style={styles.reviewBody}>
        <View style={styles.reviewVenueRow}>
          <View style={styles.reviewVenueCopy}>
            <Text style={styles.reviewVenue}>{review.venueName}</Text>
            <RatingStars rating={review.rating} styles={styles} />
          </View>
          {review.tags[0] ? (
            <Text style={styles.reviewTag}>
              {tagLabels[review.tags[0]] ?? review.tags[0]}
            </Text>
          ) : null}
        </View>
        {review.dishReviews.length > 0 ? (
          <View>
            <FlatList
              contentContainerStyle={styles.dishes}
              data={review.dishReviews}
              horizontal
              keyExtractor={(dish) => dish.id}
              renderItem={({ index, item: dish }) => (
                <Pressable
                  onPress={() => setSelectedDish(dish)}
                  style={styles.dishCard}
                >
                  <DishPhoto
                    fallbackSource={
                      seededReview
                        ? seededDishPhotos[index % seededDishPhotos.length]
                        : undefined
                    }
                    path={dish.thumbnailPath ?? dish.photoPath}
                    styles={styles}
                    url={dish.thumbnailUrl ?? dish.photoUrl}
                  />
                  <View style={styles.dishShade} />
                  <Text numberOfLines={1} style={styles.dishTitle}>
                    {dish.title}
                  </Text>
                  <Text style={styles.dishRating}>
                    ★ {dish.rating.toFixed(1)}
                  </Text>
                </Pressable>
              )}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        ) : null}
        <Text style={styles.reviewText}>{review.text}</Text>
        <View style={styles.reviewActions}>
          <Pressable
            disabled={reacting}
            onPress={onReact}
            style={styles.reviewActionIconRow}
          >
            <HeartIcon
              color={review.reacted ? colors.primary : colors.text}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
            <Text style={styles.reviewActionCount}>{review.reactionCount}</Text>
          </Pressable>
          <View style={styles.reviewActionIconRow}>
            <ChatIcon
              color={colors.text}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
            <Text style={styles.reviewActionCount}>{review.commentCount}</Text>
          </View>
          <Pressable
            accessibilityLabel="Share review"
            onPress={() =>
              void Share.share({
                message: `${review.authorDisplayName} on Tastes: ${review.text}\nhttps://tastesapp.com/reviews/${review.id}/comments`,
              })
            }
            style={styles.reviewActionIconRow}
          >
            <ShareIcon
              color={colors.text}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
          </Pressable>
        </View>
      </View>
      <Modal
        animationType="none"
        onRequestClose={dishSheet.close}
        transparent
        visible={selectedDish !== null}
      >
        <View style={styles.dishModalScrim}>
          <Pressable
            onPress={dishSheet.close}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.dishModal,
              {
                height: dishModalHeight,
                paddingBottom: Math.max(responsiveSize(16), insets.bottom),
                transform: [{ translateY: dishSheet.translateY }],
              },
            ]}
          >
            <View style={styles.sheetDragArea} {...dishSheet.panHandlers}>
              <View style={styles.sheetHandle} />
            </View>
            <View style={styles.dishModalHeader}>
              <Text style={styles.dishModalTitle}>Dish Review</Text>
              <Pressable
                accessibilityLabel="Close dish review"
                onPress={dishSheet.close}
                style={styles.dishModalClose}
              >
                <Text style={styles.dishModalCloseText}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.dishModalContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedDish ? (
                <>
                  <View style={styles.dishModalImage}>
                    <DishPhoto
                      fallbackSource={
                        seededReview && selectedDishIndex >= 0
                          ? seededDishPhotos[
                              selectedDishIndex % seededDishPhotos.length
                            ]
                          : undefined
                      }
                      path={selectedDish.photoPath}
                      styles={styles}
                      url={selectedDish.photoUrl}
                    />
                  </View>
                  <Text style={styles.dishModalRating}>
                    ★ {selectedDish.rating.toFixed(1)}
                  </Text>
                  <Text style={styles.dishModalName}>{selectedDish.title}</Text>
                </>
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function CommentRow({
  item,
  nested = false,
  highlighted = false,
  onDelete,
  onReact,
  onReply,
  onReport,
  repliesToggle,
  onLayout,
}: {
  item: Comment;
  nested?: boolean;
  highlighted?: boolean;
  onDelete?: () => void;
  onReact: () => void;
  onReply: () => void;
  onReport: () => void;
  repliesToggle?: {
    loaded: number;
    total: number;
    hidden: boolean;
    loading?: boolean;
    onLoadMore?: () => void;
    onToggle: () => void;
  };
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onLongPress={() =>
        Alert.alert(item.authorDisplayName, 'Comment options', [
          {
            text: 'Copy',
            onPress: () => void Clipboard.setStringAsync(item.text),
          },
          {
            text: 'Share',
            onPress: () =>
              void Share.share({
                message: `${item.authorDisplayName}: ${item.text}\n${commentShareUrl(item.reviewId, item.id)}`,
              }),
          },
          { text: 'Report', style: 'destructive', onPress: onReport },
          ...(onDelete
            ? [
                {
                  text: 'Delete',
                  style: 'destructive' as const,
                  onPress: onDelete,
                },
              ]
            : []),
          { text: 'Cancel', style: 'cancel' },
        ])
      }
      onLayout={onLayout}
      style={[
        styles.row,
        nested && styles.nestedRow,
        highlighted && styles.highlightedRow,
      ]}
    >
      {item.authorPhotoUrl ? (
        <Image
          source={{ uri: item.authorPhotoUrl }}
          style={styles.avatarImage}
        />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.initial}>
            {item.authorDisplayName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.copy}>
        <View style={styles.meta}>
          <Text style={styles.author}>{item.authorDisplayName}</Text>
          <Text style={styles.date}>{formatDisplayDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.text}>{item.text}</Text>
        <View style={styles.actions}>
          <Pressable onPress={onReact} style={styles.reactionAction}>
            <HeartIcon
              color={item.reacted ? colors.primary : colors.text}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
            {item.reactionCount ? (
              <Text style={styles.reactionCount}>{item.reactionCount}</Text>
            ) : null}
          </Pressable>
          <Pressable onPress={onReply} style={styles.actionIconRow}>
            <ChatIcon
              color={colors.textSecondary}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
            <Text style={styles.action}>Reply</Text>
          </Pressable>
          {repliesToggle ? (
            <>
              <Pressable
                onPress={repliesToggle.onToggle}
                style={styles.actionIconRow}
              >
                <Text style={styles.action}>
                  {repliesToggle.hidden
                    ? `Show latest replies (${repliesToggle.loaded}${repliesToggle.total > repliesToggle.loaded ? ` of ${repliesToggle.total}` : ''})`
                    : 'Hide replies'}
                </Text>
                <CaretDownIcon
                  color={colors.textSecondary}
                  height={responsiveSize(14)}
                  style={repliesToggle.hidden ? undefined : styles.caretFlipped}
                  width={responsiveSize(14)}
                />
              </Pressable>
              {!repliesToggle.hidden && repliesToggle.onLoadMore ? (
                <Pressable
                  disabled={repliesToggle.loading}
                  onPress={repliesToggle.onLoadMore}
                  style={styles.actionIconRow}
                >
                  <Text style={styles.action}>
                    {repliesToggle.loading
                      ? 'Loading replies…'
                      : `Show ${repliesToggle.total - repliesToggle.loaded} more replies`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function PaginatedCommentsScreen({
  commentId,
  reviewId,
  onBack,
}: {
  commentId?: string;
  reviewId: string;
  onBack: () => void;
}) {
  const api = useTastesApi();
  const currentUserId = useAuthenticatedUserId();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const windowDimensions = useWindowDimensions();
  const { height, width } = useOrientationDimensions();
  const headerTop = Math.max(
    insets.top,
    responsiveSize(width > height ? 12 : 54),
  );
  const headerSafeStyle = {
    height: responsiveSize(102 - 54) + headerTop,
    paddingTop: headerTop,
  };
  const composerBottom = Math.max(insets.bottom, responsiveSize(16));
  const composerSafeStyle = {
    height: responsiveSize(56) + composerBottom,
    paddingBottom: composerBottom,
  };
  const connectorColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
  const connectorX = responsiveSize(36);
  const connectorArmX = responsiveSize(63);
  const connectorReplyCenter = responsiveSize(32);
  const connectorStartY = responsiveSize(52);
  const connectorStroke = responsiveSize(2);
  const connectorDash = `${responsiveSize(2)},${responsiveSize(4)}`;
  const [text, setText] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createIdempotencyKey('comment'),
  );
  const [reportCommentId, setReportCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>('Inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const reportSheet = useBottomSheetMotion({
    onClose: () => setReportCommentId(null),
    visible: reportCommentId !== null,
  });
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [hiddenReplies, setHiddenReplies] = useState<Set<string>>(new Set());
  const [extraReplies, setExtraReplies] = useState<
    Record<string, { items: Comment[]; nextCursor: string | null | undefined }>
  >({});
  const [deepLinkedItems, setDeepLinkedItems] = useState<Comment[]>([]);
  const [deepLinkRevision, setDeepLinkRevision] = useState(0);
  const [loadingReplyIds, setLoadingReplyIds] = useState<Set<string>>(
    new Set(),
  );
  const [replyOffsets, setReplyOffsets] = useState<Record<string, number>>({});
  const [reviewReacting, setReviewReacting] = useState(false);
  const listRef = useRef<FlatList<Comment> | null>(null);
  const query = useComments(reviewId);
  const mutation = useAddComment(reviewId);
  const reaction = useReactToComment(reviewId);
  const deletion = useDeleteComment(reviewId);
  const pageItems = query.data?.pages.flatMap((page) => page.items) ?? [];
  const items = [
    ...new Map(
      [...deepLinkedItems, ...pageItems].map((item) => [item.id, item]),
    ).values(),
  ];
  const review = query.data?.pages[0]?.review;
  const rootItems = items.filter((item) => !item.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  items
    .filter((item) => item.parentCommentId)
    .forEach((item) => {
      const replies = repliesByParent.get(item.parentCommentId!) ?? [];
      replies.push(item);
      repliesByParent.set(item.parentCommentId!, replies);
    });

  // These pages live outside React Query only while this screen is mounted.
  // A refetch after a reaction or deletion must drop stale reply copies.
  useEffect(() => {
    setExtraReplies({});
  }, [query.dataUpdatedAt]);

  useEffect(() => {
    if (!commentId) {
      setDeepLinkedItems([]);
      return undefined;
    }
    let active = true;
    void api
      .getCommentContext({ reviewId, commentId })
      .then((response) => {
        if (active) setDeepLinkedItems(response.data.items);
      })
      .catch(() => {
        if (active) setDeepLinkedItems([]);
      });
    return () => {
      active = false;
    };
  }, [api, commentId, deepLinkRevision, reviewId]);

  function refreshDeepLinkContext() {
    setExtraReplies({});
    setDeepLinkRevision((revision) => revision + 1);
  }

  async function loadMoreReplies(parentCommentId: string) {
    if (loadingReplyIds.has(parentCommentId)) return;
    setLoadingReplyIds((current) => new Set(current).add(parentCommentId));
    try {
      const response = await api.getCommentReplies({
        reviewId,
        parentCommentId,
        cursor: extraReplies[parentCommentId]?.nextCursor ?? null,
        limit: 20,
      });
      setExtraReplies((current) => {
        const previous = current[parentCommentId]?.items ?? [];
        const byId = new Map(
          [...previous, ...response.data.items].map((item) => [item.id, item]),
        );
        return {
          ...current,
          [parentCommentId]: {
            items: [...byId.values()].sort((left, right) =>
              left.createdAt.localeCompare(right.createdAt),
            ),
            nextCursor: response.data.nextCursor,
          },
        };
      });
    } catch (error) {
      Alert.alert('Could not load replies', apiErrorMessage(error));
    } finally {
      setLoadingReplyIds((current) => {
        const next = new Set(current);
        next.delete(parentCommentId);
        return next;
      });
    }
  }
  const targetRootIndex = commentId
    ? rootItems.findIndex(
        (item) =>
          item.id === commentId ||
          items.some(
            (candidate) =>
              candidate.id === commentId &&
              candidate.parentCommentId === item.id,
          ),
      )
    : -1;

  useEffect(() => {
    if (!commentId || targetRootIndex < 0 || query.isPending) return undefined;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: targetRootIndex,
        viewPosition: 0.2,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [commentId, query.isPending, targetRootIndex]);

  async function submit() {
    const value = text.trim();
    if (!value || mutation.isPending) return;
    const command = {
      idempotencyKey,
      parentCommentId: replyTarget?.id ?? null,
      text: value,
    };
    setText('');
    setReplyTarget(null);
    setIdempotencyKey(createIdempotencyKey('comment'));
    try {
      await mutation.mutateAsync(command);
    } catch (error) {
      setText(value);
      Alert.alert('Could not post comment', apiErrorMessage(error));
    }
  }

  async function submitReport() {
    if (!reportCommentId || reporting) return;
    setReporting(true);
    try {
      await api.reportComment({
        idempotencyKey: createIdempotencyKey('comment-report'),
        reviewId,
        commentId: reportCommentId,
        reason: reportReason,
        ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
      });
      setReportCommentId(null);
      setReportDetails('');
      setReportReason('Inappropriate');
      setReportSent(true);
    } catch {
      Alert.alert('Could not send report', 'Please try again.');
    } finally {
      setReporting(false);
    }
  }

  async function reactToMainReview() {
    if (!review || reviewReacting) return;
    setReviewReacting(true);
    try {
      await api.reactToReview({
        idempotencyKey: createIdempotencyKey('comments-review-reaction'),
        reviewId,
        reaction: 'like',
      });
      await query.refetch();
    } catch (error) {
      Alert.alert('Could not update reaction', apiErrorMessage(error));
    } finally {
      setReviewReacting(false);
    }
  }

  return (
    <Screen style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoiding}
      >
        <View style={[styles.header, headerSafeStyle]}>
          <Pressable onPress={onBack} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Comments</Text>
          <View style={styles.back} />
        </View>
        {query.isPending ? (
          <LoadingState label="Loading comments…" />
        ) : query.isError && items.length === 0 ? (
          <ErrorState
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={styles.content}
            data={rootItems}
            initialNumToRender={10}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            maxToRenderPerBatch={10}
            ListHeaderComponent={
              review ? (
                <View>
                  <MainReview
                    onReact={() => void reactToMainReview()}
                    reacting={reviewReacting}
                    review={review}
                  />
                  <Text style={styles.commentsHeading}>Comments</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No comments yet. Be the first.</Text>
            }
            ListFooterComponent={
              <ListFooter loading={query.isFetchingNextPage} />
            }
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage)
                void query.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(
                () =>
                  listRef.current?.scrollToIndex({
                    animated: false,
                    index,
                    viewPosition: 0.2,
                  }),
                50,
              );
            }}
            style={styles.list}
            windowSize={7}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching && !query.isFetchingNextPage}
                onRefresh={() => void query.refetch()}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item }) => {
              const previewReplies = repliesByParent.get(item.id) ?? [];
              const additionalReplies = extraReplies[item.id]?.items ?? [];
              const replies = [
                ...new Map(
                  [...additionalReplies, ...previewReplies].map((reply) => [
                    reply.id,
                    reply,
                  ]),
                ).values(),
              ].sort((left, right) =>
                left.createdAt.localeCompare(right.createdAt),
              );
              const hidden = hiddenReplies.has(item.id);
              const showError = (error: Error) =>
                Alert.alert('Could not update comment', apiErrorMessage(error));
              const toggleReplies = () =>
                setHiddenReplies((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              return (
                <View style={styles.thread}>
                  <CommentRow
                    highlighted={commentId === item.id}
                    item={item}
                    onDelete={
                      item.authorId === currentUserId
                        ? () =>
                            deletion.mutate(item.id, {
                              onError: showError,
                              onSuccess: refreshDeepLinkContext,
                            })
                        : undefined
                    }
                    onReact={() =>
                      reaction.mutate(
                        {
                          commentId: item.id,
                          idempotencyKey:
                            createIdempotencyKey('comment-reaction'),
                        },
                        {
                          onError: showError,
                          onSuccess: refreshDeepLinkContext,
                        },
                      )
                    }
                    onReply={() => setReplyTarget(item)}
                    onReport={() => setReportCommentId(item.id)}
                    repliesToggle={
                      item.replyCount > 0
                        ? {
                            loaded: replies.length,
                            total: item.replyCount,
                            hidden,
                            loading: loadingReplyIds.has(item.id),
                            onLoadMore:
                              replies.length < item.replyCount &&
                              extraReplies[item.id]?.nextCursor !== null
                                ? () => void loadMoreReplies(item.id)
                                : undefined,
                            onToggle: toggleReplies,
                          }
                        : undefined
                    }
                  />
                  {!hidden
                    ? replies.map((reply) => (
                        <CommentRow
                          highlighted={commentId === reply.id}
                          key={reply.id}
                          item={reply}
                          nested
                          onDelete={
                            reply.authorId === currentUserId
                              ? () =>
                                  deletion.mutate(reply.id, {
                                    onError: showError,
                                    onSuccess: refreshDeepLinkContext,
                                  })
                              : undefined
                          }
                          onReact={() =>
                            reaction.mutate(
                              {
                                commentId: reply.id,
                                idempotencyKey:
                                  createIdempotencyKey('comment-reaction'),
                              },
                              {
                                onError: showError,
                                onSuccess: refreshDeepLinkContext,
                              },
                            )
                          }
                          onReply={() => setReplyTarget(item)}
                          onReport={() => setReportCommentId(reply.id)}
                          onLayout={(event) => {
                            const nextOffset = event.nativeEvent.layout.y;
                            setReplyOffsets((current) =>
                              current[reply.id] === nextOffset
                                ? current
                                : { ...current, [reply.id]: nextOffset },
                            );
                          }}
                        />
                      ))
                    : null}
                  {!hidden && replies.length > 0 ? (
                    <Svg
                      height="100%"
                      pointerEvents="none"
                      style={styles.threadConnector}
                      width="100%"
                    >
                      {replies.map((reply) =>
                        replyOffsets[reply.id] == null ? null : (
                          <Line
                            key={reply.id}
                            stroke={connectorColor}
                            strokeDasharray={connectorDash}
                            strokeLinecap="round"
                            strokeWidth={connectorStroke}
                            x1={connectorX}
                            x2={connectorArmX}
                            y1={replyOffsets[reply.id] + connectorReplyCenter}
                            y2={replyOffsets[reply.id] + connectorReplyCenter}
                          />
                        ),
                      )}
                      {Object.keys(replyOffsets).some((replyId) =>
                        replies.some((reply) => reply.id === replyId),
                      ) ? (
                        <Line
                          stroke={connectorColor}
                          strokeDasharray={connectorDash}
                          strokeLinecap="round"
                          strokeWidth={connectorStroke}
                          x1={connectorX}
                          x2={connectorX}
                          y1={connectorStartY}
                          y2={Math.max(
                            ...replies.map((reply) =>
                              replyOffsets[reply.id] == null
                                ? connectorStartY
                                : replyOffsets[reply.id] + connectorReplyCenter,
                            ),
                          )}
                        />
                      ) : null}
                    </Svg>
                  ) : null}
                </View>
              );
            }}
          />
        )}
        <View style={[styles.composer, composerSafeStyle]}>
          {replyTarget ? (
            <View style={styles.replyBanner}>
              <Text numberOfLines={1} style={styles.replyBannerText}>
                Replying to {replyTarget.authorDisplayName}
              </Text>
              <Pressable onPress={() => setReplyTarget(null)}>
                <Text style={styles.replyClose}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            editable={!mutation.isPending}
            maxLength={1_000}
            onChangeText={(value) => {
              if (!text && value)
                setIdempotencyKey(createIdempotencyKey('comment'));
              setText(value);
            }}
            onSubmitEditing={() => void submit()}
            placeholder={
              replyTarget
                ? `Reply to ${replyTarget.authorDisplayName}`
                : 'Add comment'
            }
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={text}
          />
          <Pressable
            accessibilityLabel="Send comment"
            disabled={!text.trim() || mutation.isPending}
            onPress={() => void submit()}
            style={styles.send}
          >
            <SendIcon height={responsiveSize(20)} width={responsiveSize(20)} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal
        animationType="none"
        transparent
        visible={reportCommentId !== null}
        onRequestClose={reportSheet.close}
      >
        <View style={styles.reportScrim}>
          <Pressable
            onPress={reportSheet.close}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.reportSheet,
              {
                maxHeight: Math.max(
                  0,
                  windowDimensions.height - insets.top - responsiveSize(12),
                ),
                transform: [{ translateY: reportSheet.translateY }],
              },
            ]}
          >
            <View style={styles.sheetDragArea} {...reportSheet.panHandlers}>
              <View style={styles.sheetHandle} />
            </View>
            <ScrollView
              contentContainerStyle={styles.reportContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.reportTitle}>
                Why are you reporting this comment?
              </Text>
              {commentReportReasons.map((reason) => (
                <Pressable
                  key={reason.value}
                  onPress={() => setReportReason(reason.value)}
                  style={styles.reportRow}
                >
                  <Text style={styles.reportLabel}>{reason.label}</Text>
                  <Text style={styles.reportRadio}>
                    {reportReason === reason.value ? '●' : '○'}
                  </Text>
                </Pressable>
              ))}
              {reportReason === 'Something else' ? (
                <View>
                  <TextInput
                    maxLength={300}
                    multiline
                    onChangeText={setReportDetails}
                    placeholder="Tell us what happened…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.reportInput}
                    value={reportDetails}
                  />
                  <Text style={styles.reportCounter}>
                    {reportDetails.length}/300
                  </Text>
                </View>
              ) : null}
              <Pressable
                disabled={reporting}
                onPress={() => void submitReport()}
                style={styles.reportButton}
              >
                <Text style={styles.reportButtonText}>
                  {reporting ? 'Submitting…' : 'Submit report'}
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setReportSent(false)}
        visible={reportSent}
      >
        <View style={styles.sent}>
          <View style={styles.sentIcon}>
            <Text style={styles.sentCheck}>✓</Text>
          </View>
          <Text style={styles.sentTitle}>Report sent</Text>
          <Text style={styles.sentCopy}>
            Thanks for helping keep Tastes safe. Our team will review this
            shortly.
          </Text>
          <Pressable
            onPress={() => setReportSent(false)}
            style={styles.sentDone}
          >
            <Text style={styles.sentDoneText}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  responsiveStyleSheet({
    keyboardAvoiding: { flex: 1 },
    header: {
      height: 102,
      paddingTop: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
    },
    back: {
      width: 52,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backText: {
      color: colors.text,
      fontSize: 38,
      lineHeight: 39,
      fontWeight: '300',
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '700' },
    list: { flex: 1 },
    content: { paddingBottom: 16, backgroundColor: colors.canvas },
    empty: { color: colors.textMuted, textAlign: 'center', padding: 32 },
    mainReview: { marginBottom: 16, backgroundColor: colors.background },
    reviewAuthorRow: {
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    reviewAvatar: { width: 40, height: 40, borderRadius: 20 },
    reviewAvatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    reviewAvatarInitial: { color: colors.onPrimary, fontWeight: '800' },
    reviewAuthorCopy: { flex: 1, marginLeft: 8, gap: 3 },
    reviewAuthor: { color: colors.text, fontSize: 15, fontWeight: '700' },
    reviewUsername: { color: colors.textMuted, fontSize: 13 },
    reviewDate: { color: colors.textMuted, fontSize: 13 },
    reviewBody: { paddingTop: 14, gap: 16 },
    reviewVenueRow: {
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
    },
    reviewVenueCopy: { flex: 1, gap: 4 },
    reviewVenue: { color: colors.text, fontSize: 16, fontWeight: '700' },
    ratingStars: { flexDirection: 'row', gap: 1 },
    ratingStarCell: { width: 17, height: 22, overflow: 'hidden' },
    ratingStarFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    reviewStars: { color: colors.primary, fontSize: 18, letterSpacing: 1 },
    reviewEmptyStars: { color: colors.textMuted },
    reviewTag: {
      overflow: 'hidden',
      paddingHorizontal: 11,
      paddingVertical: 5,
      borderRadius: 20,
      color: colors.text,
      fontSize: 12,
      backgroundColor: colors.surfaceRaised,
    },
    dishes: { gap: 9, paddingHorizontal: 16 },
    dishCard: {
      width: 150,
      height: 150,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    dishImage: { width: '100%', height: '100%' },
    dishImageFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      backgroundColor: colors.surfaceRaised,
    },
    dishImageFallbackText: {
      color: colors.textMuted,
      fontSize: 11,
      textAlign: 'center',
    },
    dishShade: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    dishTitle: {
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    dishRating: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderTopRightRadius: 12,
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    dishModalScrim: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    dishModal: {
      padding: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    sheetDragArea: {
      height: 24,
      marginTop: -10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    dishModalHeader: { height: 48, flexDirection: 'row', alignItems: 'center' },
    dishModalContent: { paddingBottom: 8 },
    dishModalTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    dishModalClose: {
      width: 28,
      height: 28,
      borderWidth: 2,
      borderColor: colors.text,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dishModalCloseText: { color: colors.text, fontSize: 20, lineHeight: 21 },
    dishModalImage: {
      width: '100%',
      aspectRatio: 1,
      maxHeight: 380,
      marginTop: 8,
      overflow: 'hidden',
      borderRadius: 16,
      backgroundColor: colors.surfaceRaised,
    },
    dishModalRating: {
      alignSelf: 'flex-start',
      marginTop: 16,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      overflow: 'hidden',
      color: '#FFFFFF',
      backgroundColor: colors.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    dishModalName: {
      marginTop: 10,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
    },
    reviewText: {
      paddingHorizontal: 16,
      color: colors.text,
      fontSize: 14,
      lineHeight: 19,
    },
    reviewActions: {
      paddingHorizontal: 16,
      paddingBottom: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
    },
    reviewAction: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    reviewActionIconRow: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    reviewActionCount: { color: colors.text, fontSize: 14 },
    commentsHeading: {
      paddingHorizontal: 16,
      paddingBottom: 10,
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    thread: { position: 'relative' },
    // Figma's dotted tree connector is positioned over the rows so the nested
    // row backgrounds cannot hide the vertical segment or its horizontal arms.
    threadConnector: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    row: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      gap: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.canvas,
    },
    nestedRow: { paddingLeft: 63 },
    highlightedRow: {
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      backgroundColor: colors.surfaceRaised,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#45312E',
    },
    avatarImage: { width: 40, height: 40, borderRadius: 20 },
    initial: { color: colors.onPrimary, fontWeight: '700' },
    copy: { flex: 1, gap: 6 },
    meta: { flexDirection: 'row', justifyContent: 'space-between' },
    author: { color: colors.text, fontWeight: '700' },
    date: { color: colors.textMuted, fontSize: 12 },
    text: { color: colors.text, opacity: 0.82, lineHeight: 19 },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 3,
    },
    action: { color: colors.textSecondary, fontSize: 13 },
    actionActive: { color: colors.primary },
    reactionAction: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    reactionCount: { color: colors.text, fontSize: 14 },
    actionIconRow: {
      minHeight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    caretFlipped: { transform: [{ rotate: '180deg' }] },
    composer: {
      height: 89,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 33,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
    },
    replyBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      top: -30,
      height: 30,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceRaised,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    },
    replyBannerText: { flex: 1, color: colors.textMuted, fontSize: 12 },
    replyClose: { color: colors.text, fontSize: 20 },
    input: {
      flex: 1,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: theme.radius.pill,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
    },
    send: {
      width: 40,
      height: 40,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    reportScrim: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.64)',
    },
    reportSheet: {
      overflow: 'hidden',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: colors.surface,
    },
    reportContent: { padding: 18, paddingBottom: 28 },
    reportTitle: {
      marginBottom: 8,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    reportRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    reportLabel: { color: colors.text, fontSize: 15 },
    reportRadio: { color: colors.primary, fontSize: 18 },
    reportInput: {
      height: 88,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      textAlignVertical: 'top',
    },
    reportCounter: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'right',
    },
    reportButton: {
      height: 52,
      marginTop: 16,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    reportButtonText: {
      color: colors.onPrimary,
      fontSize: 16,
      fontWeight: '700',
    },
    sent: {
      flex: 1,
      paddingHorizontal: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
    },
    sentIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sentCheck: { color: colors.onPrimary, fontSize: 34, fontWeight: '800' },
    sentTitle: {
      marginTop: 24,
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
    },
    sentCopy: {
      marginTop: 10,
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    sentDone: {
      position: 'absolute',
      left: 36,
      right: 36,
      bottom: 34,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sentDoneText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  });
