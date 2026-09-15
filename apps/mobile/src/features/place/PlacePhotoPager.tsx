import { useRef } from 'react';
import { Image, ScrollView, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

export function PlacePhotoPager({ activeIndex, imageStyle, onChange, sources, width }: {
  activeIndex: number;
  imageStyle: StyleProp<ImageStyle>;
  onChange: (index: number) => void;
  sources: ImageSourcePropType[];
  width: number;
}) {
  const pager = useRef<ScrollView>(null);
  const index = Math.max(0, Math.min(activeIndex, sources.length - 1));
  const alignPage = () => {
    // Native content dimensions must be applied before the offset. A resize or
    // switching the parent tab can otherwise leave the old pixel offset behind.
    pager.current?.scrollTo({ animated: false, x: index * width, y: 0 });
    if (index !== activeIndex) onChange(index);
  };

  return (
    <ScrollView
      ref={pager}
      accessibilityLabel="Place photos"
      horizontal
      onContentSizeChange={alignPage}
      onLayout={alignPage}
      onMomentumScrollEnd={({ nativeEvent }) => {
        if (width <= 0 || Math.abs(nativeEvent.layoutMeasurement.width - width) > 1) return;
        onChange(Math.max(0, Math.min(sources.length - 1, Math.round(nativeEvent.contentOffset.x / width))));
      }}
      pagingEnabled
      showsHorizontalScrollIndicator={false}
    >
      {sources.map((source, photoIndex) => <Image key={photoIndex} source={source} style={[imageStyle, { width }]} />)}
    </ScrollView>
  );
}
