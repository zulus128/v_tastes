import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { ResponsiveModal as Modal } from './ResponsiveModal';
import { responsiveStyleSheet } from './responsive';

export interface SideSlideScreenHandle {
  close: (afterClose?: () => void) => void;
}

export function useSideSlideTransition({
  frameWidth,
  onRequestClose,
  visible,
}: {
  frameWidth: number;
  onRequestClose: () => void;
  visible: boolean;
}) {
  // A normalized value keeps the pane aligned to the live window width even
  // while a resize interrupts an opening or closing animation.
  const progress = useRef(new Animated.Value(1)).current;
  const closing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const translateX = useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [0, frameWidth] }),
    [frameWidth, progress],
  );

  const finishClose = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    progress.setValue(1);
    const callback = afterClose.current;
    afterClose.current = undefined;
    onRequestClose();
    callback?.();
  }, [onRequestClose, progress]);

  const close = useCallback((callback?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    afterClose.current = callback;
    // The native-driver completion callback is not guaranteed when iOS
    // interrupts a transition. Always remove the pane on a JS fallback too.
    closeTimer.current = setTimeout(finishClose, 300);
    Animated.timing(progress, {
      duration: 240,
      toValue: 1,
      useNativeDriver: true,
    }).start(finishClose);
  }, [finishClose, progress]);

  useLayoutEffect(() => {
    if (!visible) {
      closing.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      afterClose.current = undefined;
      progress.stopAnimation();
      progress.setValue(1);
      return undefined;
    }

    closing.current = false;
    progress.stopAnimation();
    progress.setValue(1);
    const animation = Animated.timing(progress, {
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
  }, [progress, visible]);

  return { close, translateX };
}

export const SideSlideScreen = forwardRef<SideSlideScreenHandle, PropsWithChildren<{ onRequestClose: () => void; visible: boolean }>>(function SideSlideScreen({
  children,
  onRequestClose,
  visible,
}, ref) {
  const { width: frameWidth } = useWindowDimensions();
  const { close, translateX } = useSideSlideTransition({ frameWidth, onRequestClose, visible });

  useImperativeHandle(ref, () => ({ close }), [close]);

  return (
    <Modal animationType="none" onRequestClose={() => close()} presentationStyle="overFullScreen" transparent visible={visible}>
      <Animated.View style={[styles.screen, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </Modal>
  );
});

const styles = responsiveStyleSheet({ screen: { flex: 1 } });
