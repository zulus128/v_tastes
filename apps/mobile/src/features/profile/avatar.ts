import type { ImageSourcePropType } from 'react-native';
import avatarCameron from '../../../assets/discover/avatar-cameron.jpg';
import avatarKristin from '../../../assets/discover/avatar-kristin.png';
import avatarWade from '../../../assets/discover/avatar-wade.png';
import fallbackAvatar from '../../../assets/home/avatar.png';
import type { ProfileData } from './api';

const avatarAssets: Record<string, ImageSourcePropType> = {
  cameron: avatarCameron,
  kristin: avatarKristin,
  wade: avatarWade,
};

export function profileAvatarSource(profile: ProfileData | null): ImageSourcePropType {
  if (profile?.photoUrl) return { uri: profile.photoUrl };
  if (profile?.avatarKey && avatarAssets[profile.avatarKey]) return avatarAssets[profile.avatarKey];
  return fallbackAvatar;
}
