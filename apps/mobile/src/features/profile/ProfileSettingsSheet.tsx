import { apiErrorMessage } from '@tastes/firebase-client';
import type { UpdateProfileSettingsInput, Venue } from '@tastes/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useProfile } from './api';
import { profileAvatarSource } from './avatar';

type EditableField = 'displayName' | 'username' | 'favoriteDish' | 'city';

const labels: Record<EditableField, string> = {
  displayName: 'Name',
  username: 'Username',
  favoriteDish: 'Favourite Dish',
  city: 'City',
};

export function ProfileSettingsSheet({
  fallbackName,
  onClose,
  onLogout,
  onNotifications,
  userId,
  visible,
}: {
  fallbackName: string;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onNotifications: () => void;
  userId: string;
  visible: boolean;
}) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top, insets.bottom), [colors, insets.bottom, insets.top]);
  const { profile } = useProfile(userId, fallbackName);
  const [favoritePlace, setFavoritePlace] = useState('Select a place');
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [places, setPlaces] = useState<Venue[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible || !profile?.favoriteVenueId) {
      setFavoritePlace('Select a place');
      return;
    }
    let active = true;
    void api.getPlace({ venueId: profile.favoriteVenueId })
      .then((response) => { if (active) setFavoritePlace(response.data.venue.name); })
      .catch(() => { if (active) setFavoritePlace('Select a place'); });
    return () => { active = false; };
  }, [api, profile?.favoriteVenueId, visible]);

  useEffect(() => {
    const query = placeQuery.trim();
    if (!placeOpen || query.length < 2) {
      setPlaces([]);
      return;
    }
    const timeout = setTimeout(() => {
      setSearching(true);
      void api.searchVenues({ query, limit: 10 })
        .then((response) => setPlaces(response.data.items))
        .catch((error) => Alert.alert('Could not search places', apiErrorMessage(error)))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [api, placeOpen, placeQuery]);

  function beginEdit(field: EditableField) {
    if (!profile) return;
    const value = field === 'displayName' ? profile.displayName
      : field === 'username' ? profile.username ?? ''
        : field === 'favoriteDish' ? profile.favoriteDish ?? ''
          : profile.city ?? '';
    setDraft(value);
    setEditing(field);
  }

  async function save(input: UpdateProfileSettingsInput) {
    setSaving(true);
    try {
      await api.updateProfileSettings(input);
      setEditing(null);
      setPlaceOpen(false);
    } catch (error) {
      Alert.alert('Could not update profile', apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveField() {
    if (!editing) return;
    const value = editing === 'username' ? draft.trim().replace(/^@/, '') : draft.trim();
    if (!value) {
      Alert.alert(`${labels[editing]} is required`, 'Enter a value before saving.');
      return;
    }
    await save({ [editing]: value });
  }

  const rows: Array<{ field?: EditableField; label: string; value?: string; onPress?: () => void }> = profile ? [
    { field: 'displayName', label: 'Name', value: profile.displayName },
    { field: 'username', label: 'Username', value: profile.username ? `@${profile.username}` : 'Add username' },
    { field: 'favoriteDish', label: 'Favourite Dish', value: profile.favoriteDish ?? 'Select a dish' },
    { label: 'Favourite place', value: favoritePlace, onPress: () => setPlaceOpen(true) },
    { field: 'city', label: 'City', value: profile.city ?? 'Select a city' },
    { label: 'Notifications', onPress: () => { onClose(); onNotifications(); } },
  ] : [];

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.headerButton}><Text style={styles.back}>‹</Text></Pressable>
          <Text style={styles.title}>Settings</Text><View style={styles.headerButton} />
        </View>
        {!profile ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Image source={profileAvatarSource(profile)} style={styles.avatar} />
            <Text style={styles.editPhoto}>Edit photo</Text>
            <View style={styles.rows}>
              {rows.map((row) => (
                <Pressable
                  key={row.label}
                  onPress={row.onPress ?? (() => row.field && beginEdit(row.field))}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.value ? <Text numberOfLines={1} style={styles.rowValue}>{row.value}</Text> : null}
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => void Share.share({ message: 'Join me on Tastes: https://tastes.app' })} style={styles.invite}>
              <Text style={styles.inviteText}>Invite a Friend</Text>
            </Pressable>
            <Pressable onPress={() => void onLogout()} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable>
          </ScrollView>
        )}
      </View>

      <Modal animationType="fade" onRequestClose={() => setEditing(null)} transparent visible={editing !== null}>
        <Pressable onPress={() => setEditing(null)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.editor}>
            <Text style={styles.editorTitle}>{editing ? `Edit ${labels[editing]}` : ''}</Text>
            <TextInput autoCapitalize={editing === 'username' ? 'none' : 'sentences'} autoFocus onChangeText={setDraft} placeholderTextColor={colors.textMuted} style={styles.input} value={draft} />
            <Pressable disabled={saving} onPress={() => void saveField()} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setPlaceOpen(false)} visible={placeOpen}>
        <View style={styles.screen}>
          <View style={styles.header}><Pressable onPress={() => setPlaceOpen(false)} style={styles.headerButton}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Favourite place</Text><View style={styles.headerButton} /></View>
          <View style={styles.placeContent}>
            <TextInput autoFocus onChangeText={setPlaceQuery} placeholder="Search places" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={placeQuery} />
            {searching ? <ActivityIndicator color={colors.primary} style={styles.searchLoader} /> : places.map((place) => (
              <Pressable key={place.id} onPress={() => { setFavoritePlace(place.name); void save({ favoriteVenueId: place.id }); }} style={styles.placeRow}>
                <View style={styles.placeCopy}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeMeta}>{place.city}{place.address ? ` · ${place.address}` : ''}</Text></View><Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    header: { height: safeTop + 58, paddingTop: safeTop, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background },
    headerButton: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: colors.text, fontSize: 38, lineHeight: 40, fontWeight: '300' },
    title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    loader: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: safeBottom + 30, alignItems: 'center' },
    avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.surface },
    editPhoto: { marginTop: 10, marginBottom: 24, color: colors.text, fontSize: 14, fontWeight: '600' },
    rows: { width: '100%', gap: 10 },
    row: { minHeight: 50, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderRadius: 25, backgroundColor: colors.surface },
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
    rowValue: { flex: 1, marginLeft: 12, color: colors.textSecondary, fontSize: 13, textAlign: 'right' },
    chevron: { marginLeft: 8, color: colors.textMuted, fontSize: 27, lineHeight: 29 },
    invite: { width: '100%', height: 52, marginTop: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.primary },
    inviteText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    signOut: { marginTop: 20, padding: 12 },
    signOutText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
    pressed: { opacity: 0.72 },
    modalBackdrop: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.76)' },
    editor: { padding: 20, borderRadius: 24, backgroundColor: colors.surface },
    editorTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
    input: { height: 50, marginTop: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.text, backgroundColor: colors.canvas },
    saveButton: { height: 48, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.primary },
    saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    placeContent: { flex: 1, padding: 16 },
    searchInput: { height: 48, paddingHorizontal: 16, borderRadius: 24, color: colors.text, backgroundColor: colors.surface },
    searchLoader: { marginTop: 30 },
    placeRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    placeCopy: { flex: 1 },
    placeName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    placeMeta: { marginTop: 4, color: colors.textSecondary, fontSize: 12 },
  });
}
