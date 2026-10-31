import type { FavouriteFolder, FavouritesResult } from '@tastes/contracts';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../../infrastructure/firebase';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { offerPushNotificationsAfterEngagement } from '../../infrastructure/pushNotifications';
import { useTastesApi } from '../../session/SessionProvider';
import { favouritesQueryKey } from '../queryKeys';

export { favouritesQueryKey } from '../queryKeys';

export function useFavourites(userId: string) {
  const api = useTastesApi();
  return useInfiniteQuery({
    queryKey: favouritesQueryKey(userId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await api.getFavourites({ cursor: pageParam, limit: 10 })).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => ({
      folders: data.pages[0]?.folders ?? [],
      places: data.pages.flatMap((page) => page.places),
      nextCursor: data.pages.at(-1)?.nextCursor ?? null,
    }),
  });
}

export function useSavedVenue(
  userId: string,
  venueId: string | null | undefined,
) {
  const [state, setState] = useState<{
    folderIds: string[];
    loading: boolean;
    saved: boolean;
  }>({
    folderIds: [],
    loading: Boolean(venueId),
    saved: false,
  });
  useEffect(() => {
    if (!venueId) {
      setState({ folderIds: [], loading: false, saved: false });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true }));
    return onSnapshot(
      doc(firestore, 'users', userId, 'savedVenues', venueId),
      (snapshot) => {
        const folderIds = Array.isArray(snapshot.data()?.folderIds)
          ? snapshot
              .data()!
              .folderIds.filter(
                (value: unknown): value is string => typeof value === 'string',
              )
          : [];
        setState({ folderIds, loading: false, saved: snapshot.exists() });
      },
      () => setState({ folderIds: [], loading: false, saved: false }),
    );
  }, [userId, venueId]);
  return state;
}

export function useCreateFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  const queryKey = favouritesQueryKey(userId);
  return useMutation({
    mutationFn: async (name: string) =>
      (
        await api.createFolder({
          idempotencyKey: createIdempotencyKey('favourite-folder'),
          name,
        })
      ).data,
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<InfiniteData<FavouritesResult, string | null>>(
          queryKey,
        );
      const optimisticId = createIdempotencyKey('pending-folder');
      const folder: FavouriteFolder = {
        id: optimisticId,
        name,
        placeCount: 0,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<InfiniteData<FavouritesResult, string | null>>(
        queryKey,
        (current) => {
          if (!current?.pages[0]) return current;
          return {
            ...current,
            pages: [
              {
                ...current.pages[0],
                folders: [...current.pages[0].folders, folder],
              },
              ...current.pages.slice(1),
            ],
          };
        },
      );
      return { optimisticId, previous };
    },
    onSuccess: (result, _name, context) => {
      queryClient.setQueryData<InfiniteData<FavouritesResult, string | null>>(
        queryKey,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              folders: page.folders.map((folder) =>
                folder.id === context.optimisticId
                  ? { ...folder, id: result.id }
                  : folder,
              ),
            })),
          };
        },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (_error, _name, context) => {
      if (context?.previous)
        queryClient.setQueryData(queryKey, context.previous);
    },
  });
}

export function useRenameFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      folderId,
      name,
    }: {
      folderId: string;
      name: string;
    }) => (await api.renameFolder({ folderId, name })).data,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useDeleteFolder(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (folderId: string) =>
      (await api.deleteFolder({ folderId })).data,
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
  });
}

export function useSaveVenue(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      venueId,
      folderIds,
    }: {
      venueId: string;
      folderIds: string[];
    }) => (await api.saveVenue({ venueId, folderIds })).data,
    onSuccess: async () => {
      void offerPushNotificationsAfterEngagement(api, 'save');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: ['discover', 'feed', userId],
        }),
      ]);
    },
  });
}

export function useUnsaveVenue(userId: string) {
  const api = useTastesApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (venueId: string) =>
      (await api.unsaveVenue({ venueId })).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: favouritesQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: ['discover', 'feed', userId],
        }),
      ]);
    },
  });
}

export function folderSelection(
  folders: FavouriteFolder[],
  selectedFolderId: string | null,
): FavouriteFolder[] {
  return selectedFolderId
    ? folders.filter((folder) => folder.id === selectedFolderId)
    : folders;
}
