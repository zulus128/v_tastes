import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  manipulateAsync: vi.fn(),
  storageRef: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: mocks.manipulateAsync,
  SaveFormat: { JPEG: 'jpeg' },
}));

vi.mock('firebase/storage', () => ({
  ref: mocks.storageRef,
  uploadBytes: mocks.uploadBytes,
}));

vi.mock('../src/infrastructure/firebase', () => ({
  storage: { name: 'storage' },
}));

import { uploadJpegImageVariant } from '../src/infrastructure/imageUpload';

describe('image upload variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.manipulateAsync.mockResolvedValue({ uri: 'file:///optimized.jpg' });
    mocks.storageRef.mockReturnValue({ fullPath: 'images/thumbnail.jpg' });
    mocks.uploadBytes.mockResolvedValue({});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['jpeg']) }),
    );
  });

  it('resizes, compresses, and uploads an immutable JPEG variant', async () => {
    const actions = [{ resize: { width: 360, height: 360 } }];

    await expect(
      uploadJpegImageVariant({
        actions,
        compress: 0.68,
        path: 'images/thumbnail.jpg',
        uri: 'file:///original.jpg',
      }),
    ).resolves.toBe('images/thumbnail.jpg');

    expect(mocks.manipulateAsync).toHaveBeenCalledWith(
      'file:///original.jpg',
      actions,
      { compress: 0.68, format: 'jpeg' },
    );
    expect(mocks.uploadBytes).toHaveBeenCalledWith(
      { fullPath: 'images/thumbnail.jpg' },
      expect.any(Blob),
      {
        cacheControl: 'public,max-age=31536000,immutable',
        contentType: 'image/jpeg',
      },
    );
  });
});
