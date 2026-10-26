import { describe, expect, it } from 'vitest';
import { isViewerFollowingProfile } from '../src/features/profile/profileRelationship';

describe('isViewerFollowingProfile', () => {
  it('uses the viewed profile followers to resolve the viewer relationship', () => {
    expect(
      isViewerFollowingProfile(
        [
          {
            userId: 'viewer-user',
            displayName: 'Viewer',
            username: 'viewer',
            photoUrl: null,
            following: false,
          },
        ],
        'viewer-user',
      ),
    ).toBe(true);
  });

  it('returns false when the viewer is not among the profile followers', () => {
    expect(isViewerFollowingProfile([], 'viewer-user')).toBe(false);
  });
});
