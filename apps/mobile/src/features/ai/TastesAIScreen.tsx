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
import assistantImage from '../../../assets/ai/assistant-cropped.png';
import BookmarkOutlineLine from '../../../assets/ai/bookmark-outline-line.svg';
import BookmarkOutline from '../../../assets/ai/bookmark-outline.svg';
import bottomGlow from '../../../assets/ai/bottom-glow.png';
import SendIcon from '../../../assets/ai/send.svg';
import AiMouthOutline from '../../../assets/create-review/success-mouth-outline.svg';
import AiMouthPink from '../../../assets/create-review/success-mouth-pink.svg';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import OfflineIcon from '../../../assets/figma-icons/home-offline.svg';
import LocationOffIcon from '../../../assets/leaderboard/xp-location.svg';
import { SaveToFolderSheet, type SaveablePlace } from '../favourites/FavouritesPane';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

type AiTurn = {
  id: string;
  prompt: string;
  answer: TastesAiAnswer;
  createdAt: string;
};

type AiConversation = {
  id: string;
  turns: AiTurn[];
  createdAt: string;
  updatedAt: string;
};

type LegacyAiExchange = AiTurn;

const HISTORY_KEY = '@tastes/ai-history';
const THINKING_PREVIEW_DELAY_MS = __DEV__ ? 5_000 : 0;
const PLACE_IMAGES = [cafeImage, loungeImage, restaurantImage] as const;
const QUICK_PROMPTS = [
  { label: '⭐ Top rated', prompt: 'Show me the top-rated restaurants nearby' },
  { label: '🍔 Fast food', prompt: 'Find good fast food nearby' },
  { label: '☕ Coffee nearby', prompt: 'Find a great coffee shop nearby' },
  { label: '🍣 Sushi spots', prompt: 'Show me the best sushi spots nearby' },
  { label: '🍜 Asian food', prompt: 'Recommend Asian restaurants nearby' },
  { label: '🥗 Healthy food', prompt: 'Find healthy food nearby' },
] as const;

function parseStoredHistory(raw: string): AiConversation[] {
  const stored = JSON.parse(raw) as Array<AiConversation | LegacyAiExchange>;
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((item) => {
    if ('turns' in item && Array.isArray(item.turns)) return [item];
    if ('prompt' in item && 'answer' in item) {
      return [{
        id: item.id,
        turns: [item],
        createdAt: item.createdAt,
        updatedAt: item.createdAt,
      }];
    }
    return [];
  });
}

