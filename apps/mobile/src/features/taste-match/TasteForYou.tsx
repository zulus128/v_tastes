import type { TasteRecommendationsResult } from '@tastes/contracts';
import { ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize } from '../../ui/responsive';
import { TasteRecommendationCard } from './TasteRecommendationCard';

export function TasteForYou({
  onOpenPlace,
  onOpenReview,
  width,
  data,
}: {
  onOpenPlace: (id: string) => void;
  onOpenReview: (id: string) => void;
  width: number;
  data: TasteRecommendationsResult | undefined;
}) {
  const { colors } = useAppTheme();
  if (!data) return null;
  const subtitle =
    data.state === 'cold_start'
      ? `Rate ${data.requiredDishCount} different dishes to build your taste profile (${data.distinctRatedDishes}/${data.requiredDishCount}).`
      : data.state === 'insufficient_overlap'
        ? 'Still looking for people with similar dish ratings.'
        : data.state === 'no_match_candidates'
          ? 'No new dishes from your taste matches in this area yet.'
          : 'Dishes recommended by people with similar ratings';
  return (
    <View style={{ marginVertical: 12 }}>
      <Text
        style={{
          color: colors.text,
          fontWeight: '700',
          fontSize: responsiveSize(20),
          marginHorizontal: responsiveSize(16),
        }}
      >
        For you
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: responsiveSize(12),
          marginHorizontal: responsiveSize(16),
          marginTop: 5,
        }}
      >
        {subtitle}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: responsiveSize(16),
          gap: responsiveSize(10),
        }}
      >
        {data.recommendations.map((card) => (
          <TasteRecommendationCard
            key={card.id}
            card={card}
            width={width}
            onOpenPlace={() => onOpenPlace(card.venue.id)}
            onOpenReview={() => onOpenReview(card.reviewId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
