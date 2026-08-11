import type { FeedItem } from '@tastes/contracts';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { storage } from '../../infrastructure/firebase';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { ProfileData } from './api';
import { profileAvatarSource } from './avatar';

const tagLabels: Record<string, string> = {
  casual: 'Casual',
  'date-night': 'Date night',
  birthday: 'Birthday',
  children: 'With children',
};

function DishPhoto({ path }: { path: string }) {
  const [uri, setUri] = useState<string>();

  useEffect(() => {
    let active = true;
    void getDownloadURL(storageRef(storage, path)).then((value) => {
      if (active) setUri(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [path]);

  return uri
    ? <Image source={{ uri }} style={staticStyles.dishImage} />
    : <View style={staticStyles.dishImagePlaceholder} />;
}

export function ProfileReviewCard({
  item,
  onComments,
  onMore,
  onReact,
  onShare,
  profile,
}: {
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

  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Image source={profileAvatarSource(profile)} style={styles.reviewAvatar} />
        <View style={styles.reviewAuthorCopy}>
          <Text style={styles.reviewAuthor}>{profile.displayName}</Text>
          <Text style={styles.reviewHandle}>{profile.username ? `@${profile.username}` : ''}</Text>
        </View>
        <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
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
              <View key={dish.id} style={styles.dishCard}>
                <DishPhoto path={dish.photoPath} />
                <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <Text numberOfLines={4} style={styles.reviewText}>{item.text}</Text>
        <View style={styles.metrics}>
          <Pressable onPress={onReact}><Text style={styles.metric}>♡ {item.reactionCount}</Text></Pressable>
          <Pressable onPress={onComments}><Text style={styles.metric}>◯ {item.commentCount}</Text></Pressable>
          <Pressable onPress={onShare}><Text style={styles.metric}>↗</Text></Pressable>
        </View>
      </View>
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
  metric: { color: colors.text, fontSize: 14 },
});

const staticStyles = StyleSheet.create({
  dishImage: { width: 150, height: 150 },
  dishImagePlaceholder: { width: 150, height: 150, backgroundColor: '#222222' },
});
