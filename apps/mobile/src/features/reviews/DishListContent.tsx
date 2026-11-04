import type { Review } from '@tastes/contracts';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize } from '../../ui/responsive';

type Dish = Review['dishReviews'][number];
type Visit = NonNullable<Review['visits']>[number];

export function dishVisitTag(dish: Dish, latestVisitId?: string) {
  if (!latestVisitId || dish.latestVisitId !== latestVisitId) return '';
  if (dish.firstVisitId === latestVisitId) return 'New dish';
  const history = dish.history ?? [];
  return history.length > 1 && history.at(-1)?.rating !== history.at(-2)?.rating
    ? 'Re-rated'
    : '';
}

export function reviewDishLabel(
  review: Pick<Review, 'dishReviews' | 'visits' | 'visitCount'>,
) {
  const latest = review.visits?.at(-1)?.id;
  const added =
    (review.visitCount ?? 1) > 1
      ? review.dishReviews.filter((dish) => dish.firstVisitId === latest).length
      : 0;
  return `Dishes (${review.dishReviews.length})${added ? ` · ${added} new` : ''}`;
}

export function DishListContent({
  dishes,
  visits = [],
  onOpen,
}: {
  dishes: Dish[];
  visits?: Visit[];
  onOpen: (index: number) => void;
}) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'high' | 'low' | 'name'>('high');
  const [filter, setFilter] = useState('all');
  const latest = visits.at(-1)?.id;
  const dateLabel = (visit: Visit, chips = false) => {
    const date = new Date(visit.createdAt);
    const sameMonth =
      visits.filter(
        (other) => other.createdAt.slice(0, 7) === visit.createdAt.slice(0, 7),
      ).length > 1;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      ...(!chips || sameMonth ? { day: 'numeric' as const } : {}),
    });
  };
  const groups =
    filter !== 'all'
      ? visits.filter((visit) => visit.id === filter)
      : visits.length
        ? [...visits].reverse()
        : [{ id: '', createdAt: '', rating: 0, text: '' }];
  return (
    <View
      style={{
        flexShrink: 1,
        gap: responsiveSize(12),
        paddingHorizontal: responsiveSize(16),
      }}
    >
      <TextInput
        accessibilityLabel="Search dishes"
        placeholder="Search dishes"
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        style={{
          color: colors.text,
          backgroundColor: colors.surfaceRaised,
          borderRadius: 12,
          padding: responsiveSize(12),
        }}
      />
      <Pressable
        accessibilityLabel="Sort dishes"
        onPress={() =>
          setSort((value) =>
            value === 'high' ? 'low' : value === 'low' ? 'name' : 'high',
          )
        }
      >
        <Text style={{ color: colors.primary }}>
          {sort === 'high'
            ? 'Highest rated'
            : sort === 'low'
              ? 'Lowest rated'
              : 'Name A–Z'}{' '}
          ↕
        </Text>
      </Pressable>
      {visits.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: responsiveSize(8) }}
          style={{ flexGrow: 0 }}
        >
          {[
            { id: 'all', label: 'All visits' },
            ...[...visits].reverse().map((visit) => ({
              id: visit.id,
              label: dateLabel(visit, true),
            })),
          ].map((chip) => (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === chip.id }}
              onPress={() => setFilter(chip.id)}
              style={{
                backgroundColor:
                  filter === chip.id ? colors.primary : colors.surfaceRaised,
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{ color: filter === chip.id ? '#fff' : colors.text }}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: responsiveSize(16),
          paddingBottom: responsiveSize(24),
        }}
      >
        {groups.map((visit) => {
          const rows = dishes
            .flatMap((dish, index) => {
              const history = dish.history?.find(
                (entry) => entry.visitId === visit.id,
              );
              if (filter !== 'all' && !history) return [];
              if (
                filter === 'all' &&
                visits.length &&
                dish.latestVisitId !== visit.id
              )
                return [];
              if (
                !dish.title
                  .toLocaleLowerCase()
                  .includes(query.trim().toLocaleLowerCase())
              )
                return [];
              return [
                {
                  dish,
                  index,
                  rating: filter !== 'all' ? history!.rating : dish.rating,
                },
              ];
            })
            .sort((left, right) =>
              sort === 'name'
                ? left.dish.title.localeCompare(right.dish.title)
                : (sort === 'high' ? -1 : 1) * (left.rating - right.rating) ||
                  left.dish.title.localeCompare(right.dish.title),
            );
          if (!rows.length) return null;
          return (
            <View
              key={visit.id || 'single'}
              style={{ gap: responsiveSize(12) }}
            >
              {visits.length > 1 ? (
                <Text style={{ color: colors.textSecondary }}>
                  {visit.id === latest
                    ? 'This visit'
                    : visit.id === visits[0].id
                      ? 'First visit'
                      : 'Visit'}{' '}
                  · {dateLabel(visit)}
                </Text>
              ) : null}
              {rows.map(({ dish, index, rating }) => {
                const tag =
                  filter === 'all' && visits.length > 1
                    ? dishVisitTag(dish, latest)
                    : '';
                const previous =
                  tag === 'Re-rated' ? dish.history?.at(-2)?.rating : undefined;
                return (
                  <Pressable
                    key={dish.id}
                    accessibilityLabel={`Open dish review for ${dish.title}`}
                    onPress={() => onOpen(index)}
                    style={{
                      borderBottomWidth: 1,
                      borderColor: colors.border,
                      paddingVertical: responsiveSize(10),
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: responsiveSize(16),
                      }}
                    >
                      {dish.title}
                    </Text>
                    {tag ? (
                      <Text style={{ color: colors.primary }}>{tag}</Text>
                    ) : null}
                    <Text style={{ color: colors.text }}>
                      {previous != null ? (
                        <Text
                          style={{
                            textDecorationLine: 'line-through',
                            color: colors.textSecondary,
                          }}
                        >
                          {previous.toFixed(1)}{' '}
                        </Text>
                      ) : null}
                      ★ {rating.toFixed(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
