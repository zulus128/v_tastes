import type { FavouriteFolder, FavouritePlace } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import EmptyIcon from '../../../assets/favourites/empty.svg';
import FolderActiveIcon from '../../../assets/favourites/folder-active.svg';
import FolderIcon from '../../../assets/favourites/folder.svg';
import SearchIcon from '../../../assets/favourites/search.svg';
import restaurantImage from '../../../assets/discover/restaurant.png';
import tuneIcon from '../../../assets/profile/map-tune.png';
import addFolderIcon from '../../../assets/favourites/add-folder.png';
import closeFolderIcon from '../../../assets/favourites/close-folder.png';
import trashIcon from '../../../assets/favourites/trash.png';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { matchesPlaceFilters } from '../discover/placeFilters';
import {
  useCreateFolder,
  useDeleteFolder,
  useFavourites,
  useRenameFolder,
  useSaveVenue,
  useSavedVenue,
  useUnsaveVenue,
} from './api';

type FolderEditor = { mode: 'create' } | { mode: 'rename'; folder: FavouriteFolder };

export type SaveablePlace = {
  venueId: string;
  name: string;
};

export function FavouritesPane({
  appliedFilters = [],
  onOpenFilters,
  onOpenPlace,
  userId,
}: {
  appliedFilters?: string[];
  onOpenFilters?: () => void;
  onOpenPlace: (venueId: string) => void;
  userId: string;
}) {
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
    return inFolder && matches && matchesPlaceFilters(place, appliedFilters);
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
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <SearchIcon color={colors.textMuted} height={22} width={22} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            value={query}
          />
          <Pressable accessibilityLabel="Open filters" hitSlop={8} onPress={onOpenFilters}>
            <Image source={tuneIcon} style={styles.tuneIcon} />
          </Pressable>
        </View>
      </View>

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
        <ScrollView
            contentContainerStyle={styles.placeList}
            nestedScrollEnabled
            onScroll={({ nativeEvent }) => {
              const nearEnd = nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y
                >= nativeEvent.contentSize.height - 120;
              if (nearEnd && favourites.hasNextPage && !favourites.isFetchingNextPage) void favourites.fetchNextPage();
            }}
            scrollEventThrottle={120}
            showsVerticalScrollIndicator={false}
          >
            {places.map((place, index) => (
              <FavouriteCard
                index={index}
                key={place.venueId}
                onOpen={() => onOpenPlace(place.venueId)}
                onUnsave={() => unsaveVenue.mutate(place.venueId)}
                place={place}
                styles={styles}
              />
            ))}
            {favourites.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={styles.pageLoader} /> : null}
        </ScrollView>
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
  onSaved,
  place,
  userId,
  visible,
}: {
  onClose: () => void;
  onSaved?: () => void;
  place: SaveablePlace | null;
  userId: string;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const favourites = useFavourites(userId);
  const savedVenue = useSavedVenue(userId, place?.venueId);
  const saveVenue = useSaveVenue(userId);
  const createFolder = useCreateFolder(userId);
  const deleteFolder = useDeleteFolder(userId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setSelected(new Set(savedVenue.folderIds));
      setCreating(false);
      setFolderName('');
      setQuery('');
    }
  }, [savedVenue.folderIds, visible]);

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
      onSaved?.();
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
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.addScreen}
      >
        <View style={styles.addHeader}>
          <View style={styles.addTitleRow}>
            <Pressable accessibilityLabel="Cancel" hitSlop={12} onPress={onClose}><Text style={styles.addBack}>‹</Text></Pressable>
            <Text style={styles.addTitle}>Add to Wishlist</Text>
            <View style={styles.addTitleSpacer} />
          </View>
          <View style={styles.addSearch}>
            <SearchIcon color={colors.textMuted} height={22} width={22} />
            <TextInput onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.placeholder} style={styles.searchInput} value={query} />
            <Image source={tuneIcon} style={styles.tuneIcon} />
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.selectionList} keyboardShouldPersistTaps="handled">
          <FolderSelectionRow checked={selected.size === 0} label="All" onPress={() => setSelected(new Set())} styles={styles} />
          {(favourites.data?.folders ?? []).filter((folder) => folder.name.toLocaleLowerCase('en-US').includes(query.trim().toLocaleLowerCase('en-US'))).map((folder) => (
            <FolderSelectionRow
              key={folder.id}
              checked={selected.has(folder.id)}
              onDelete={() => deleteFolder.mutate(folder.id)}
              label={folder.name}
              onPress={() => toggleFolder(folder.id)}
              styles={styles}
            />
          ))}
          <Pressable onPress={() => setCreating(true)} style={styles.newFolderButton}>
            <Image source={addFolderIcon} style={styles.addFolderIcon} /><Text style={styles.newFolderText}>Create Folder</Text>
          </Pressable>
        </ScrollView>
        <View style={styles.addFooter}>
          <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable
            disabled={!place || saveVenue.isPending}
            onPress={() => void save()}
            style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}
          >
            {saveVenue.isPending
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.confirmText}>✓  Confirm</Text>}
          </Pressable>
        </View>
        <Modal animationType="slide" onRequestClose={() => setCreating(false)} transparent visible={creating}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.createFolderRoot}>
            <Pressable onPress={() => setCreating(false)} style={styles.createFolderScrim} />
            <View style={styles.createFolderSheet}>
              <View style={styles.createFolderTitleRow}>
                <Text style={styles.createFolderTitle}>Create Folder</Text>
                <Pressable accessibilityLabel="Close create folder" hitSlop={10} onPress={() => setCreating(false)}><Image source={closeFolderIcon} style={styles.closeFolderIcon} /></Pressable>
              </View>
              <View style={styles.createFolderField}>
                <Text style={styles.createFolderLabel}>TITLE</Text>
                <TextInput
                  autoFocus
                  maxLength={40}
                  onChangeText={setFolderName}
                  onSubmitEditing={() => void createAndSelect()}
                  placeholder="Enter text"
                  placeholderTextColor={colors.placeholder}
                  returnKeyType="done"
                  style={styles.createFolderInput}
                  value={folderName}
                />
              </View>
              <Pressable disabled={!folderName.trim() || createFolder.isPending} onPress={() => void createAndSelect()} style={({ pressed }) => [styles.createFolderSubmit, (!folderName.trim() || createFolder.isPending) && styles.createFolderSubmitDisabled, pressed && styles.pressed]}>
                {createFolder.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createFolderSubmitText}>Create Folder</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
  onOpen,
  onUnsave,
  place,
  styles,
}: {
  index: number;
  onOpen: () => void;
  onUnsave: () => void;
  place: FavouritePlace;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.placeCard}>
      <Pressable onPress={onOpen} style={styles.cardImageWrap}>
        <Image source={place.imageUrl ? { uri: place.imageUrl } : restaurantImage} style={styles.cardImage} />
        {index === 0 ? <Text style={styles.popularTag}>Popular</Text> : null}
      </Pressable>
      <Pressable onPress={onOpen} style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>{place.name}</Text>
        <Text numberOfLines={1} style={styles.cardAddress}>{place.address || place.city}</Text>
        <View style={styles.ratingRow}>
          <View style={styles.ratingPill}><Text style={styles.ratingText}>★ {place.rating.toFixed(1)}</Text></View>
          <Text style={styles.reviewCount}>{place.reviewCount} reviews</Text>
        </View>
      </Pressable>
      <Pressable accessibilityLabel={`Remove ${place.name} from favourites`} hitSlop={10} onPress={onUnsave} style={styles.cardBookmark}>
        <BookmarkIcon color={styles.cardTitle.color} height={20} width={20} />
      </Pressable>
      <View style={styles.metaRow}>
        <Text style={styles.metaPill}>{place.category}</Text>
        <Text style={styles.metaPill}>{'$'.repeat(Math.max(1, place.priceLevel))}</Text>
        <Text style={styles.metaPill}>{place.distanceKm.toFixed(1).replace('.', ',')} km</Text>
      </View>
    </View>
  );
}

