import type { TasteRecommendation } from '@tastes/contracts';
import { Image, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../../ui/ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import { responsiveStyleSheet } from '../../ui/responsive';
import { resolveStorageImageUrl } from '../../infrastructure/storageImage';
import { useState } from 'react';

export function TasteRecommendationCard({
  card,
  onOpenReview,
  onOpenPlace,
  onDismiss,
  width,
}: {
  card: TasteRecommendation;
  onOpenReview: () => void;
  onOpenPlace: () => void;
  onDismiss?: () => void;
  width?: number;
}) {
  const { colors } = useAppTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const image = useQuery({
    queryKey: ['storage-image', card.dishPhotoPath],
    queryFn: () => resolveStorageImageUrl(card.dishPhotoPath!),
    enabled:
      !!card.dishPhotoPath &&
      (!card.dishPhotoUrl || failedUri === card.dishPhotoUrl),
    staleTime: 10 * 60_000,
  });
  const photo =
    card.dishPhotoUrl && failedUri !== card.dishPhotoUrl
      ? card.dishPhotoUrl
      : image.data;
  const label =
    card.tier === 'taste_match'
      ? 'Similar tastes'
      : card.tier === 'social'
        ? 'People you follow'
        : 'Popular dish nearby';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        width ? { width } : {},
      ]}
      testID="taste-recommendation-card"
    >
      <View style={styles.heading}>
        <Text style={[styles.label, { color: colors.primary }]}>{label}</Text>
        {onDismiss ? (
          <Pressable
            accessibilityLabel={`Dismiss recommendation for ${card.canonicalDishName}`}
            hitSlop={10}
            onPress={onDismiss}
          >
            <Text style={{ color: colors.textSecondary }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityLabel={`See review of ${card.canonicalDishName} at ${card.venue.name}`}
        onPress={onOpenReview}
        style={styles.row}
      >
        {photo && photo !== failedUri ? (
          <Image
            source={{ uri: photo }}
            style={styles.photo}
            onError={() => setFailedUri(photo)}
          />
        ) : (
          <View
            style={[styles.photo, styles.placeholder]}
            accessibilityLabel="No dish photo"
          >
            <Text>🍽️</Text>
          </View>
        )}
        <View style={styles.copy}>
          <Text style={[styles.dish, { color: colors.text }]}>
            {card.canonicalDishName}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {card.dishRating.toFixed(1)} ★ · {card.supporterCount}{' '}
            {card.supporterCount === 1
              ? 'supporting review'
              : 'supporting reviews'}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={onOpenPlace}>
        <Text style={[styles.venue, { color: colors.text }]}>
          {card.venue.name}
          {card.venue.distanceKm !== undefined
            ? ` · ${card.venue.distanceKm.toFixed(1)} km`
            : card.venue.city
              ? ` · ${card.venue.city}`
              : ''}
        </Text>
      </Pressable>
      <Text style={[styles.explanation, { color: colors.textSecondary }]}>
        {card.headline}
      </Text>
      {card.connection ? (
        <Text style={[styles.explanation, { color: colors.textSecondary }]}>
          {card.connection}
        </Text>
      ) : null}
    </View>
  );
}
const styles = responsiveStyleSheet({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 9,
    marginVertical: 8,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 64, height: 64, borderRadius: 12 },
  placeholder: {
    backgroundColor: '#737373',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 5 },
  dish: { fontSize: 17, fontWeight: '700' },
  venue: { fontSize: 14, fontWeight: '600' },
  explanation: { fontSize: 12, lineHeight: 17 },
});
