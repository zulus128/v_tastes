import type { Review } from '@tastes/contracts';
import { Text, View } from 'react-native';
import { useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize } from '../../ui/responsive';

export function RevisedReviewSummary({
  review,
}: {
  review: Pick<Review, 'visitCount' | 'previousRating' | 'rating'>;
}) {
  const { colors } = useAppTheme();
  if ((review.visitCount ?? 1) < 2) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: responsiveSize(10),
        paddingHorizontal: responsiveSize(16),
        paddingTop: responsiveSize(10),
      }}
    >
      <Text
        style={{
          color: colors.primary,
          fontSize: responsiveSize(12),
          fontWeight: '700',
        }}
      >
        REVISED
      </Text>
      {review.previousRating != null ? (
        <Text
          style={{
            color: colors.textSecondary,
            textDecorationLine: 'line-through',
          }}
        >
          {review.previousRating.toFixed(1)}
        </Text>
      ) : null}
      <Text style={{ color: colors.text }}>★ {review.rating.toFixed(1)}</Text>
    </View>
  );
}