function FolderSelectionRow({
  checked,
  label,
  onDelete,
  onPress,
  styles,
}: {
  checked: boolean;
  label: string;
  onDelete?: () => void;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const translateX = useMemo(() => new Animated.Value(0), []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Boolean(onDelete) && gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => translateX.setValue(Math.max(-60, Math.min(0, gesture.dx))),
    onPanResponderRelease: (_, gesture) => {
      Animated.spring(translateX, { toValue: gesture.dx < -36 ? -60 : 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  }), [onDelete, translateX]);
  return (
    <View style={styles.selectionSwipe}>
      {onDelete ? <Pressable accessibilityLabel={`Delete ${label}`} onPress={onDelete} style={styles.selectionDeleteAction}><Image source={trashIcon} style={styles.selectionDelete} /></Pressable> : null}
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <Pressable onPress={() => { if ((translateX as unknown as { _value: number })._value < 0) Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(); else onPress(); }} style={styles.selectionRow}>
          <View style={styles.selectionName}><FolderIcon color={styles.selectionLabel.color} height={20} width={20} /><Text style={styles.selectionLabel}>{label}</Text></View>
          <View style={[styles.radioCircle, checked && styles.radioCircleChecked]}>
            {checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
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
    pane: { flex: 1, backgroundColor: colors.canvas, overflow: 'hidden' },
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
    searchBox: { flex: 1, height: 39, paddingHorizontal: 10, borderRadius: 22, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 8 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
    tuneIcon: { width: 24, height: 24, opacity: 0.55 },
    folderChips: { gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
    folderChip: { height: 28, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface },
    folderChipActive: { backgroundColor: colors.primary, borderColor: 'rgba(255,255,255,0.1)' },
    folderChipText: { color: colors.textMuted, fontSize: 12 },
    folderChipTextActive: { color: '#FFFFFF' },
    placeList: { paddingBottom: 32 },
    pageLoader: { paddingVertical: 20 },
    placeCard: { minHeight: 142, padding: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardImageWrap: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden' },
    cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    popularTag: { position: 'absolute', left: 3, top: 3, color: '#FFFFFF', backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11 },
    cardBody: { flex: 1, minWidth: 0, gap: 6 },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    cardAddress: { color: colors.textSecondary, fontSize: 12, lineHeight: 15 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.primary },
    ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
    reviewCount: { color: colors.textMuted, fontSize: 12 },
    cardBookmark: { position: 'absolute', right: 16, top: 16 },
    metaRow: { position: 'absolute', left: 16, bottom: 10, flexDirection: 'row', gap: 6 },
    metaPill: { color: colors.text, fontSize: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#080808', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 5 },
    centerState: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 42 },
    emptyState: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 42 },
    stateTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
    stateBody: { color: colors.textMuted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
    retryButton: { marginTop: 4, paddingHorizontal: 20, height: 42, borderRadius: 21, backgroundColor: colors.primary, justifyContent: 'center' },
    retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.75 },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    addScreen: { flex: 1, backgroundColor: colors.canvas },
    addHeader: { paddingTop: 48, paddingBottom: 16, gap: 18, borderBottomWidth: 1, borderBottomColor: colors.border, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: '#080808' },
    addTitleRow: { height: 34, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    addBack: { width: 44, color: colors.text, fontSize: 36, lineHeight: 36 },
    addTitle: { color: colors.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
    addTitleSpacer: { width: 44 },
    addSearch: { height: 44, marginHorizontal: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    selectionList: { flexGrow: 1, paddingBottom: 24 },
    addFooter: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, flexDirection: 'row', gap: 10, backgroundColor: '#080808' },
    cancelButton: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: 22 },
    cancelText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    confirmButton: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.primary },
    confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    createFolderRoot: { flex: 1, justifyContent: 'flex-end' },
    createFolderScrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
    createFolderSheet: { height: 294, paddingBottom: 30, borderTopWidth: 1, borderTopColor: '#45474B', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: '#161616' },
    createFolderTitleRow: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    createFolderTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', letterSpacing: -0.45 },
    closeFolderIcon: { width: 30, height: 30 },
    createFolderField: { flex: 1, padding: 16, gap: 6 },
    createFolderLabel: { color: '#FFFFFF', opacity: 0.5, fontSize: 13, lineHeight: 16 },
    createFolderInput: { height: 50, paddingHorizontal: 12, borderRadius: 12, color: '#FFFFFF', backgroundColor: '#080808', fontSize: 16 },
    createFolderSubmit: { width: 330, height: 54, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#4C1816', borderRadius: 27, backgroundColor: '#B82F29' },
    createFolderSubmitDisabled: { opacity: 0.45 },
    createFolderSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: 0.6 },
    scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.56)' },
    saveSheet: { margin: 16, marginBottom: 24, padding: 24, paddingTop: 20, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    nameSheet: { margin: 16, marginBottom: 24, padding: 24, paddingTop: 20, gap: 16, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    actionSheet: { margin: 16, marginBottom: 24, padding: 16, paddingTop: 20, gap: 4, borderRadius: 22, backgroundColor: colors.surfaceRaised },
    sheetHandle: { alignSelf: 'center', width: 36, height: 4, marginBottom: 12, borderRadius: 2, backgroundColor: colors.border },
    sheetTitleRow: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    selectionSwipe: { height: 76, overflow: 'hidden', backgroundColor: colors.canvas },
    selectionRow: { height: 76, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.canvas },
    selectionName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    selectionLabel: { color: colors.text, fontSize: 16 },
    selectionDelete: { width: 24, height: 24 },
    selectionDeleteAction: { position: 'absolute', right: 0, top: 0, width: 60, height: 76, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
    radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
    radioCircleChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
    checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    radio: { color: colors.textMuted, fontSize: 22 },
    newFolderButton: { height: 46, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 23, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    addFolderIcon: { width: 20, height: 20 },
    newFolderText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    doneButton: { height: 50, marginTop: 4, borderRadius: 25, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    doneText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    nameInput: { height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 16 },
    actionHeading: { color: colors.textMuted, fontSize: 13, padding: 12 },
    actionButton: { height: 52, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    deleteText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
  });
}
