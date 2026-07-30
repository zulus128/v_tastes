import type { FavouriteFolder, FavouritePlace } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import EmptyIcon from '../../../assets/favourites/empty.svg';
import FolderActiveIcon from '../../../assets/favourites/folder-active.svg';
import FolderIcon from '../../../assets/favourites/folder.svg';
import SearchIcon from '../../../assets/favourites/search.svg';
import CloseCircle from '../../../assets/recap/story/close-circle.svg';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import sushiImage from '../../../assets/discover/sushi.jpg';
import tacosImage from '../../../assets/discover/tacos.jpg';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import {
  useCreateFolder,
  useDeleteFolder,
  useFavourites,
  useRenameFolder,
  useSaveVenue,
  useUnsaveVenue,
} from './api';

type FolderEditor = { mode: 'create' } | { mode: 'rename'; folder: FavouriteFolder };

const placeImages: Record<string, ImageSourcePropType> = {
  'coffee-bar-760': cafeImage,
  'gemini-750': loungeImage,
  'joes-shanghai': restaurantImage,
  morimoto: sushiImage,
  'tacos-la-brea': tacosImage,
};

export type SaveablePlace = {
  venueId: string;
  name: string;
};

export function FavouritesPane({ userId }: { userId: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const favourites = useFavourites(userId);
  const unsaveVenue = useUnsaveVenue(userId);
  const deleteFolder = useDeleteFolder(userId);
  const [query, setQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editor, setEditor] = useState<FolderEditor | null>(null);
  const [folderMenu, setFolderMenu] = useState<FavouriteFolder | null>(null);

  const folders = favourites.data?.folders ?? [];
  const allPlaces = favourites.data?.places ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');
  const places = allPlaces.filter((place) => {
    const inFolder = selectedFolderId === null || place.folderIds.includes(selectedFolderId);
    const matches = normalizedQuery.length === 0
      || `${place.name} ${place.address} ${place.category}`.toLocaleLowerCase('en-US').includes(normalizedQuery);
    return inFolder && matches;
  });
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);

  function confirmDelete(folder: FavouriteFolder) {
    setFolderMenu(null);
    Alert.alert(
      'Delete folder?',
      `Places in “${folder.name}” will remain saved in All places.`,
      [
        { text: 'Keep folder', style: 'cancel' },
        {
          text: 'Delete folder',
          style: 'destructive',
          onPress: () => {
            if (selectedFolderId === folder.id) setSelectedFolderId(null);
            deleteFolder.mutate(folder.id);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.pane}>
      <View style={styles.grabber} />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <SearchIcon color={colors.textMuted} height={22} width={22} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search in Favourite"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            value={query}
          />
          <Text style={styles.voice}>●</Text>
        </View>
        <Text style={styles.toolbarIcon}>☷</Text>
        <BookmarkIcon color={colors.primary} height={24} width={24} />
      </View>

      <Text style={styles.heading}>Favourite</Text>
      {folders.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.folderChips}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <FolderChip
            active={selectedFolderId === null}
            label="All"
            onPress={() => setSelectedFolderId(null)}
            styles={styles}
          />
          {folders.map((folder) => (
            <FolderChip
              key={folder.id}
              active={selectedFolderId === folder.id}
              label={folder.name}
              onLongPress={() => setFolderMenu(folder)}
              onPress={() => setSelectedFolderId(folder.id)}
              styles={styles}
            />
          ))}
        </ScrollView>
      ) : null}

      <Pressable
        onPress={() => setEditor({ mode: 'create' })}
        style={({ pressed }) => [styles.createFolder, pressed && styles.pressed]}
      >
        <Text style={styles.createFolderPlus}>⊕</Text>
        <Text style={styles.createFolderText}>Create Folder</Text>
      </Pressable>

      {favourites.isPending ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateBody}>Loading saved places…</Text>
        </View>
      ) : null}
      {favourites.isError ? (
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Could not load favourites</Text>
          <Text style={styles.stateBody}>{apiErrorMessage(favourites.error)}</Text>
          <Pressable onPress={() => void favourites.refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {favourites.isSuccess && places.length === 0 ? (
        <EmptyState folderName={selectedFolder?.name} query={normalizedQuery} styles={styles} />
      ) : null}
      {favourites.isSuccess && places.length > 0 ? (
        <>
          <View style={styles.sortRow}>
            <Text style={styles.countText}>{places.length} {places.length === 1 ? 'place' : 'places'}</Text>
            <View style={styles.sortPill}>
              <Text style={styles.sortText}>Sort by: Top rated</Text>
              <Text style={styles.sortChevron}>▾</Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={styles.placeList}
            showsVerticalScrollIndicator={false}
          >
            {[...places].sort((left, right) => right.rating - left.rating).map((place, index) => (
              <FavouriteCard
                key={place.venueId}
                index={index}
                onUnsave={() => unsaveVenue.mutate(place.venueId)}
                place={place}
                styles={styles}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <FolderNameSheet
        editor={editor}
        onClose={() => setEditor(null)}
        userId={userId}
      />
      <FolderActionSheet
        folder={folderMenu}
        onClose={() => setFolderMenu(null)}
        onDelete={() => folderMenu && confirmDelete(folderMenu)}
        onRename={() => {
          if (folderMenu) setEditor({ mode: 'rename', folder: folderMenu });
          setFolderMenu(null);
        }}
      />
    </View>
  );
}

export function SaveToFolderSheet({
  onClose,
  place,
  userId,
  visible,
}: {
  onClose: () => void;
  place: SaveablePlace | null;
  userId: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const favourites = useFavourites(userId);
  const saveVenue = useSaveVenue(userId);
  const createFolder = useCreateFolder(userId);
  const existing = favourites.data?.places.find((item) => item.venueId === place?.venueId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (visible) {
      setSelected(new Set(existing?.folderIds ?? []));
      setCreating(false);
      setFolderName('');
    }
  }, [existing?.folderIds, visible]);

  async function createAndSelect() {
    const name = folderName.trim();
    if (!name) return;
    try {
      const folder = await createFolder.mutateAsync(name);
      setSelected((current) => new Set(current).add(folder.id));
      setCreating(false);
      setFolderName('');
    } catch (error) {
      Alert.alert('Could not create folder', apiErrorMessage(error));
    }
  }

  async function save() {
    if (!place) return;
    try {
      await saveVenue.mutateAsync({ venueId: place.venueId, folderIds: [...selected] });
      onClose();
    } catch (error) {
      Alert.alert('Could not save place', apiErrorMessage(error));
    }
  }

  function toggleFolder(folderId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.saveSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <Text style={styles.sheetTitle}>Save to…</Text>
            <Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
              <CloseCircle color={colors.text} height={24} width={24} />
            </Pressable>
          </View>
          <FolderSelectionRow checked label="All places" onPress={() => undefined} styles={styles} />
          {(favourites.data?.folders ?? []).map((folder) => (
            <FolderSelectionRow
              key={folder.id}
              checked={selected.has(folder.id)}
              label={folder.name}
              onPress={() => toggleFolder(folder.id)}
              styles={styles}
            />
          ))}
          {creating ? (
            <View style={styles.newFolderRow}>
              <TextInput
                autoFocus
                maxLength={40}
                onChangeText={setFolderName}
                onSubmitEditing={() => void createAndSelect()}
                placeholder="Folder name"
                placeholderTextColor={colors.placeholder}
                returnKeyType="done"
                style={styles.folderInput}
                value={folderName}
              />
              <Pressable disabled={!folderName.trim() || createFolder.isPending} onPress={() => void createAndSelect()}>
                <Text style={[styles.inlineDone, !folderName.trim() && styles.disabledText]}>Add</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={styles.newFolderButton}>
              <Text style={styles.newFolderText}>+ New folder</Text>
              <Text style={styles.radio}>○</Text>
            </Pressable>
          )}
          <Pressable
            disabled={!place || saveVenue.isPending}
            onPress={() => void save()}
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          >
            {saveVenue.isPending
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.doneText}>Done</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FolderChip({
  active,
  label,
  onLongPress,
  onPress,
  styles,
}: {
  active: boolean;
  label: string;
  onLongPress?: () => void;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const Icon = active ? FolderActiveIcon : FolderIcon;
  return (
    <Pressable
      delayLongPress={350}
      onLongPress={onLongPress}
      onPress={onPress}
      style={[styles.folderChip, active && styles.folderChipActive]}
    >
      <Icon color={active ? '#FFFFFF' : styles.folderChipText.color} height={14} width={14} />
      <Text style={[styles.folderChipText, active && styles.folderChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({
  folderName,
  query,
  styles,
}: {
  folderName?: string;
  query: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const title = query ? 'No places found' : folderName ? `${folderName} is empty` : 'Nothing saved yet';
  const body = query
    ? 'Try a different search.'
    : folderName
      ? 'Save a place to this folder from any place page.'
      : 'Tap the bookmark on any place to save it here.';
  return (
    <View style={styles.emptyState}>
      <EmptyIcon color={styles.stateTitle.color} height={60} width={60} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
    </View>
  );
}

function FavouriteCard({
  index,
  onUnsave,
  place,
  styles,
}: {
  index: number;
  onUnsave: () => void;
  place: FavouritePlace;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.placeCard}>
      <View style={styles.cardImageWrap}>
        <Image source={placeImages[place.venueId] ?? restaurantImage} style={styles.cardImage} />
        {index === 0 ? <Text style={styles.popularTag}>Popular</Text> : null}
      </View>
      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>{place.name}</Text>
        <Text numberOfLines={2} style={styles.cardAddress}>{place.address || place.city}</Text>
        <View style={styles.ratingRow}>
          <View style={styles.ratingPill}><Text style={styles.ratingText}>★ {place.rating.toFixed(1)}</Text></View>
          <Text style={styles.reviewCount}>{place.reviewCount} reviews</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaPill}>{place.category}</Text>
          <Text style={styles.metaPill}>{'$'.repeat(Math.max(1, place.priceLevel))}</Text>
          <Text style={styles.metaPill}>{place.distanceKm.toFixed(1).replace('.', ',')} km</Text>
        </View>
      </View>
      <Pressable accessibilityLabel={`Remove ${place.name} from favourites`} hitSlop={10} onPress={onUnsave}>
        <BookmarkIcon color={styles.cardTitle.color} height={20} width={20} />
      </Pressable>
    </View>
  );
}

function FolderSelectionRow({
  checked,
  label,
  onPress,
  styles,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={styles.selectionRow}>
      <Text style={styles.selectionLabel}>{label}</Text>
      <View style={[styles.radioCircle, checked && styles.radioCircleChecked]}>
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

function FolderNameSheet({
  editor,
  onClose,
  userId,
}: {
  editor: FolderEditor | null;
  onClose: () => void;
  userId: string;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const createFolder = useCreateFolder(userId);
  const renameFolder = useRenameFolder(userId);
  const [name, setName] = useState('');

  useEffect(() => {
    setName(editor?.mode === 'rename' ? editor.folder.name : '');
  }, [editor]);

  async function submit() {
    const value = name.trim();
    if (!value || !editor) return;
    try {
      if (editor.mode === 'rename') {
        await renameFolder.mutateAsync({ folderId: editor.folder.id, name: value });
      } else {
        await createFolder.mutateAsync(value);
      }
      onClose();
    } catch (error) {
      Alert.alert('Could not save folder', apiErrorMessage(error));
    }
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={editor !== null}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.nameSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{editor?.mode === 'rename' ? 'Rename folder' : 'Create folder'}</Text>
          <TextInput
            autoFocus
            maxLength={40}
            onChangeText={setName}
            onSubmitEditing={() => void submit()}
            placeholder="Folder name"
            placeholderTextColor={colors.placeholder}
            returnKeyType="done"
            style={styles.nameInput}
            value={name}
          />
          <Pressable
            disabled={!name.trim() || createFolder.isPending || renameFolder.isPending}
            onPress={() => void submit()}
            style={styles.doneButton}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FolderActionSheet({
  folder,
  onClose,
  onDelete,
  onRename,
}: {
  folder: FavouriteFolder | null;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={folder !== null}>
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.scrim} />
        <View style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.actionHeading}>{folder?.name}</Text>
          <Pressable onPress={onRename} style={styles.actionButton}>
            <Text style={styles.actionText}>Rename folder</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.actionButton}>
            <Text style={styles.deleteText}>Delete folder</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    pane: { flex: 1, backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, overflow: 'hidden' },
    grabber: { alignSelf: 'center', width: 36, height: 4, marginBottom: 12, borderRadius: 2, backgroundColor: colors.border },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
    searchBox: { flex: 1, height: 39, paddingHorizontal: 10, borderRadius: 22, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
    voice: { color: colors.textMuted, fontSize: 13 },
    toolbarIcon: { color: colors.text, fontSize: 22 },
    heading: { marginTop: 12, paddingHorizontal: 16, color: colors.text, fontSize: 15, fontWeight: '700' },
    folderChips: { gap: 6, paddingHorizontal: 16, paddingTop: 12 },
    folderChip: { height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface },
    folderChipActive: { backgroundColor: colors.primary, borderColor: 'rgba(255,255,255,0.1)' },
    folderChipText: { color: colors.textMuted, fontSize: 13 },
    folderChipTextActive: { color: '#FFFFFF' },
    createFolder: { height: 44, margin: 12, marginHorizontal: 16, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: 'rgba(184,47,41,0.10)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    createFolderPlus: { color: colors.text, fontSize: 20 },
    createFolderText: { color: colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.6 },
    sortRow: { minHeight: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    countText: { color: colors.textMuted, fontSize: 14 },
    sortPill: { backgroundColor: colors.surfaceRaised, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', gap: 6 },
    sortText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    sortChevron: { color: colors.textMuted, fontSize: 13 },
    placeList: { padding: 6, paddingHorizontal: 16, gap: 12, paddingBottom: 32 },
    placeCard: { minHeight: 154, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardImageWrap: { width: 86, height: 86, borderRadius: 12, overflow: 'hidden' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    popularTag: { position: 'absolute', left: 6, top: 6, color: '#FFFFFF', backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12 },
    cardBody: { flex: 1, minWidth: 0, gap: 6 },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    cardAddress: { minHeight: 31, color: colors.textSecondary, fontSize: 13, lineHeight: 16 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.primary },
    ratingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    reviewCount: { color: colors.textMuted, fontSize: 13 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaPill: { color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
    centerState: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 42 },
    emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 42 },
    stateTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
    stateBody: { color: colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
    retryButton: { marginTop: 4, paddingHorizontal: 20, height: 42, borderRadius: 21, backgroundColor: colors.primary, justifyContent: 'center' },
    retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.75 },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.56)' },
    saveSheet: { margin: 16, marginBottom: 24, padding: 24, paddingTop: 20, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    nameSheet: { margin: 16, marginBottom: 24, padding: 24, paddingTop: 20, gap: 16, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    actionSheet: { margin: 16, marginBottom: 24, padding: 16, paddingTop: 20, gap: 4, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    sheetHandle: { alignSelf: 'center', width: 36, height: 4, marginBottom: 12, borderRadius: 2, backgroundColor: colors.border },
    sheetTitleRow: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    selectionRow: { height: 52, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectionLabel: { color: colors.text, fontSize: 16 },
    radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
    radioCircleChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    radio: { color: colors.textMuted, fontSize: 22 },
    newFolderButton: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    newFolderText: { color: colors.primary, fontSize: 16 },
    newFolderRow: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    folderInput: { flex: 1, height: 42, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, color: colors.text, fontSize: 16 },
    inlineDone: { color: colors.primary, fontSize: 15, fontWeight: '700' },
    disabledText: { opacity: 0.35 },
    doneButton: { height: 50, marginTop: 4, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    doneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    nameInput: { height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
    actionHeading: { color: colors.textMuted, fontSize: 13, padding: 12 },
    actionButton: { height: 52, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    deleteText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
  });
}
