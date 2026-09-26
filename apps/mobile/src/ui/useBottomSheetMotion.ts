import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Keyboard, PanResponder } from 'react-native';

const DEFAULT_CLOSED_OFFSET = 900;
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 1;

export function useBottomSheetMotion({
  closedOffset = DEFAULT_CLOSED_OFFSET,
  onClose,
  visible,
}: {
  closedOffset?: number;
  onClose: () => void;
  visible: boolean;
}) {
  const translateY = useRef(new Animated.Value(closedOffset)).current;
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closingRef.current = false;
    translateY.stopAnimation();
    if (!visible) {
      translateY.setValue(closedOffset);
      return undefined;
    }

    translateY.setValue(closedOffset);
    const animation = Animated.spring(translateY, {
      damping: 22,
      mass: 0.9,
      stiffness: 240,
      toValue: 0,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [closedOffset, translateY, visible]);

  const springBack = useCallback(() => {
    Animated.spring(translateY, {
      damping: 18,
      stiffness: 220,
      toValue: 0,
      useNativeDriver: false,
    }).start();
  }, [translateY]);

  const closeThen = useCallback(
    (afterClose?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();
      translateY.stopAnimation();
      Animated.timing(translateY, {
        duration: 180,
        toValue: closedOffset,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          onCloseRef.current();
          afterClose?.();
        }
        closingRef.current = false;
      });
    },
    [closedOffset, translateY],
  );

  const close = useCallback(() => closeThen(), [closeThen]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => Keyboard.dismiss(),
        onPanResponderMove: (_, gesture) =>
          translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dy >= DISMISS_DISTANCE ||
            gesture.vy >= DISMISS_VELOCITY
          ) {
            close();
          } else {
            springBack();
          }
        },
        onPanResponderTerminate: springBack,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [close, springBack, translateY],
  );

  return {
    close,
    closeThen,
    panHandlers: panResponder.panHandlers,
    translateY,
  };
}
