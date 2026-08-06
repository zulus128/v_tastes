import type { ImageSourcePropType } from 'react-native';
import fallbackAvatar from '../../../assets/home/avatar.png';
import type { ProfileData } from './api';

export function profileAvatarSource(profile: ProfileData | null): ImageSourcePropType {
  if (profile?.photoUrl) return { uri: profile.photoUrl };
  return fallbackAvatar;
}
