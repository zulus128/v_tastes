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
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closingRef.current = false;
    translateY.stopAnimation();
    backdropOpacity.stopAnimation();
    if (!visible) {
      translateY.setValue(closedOffset);
      backdropOpacity.setValue(0);
      return undefined;
    }

    translateY.setValue(closedOffset);
    backdropOpacity.setValue(0);
    const animation = Animated.parallel([
      Animated.spring(translateY, {
        damping: 22,
        mass: 0.9,
        stiffness: 240,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 100,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [backdropOpacity, closedOffset, translateY, visible]);

  const springBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        damping: 18,
        stiffness: 220,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: 100,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, translateY]);

  const closeThen = useCallback(
    (afterClose?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      Keyboard.dismiss();
      translateY.stopAnimation();
      backdropOpacity.stopAnimation();
      Animated.parallel([
        Animated.timing(translateY, {
          duration: 180,
          toValue: closedOffset,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          duration: 80,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          onCloseRef.current();
          afterClose?.();
        }
        closingRef.current = false;
      });
    },
    [backdropOpacity, closedOffset, translateY],
  );

  const close = useCallback(() => closeThen(), [closeThen]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => Keyboard.dismiss(),
        onPanResponderMove: (_, gesture) => {
          const dragDistance = Math.max(0, gesture.dy);
          translateY.setValue(dragDistance);
          backdropOpacity.setValue(Math.max(0, 1 - dragDistance / 180));
        },
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
    [backdropOpacity, close, springBack, translateY],
  );

  return {
    backdropOpacity,
    close,
    closeThen,
    panHandlers: panResponder.panHandlers,
    translateY,
  };
}