function AiMark({ color }: { color?: string } = {}) {
  const { colors } = useAppTheme();
  return (
    <View style={markStyles.container}>
      <AiMouthPink height={10} style={markStyles.pink} width={13} />
      <AiMouthOutline color={color ?? colors.text} height={13} style={markStyles.outline} width={18} />
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
  const [conversation, setConversation] = useState<AiConversation | null>(null);
  const [history, setHistory] = useState<AiConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [asking, setAsking] = useState(false);
  const [savedPlace, setSavedPlace] = useState<SaveablePlace | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);
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
          setHistory(parseStoredHistory(raw));
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
    const thinkingStartedAt = Date.now();
    setLastPrompt(prompt);
    setText('');
    setAsking(true);
    setFailure(null);
    const currentRequest = ++requestId.current;
    const activeConversation = conversation;
    try {
      const answer = await api
        .askTastesAi({
          prompt,
          context: activeConversation?.turns.slice(-10).map((turn) => turn.prompt) ?? [],
          ...(city ? { location: city } : {}),
          ...(coordinates ?? {}),
        })
        .then((response) => response.data);
      const remainingPreviewDelay = THINKING_PREVIEW_DELAY_MS - (Date.now() - thinkingStartedAt);
      if (remainingPreviewDelay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remainingPreviewDelay));
      }
      if (currentRequest !== requestId.current) return;
      const nextTurn = {
        id: answer.id,
        prompt,
        answer,
        createdAt: new Date().toISOString(),
      };
      const nextConversation: AiConversation = activeConversation
        ? {
            ...activeConversation,
            turns: [...activeConversation.turns, nextTurn],
            updatedAt: nextTurn.createdAt,
          }
        : {
            id: `chat-${Date.now()}`,
            turns: [nextTurn],
            createdAt: nextTurn.createdAt,
            updatedAt: nextTurn.createdAt,
          };
      setConversation(nextConversation);
      const nextHistory = [
        nextConversation,
        ...history.filter((item) => item.id !== nextConversation.id),
      ].slice(0, 30);
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
    setConversation(null);
  }
  async function deleteHistory(id: string) {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    if (conversation?.id === id) setConversation(null);
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
            <AiMark color="#FFFFFF" />
            <Text style={styles.title}>Tastes AI</Text>
          </View>
          {failure || asking || conversation ? <View style={styles.headerAction} /> : (
            <Pressable
              accessibilityLabel="Open AI history"
              onPress={() => setHistoryOpen(true)}
              style={styles.headerAction}
            >
              <Text style={styles.historyLink}>History</Text>
            </Pressable>
          )}
        </View>

        {failure ? (
          <View style={styles.errorPanel}>
            <View style={styles.errorContent}>
              {failure === 'location' ? (
                <LocationOffIcon color={colors.text} height={62} width={52} />
              ) : (
                <OfflineIcon color={colors.text} height={62} width={62} />
              )}
              <Text style={styles.errorTitle}>
                {failure === 'location' ? 'Location is off' : "You're offline"}
              </Text>
              <Text style={styles.errorCopy}>
                {failure === 'location'
                  ? 'Tastes AI suggests places near you. Turn on\nlocation, or pick a city instead.'
                  : 'Tastes AI needs a connection to answer.\nCheck your internet and try again.'}
              </Text>
              <Pressable
                onPress={() => {
                  if (failure === 'location') {
                    void enableLocation();
                  } else {
                    void ask(lastPrompt);
                  }
                }}
                style={styles.errorPrimary}
              >
                <Text style={styles.errorPrimaryText}>
                  {failure === 'location' ? 'Enable location' : 'Retry'}
                </Text>
              </Pressable>
              {failure === 'location' ? (
                <Pressable
                  onPress={() => {
                    setCity('Istanbul');
                    setCoordinates(null);
                    setFailure(null);
                  }}
                  style={styles.errorSecondary}
                >
                  <Text style={styles.errorSecondaryText}>Choose city manually</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : !conversation && !asking ? (
          <View style={styles.empty}>
            <Text style={styles.heroTitle}>Discover where to eat...</Text>
            <View style={styles.assistantCrop}>
              <Image resizeMode="contain" source={assistantImage} style={styles.assistant} />
            </View>
            <Text style={styles.heroCopy}>
              {'Find the best restaurants near you\nwith AI recommendations based on\n'}
              <Text style={styles.accent}>your taste</Text>
            </Text>
          </View>
        ) : asking && !conversation ? (
          <Thinking prompt={lastPrompt} styles={styles} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
            ref={chatScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.chatViewport}
          >
            {conversation?.turns.map((turn) => (
              <ChatTurn
                key={turn.id}
                onAsk={(prompt) => void ask(prompt)}
                onOpenPlace={onOpenPlace}
                onSavePlace={setSavedPlace}
                styles={styles}
                turn={turn}
              />
            ))}
            {asking && conversation ? (
              <View style={styles.conversationTurn}>
                <UserBubble text={lastPrompt} styles={styles} />
                <InlineThinking styles={styles} />
              </View>
            ) : null}
          </ScrollView>
        )}

        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>✓ {toast}</Text>
          </View>
        ) : null}
        {!failure && !conversation && !asking ? (
          <View style={styles.quickPrompts}>
            <View style={styles.quickPromptsTitleRow}>
              <View style={styles.quickPromptsDivider} />
              <Text style={styles.quickPromptsTitle}>FAST BUTTONS</Text>
              <View style={styles.quickPromptsDivider} />
            </View>
            <View style={styles.quickPromptRows}>
              {[QUICK_PROMPTS.slice(0, 3), QUICK_PROMPTS.slice(3)].map((row, index) => (
                <View key={index} style={styles.quickPromptRow}>
                  {row.map(({ label, prompt }) => (
                    <Pressable
                      key={label}
                      onPress={() => void ask(prompt)}
                      style={styles.quickPrompt}
                    >
                      <Text style={styles.quickPromptText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
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
        isDark={isDark}
        loading={loadingHistory}
        history={history}
        onClear={() => void clearHistory()}
        onDelete={(id) => void deleteHistory(id)}
        onClose={() => setHistoryOpen(false)}
        onNew={() => {
          setConversation(null);
          setFailure(null);
          setHistoryOpen(false);
        }}
        onOpen={(item) => {
          setConversation(item);
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

function ChatTurn({
  onAsk,
  onOpenPlace,
  onSavePlace,
  styles,
  turn,
}: {
  onAsk: (prompt: string) => void;
  onOpenPlace: (venueId: string) => void;
  onSavePlace: (place: SaveablePlace) => void;
  styles: ReturnType<typeof createStyles>;
  turn: AiTurn;
}) {
  return (
    <View style={styles.conversationTurn}>
      <UserBubble text={turn.prompt} styles={styles} />
      <View style={styles.answer}>
        <View style={styles.assistantMessageRow}>
          <View style={styles.aiAvatar}><AiMark color="#FFFFFF" /></View>
          <View style={styles.assistantBubble}>
            <Text style={styles.answerText}>{turn.answer.text}</Text>
          </View>
        </View>
        {turn.answer.places.length === 0 ? (
          <View style={styles.noResults}>
            <Text style={styles.noResultsIcon}>⌕</Text>
            <Text style={styles.noResultsTitle}>No confident matches</Text>
            <Text style={styles.noResultsBody}>Try another area, cuisine or occasion.</Text>
          </View>
        ) : (
          <>
            <View style={styles.bestResultsRow}>
              <View style={styles.aiAvatar}><AiMark color="#FFFFFF" /></View>
              <View style={styles.bestResultsBubble}>
                <Text style={styles.bestResultsText}>Best results</Text>
              </View>
            </View>
            <View style={styles.placeList}>
              {turn.answer.places.map((place, index) => (
                <PlaceCard
                  key={place.id}
                  index={index}
                  onOpen={() => onOpenPlace(place.id)}
                  onSave={() => onSavePlace({ venueId: place.id, name: place.name })}
                  place={place}
                  styles={styles}
                />
              ))}
            </View>
          </>
        )}
        <View style={styles.followUps}>
          {turn.answer.followUps.map((followUp) => (
            <Pressable key={followUp} onPress={() => onAsk(followUp)} style={styles.followUp}>
              <Text style={styles.followUpText}>{followUp}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function UserBubble({ text, styles }: { text: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.userBubble}>
      <Text style={styles.userText}>{text}</Text>
    </View>
  );
}

function InlineThinking({ styles }: { styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.inlineThinkingRow}>
      <View style={styles.aiAvatar}><AiMark color="#FFFFFF" /></View>
      <View style={styles.inlineThinkingBubble}>
        <Text style={styles.inlineThinkingText}>Thinking…</Text>
      </View>
    </View>
  );
}

function Thinking({ prompt, styles }: { prompt: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.thinkingScreen}>
      <View style={styles.thinkingHero}>
        <View style={styles.thinkingAssistantCrop}>
          <Image resizeMode="contain" source={assistantImage} style={styles.thinkingAssistant} />
        </View>
        <Text style={styles.thinkingTitle}>Thinking...</Text>
      </View>
      <View style={styles.thinkingStage}>
        <View style={styles.thinkingPrompt}>
          <Text style={styles.thinkingPromptText}>{prompt}</Text>
        </View>
      </View>
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
  const { isDark } = useAppTheme();
  const reviewCount = 35 + index * 18;
  return (
    <Pressable onPress={onOpen} style={styles.placeCard}>
      <Image source={PLACE_IMAGES[index % PLACE_IMAGES.length]} style={styles.placeImage} />
      <View style={styles.placeCopy}>
        <Text numberOfLines={1} style={styles.placeName}>{place.name}</Text>
        <Text numberOfLines={1} style={styles.placeDescription}>{place.description}</Text>
        <View style={styles.placeRatingRow}>
          <View style={styles.ratingPill}>
            <Text style={styles.ratingPillText}>★ {place.rating.toFixed(1)}</Text>
          </View>
          <Text style={styles.reviewCount}>{reviewCount} reviews</Text>
        </View>
      </View>
        <Pressable
          accessibilityLabel={`Save ${place.name}`}
          onPress={(event) => {
            event.stopPropagation();
            onSave();
          }}
          style={styles.bookmark}
        >
          {isDark ? (
            <BookmarkIcon height={20} width={18} />
          ) : (
            <View style={styles.bookmarkOutline}>
              <BookmarkOutline height={17} width={15} />
              <BookmarkOutlineLine height={1.2} style={styles.bookmarkOutlineLine} width={6} />
            </View>
          )}
        </Pressable>
    </Pressable>
  );
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function HistoryModal({
  color,
  history,
  isDark,
  loading,
  onClear,
  onClose,
  onDelete,
  onNew,
  onOpen,
  styles,
  visible,
}: {
  color: string;
  history: AiConversation[];
  isDark: boolean;
  loading: boolean;
  onClear: () => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onOpen: (item: AiConversation) => void;
  styles: ReturnType<typeof createStyles>;
  visible: boolean;
}) {
  const [clearConfirm, setClearConfirm] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <LinearGradient
        colors={isDark ? ['#560E0B', '#080808'] : ['#B82F29', '#F2EFEA']}
        locations={isDark ? [0, 1] : [0, 0.42449]}
        style={styles.historyScreen}
      >
        <StatusBar style="light" />
        <View pointerEvents="none" style={styles.historyDim} />
        <View pointerEvents="none" style={styles.historyGlow}>
          <Image source={bottomGlow} style={styles.historyGlowImage} />
        </View>
        <View pointerEvents="none" style={styles.historyPanel} />
        <View style={styles.historyHeader}>
          <Pressable accessibilityLabel="Back" onPress={onClose} style={styles.historyButton}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <View style={styles.historyBrand}>
            <View style={styles.historyBrandMark}>
              <AiMark color="#FFFFFF" />
            </View>
            <Text style={styles.historyTitle}>Tastes AI</Text>
          </View>
          {!loading && history.length > 0 ? (
            <Pressable onPress={() => setClearConfirm(true)} style={styles.historyButton}>
              <Text style={styles.clearHistory}>Clear all</Text>
            </Pressable>
          ) : <View style={styles.historyButton} />}
        </View>
        {loading ? (
          <ActivityIndicator color={color} style={styles.historyLoader} />
        ) : history.length === 0 ? (
          <View style={styles.historyEmpty}>
            <View style={styles.historyEmptyMark}>
              <AiMark color={isDark ? '#FFFFFF' : '#000000'} />
            </View>
            <Text style={styles.historyEmptyTitle}>No chats yet</Text>
            <Text style={styles.historyEmptyBody}>
              Ask Tastes AI where to eat and your chats will{`\n`}show up here.
            </Text>
            <Pressable
              accessibilityLabel="Start a new chat"
              onPress={onNew}
              style={[styles.newChatButton, styles.historyEmptyNewChat]}
            >
              <Text style={styles.newChatPlus}>+</Text>
              <Text style={styles.newChatText}>New chat</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable onPress={onNew} style={styles.newChatButton}>
              <Text style={styles.newChatPlus}>+</Text>
              <Text style={styles.newChatText}>New chat</Text>
            </Pressable>
            <Text style={styles.historySectionTitle}>RECENT</Text>
            <ScrollView contentContainerStyle={styles.historyList}>
              {history.map((item, index) => {
                const firstTurn = item.turns[0];
                const latestTurn = item.turns[item.turns.length - 1];
                if (!firstTurn || !latestTurn) return null;
                return (
                  <Pressable
                    key={item.id}
                    onLongPress={() => setMenuId(item.id)}
                    onPress={() => onOpen(item)}
                    style={styles.historyRow}
                  >
                    <View style={styles.historyCopy}>
                      <Text numberOfLines={1} style={styles.historyPrompt}>
                        {firstTurn.prompt}
                      </Text>
                      <Text numberOfLines={1} style={styles.historyPreview}>
                        {formatHistoryDate(item.updatedAt)}
                        {index === 0 && latestTurn.answer.places.length > 0
                          ? ` · ${latestTurn.answer.places.length} places found`
                          : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
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
      </LinearGradient>
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
    errorPanel: {
      flex: 1,
      marginHorizontal: 14,
      marginTop: 8,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(8,8,8,0.08)' : colors.canvas,
    },
    errorContent: {
      flex: 1,
      paddingHorizontal: 20,
      paddingBottom: 140,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorTitle: {
      marginTop: 18,
      color: colors.text,
      fontSize: 23,
      lineHeight: 29,
      fontWeight: '700',
      textAlign: 'center',
    },
    errorCopy: {
      marginTop: 12,
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 20,
      textAlign: 'center',
    },
    errorPrimary: {
      minWidth: 160,
      height: 48,
      marginTop: 16,
      paddingHorizontal: 24,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    errorPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    errorSecondary: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10 },
    errorSecondaryText: { color: colors.textSecondary, fontSize: 15 },
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
    assistant: {
      position: 'absolute',
      top: isDark ? 40 : 7,
      left: isDark ? 61 : 22,
      width: isDark ? 260 : 219,
      height: isDark ? 260 : 219,
    },
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
    quickPrompts: { width: '100%', paddingHorizontal: 16, paddingBottom: 4 },
    quickPromptsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    quickPromptsDivider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    quickPromptsTitle: { color: colors.textMuted, fontSize: 13, letterSpacing: 0.6 },
    quickPromptRows: { marginTop: 12, gap: 8 },
    quickPromptRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    quickPrompt: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 39, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' },
    quickPromptText: { color: isDark ? colors.text : '#000000', fontSize: 14 },
    chatViewport: {
      flex: 1,
      marginHorizontal: isDark ? 0 : 16,
      overflow: 'hidden',
      borderWidth: isDark ? 0 : 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: isDark ? 0 : 20,
      backgroundColor: isDark ? 'transparent' : 'rgba(255,255,255,0.40)',
    },
    chatContent: {
      paddingHorizontal: isDark ? 16 : 0,
      paddingTop: isDark ? 16 : 10,
      paddingBottom: 18,
    },
    conversationTurn: { marginBottom: isDark ? 18 : 0 },
    userBubble: {
      maxWidth: isDark ? '82%' : '76%',
      alignSelf: 'flex-end',
      marginRight: isDark ? 0 : 12,
      paddingHorizontal: isDark ? 12 : 10,
      paddingVertical: isDark ? 10 : 8,
      borderRadius: isDark ? 14 : 12,
      borderBottomRightRadius: isDark ? 4 : 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    },
    userText: { color: colors.text, fontSize: 14, lineHeight: isDark ? 20 : 17 },
    answer: {
      marginTop: isDark ? 18 : 12,
      paddingTop: isDark ? 14 : 0,
      paddingHorizontal: 12,
      overflow: 'hidden',
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.hairline,
      borderRadius: isDark ? 20 : 0,
      backgroundColor: isDark ? 'rgba(8,8,8,0.14)' : 'transparent',
    },
    assistantMessageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: isDark ? 8 : 5,
    },
    aiAvatar: {
      width: isDark ? 38 : 36,
      height: isDark ? 38 : 36,
      borderRadius: isDark ? 19 : 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FF9EB1',
    },
    assistantBubble: {
      flexShrink: 1,
      maxWidth: isDark ? '82%' : '80%',
      paddingHorizontal: isDark ? 12 : 10,
      paddingVertical: isDark ? 10 : 8,
      borderRadius: isDark ? 14 : 12,
      borderBottomLeftRadius: isDark ? 4 : 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#FF9EB1',
    },
    answerText: {
      color: colors.text,
      fontSize: 14,
      lineHeight: isDark ? 20 : 17,
    },
    bestResultsRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: isDark ? 8 : 5,
    },
    bestResultsBubble: {
      paddingHorizontal: isDark ? 12 : 10,
      paddingVertical: isDark ? 9 : 8,
      borderRadius: isDark ? 14 : 12,
      borderBottomLeftRadius: isDark ? 4 : 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#FF9EB1',
    },
    bestResultsText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    inlineThinkingRow: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineThinkingBubble: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderBottomLeftRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.10)',
    },
    inlineThinkingText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
    thinkingScreen: { flex: 1, paddingHorizontal: 16 },
    thinkingHero: {
      height: 120,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 13,
    },
    thinkingAssistantCrop: {
      width: 111,
      height: 98,
      overflow: 'hidden',
    },
    thinkingAssistant: {
      width: '100%',
      height: '100%',
    },
    thinkingTitle: {
      color: '#FFFFFF',
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    thinkingStage: {
      flex: 1,
      minHeight: 260,
      padding: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? colors.hairline : 'rgba(255,255,255,0.10)',
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(8,8,8,0.08)' : 'rgba(255,255,255,0.40)',
    },
    thinkingPrompt: {
      alignSelf: 'flex-end',
      maxWidth: '84%',
      paddingHorizontal: isDark ? 14 : 10,
      paddingVertical: isDark ? 10 : 8,
      borderRadius: isDark ? 18 : 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    },
    thinkingPromptText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    placeList: { marginTop: 12, marginHorizontal: -12 },
    placeCard: {
      minHeight: isDark ? 136 : 146,
      paddingHorizontal: isDark ? 12 : 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: isDark ? 14 : 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.hairline : 'rgba(255,255,255,0.10)',
    },
    placeImage: {
      width: isDark ? 112 : 122,
      height: isDark ? 112 : 122,
      borderRadius: 12,
    },
    bookmark: {
      position: 'absolute',
      top: 12,
      right: 14,
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bookmarkOutline: {
      width: 15,
      height: 17,
    },
    bookmarkOutlineLine: {
      position: 'absolute',
      top: 3,
      left: 4.5,
    },
    placeCopy: { flex: 1, minWidth: 0, paddingRight: 34 },
    placeName: {
      color: colors.text,
      fontSize: isDark ? 15 : 14,
      fontWeight: isDark ? '700' : '600',
    },
    placeDescription: {
      marginTop: 6,
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    placeRatingRow: {
      marginTop: isDark ? 12 : 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: isDark ? 8 : 4,
    },
    ratingPill: {
      height: isDark ? 27 : 28,
      paddingHorizontal: isDark ? 10 : 12,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    ratingPillText: {
      color: '#FFFFFF',
      fontSize: isDark ? 13 : 14,
      fontWeight: isDark ? '700' : '600',
    },
    reviewCount: {
      color: isDark ? colors.textMuted : 'rgba(56,64,80,0.40)',
      fontSize: isDark ? 13 : 14,
    },
    followUps: {
      display: isDark ? 'flex' : 'none',
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
      paddingTop: isDark ? 10 : 16,
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
    historyScreen: { flex: 1 },
    historyDim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'transparent',
    },
    historyGlow: {
      position: 'absolute',
      left: '50%',
      bottom: -155.7,
      width: 454.4,
      height: 454.4,
      transform: [{ translateX: -227.2 }],
    },
    historyGlowImage: { width: '100%', height: '100%', opacity: isDark ? 1 : 0 },
    historyPanel: {
      position: 'absolute',
      top: safeTop + 66,
      right: 0,
      bottom: 0,
      left: 0,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: isDark ? 'rgba(8,8,8,0.24)' : colors.canvas,
    },
    historyHeader: {
      height: safeTop + 66,
      paddingTop: safeTop + 6,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    historyButton: {
      width: 70,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyBrand: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    historyBrandMark: {
      width: 29,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyTitle: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '600',
      textAlign: 'center',
    },
    clearHistory: { color: '#FFFFFF', opacity: 0.72, fontSize: 14 },
    newChatButton: {
      alignSelf: 'flex-start',
      height: 49,
      marginTop: 10,
      marginLeft: 16,
      paddingLeft: 18,
      paddingRight: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 25,
      backgroundColor: colors.primary,
    },
    newChatPlus: { color: '#FFFFFF', fontSize: 19, lineHeight: 23, fontWeight: '400' },
    newChatText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    historySectionTitle: {
      marginTop: 38,
      marginHorizontal: 16,
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.6,
    },
    historyLoader: { marginTop: 40 },
    historyEmpty: {
      flex: 1,
      paddingTop: 190,
      paddingHorizontal: 41,
      alignItems: 'center',
    },
    historyEmptyMark: {
      width: 46,
      height: 58,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.5,
      transform: [{ scale: 1.75 }],
    },
    historyEmptyTitle: {
      marginTop: 10,
      color: colors.text,
      fontSize: 19,
      lineHeight: 23,
      fontWeight: '600',
      textAlign: 'center',
    },
    historyEmptyBody: {
      marginTop: 10,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 17,
      textAlign: 'center',
    },
    historyEmptyNewChat: {
      alignSelf: 'center',
      marginTop: 25,
      marginLeft: 0,
    },
    historyList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 + safeBottom },
    historyRow: {
      minHeight: 66,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    historyCopy: { flex: 1, gap: 4 },
    historyPrompt: { color: colors.text, fontSize: 15, fontWeight: '600' },
    historyPreview: { color: colors.textSecondary, fontSize: 13 },
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
