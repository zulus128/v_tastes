import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  Pressable,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../ui/ThemeProvider';

export function ReviewTextPreview({
  text,
  style,
  textStyle,
  fadeStyle,
  moreStyle,
  onOpenFullReview,
}: {
  text: string;
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  fadeStyle: StyleProp<ViewStyle>;
  moreStyle: StyleProp<TextStyle>;
  onOpenFullReview?: () => void;
}) {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setOverflow(false);
  }, [text]);
  return (
    <Pressable
      style={style}
      onPress={() =>
        onOpenFullReview ? onOpenFullReview() : setExpanded((value) => !value)
      }
    >
      <Text
        testID="review-text-measurement"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        onTextLayout={(event) =>
          setOverflow(event.nativeEvent.lines.length > 2)
        }
        style={[
          textStyle,
          { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
        ]}
      >
        {text}
      </Text>
      <Text numberOfLines={expanded ? undefined : 2} style={textStyle}>
        {text}
      </Text>
      {!expanded && overflow ? (
        <LinearGradient
          colors={['rgba(22,22,22,0)', colors.surface, colors.surface]}
          locations={[0, 0.37, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={fadeStyle}
        >
          <Text style={moreStyle}>See more</Text>
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}
