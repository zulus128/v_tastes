import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import NightIcon from '../../../assets/create-review/tag-night.svg';
import type { DishReviewDraft } from '../create-review/api';
import { formatDisplayDate } from '../../infrastructure/date';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import type { ProfileData } from './api';
import { profileAvatarSource } from './avatar';

export interface ProfileReviewDraft {
  dishes: DishReviewDraft[];
  rating: number;
  savedAt: string;
  text: string;
  venueName: string;
}

function RatingStars({ rating, styles }: { rating: number; styles: ReturnType<typeof createStyles> }) {
  const clamped = Math.max(0, Math.min(5, rating));
  return <View accessibilityLabel={`${clamped.toFixed(1)} out of 5 stars`} style={styles.ratingStars}>
    {[1, 2, 3, 4, 5].map((star) => {
      const fill = Math.max(0, Math.min(1, clamped - star + 1));
      return <View key={star} style={styles.ratingStarCell}>
        <Text style={[styles.ratingStar, styles.ratingStarEmpty]}>★</Text>
        {fill > 0 ? <View style={[styles.ratingStarFill, { width: `${fill * 100}%` }]}><Text style={styles.ratingStar}>★</Text></View> : null}
      </View>;
    })}
  </View>;
}

export function ProfileDraftCard({
  draft,
  onContinue,
  profile,
}: {
  draft: ProfileReviewDraft;
  onContinue: () => void;
  profile: ProfileData;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dishes = Array.isArray(draft.dishes) ? draft.dishes : [];
  const text = typeof draft.text === 'string' ? draft.text : '';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Image source={profileAvatarSource(profile)} style={styles.avatar} />
        <View style={styles.authorCopy}>
          <Text numberOfLines={1} style={styles.authorName}>{profile.displayName}</Text>
          <Text numberOfLines={1} style={styles.authorHandle}>{profile.username ? `@${profile.username}` : ''}</Text>
        </View>
        <Text style={styles.date}>{formatDisplayDate(draft.savedAt)}</Text>
        <Text accessibilityLabel="More options unavailable for a draft" style={styles.more}>⋮</Text>
      </View>

      <View style={styles.venueRow}>
        <View style={styles.venueCopy}>
          <Text numberOfLines={1} style={styles.venue}>{draft.venueName}</Text>
          <RatingStars rating={draft.rating} styles={styles} />
        </View>
        <View style={styles.draftTag}>
          <NightIcon color="#FFFFFF" height={12} width={12} />
          <Text style={styles.draftTagText}>Draft</Text>
        </View>
      </View>

      {dishes.length > 0 ? <ScrollView
        contentContainerStyle={styles.dishRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {dishes.map((dish) => (
          <View key={dish.id} style={styles.dishCard}>
            <Image source={{ uri: dish.photoUri }} style={styles.dishImage} />
            <LinearGradient colors={['rgba(22,22,22,0.9)', 'rgba(22,22,22,0)']} style={styles.dishTitleShade} />
            <Text numberOfLines={1} style={styles.dishTitle}>{dish.title}</Text>
            <View style={styles.dishRating}><Text style={styles.dishRatingText}>★ {dish.rating.toFixed(1)}</Text></View>
          </View>
        ))}
      </ScrollView> : null}

      <View style={styles.footer}>
        <View style={styles.textWrap}>
          <Text numberOfLines={2} style={styles.text}>{text}</Text>
          {text.length > 80 ? <LinearGradient
            colors={['rgba(22,22,22,0)', colors.surface]}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            end={{ x: 0.36, y: 0 }}
            style={styles.seeMoreShade}
          ><Text style={styles.seeMore}>See more</Text></LinearGradient> : null}
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onContinue} style={styles.continueButton}>
          <Text style={styles.continueText}>Continue editing  →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: 16, paddingBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  header: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surfaceRaised },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorCopy: { flex: 1, minWidth: 0, gap: 4 },
  authorName: { color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.41 },
  authorHandle: { color: colors.textSecondary, fontSize: 13, letterSpacing: -0.24 },
  date: { color: colors.text, fontSize: 14, letterSpacing: -0.24, opacity: 0.4 },
  more: { width: 24, color: colors.text, fontSize: 24, lineHeight: 24, textAlign: 'center', opacity: 0.5 },
  venueRow: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 4 },
  venueCopy: { flex: 1, minWidth: 0, gap: 4 },
  venue: { color: colors.text, fontSize: 16, fontWeight: '600', letterSpacing: -0.24 },
  ratingStars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingStarCell: { width: 20, height: 20, overflow: 'hidden' },
  ratingStarFill: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  ratingStar: { color: colors.primary, fontSize: 20, lineHeight: 20 },
  ratingStarEmpty: { opacity: 0.3 },
  draftTag: { paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 40, backgroundColor: colors.primary },
  draftTagText: { color: '#FFFFFF', fontSize: 12, letterSpacing: -0.23 },
  dishRow: { paddingLeft: 16, paddingRight: 1, gap: 9 },
  dishCard: { width: 150, height: 150, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, backgroundColor: colors.surfaceRaised },
  dishImage: { width: 150, height: 150 },
  dishTitleShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 48 },
  dishTitle: { position: 'absolute', top: 8, left: 10, right: 10, color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: -0.24, textAlign: 'center' },
  dishRating: { position: 'absolute', bottom: 0, left: 0, height: 24, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 16, backgroundColor: 'rgba(22,22,22,0.72)' },
  dishRatingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: -0.23 },
  footer: { paddingHorizontal: 16, gap: 20 },
  textWrap: { position: 'relative' },
  text: { color: colors.text, fontSize: 14, lineHeight: 18, letterSpacing: -0.41 },
  seeMoreShade: { position: 'absolute', right: 0, bottom: 0, width: 104, height: 18, alignItems: 'flex-end', justifyContent: 'center' },
  seeMore: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', letterSpacing: -0.41 },
  continueButton: { alignSelf: 'flex-start' },
  continueText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
