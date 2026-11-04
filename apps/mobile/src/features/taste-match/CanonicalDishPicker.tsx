import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { useTastesApi } from '../../session/SessionProvider';
import { useAppTheme } from '../../ui/ThemeProvider';

export function CanonicalDishPicker({
  title,
  selectedId,
  onSelect,
}: {
  title: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const api = useTastesApi(),
    { colors } = useAppTheme(),
    [query, setQuery] = useState(title);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(title.trim()), 250);
    return () => clearTimeout(timer);
  }, [title]);
  const results = useQuery({
    queryKey: ['canonical-dishes', query],
    queryFn: async () =>
      (await api.getCanonicalDishes({ query, limit: 4 })).data,
    enabled: query.length >= 2 && typeof api.getCanonicalDishes === 'function',
    staleTime: 60_000,
  });
  if (!results.data || query !== title.trim()) return null;
  const exact = results.data.exactId === selectedId || !!results.data.exactId;
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
        {exact
          ? 'Dish recognised for taste recommendations.'
          : 'Match the exact dish for taste recommendations (optional).'}
      </Text>
      {!exact
        ? results.data.dishes.map((dish) => (
            <Pressable
              key={dish.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === dish.id }}
              onPress={() => onSelect(dish.id)}
              style={{
                padding: 10,
                borderWidth: 1,
                borderRadius: 10,
                borderColor:
                  selectedId === dish.id ? colors.primary : colors.border,
              }}
            >
              <Text style={{ color: colors.text }}>
                {dish.name}
                {selectedId === dish.id ? ' ✓' : ''}
              </Text>
            </Pressable>
          ))
        : null}
      {!exact && !results.data.dishes.length ? (
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          No exact match yet. You can still save your dish.
        </Text>
      ) : null}
    </View>
  );
}
