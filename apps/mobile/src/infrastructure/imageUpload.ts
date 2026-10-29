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
    // Review/profile paths may be overwritten by an edit or an idempotent
    // retry, so clients must be allowed to revalidate the object.
    cacheControl: 'private,max-age=0,must-revalidate',
    contentType: 'image/jpeg',
  });
  return path;
}
