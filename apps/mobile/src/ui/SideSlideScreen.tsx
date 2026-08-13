import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, Dimensions, Modal, StyleSheet } from 'react-native';

export interface SideSlideScreenHandle {
  close: (afterClose?: () => void) => void;
}

export const SideSlideScreen = forwardRef<SideSlideScreenHandle, PropsWithChildren<{ onRequestClose: () => void; visible: boolean }>>(function SideSlideScreen({
  children,
  onRequestClose,
  visible,
}, ref) {
  const translateX = useRef(new Animated.Value(Dimensions.get('window').width)).current;

  const close = useCallback((afterClose?: () => void) => {
    Animated.timing(translateX, {
      duration: 240,
      toValue: Dimensions.get('window').width,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      onRequestClose();
      afterClose?.();
    });
  }, [onRequestClose, translateX]);

  useImperativeHandle(ref, () => ({ close }), [close]);

  useLayoutEffect(() => {
    if (!visible) return;
    translateX.setValue(Dimensions.get('window').width);
    const animation = Animated.timing(translateX, {
      duration: 280,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [translateX, visible]);

  return (
    <Modal animationType="none" onRequestClose={() => close()} presentationStyle="overFullScreen" transparent visible={visible}>
      <Animated.View style={[styles.screen, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </Modal>
  );
});

const styles = StyleSheet.create({ screen: { flex: 1 } });
