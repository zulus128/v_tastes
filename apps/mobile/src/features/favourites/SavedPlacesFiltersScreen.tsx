import { DiscoverFiltersScreen } from '../discover/DiscoverFiltersScreen';
import { useFavourites } from './api';

export function SavedPlacesFiltersScreen({
  initialValues,
  onApply,
  onBack,
  userId,
}: {
  initialValues: string[];
  onApply: (values: string[]) => void;
  onBack: () => void;
  userId: string;
}) {
  const favourites = useFavourites(userId);
  return (
    <DiscoverFiltersScreen
      initialValues={initialValues}
      onApply={onApply}
      onBack={onBack}
      previewPlaces={favourites.data?.places ?? []}
      scope="saved"
    />
  );
}
