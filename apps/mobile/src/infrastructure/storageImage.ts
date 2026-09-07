import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from './firebase';

const MAX_CACHED_URLS = 500;
const downloadUrlCache = new Map<string, Promise<string>>();

/** Reuses a Storage URL lookup across recycled list rows and screens. */
export function resolveStorageImageUrl(path: string): Promise<string> {
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPath) return Promise.reject({ code: 'storage/invalid-root-operation' });
  const cached = downloadUrlCache.get(normalizedPath);
  if (cached) return cached;

  if (downloadUrlCache.size >= MAX_CACHED_URLS) {
    const oldest = downloadUrlCache.keys().next().value;
    if (oldest) downloadUrlCache.delete(oldest);
  }
  const request = getDownloadURL(ref(storage, normalizedPath)).catch((error) => {
    downloadUrlCache.delete(normalizedPath);
    throw error;
  });
  downloadUrlCache.set(normalizedPath, request);
  return request;
}
