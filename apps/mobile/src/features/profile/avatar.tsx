import type { StyleProp, ViewStyle } from 'react-native';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ProfileData } from './api';

export function ProfileAvatar({ profile, style }: {
  profile: ProfileData | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityLabel={profile?.photoUrl ? `${profile.displayName} profile photo` : 'Default profile avatar'} style={[styles.frame, style]}>
      {profile?.photoUrl ? (
        <Image resizeMode="cover" source={{ uri: profile.photoUrl }} style={StyleSheet.absoluteFill} />
      ) : (
        <Svg height="58%" viewBox="0 0 24 24" width="58%">
          <Circle cx="12" cy="8" fill="#B82F29" r="4" />
          <Path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" fill="#B82F29" />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#F3DAD7',
  },
});
