import type { ActivityCandidate } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

const ACTIONS_HEIGHT = 124;
const SHEET_HEIGHT_RATIO = 0.8;
const FIXED_CONTENT_HEIGHT = 298;
const MIN_RESULTS_HEIGHT = 92;

export function NewDialogSheet({
  onClose,
  onNewActivity,
  onNewGroup,
  onOpenConversation,
  visible,
}: {
  onClose: () => void;
  onNewActivity: () => void;
  onNewGroup: () => void;
  onOpenConversation: (conversationId: string) => void;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const api = useTastesApi();
  const [candidates, setCandidates] = useState<ActivityCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionsHidden, setActionsHidden] = useState(false);
  const actionsVisibility = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animateActions = (visible: boolean, duration = 280) => {
      actionsVisibility.stopAnimation();
      setActionsHidden(!visible);
      Animated.timing(actionsVisibility, {
        duration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        toValue: visible ? 1 : 0,
        useNativeDriver: false,
      }).start();
    };
    const showSubscription = Keyboard.addListener(
      'keyboardDidShow',
      (event) => {
        const resultsHeight = event.endCoordinates.screenY * SHEET_HEIGHT_RATIO - FIXED_CONTENT_HEIGHT;
        animateActions(resultsHeight >= MIN_RESULTS_HEIGHT, 280);
      },
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event) => animateActions(true, event.duration || 280),
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [actionsVisibility]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    void api.listActivityCandidates()
      .then((result) => { if (active) setCandidates(result.data); })
      .catch((error) => { if (active) Alert.alert('Could not load friends', apiErrorMessage(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, visible]);

  async function openConversation(candidate: ActivityCandidate) {
    if (openingId) return;
    setOpeningId(candidate.userId);
    try {
      const result = await api.createConversation({ targetUserId: candidate.userId });
      onClose();
      onOpenConversation(result.data.id);
    } catch (error) {
      Alert.alert('Could not start dialog', apiErrorMessage(error));
    } finally {
      setOpeningId(null);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered = candidates.filter((candidate) => (
    !query
    || candidate.displayName.toLowerCase().includes(query)
    || candidate.username?.toLowerCase().includes(query)
  ));

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoider}>
        <Pressable onPress={onClose} style={styles.backdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.header}>
              <Text style={styles.title}>New Dialog</Text>
              <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <View style={styles.searchBox}><Text style={styles.searchGlyph}>⌕</Text><TextInput autoCapitalize="none" autoCorrect={false} blurOnSubmit={false} onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.placeholder} style={styles.searchInput} value={search} /></View>
            <Animated.View
              accessibilityElementsHidden={actionsHidden}
              importantForAccessibility={actionsHidden ? 'no-hide-descendants' : 'auto'}
              pointerEvents={actionsHidden ? 'none' : 'auto'}
              style={[
                styles.actions,
                {
                  height: actionsVisibility.interpolate({ inputRange: [0, 1], outputRange: [0, ACTIONS_HEIGHT] }),
                  opacity: actionsVisibility,
                  transform: [
                    { translateY: actionsVisibility.interpolate({ inputRange: [0, 1], outputRange: [-72, 0] }) },
                    { scale: actionsVisibility.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  ],
                },
              ]}
            >
              <Pressable onPress={() => { onClose(); onNewGroup(); }} style={[styles.action, styles.groupAction]}>
                <GroupIcon color={colors.text} /><Text style={styles.actionText}>New group</Text>
              </Pressable>
              <Pressable onPress={() => { onClose(); onNewActivity(); }} style={[styles.action, styles.activityAction]}>
                <BellIcon color="#FFFFFF" /><Text style={styles.actionText}>New activity</Text>
              </Pressable>
            </Animated.View>
            <Text style={styles.section}>COMMUNICATE OFTEN</Text>
            {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.userId}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="always"
                ListEmptyComponent={<Text style={styles.empty}>{query ? 'No matching contacts.' : 'Mutual followers will appear here.'}</Text>}
                renderItem={({ item }) => (
                  <Pressable disabled={openingId !== null} onPress={() => void openConversation(item)} style={({ pressed }) => [styles.person, pressed && styles.personPressed]}>
                    {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View>}
                    <View style={styles.copy}><Text style={styles.name}>{item.displayName}</Text><Text style={styles.handle}>{item.username ? `@${item.username}` : 'Mutual follower'}</Text></View>
                    {openingId === item.userId ? <ActivityIndicator color={colors.primary} /> : null}
                  </Pressable>
                )}
                style={styles.results}
              />
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function GroupIcon({ color }: { color: string }) {
  return <Svg fill="none" height={18} viewBox="0 0 18 18" width={18}><Circle cx={6.25} cy={6} r={2.4} stroke={color} strokeWidth={1.5} /><Circle cx={12.25} cy={6.75} r={1.8} stroke={color} strokeWidth={1.4} /><Path d="M1.8 14.5c.35-3 2-4.5 4.45-4.5s4.1 1.5 4.45 4.5H1.8ZM10.5 10.7c2.7-.7 4.75.7 5 3.15h-3.4" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} /></Svg>;
}

function BellIcon({ color }: { color: string }) {
  return <Svg fill="none" height={18} viewBox="0 0 18 18" width={18}><Path d="M4.3 12.2h9.4l-1.05-1.45V7.5A3.65 3.65 0 0 0 9 3.85 3.65 3.65 0 0 0 5.35 7.5v3.25L4.3 12.2Z" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} /><Path d="M7.4 14.1a1.8 1.8 0 0 0 3.2 0" stroke={color} strokeLinecap="round" strokeWidth={1.5} /></Svg>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    keyboardAvoider: { flex: 1 },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
    sheet: { height: '80%', paddingHorizontal: 16, borderTopWidth: 1, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas },
    header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: colors.text, fontSize: 20, fontWeight: '700' }, close: { width: 28, height: 28, borderWidth: 2, borderColor: colors.text, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.text, fontSize: 20, lineHeight: 21 },
    searchBox: { height: 40, paddingHorizontal: 11, borderRadius: 22, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised }, searchGlyph: { color: colors.textSecondary, marginRight: 8, fontSize: 21 }, searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
    actions: { overflow: 'hidden' },
    action: { height: 50, marginTop: 12, borderRadius: 25, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' }, groupAction: { borderWidth: 1, borderColor: colors.primary }, activityAction: { backgroundColor: colors.primary }, actionText: { color: colors.text, fontSize: 16 },
    section: { color: colors.textMuted, marginTop: 25, marginBottom: 10, fontSize: 12 }, loader: { marginTop: 35 }, empty: { color: colors.textMuted, marginTop: 35, textAlign: 'center' },
    results: { flex: 1 },
    person: { height: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }, personPressed: { opacity: 0.7 }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.skeleton }, avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, avatarInitial: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' }, copy: { flex: 1, marginLeft: 10 }, name: { color: colors.text, fontSize: 15, fontWeight: '600' }, handle: { color: colors.textSecondary, marginTop: 2, fontSize: 12 },
  });
}
