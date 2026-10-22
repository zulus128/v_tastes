import type { ImageSourcePropType } from 'react-native';
import mediaOne from '../../assets/home/recommendation.jpg';
import mediaThree from '../../assets/home/dish-2.png';
import mediaTwo from '../../assets/home/dish-1.jpg';

export const visualAuditMediaIds = [
  'visual-audit-media-1',
  'visual-audit-media-2',
  'visual-audit-media-3',
] as const;

const visualAuditMedia: Record<string, ImageSourcePropType> = {
  [visualAuditMediaIds[0]]: mediaOne,
  [visualAuditMediaIds[1]]: mediaTwo,
  [visualAuditMediaIds[2]]: mediaThree,
};

export function imageSourceForUrl(url: string): ImageSourcePropType {
  return visualAuditMedia[url] ?? { uri: url };
}
