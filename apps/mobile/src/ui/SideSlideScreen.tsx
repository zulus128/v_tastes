import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, type PropsWithChildren } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { ResponsiveModal as Modal } from './ResponsiveModal';
import { responsiveStyleSheet } from './responsive';

export interface SideSlideScreenHandle {
  close: (afterClose?: () => void) => void;
}

export const SideSlideScreen = forwardRef<SideSlideScreenHandle, PropsWithChildren<{ onRequestClose: () => void; visible: boolean }>>(function SideSlideScreen({
  children,
  onRequestClose,
  visible,
}, ref) {
  const { width: frameWidth } = useWindowDimensions();
  const frameWidthRef = useRef(frameWidth);
  const translateX = useRef(new Animated.Value(frameWidth)).current;
  const closing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterClose = useRef<(() => void) | undefined>(undefined);

  const finishClose = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    const callback = afterClose.current;
    afterClose.current = undefined;
    onRequestClose();
    callback?.();
  }, [onRequestClose]);

  const close = useCallback((callback?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    afterClose.current = callback;
    // The native-driver completion callback is not guaranteed when iOS
    // interrupts a transition. Always remove the modal on a JS fallback too.
    closeTimer.current = setTimeout(finishClose, 300);
    Animated.timing(translateX, {
      duration: 240,
      toValue: frameWidthRef.current,
      useNativeDriver: true,
    }).start(finishClose);
  }, [finishClose, translateX]);

  useImperativeHandle(ref, () => ({ close }), [close]);

  useLayoutEffect(() => {
    frameWidthRef.current = frameWidth;
    if (!visible) {
      closing.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      afterClose.current = undefined;
      translateX.setValue(frameWidth);
      return undefined;
    }
    return undefined;
  }, [frameWidth, translateX, visible]);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    closing.current = false;
    translateX.stopAnimation();
    translateX.setValue(frameWidthRef.current);
    const animation = Animated.timing(translateX, {
      duration: 280,
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
  }, [translateX, visible]);

  return (
    <Modal animationType="none" onRequestClose={() => close()} presentationStyle="overFullScreen" transparent visible={visible}>
      <Animated.View style={[styles.screen, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </Modal>
  );
});

const styles = responsiveStyleSheet({ screen: { flex: 1 } });
