import type { ProfileConnection } from '@tastes/contracts';

export function isViewerFollowingProfile(
  followers: ProfileConnection[],
  viewerUserId: string,
) {
  return followers.some((follower) => follower.userId === viewerUserId);
}
