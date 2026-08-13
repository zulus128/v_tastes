import { apiErrorMessage } from '@tastes/firebase-client';
import type { UpdateProfileSettingsInput, Venue } from '@tastes/contracts';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
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
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage';
import homeFeedPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import backIcon from '../../../assets/onboarding/back.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import InviteUsersIcon from '../../../assets/profile/invite-users.svg';
import SignOutIcon from '../../../assets/profile/sign-out.svg';
import { useTastesApi } from '../../session/SessionProvider';
import { storage } from '../../infrastructure/firebase';
import { captureException } from '../../infrastructure/observability';
import { SideSlideScreen, type SideSlideScreenHandle } from '../../ui/SideSlideScreen';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { CityPicker, cityFlag } from '../onboarding/CityPicker';
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
  const [cityOpen, setCityOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const settingsSlide = useRef<SideSlideScreenHandle>(null);
  const placeSlide = useRef<SideSlideScreenHandle>(null);
  const citySlide = useRef<SideSlideScreenHandle>(null);

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
      setCityOpen(false);
    } catch (error) {
      Alert.alert('Could not update profile', apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function chooseProfilePhoto(camera: boolean) {
    if (!profile || uploadingPhoto) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo library'} access to update your profile photo.`);
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const cropSize = Math.min(asset.width, asset.height);
    const photoPath = `profile-images/${userId}/avatar-${Date.now()}.jpg`;
    setUploadingPhoto(true);
    try {
      const optimized = await manipulateAsync(asset.uri, [
        { crop: {
          originX: Math.max(0, (asset.width - cropSize) / 2),
          originY: Math.max(0, (asset.height - cropSize) / 2),
          width: cropSize,
          height: cropSize,
        } },
        { resize: { width: 512, height: 512 } },
      ], { compress: 0.78, format: SaveFormat.JPEG });
      const response = await fetch(optimized.uri);
      await uploadBytes(storageRef(storage, photoPath), await response.blob(), { contentType: 'image/jpeg' });
      await api.updateProfilePhoto({ photoPath });
      if (profile.photoPath && profile.photoPath !== photoPath) {
        void deleteObject(storageRef(storage, profile.photoPath)).catch((error) => captureException(error, { operation: 'delete-old-profile-photo' }));
      }
    } catch (error) {
      Alert.alert('Could not update photo', apiErrorMessage(error));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function editPhoto() {
    Alert.alert('Edit photo', undefined, [
      { text: 'Take Photo', onPress: () => void chooseProfilePhoto(true) },
      { text: 'Choose from Library', onPress: () => void chooseProfilePhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

  function confirmLogout() {
    Alert.alert('Sign out?', 'You will need to sign in with your phone number again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onLogout() },
    ]);
  }

  const rows: Array<{ field?: EditableField; label: string; value?: string; valueFlag?: ReturnType<typeof cityFlag>; onPress?: () => void }> = profile ? [
    { field: 'displayName', label: 'Name', value: profile.displayName },
    { field: 'username', label: 'Username', value: profile.username ? `@${profile.username}` : 'Add username' },
    { field: 'favoriteDish', label: 'Favourite Dish', value: profile.favoriteDish ?? 'Select a dish' },
    { label: 'Favourite place', value: favoritePlace, onPress: () => setPlaceOpen(true) },
    { label: 'City', value: profile.city ?? 'Select a city', valueFlag: cityFlag(profile.city ?? ''), onPress: () => setCityOpen(true) },
    { label: 'Notifications', onPress: onNotifications },
  ] : [];

  return (
    <>
    <SideSlideScreen onRequestClose={onClose} ref={settingsSlide} visible={visible}>
      <ImageBackground imageStyle={styles.patternImage} resizeMode="stretch" source={pattern} style={styles.screen}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><Image resizeMode="cover" source={homeFeedPattern} style={styles.darkPatternBoost} /></View>
        <View pointerEvents="none" style={styles.backgroundLift} />
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" hitSlop={8} onPress={() => settingsSlide.current?.close()} style={styles.headerButton}><Image source={backIcon} style={styles.backIcon} /></Pressable>
          <Text style={styles.title}>Settings</Text>
          <Pressable accessibilityLabel="Sign out" hitSlop={8} onPress={confirmLogout} style={styles.headerButton}><SignOutIcon height={24} width={24} /></Pressable>
        </View>
        {!profile ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Pressable accessibilityLabel="Edit profile photo" disabled={uploadingPhoto} onPress={editPhoto}>
              <Image source={profileAvatarSource(profile)} style={[styles.avatar, uploadingPhoto && styles.photoUploading]} />
              {uploadingPhoto ? <ActivityIndicator color="#FFFFFF" style={styles.photoLoader} /> : null}
            </Pressable>
            <Pressable disabled={uploadingPhoto} onPress={editPhoto}><Text style={styles.editPhoto}>Edit photo</Text></Pressable>
            <View style={styles.rows}>
              {rows.map((row) => (
                <Pressable
                  key={row.label}
                  onPress={row.onPress ?? (() => row.field && beginEdit(row.field))}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.value ? <Text numberOfLines={1} style={styles.rowValue}>{row.value}</Text> : null}
                  {row.valueFlag ? <Image source={row.valueFlag} style={styles.cityFlag} /> : null}
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
        <LinearGradient colors={['rgba(22,22,22,0)', '#161616']} pointerEvents="box-none" style={styles.actions}>
          <View style={styles.inviteRing}>
            <Pressable onPress={() => void Share.share({ message: 'Join me on Tastes: https://tastes.app' })} style={({ pressed }) => [styles.invite, pressed && styles.pressed]}>
              <InviteUsersIcon height={24} width={24} />
              <Text style={styles.inviteText}>Invite a Friend</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </ImageBackground>
    </SideSlideScreen>

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

      <SideSlideScreen onRequestClose={() => setPlaceOpen(false)} ref={placeSlide} visible={placeOpen}>
        <View style={styles.screen}>
          <View style={styles.header}><Pressable onPress={() => placeSlide.current?.close()} style={styles.headerButton}><Image source={backIcon} style={styles.backIcon} /></Pressable><Text style={styles.title}>Favourite place</Text><View style={styles.headerButton} /></View>
          <View style={styles.placeContent}>
            <TextInput autoFocus onChangeText={setPlaceQuery} placeholder="Search places" placeholderTextColor={colors.textMuted} style={styles.searchInput} value={placeQuery} />
            {searching ? <ActivityIndicator color={colors.primary} style={styles.searchLoader} /> : places.map((place) => (
              <Pressable key={place.id} onPress={() => { setFavoritePlace(place.name); void save({ favoriteVenueId: place.id }); }} style={styles.placeRow}>
                <View style={styles.placeCopy}><Text style={styles.placeName}>{place.name}</Text><Text style={styles.placeMeta}>{place.city}{place.address ? ` · ${place.address}` : ''}</Text></View><Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SideSlideScreen>

      <SideSlideScreen onRequestClose={() => setCityOpen(false)} ref={citySlide} visible={cityOpen}>
        <View style={styles.screen}>
          <View style={styles.header}><Pressable onPress={() => citySlide.current?.close()} style={styles.headerButton}><Image source={backIcon} style={styles.backIcon} /></Pressable><Text style={styles.title}>City</Text><View style={styles.headerButton} /></View>
          <CityPicker onSelect={(name) => void save({ city: name })} topPadding={24} />
        </View>
      </SideSlideScreen>
    </>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#161616' },
    patternImage: { opacity: 1 },
    darkPatternBoost: { width: '100%', height: '100%', opacity: 0.025, tintColor: '#FFFFFF' },
    backgroundLift: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.057)' },
    header: { zIndex: 2, height: safeTop + 48, paddingTop: safeTop, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: '#080808' },
    headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backIcon: { width: 24, height: 24, tintColor: '#FFFFFF' },
    title: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.43, textAlign: 'center' },
    loader: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: safeBottom + 116, alignItems: 'center' },
    avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#161616' },
    photoUploading: { opacity: 0.55 },
    photoLoader: { position: 'absolute', inset: 0 },
    editPhoto: { marginTop: 10, marginBottom: 10, color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41, textDecorationLine: 'underline' },
    rows: { width: '100%', gap: 6 },
    row: { width: '100%', height: 50, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 100, backgroundColor: '#080808' },
    rowLabel: { flex: 1, color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
    rowValue: { maxWidth: '55%', marginLeft: 8, color: 'rgba(255,255,255,0.50)', fontSize: 15, fontWeight: '500', textAlign: 'right' },
    cityFlag: { width: 18, height: 18, marginLeft: 5 },
    chevron: { width: 8, marginLeft: 8, color: 'rgba(255,255,255,0.50)', fontSize: 27, lineHeight: 29 },
    actions: { position: 'absolute', right: 0, bottom: 0, left: 0, paddingTop: 16, paddingBottom: Math.max(24, safeBottom), alignItems: 'center', justifyContent: 'center' },
    inviteRing: { width: 330, height: 54, padding: 5, borderRadius: 36, backgroundColor: '#4C1816' },
    invite: { flex: 1, paddingHorizontal: 20, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 31, backgroundColor: '#B82F29' },
    inviteText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.6 },
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
