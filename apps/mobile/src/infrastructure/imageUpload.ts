import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

type ImageActions = Parameters<typeof manipulateAsync>[1];

export async function uploadJpegImageVariant({
  actions,
  compress,
  path,
  uri,
}: {
  actions: ImageActions;
  compress: number;
  path: string;
  uri: string;
}) {
  const optimized = await manipulateAsync(uri, actions, {
    compress,
    format: SaveFormat.JPEG,
  });
  const response = await fetch(optimized.uri);
  const blob = await response.blob();
  await uploadBytes(storageRef(storage, path), blob, {
    cacheControl: 'public,max-age=31536000,immutable',
    contentType: 'image/jpeg',
  });
  return path;
}
