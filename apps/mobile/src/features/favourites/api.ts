import type { FavouriteFolder, FavouritesResult } from '@tastes/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { useTastesApi } from '../../session/SessionProvider';

export const favouritesQueryKey = (userId: string) => ['favourites', userId] as const;

export function useFavourites(userId: string) {
  const api = useTastesApi();
  return useQuery({
    queryKey: favouritesQueryKey(userId),
    queryFn: async () => (await api.getFavourites()).data,
  });
}

export function useCreateFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (
      await api.createFolder({ idempotencyKey: createIdempotencyKey('favourite-folder'), name })
    ).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useRenameFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => (
      await api.renameFolder({ folderId, name })
    ).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useDeleteFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (folderId: string) => (await api.deleteFolder({ folderId })).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useSaveVenue(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ venueId, folderIds }: { venueId: string; folderIds: string[] }) => (
      await api.saveVenue({ venueId, folderIds })
    ).data,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useUnsaveVenue(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (venueId: string) => (await api.unsaveVenue({ venueId })).data,
    onSuccess: (_, venueId) => {
      queryClient.setQueryData<FavouritesResult>(favouritesQueryKey(userId), (current) => current
        ? { ...current, places: current.places.filter((place) => place.venueId !== venueId) }
        : current);
    },
  });
}

export function folderSelection(
  folders: FavouriteFolder[],
  selectedFolderId: string | null,
): FavouriteFolder[] {
  return selectedFolderId ? folders.filter((folder) => folder.id === selectedFolderId) : folders;
}
