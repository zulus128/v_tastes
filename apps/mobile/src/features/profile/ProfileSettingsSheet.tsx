import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

export function ProfileSettingsSheet({
  onClose,
  onLeaderboard,
  onLogout,
  onRecap,
  visible,
}: {
  onClose: () => void;
  onLeaderboard: () => void;
  onLogout: () => Promise<void>;
  onRecap: () => void;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loggingOut, setLoggingOut] = useState(false);

  function confirmLogout() {
    if (loggingOut) return;
    Alert.alert(
      'Sign out?',
      'You will need to sign in with your phone number again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setLoggingOut(true);
            void onLogout()
              .catch(() => Alert.alert('Could not sign out', 'Please try again.'))
              .finally(() => setLoggingOut(false));
          },
        },
      ],
    );
  }

  function open(action: () => void) {
    onClose();
    action();
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Close settings" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={() => undefined}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.group}>
            <Pressable onPress={() => open(onLeaderboard)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.rowText}>Leaderboard</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable onPress={() => open(onRecap)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.rowText}>Monthly recap</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={loggingOut}
            onPress={confirmLogout}
            style={({ pressed }) => [styles.logout, pressed && styles.pressed, loggingOut && styles.disabled]}
          >
            {loggingOut ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.logoutText}>Sign out</Text>}
          </Pressable>
          <Text style={styles.logoutHint}>Your reviews and profile will stay in Tastes.</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' },
    sheet: { paddingHorizontal: 16, borderTopWidth: 1, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas },
    handle: { width: 36, height: 4, marginTop: 10, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
    header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    close: { width: 30, height: 30, borderWidth: 1.5, borderColor: colors.text, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: colors.text, fontSize: 21, lineHeight: 22 },
    group: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
    row: { height: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center' },
    rowText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
    chevron: { color: colors.textMuted, fontSize: 28, lineHeight: 30 },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 17, backgroundColor: colors.border },
    logout: { height: 52, marginTop: 22, borderWidth: 1, borderColor: colors.danger, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    logoutText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
    logoutHint: { marginTop: 9, color: colors.textMuted, fontSize: 12, textAlign: 'center' },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.55 },
  });
}
