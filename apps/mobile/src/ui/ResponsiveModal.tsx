import { Modal as NativeModal, StyleSheet, useWindowDimensions, View, type ModalProps } from 'react-native';
import { useAppTheme } from './ThemeProvider';

/** Keeps native React Native modals on the same proportional canvas as the app. */
export function ResponsiveModal({ children, transparent, ...props }: ModalProps) {
  const { colors } = useAppTheme();
  const { height, width } = useWindowDimensions();

  return (
    <NativeModal transparent={transparent} {...props}>
      <View
        style={[
          styles.viewport,
          { backgroundColor: transparent ? 'transparent' : colors.background },
        ]}
      >
        <View style={[styles.frame, { height, width }]}>{children}</View>
      </View>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { overflow: 'hidden' },
});
