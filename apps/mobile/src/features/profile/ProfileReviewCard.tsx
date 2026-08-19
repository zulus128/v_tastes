import type { FeedItem } from '@tastes/contracts';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { storage } from '../../infrastructure/firebase';
import { captureException } from '../../infrastructure/observability';
import { formatDisplayDate } from '../../infrastructure/date';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { ProfileData } from './api';
import { profileAvatarSource } from './avatar';
import ChatIcon from '../../../assets/comments/chat-round-outline.svg';

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

export function ProfileReviewCard({
  fallbackImageUrl,
  item,
  onComments,
  onMore,
  onReact,
  onShare,
  profile,
}: {
  fallbackImageUrl?: string;
  item: FeedItem;
  onComments: () => void;
  onMore: () => void;
  onReact: () => void;
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
        <Image source={profileAvatarSource(profile)} style={styles.reviewAvatar} />
        <View style={styles.reviewAuthorCopy}>
          <Text style={styles.reviewAuthor}>{profile.displayName}</Text>
          <Text style={styles.reviewHandle}>{profile.username ? `@${profile.username}` : ''}</Text>
        </View>
        <Text style={styles.reviewDate}>{formatDisplayDate(item.createdAt)}</Text>
        <Pressable accessibilityLabel="Review actions" onPress={onMore}><Text style={styles.moreGlyph}>⋮</Text></Pressable>
      </View>
      <View style={styles.reviewBody}>
        <View style={styles.reviewVenueRow}>
          <View style={styles.reviewVenueCopy}>
            <Text numberOfLines={1} style={styles.reviewVenue}>{item.venueName}</Text>
            <Text style={styles.reviewStars}>
              {'★'.repeat(Math.max(1, Math.round(item.rating)))}
              <Text style={styles.emptyStars}>{'★'.repeat(Math.max(0, 5 - Math.round(item.rating)))}</Text>
            </Text>
          </View>
          {tags[0] ? <Text style={styles.visitTag}>{tagLabels[tags[0]] ?? tags[0]}</Text> : null}
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
          <Pressable onPress={onReact}><Text style={styles.metric}>♡ {item.reactionCount}</Text></Pressable>
          <Pressable accessibilityLabel="Open comments" onPress={onComments} style={styles.metricIconRow}>
            <ChatIcon color={colors.text} height={20} width={20} />
            <Text style={styles.metric}>{item.commentCount}</Text>
          </Pressable>
          <Pressable onPress={onShare}><Text style={styles.metric}>↗</Text></Pressable>
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
  reviewCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  reviewHeader: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised },
  reviewAvatar: { width: 40, height: 40, borderRadius: 20 },
  reviewAuthorCopy: { flex: 1, marginLeft: 8, gap: 3 },
  reviewAuthor: { color: colors.text, fontSize: 15, fontWeight: '600' },
  reviewHandle: { color: colors.textSecondary, fontSize: 13 },
  reviewDate: { color: colors.textMuted, fontSize: 13 },
  moreGlyph: { marginLeft: 8, color: colors.textMuted, fontSize: 24 },
  reviewBody: { padding: 16, gap: 13 },
  reviewVenueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewVenueCopy: { flex: 1, gap: 3 },
  reviewVenue: { color: colors.text, fontSize: 16, fontWeight: '600' },
  reviewStars: { color: '#D33B35', fontSize: 18, letterSpacing: 1 },
  emptyStars: { color: '#D33B35', opacity: 0.3 },
  visitTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 40, overflow: 'hidden', backgroundColor: colors.surfaceRaised, color: colors.text, fontSize: 12 },
  dishRow: { gap: 9 },
  dishCard: { width: 150, height: 150, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, backgroundColor: colors.surfaceRaised },
  dishTitle: { position: 'absolute', top: 8, left: 10, right: 10, color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  dishRating: { position: 'absolute', bottom: 5, left: 0, paddingHorizontal: 10, paddingVertical: 4, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(22,22,22,0.72)', color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  reviewText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  metrics: { paddingTop: 2, flexDirection: 'row', gap: 20 },
  metricIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metric: { color: colors.text, fontSize: 14 },
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
