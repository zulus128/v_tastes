import { Modal as NativeModal, StyleSheet, View, type ModalProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppTheme } from './ThemeProvider';

/** Fills the native presentation, including resized windows and iPad sheets. */
export function ResponsiveModal({ children, transparent, ...props }: ModalProps) {
  const { colors } = useAppTheme();
  return (
    <NativeModal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} transparent={transparent} {...props}>
      <SafeAreaProvider
        style={[
          styles.viewport,
          { backgroundColor: transparent ? 'transparent' : colors.background },
        ]}
      >
        <View style={styles.frame}>{children}</View>
      </SafeAreaProvider>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  frame: { flex: 1, overflow: 'hidden' },
});
