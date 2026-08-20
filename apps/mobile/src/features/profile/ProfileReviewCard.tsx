import type { FeedItem } from '@tastes/contracts';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { storage } from '../../infrastructure/firebase';
import { captureException } from '../../infrastructure/observability';
import { formatDisplayDate } from '../../infrastructure/date';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { ProfileData } from './api';
import { ProfileAvatar } from './avatar';
import ChatIcon from '../../../assets/comments/chat-round-outline.svg';
import HeartIcon from '../../../assets/comments/heart-outline.svg';
import ShareIcon from '../../../assets/comments/square-share-line-broken.svg';
import DishIcon from '../../../assets/create-review/add-dish.svg';
import NightIcon from '../../../assets/create-review/tag-night.svg';
import PinnedIndicator from '../../../assets/profile/pinned-indicator.svg';

const tagLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

function DishPhoto({ fallbackUri, large = false, path }: { fallbackUri?: string; large?: boolean; path?: string }) {
  const [state, setState] = useState<{ uri?: string; failed: boolean }>({ failed: false });
  const normalizedPath = path?.trim().replace(/^\/+|\/+$/g, '');
  const imageStyle = large ? staticStyles.dishImageLarge : staticStyles.dishImage;

  useEffect(() => {
    let active = true;
    if (!normalizedPath) {
      setState(fallbackUri ? { uri: fallbackUri, failed: false } : { failed: true });
      return () => { active = false; };
    }

    let download: Promise<string>;
    try {
      const photoRef = storageRef(storage, normalizedPath);
      if (!photoRef.fullPath.replace(/\//g, '')) throw { code: 'storage/invalid-root-operation' };
      download = getDownloadURL(photoRef);
    } catch (error) {
      if ((error as { code?: string }).code !== 'storage/invalid-root-operation')
        captureException(error, { operation: 'load-profile-review-photo', path: normalizedPath });
      setState(fallbackUri ? { uri: fallbackUri, failed: false } : { failed: true });
      return () => { active = false; };
    }

    setState({ failed: false });
    void download.then((value) => {
      if (active) setState({ uri: value, failed: false });
    }).catch((error) => {
      if ((error as { code?: string }).code !== 'storage/invalid-root-operation')
        captureException(error, { operation: 'load-profile-review-photo', path: normalizedPath });
      if (active) setState(fallbackUri ? { uri: fallbackUri, failed: false } : { failed: true });
    });
    return () => { active = false; };
  }, [fallbackUri, normalizedPath]);

  return state.uri
    ? <Image onError={() => setState({ failed: true })} source={{ uri: state.uri }} style={imageStyle} />
    : <View style={[imageStyle, staticStyles.dishImagePlaceholder]}>{state.failed ? <Text style={staticStyles.dishImageError}>Photo unavailable</Text> : null}</View>;
}

function RatingStars({ rating, styles }: { rating: number; styles: ReturnType<typeof createStyles> }) {
  const clamped = Math.max(0, Math.min(5, rating));
  return <View style={styles.ratingStars} accessibilityLabel={`${clamped.toFixed(1)} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => {
      const fill = Math.max(0, Math.min(1, clamped - star + 1));
      return <View key={star} style={styles.ratingStarCell}>
        <Text style={[styles.reviewStars, styles.emptyStars]}>★</Text>
        {fill > 0 ? <View style={[styles.ratingStarFill, { width: `${fill * 100}%` }]}><Text style={styles.reviewStars}>★</Text></View> : null}
      </View>;
    })}
  </View>;
}

export function ProfileReviewCard({
  fallbackImageUrl,
  item,
  onComments,
  onMore,
  onReact,
  reacted = false,
  onShare,
  profile,
}: {
  fallbackImageUrl?: string;
  item: FeedItem;
  onComments: () => void;
  onMore: () => void;
  onReact: () => void;
  reacted?: boolean;
  onShare: () => void;
  profile: ProfileData;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dishes = item.dishReviews ?? [];
  const tags = item.tags ?? [];
  const [selectedDish, setSelectedDish] = useState<(typeof dishes)[number] | null>(null);

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <ProfileAvatar profile={profile} style={styles.reviewAvatar} />
        <View style={styles.reviewAuthorCopy}>
          <Text style={styles.reviewAuthor}>{profile.displayName}</Text>
          <Text style={styles.reviewHandle}>{profile.username ? `@${profile.username}` : ''}</Text>
        </View>
        {item.pinned ? <View accessibilityLabel="Pinned review" style={styles.pinBadge}><PinnedIndicator height={16} width={16} /></View> : null}
        <Text style={styles.reviewDate}>{formatDisplayDate(item.createdAt)}</Text>
        <Pressable
          accessibilityLabel="Review actions"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onMore}
          pressRetentionOffset={12}
          style={styles.moreButton}
        >
          <Text style={styles.moreGlyph}>⋮</Text>
        </Pressable>
      </View>
      <View style={styles.reviewBody}>
        <View style={styles.reviewVenueRow}>
          <View style={styles.reviewVenueCopy}>
            <Text numberOfLines={1} style={styles.reviewVenue}>{item.venueName}</Text>
            <RatingStars rating={item.rating} styles={styles} />
          </View>
          {tags[0] ? (
            <View style={styles.visitTag}>
              {tags[0] === 'date-night' ? <NightIcon color={colors.text} height={12} width={12} /> : null}
              <Text style={styles.visitTagText}>{tagLabels[tags[0]] ?? tags[0]}</Text>
            </View>
          ) : null}
        </View>
        {dishes.length > 0 ? (
          <ScrollView contentContainerStyle={styles.dishRow} horizontal showsHorizontalScrollIndicator={false}>
            {dishes.map((dish) => (
              <Pressable accessibilityLabel={`Open photo of ${dish.title}`} key={dish.id} onPress={() => setSelectedDish(dish)} style={styles.dishCard}>
                <DishPhoto fallbackUri={fallbackImageUrl} path={dish.photoPath} />
                <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Text numberOfLines={4} style={styles.reviewText}>{item.text}</Text>
        <View style={styles.metrics}>
          <View style={styles.metricActions}>
            <Pressable onPress={onReact} style={styles.metricIconRow}>
              <HeartIcon color={reacted ? colors.primary : colors.text} height={15.5978} width={17.9167} />
              <Text style={[styles.metric, reacted && styles.metricActive]}>{item.reactionCount}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Open comments" onPress={onComments} style={styles.metricIconRow}>
              <ChatIcon color={colors.text} height={20} width={20} />
              <Text style={styles.metric}>{item.commentCount}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Share review" onPress={onShare} style={styles.metricIconButton}>
              <ShareIcon color={colors.text} height={18.1667} width={18.1673} />
            </Pressable>
          </View>
          {dishes.length > 0 ? (
            <View style={styles.dishCountTag}>
              <DishIcon color={colors.text} height={10.8392} width={12} />
              <Text style={styles.dishCountText}>{dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Modal animationType="fade" onRequestClose={() => setSelectedDish(null)} transparent visible={selectedDish !== null}>
        <View style={styles.photoModalScrim}>
          <Pressable accessibilityLabel="Close photo" onPress={() => setSelectedDish(null)} style={StyleSheet.absoluteFill} />
          <View style={styles.photoModal}>
            <View style={styles.photoModalHeader}>
              <Text numberOfLines={1} style={styles.photoModalTitle}>{selectedDish?.title}</Text>
              <Pressable accessibilityLabel="Close photo" hitSlop={8} onPress={() => setSelectedDish(null)}><Text style={styles.photoModalClose}>×</Text></Pressable>
            </View>
            {selectedDish ? <DishPhoto fallbackUri={fallbackImageUrl} large path={selectedDish.photoPath} /> : null}
            {selectedDish ? <Text style={styles.photoModalRating}>★ {selectedDish.rating.toFixed(1)}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  reviewCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  reviewHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 23, borderTopRightRadius: 23, position: 'relative' },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20 },
  reviewAuthorCopy: { flex: 1, marginLeft: 8, gap: 3 },
  reviewAuthor: { color: colors.text, fontSize: 15, fontWeight: '600' },
  reviewHandle: { color: colors.textSecondary, fontSize: 13 },
  reviewDate: { color: colors.text, fontSize: 14, opacity: 0.4 },
  pinBadge: { position: 'absolute', zIndex: 1, top: -2, right: -6, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  moreButton: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  moreGlyph: { color: colors.textMuted, fontSize: 24, lineHeight: 28 },
  reviewBody: { padding: 16, gap: 16 },
  reviewVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewVenueCopy: { flex: 1, gap: 3 },
  reviewVenue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  ratingStars: { flexDirection: 'row', gap: 1 },
  ratingStarCell: { width: 14, height: 14, overflow: 'hidden' },
  ratingStarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  reviewStars: { color: '#D33B35', fontSize: 14, lineHeight: 14 },
  emptyStars: { color: '#D33B35', opacity: 0.3 },
  visitTag: { height: 24, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 40, backgroundColor: colors.surfaceRaised },
  visitTagText: { color: colors.text, fontSize: 12 },
  dishRow: { gap: 9 },
  dishCard: { width: 150, height: 150, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, backgroundColor: colors.surfaceRaised },
  dishTitle: { position: 'absolute', top: 8, left: 10, right: 10, color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dishRating: { position: 'absolute', bottom: 5, left: 0, paddingHorizontal: 10, paddingVertical: 4, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(22,22,22,0.72)', color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  reviewText: { color: colors.text, fontSize: 14, lineHeight: 18, letterSpacing: -0.24 },
  metrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIconRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricIconButton: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  metric: { color: colors.text, fontSize: 14 },
  metricActive: { color: colors.primary },
  dishCountTag: { height: 24, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: 'rgba(184,47,41,0.4)', borderRadius: 40 },
  dishCountText: { color: colors.text, fontSize: 12 },
  photoModalScrim: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.84)' },
  photoModal: { width: '100%', maxWidth: 430, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  photoModalHeader: { height: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  photoModalTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' },
  photoModalClose: { color: colors.text, fontSize: 30, lineHeight: 32 },
  photoModalRating: { padding: 16, color: '#D33B35', fontSize: 18, fontWeight: '700' },
});

const staticStyles = StyleSheet.create({
  dishImage: { width: 150, height: 150 },
  dishImageLarge: { width: '100%', aspectRatio: 1 },
  dishImagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#222222' },
  dishImageError: { margin: 'auto', color: '#AEB4C0', fontSize: 11, textAlign: 'center' },
});
