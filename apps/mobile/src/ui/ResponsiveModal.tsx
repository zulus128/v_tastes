import { Modal as NativeModal, StyleSheet, View, type ModalProps } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from './ThemeProvider';

type ResponsiveModalProps = ModalProps & {
  /** Insets full-screen controls from notches, rounded corners and the home indicator. */
  insetContent?: boolean;
};

/** Fills the native presentation, including resized windows and iPad sheets. */
export function ResponsiveModal({ children, insetContent = false, transparent, ...props }: ResponsiveModalProps) {
  const { colors } = useAppTheme();
  return (
    <NativeModal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape']} transparent={transparent} {...props}>
      <SafeAreaProvider
        style={[
          styles.viewport,
          { backgroundColor: transparent ? 'transparent' : colors.background },
        ]}
      >
        {transparent
          ? <View style={styles.frame}>{children}</View>
          : insetContent
          ? <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.frame}>{children}</SafeAreaView>
          : <View style={styles.frame}>{children}</View>}
      </SafeAreaProvider>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  frame: { flex: 1, overflow: 'hidden' },
});
