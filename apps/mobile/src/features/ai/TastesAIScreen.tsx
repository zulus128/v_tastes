import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TastesAiAnswer, TastesAiPlace } from '@tastes/contracts';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import assistantImage from '../../../assets/ai/assistant.png';
import bottomGlow from '../../../assets/ai/bottom-glow.png';
import SendIcon from '../../../assets/ai/send.svg';
import AiMouthOutline from '../../../assets/create-review/success-mouth-outline.svg';
import AiMouthPink from '../../../assets/create-review/success-mouth-pink.svg';
import { SaveToFolderSheet, type SaveablePlace } from '../favourites/FavouritesPane';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type AiExchange = {
  id: string;
  prompt: string;
  answer: TastesAiAnswer;
  createdAt: string;
};

const HISTORY_KEY = '@tastes/ai-history';
const QUICK_PROMPTS = [
  { label: '⭐ Top rated', prompt: 'Show me the top-rated restaurants nearby' },
  { label: '🍔 Fast food', prompt: 'Find good fast food nearby' },
  { label: '☕ Coffee nearby', prompt: 'Find a great coffee shop nearby' },
  { label: '🍣 Sushi spots', prompt: 'Show me the best sushi spots nearby' },
  { label: '🍜 Asian food', prompt: 'Recommend Asian restaurants nearby' },
  { label: '🥗 Healthy food', prompt: 'Find healthy food nearby' },
] as const;

function AiMark() {
  return (
    <View style={markStyles.container}>
      <AiMouthPink height={10} style={markStyles.pink} width={13} />
      <AiMouthOutline height={13} style={markStyles.outline} width={18} />
    </View>
  );
}

const markStyles = StyleSheet.create({
  container: { width: 20, height: 18 },
  pink: { position: 'absolute', top: 6, left: 4 },
  outline: { position: 'absolute', top: 2, left: 1, transform: [{ scaleY: -1 }] },
});

export function TastesAIScreen({
  onBack,
  onOpenPlace,
  userId,
}: {
  onBack: () => void;
  onOpenPlace: (venueId: string) => void;
  userId: string;
}) {
  const api = useTastesApi();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(colors, insets.top, insets.bottom),
    [colors, insets.bottom, insets.top],
  );
  const [text, setText] = useState('');
  const [exchange, setExchange] = useState<AiExchange | null>(null);
  const [history, setHistory] = useState<AiExchange[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [asking, setAsking] = useState(false);
  const [savedPlace, setSavedPlace] = useState<SaveablePlace | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const [failure, setFailure] = useState<'offline' | 'failed' | 'location' | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');

  useEffect(() => {
    void AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setHistory(JSON.parse(raw) as AiExchange[]);
        } catch {
          setHistory([]);
        }
      })
      .finally(() => setLoadingHistory(false));
    void Location.getForegroundPermissionsAsync().then((permission) => {
      if (permission.status === 'denied' && !permission.canAskAgain) setFailure('location');
    });
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  async function ask(value = text) {
    const prompt = value.trim();
    if (!prompt || asking) return;
    setLastPrompt(prompt);
    setText('');
    setAsking(true);
    setFailure(null);
    const currentRequest = ++requestId.current;
    try {
      const answer = await api
        .askTastesAi({ prompt, ...(city ? { location: city } : {}), ...(coordinates ?? {}) })
        .then((response) => response.data);
      if (currentRequest !== requestId.current) return;
      const next = {
        id: answer.id,
        prompt,
        answer,
        createdAt: new Date().toISOString(),
      };
      setExchange(next);
      const nextHistory = [next, ...history.filter((item) => item.id !== next.id)].slice(0, 30);
      setHistory(nextHistory);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const code = (error as { code?: string }).code ?? '';
      setFailure(/unavailable|network|deadline/.test(code) ? 'offline' : 'failed');
    } finally {
      if (currentRequest === requestId.current) setAsking(false);
    }
  }

  async function clearHistory() {
    await AsyncStorage.removeItem(HISTORY_KEY);
    setHistory([]);
    setExchange(null);
  }
  async function deleteHistory(id: string) {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    if (exchange?.id === id) setExchange(null);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }
  async function enableLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status === 'granted') {
      const position = await Location.getCurrentPositionAsync();
      const result = await Location.reverseGeocodeAsync(position.coords);
      setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setCity(result[0]?.city ?? 'Nearby');
      setFailure(null);
    }
  }

  return (
    <LinearGradient
      colors={isDark ? ['#560E0B', '#080808'] : ['#B82F29', '#F2EFEA']}
      locations={isDark ? [0, 1] : [0, 0.42449]}
      style={styles.screen}
    >
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.backgroundDim} />
      <View pointerEvents="none" style={styles.bottomGlow}>
        <Image source={bottomGlow} style={styles.bottomGlowImage} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.headerAction}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <View style={styles.brand}>
            <AiMark />
            <Text style={styles.title}>Tastes AI</Text>
          </View>
          <Pressable
            accessibilityLabel="Open AI history"
            onPress={() => setHistoryOpen(true)}
            style={styles.headerAction}
          >
            <Text style={styles.historyLink}>History</Text>
          </Pressable>
        </View>

        {failure ? (
          <View style={styles.empty}>
            <Text style={styles.heroTitle}>
              {failure === 'location'
                ? 'Location is off'
                : failure === 'offline'
                  ? 'You’re offline'
                  : 'Couldn’t get an answer.'}
            </Text>
            <View style={styles.assistantCrop}>
              <Image resizeMode="contain" source={assistantImage} style={styles.assistant} />
            </View>
            <Text style={styles.heroCopy}>
              {failure === 'location'
                ? 'Tastes AI suggests places near you. Turn on location, or pick a city instead.'
                : 'Check your connection and try again.'}
            </Text>
            <View style={styles.suggestions}>
              {failure === 'location' ? (
                <>
                  <Pressable onPress={() => void enableLocation()} style={styles.suggestion}>
                    <Text style={styles.suggestionText}>Enable location</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setCity('Istanbul');
                      setCoordinates(null);
                      setFailure(null);
                    }}
                    style={styles.suggestion}
                  >
                    <Text style={styles.suggestionText}>Choose Istanbul manually</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => void ask(lastPrompt)} style={styles.suggestion}>
                  <Text style={styles.suggestionText}>Try again</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : !exchange && !asking ? (
          <View style={styles.empty}>
            <Text style={styles.heroTitle}>Discover where to eat...</Text>
            <View style={styles.assistantCrop}>
              <Image resizeMode="contain" source={assistantImage} style={styles.assistant} />
            </View>
            <Text style={styles.heroCopy}>
              {'Find the best restaurants near you\nwith AI recommendations based on\n'}
              <Text style={styles.accent}>your taste</Text>
            </Text>
            <View style={styles.quickPrompts}>
              <View style={styles.quickPromptsTitleRow}>
                <View style={styles.quickPromptsDivider} />
                <Text style={styles.quickPromptsTitle}>FAST BUTTONS</Text>
                <View style={styles.quickPromptsDivider} />
              </View>
              <View style={styles.quickPromptsGrid}>
                {QUICK_PROMPTS.map(({ label, prompt }) => (
                <Pressable
                  key={label}
                  onPress={() => void ask(prompt)}
                  style={styles.quickPrompt}
                >
                  <Text style={styles.quickPromptText}>{label}</Text>
                </Pressable>
              ))}
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {exchange ? <UserBubble text={exchange.prompt} styles={styles} /> : null}
            {asking ? <Thinking color={colors.primary} styles={styles} /> : null}
            {exchange && !asking ? (
              <View style={styles.answer}>
                <View style={styles.aiHeading}>
                  <AiMark />
                  <Text style={styles.aiName}>Tastes AI</Text>
                </View>
                <Text style={styles.answerText}>{exchange.answer.text}</Text>
                {exchange.answer.places.length === 0 ? (
                  <View style={styles.noResults}>
                    <Text style={styles.noResultsIcon}>⌕</Text>
                    <Text style={styles.noResultsTitle}>No confident matches</Text>
                    <Text style={styles.noResultsBody}>Try another area, cuisine or occasion.</Text>
                  </View>
                ) : (
                  exchange.answer.places.map((place, index) => (
                    <PlaceCard
                      key={place.id}
                      index={index}
                      onOpen={() => onOpenPlace(place.id)}
                      onSave={() => setSavedPlace({ venueId: place.id, name: place.name })}
                      place={place}
                      styles={styles}
                    />
                  ))
                )}
                <View style={styles.followUps}>
                  {exchange.answer.followUps.map((followUp) => (
                    <Pressable
                      key={followUp}
                      onPress={() => void ask(followUp)}
                      style={styles.followUp}
                    >
                      <Text style={styles.followUpText}>{followUp}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        )}

        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>✓ {toast}</Text>
          </View>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            editable={!asking}
            maxLength={500}
            onChangeText={setText}
            onSubmitEditing={() => void ask()}
            placeholder="Message"
            placeholderTextColor={colors.placeholder}
            returnKeyType="send"
            style={styles.input}
            value={text}
          />
          <Pressable
            accessibilityLabel={asking ? 'Stop generating' : 'Send'}
            disabled={!asking && !text.trim()}
            onPress={() =>
              asking
                ? (() => {
                    requestId.current += 1;
                    setAsking(false);
                  })()
                : void ask()
            }
            style={[styles.send, !asking && !text.trim() && styles.sendDisabled]}
          >
            {asking ? <Text style={styles.sendText}>■</Text> : <SendIcon height={16.667} width={16.667} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <HistoryModal
        color={colors.primary}
        loading={loadingHistory}
        history={history}
        onClear={() => void clearHistory()}
        onDelete={(id) => void deleteHistory(id)}
        onClose={() => setHistoryOpen(false)}
        onOpen={(item) => {
          setExchange(item);
          setHistoryOpen(false);
        }}
        styles={styles}
        visible={historyOpen}
      />
      <SaveToFolderSheet
        onClose={() => setSavedPlace(null)}
        onSaved={() => showToast('Saved to favourites')}
        place={savedPlace}
        userId={userId}
        visible={savedPlace !== null}
      />
    </LinearGradient>
  );
}

function UserBubble({ text, styles }: { text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.userBubble}>
      <Text style={styles.userText}>{text}</Text>
    </View>
  );
}

function Thinking({ color, styles }: { color: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.thinking}>
      <View style={styles.aiHeading}>
        <AiMark />
        <Text style={styles.aiName}>Tastes AI</Text>
      </View>
      <ActivityIndicator color={color} />
      <Text style={styles.thinkingText}>Finding places that match your taste…</Text>
    </View>
  );
}

function PlaceCard({
  index,
  onOpen,
  onSave,
  place,
  styles,
}: {
  index: number;
  onOpen: () => void;
  onSave: () => void;
  place: TastesAiPlace;
  styles: ReturnType<typeof createStyles>;
}) {
  const gradients = [
    ['#693A2B', '#251411'],
    ['#253D45', '#111C20'],
    ['#51402C', '#211A12'],
  ] as const;
  return (
    <Pressable onPress={onOpen} style={styles.placeCard}>
      <LinearGradient colors={gradients[index % gradients.length]} style={styles.placeImage}>
        <Text style={styles.placeInitial}>{place.name.slice(0, 1)}</Text>
        <Pressable
          accessibilityLabel={`Save ${place.name}`}
          onPress={(event) => {
            event.stopPropagation();
            onSave();
          }}
          style={styles.bookmark}
        >
          <Text style={styles.bookmarkText}>♡</Text>
        </Pressable>
      </LinearGradient>
      <View style={styles.placeCopy}>
        <View style={styles.placeTitleRow}>
          <Text numberOfLines={1} style={styles.placeName}>
            {place.name}
          </Text>
          <Text style={styles.rating}>★ {place.rating}</Text>
        </View>
        <Text numberOfLines={2} style={styles.placeDescription}>
          {place.description}
        </Text>
        <View style={styles.placeMeta}>
          <Text style={styles.metaChip}>{place.cuisine}</Text>
          <Text style={styles.metaChip}>{place.price}</Text>
          <Text style={styles.metaChip}>Nearby</Text>
        </View>
      </View>
    </Pressable>
  );
}

function HistoryModal({
  color,
  history,
  loading,
  onClear,
  onClose,
  onDelete,
  onOpen,
  styles,
  visible,
}: {
  color: string;
  history: AiExchange[];
  loading: boolean;
  onClear: () => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onOpen: (item: AiExchange) => void;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  const [clearConfirm, setClearConfirm] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={styles.historyScreen}>
        <View style={styles.historyHeader}>
          <Pressable onPress={onClose} style={styles.historyButton}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.historyTitle}>Chat history</Text>
          <Pressable
            disabled={history.length === 0}
            onPress={() => setClearConfirm(true)}
            style={styles.historyButton}
          >
            <Text style={styles.clearHistory}>Clear</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={color} style={styles.historyLoader} />
        ) : history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Text style={styles.noResultsTitle}>No chats yet</Text>
            <Text style={styles.noResultsBody}>Your restaurant searches will appear here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.historyList}>
            {history.map((item) => (
              <Pressable
                key={item.id}
                onLongPress={() => setMenuId(item.id)}
                onPress={() => onOpen(item)}
                style={styles.historyRow}
              >
                <View style={styles.historyRowIcon}>
                  <AiMark />
                </View>
                <View style={styles.historyCopy}>
                  <Text numberOfLines={1} style={styles.historyPrompt}>
                    {item.prompt}
                  </Text>
                  <Text numberOfLines={1} style={styles.historyPreview}>
                    {item.answer.text}
                  </Text>
                </View>
                <Text style={styles.historyDate}>
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {menuId ? (
          <View style={styles.historyScrim}>
            <Pressable onPress={() => setMenuId(null)} style={StyleSheet.absoluteFill} />
            <View style={styles.historySheet}>
              <Text style={styles.historySheetTitle}>Chat options</Text>
              <Pressable
                onPress={() => {
                  const id = menuId;
                  setMenuId(null);
                  void onDelete(id);
                }}
                style={styles.historyDestructive}
              >
                <Text style={styles.historyDestructiveText}>Delete chat</Text>
              </Pressable>
              <Pressable onPress={() => setMenuId(null)} style={styles.historyCancel}>
                <Text style={styles.historyCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {clearConfirm ? (
          <View style={styles.historyScrim}>
            <View style={styles.historyConfirm}>
              <Text style={styles.historySheetTitle}>Clear all chats?</Text>
              <Text style={styles.historyConfirmCopy}>
                This removes AI history from this device.
              </Text>
              <Pressable
                onPress={() => {
                  setClearConfirm(false);
                  onClear();
                }}
                style={styles.historyDestructive}
              >
                <Text style={styles.historyDestructiveText}>Clear all</Text>
              </Pressable>
              <Pressable onPress={() => setClearConfirm(false)} style={styles.historyCancel}>
                <Text style={styles.historyCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, safeTop: number, safeBottom: number) {
  const isDark = colors.background === '#080808';
  return StyleSheet.create({
    screen: { flex: 1 },
    backgroundDim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'transparent',
    },
    bottomGlow: {
      position: 'absolute',
      left: '50%',
      width: 454.4,
      height: 454.4,
      bottom: -155.7,
      transform: [{ translateX: -227.2 }],
    },
    bottomGlowImage: { width: '100%', height: '100%', opacity: isDark ? 1 : 0 },
    header: {
      height: safeTop + 66,
      paddingTop: safeTop + 6,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerAction: {
      width: 66,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    back: {
      color: '#FFFFFF',
      fontSize: 38,
      lineHeight: 40,
      fontWeight: '300',
    },
    brand: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    title: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
    historyLink: { color: '#FFFFFF', opacity: 0.72, fontSize: 13 },
    empty: { flex: 1, paddingHorizontal: 16, alignItems: 'center' },
    heroTitle: {
      marginTop: 6,
      color: '#FFFFFF',
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: 0.4,
    },
    assistantCrop: {
      width: isDark ? 380 : 257,
      height: isDark ? 300 : 226,
      marginTop: isDark ? 30 : 36,
      marginBottom: isDark ? 25 : 39,
      overflow: 'hidden',
    },
    assistant: { position: 'absolute', top: isDark ? -20 : -43, left: isDark ? 0 : -29, width: isDark ? 380 : 319, height: isDark ? 380 : 319 },
    heroCopy: {
      maxWidth: 365,
      color: colors.textSecondary,
      fontSize: isDark ? 19 : 22,
      lineHeight: isDark ? 25 : 26,
      textAlign: 'center',
    },
    accent: { color: colors.primary, fontWeight: '700' },
    suggestions: { width: '100%', marginTop: 24, gap: 8 },
    suggestion: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    suggestionText: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
    },
    quickPrompts: { width: '100%', marginTop: 'auto', paddingBottom: 20 },
    quickPromptsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    quickPromptsDivider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    quickPromptsTitle: { color: colors.textMuted, fontSize: 13, letterSpacing: 0.6 },
    quickPromptsGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 8 },
    quickPrompt: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 39, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' },
    quickPromptText: { color: isDark ? colors.text : '#000000', fontSize: 14 },
    chatContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 },
    userBubble: {
      maxWidth: '82%',
      alignSelf: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      borderBottomRightRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    userText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    answer: {
      marginTop: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 20,
      backgroundColor: 'rgba(8,8,8,0.32)',
    },
    aiHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    aiName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    answerText: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    thinking: {
      marginTop: 20,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 20,
      backgroundColor: 'rgba(8,8,8,0.25)',
    },
    thinkingText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
    },
    placeCard: {
      marginTop: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 18,
      backgroundColor: colors.surface,
    },
    placeImage: { height: 116, alignItems: 'center', justifyContent: 'center' },
    placeInitial: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 52,
      fontWeight: '900',
    },
    bookmark: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.46)',
    },
    bookmarkText: { color: '#FFFFFF', fontSize: 22 },
    placeCopy: { padding: 12 },
    placeTitleRow: { flexDirection: 'row', alignItems: 'center' },
    placeName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
    rating: { marginLeft: 8, color: colors.text, fontSize: 13 },
    placeDescription: {
      marginTop: 6,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    placeMeta: { marginTop: 10, flexDirection: 'row', gap: 6 },
    metaChip: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      overflow: 'hidden',
      borderRadius: 12,
      color: colors.textSecondary,
      backgroundColor: colors.surfaceRaised,
      fontSize: 11,
    },
    followUps: {
      marginTop: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    followUp: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
    },
    followUpText: { color: colors.textSecondary, fontSize: 12 },
    noResults: {
      minHeight: 190,
      marginTop: 14,
      padding: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: colors.surface,
    },
    noResultsIcon: { color: colors.primary, fontSize: 38 },
    noResultsTitle: {
      marginTop: 10,
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    noResultsBody: {
      marginTop: 7,
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    composer: {
      minHeight: (isDark ? 64 : 55) + safeBottom,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Math.max(10, safeBottom),
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: isDark ? 'rgba(8,8,8,0.24)' : 'transparent',
    },
    input: {
      flex: 1,
      height: 40,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      color: isDark ? colors.text : '#000000',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
      fontSize: 16,
    },
    send: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    sendDisabled: { backgroundColor: isDark ? '#8E2926' : colors.primary },
    sendText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
    toast: {
      position: 'absolute',
      left: 90,
      right: 90,
      bottom: 82 + safeBottom,
      padding: 12,
      borderRadius: 21,
      alignItems: 'center',
      backgroundColor: '#272727',
    },
    toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
    historyScreen: { flex: 1, backgroundColor: colors.canvas },
    historyHeader: {
      height: safeTop + 62,
      paddingTop: safeTop,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    historyButton: {
      width: 64,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    clearHistory: { color: colors.primary, fontSize: 13 },
    historyLoader: { marginTop: 60 },
    historyEmpty: {
      flex: 1,
      padding: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyList: { paddingVertical: 10 },
    historyRow: {
      minHeight: 78,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    historyRowIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    historyCopy: { flex: 1, marginLeft: 11 },
    historyPrompt: { color: colors.text, fontSize: 15, fontWeight: '600' },
    historyPreview: { marginTop: 4, color: colors.textMuted, fontSize: 12 },
    historyDate: { marginLeft: 8, color: colors.textMuted, fontSize: 11 },
    historyScrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 20,
      justifyContent: 'flex-end',
      padding: 12,
      backgroundColor: 'rgba(0,0,0,0.64)',
    },
    historySheet: {
      padding: 16,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    historyConfirm: {
      padding: 20,
      borderRadius: 20,
      backgroundColor: colors.surface,
    },
    historySheetTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: '700',
      textAlign: 'center',
    },
    historyConfirmCopy: {
      marginTop: 8,
      marginBottom: 18,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    historyDestructive: {
      height: 50,
      marginTop: 14,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    historyDestructiveText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    historyCancel: {
      height: 46,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyCancelText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  });
}
