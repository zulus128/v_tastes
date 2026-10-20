/// <reference types="jest" />

import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PaginatedCommentsScreen } from '../src/features/comments/CommentsScreen';
import { responsiveSize } from '../src/ui/responsive';

const colors = {
  background: '#080808',
  border: '#45474B',
  canvas: '#161616',
  onPrimary: '#FFFFFF',
  placeholder: '#777777',
  primary: '#B82F29',
  surface: '#161616',
  surfaceRaised: '#282828',
  text: '#FFFFFF',
  textMuted: '#777777',
  textSecondary: '#AAB2C5',
};

let mockCommentsRefetching = false;

function findRefreshControl(
  node: unknown,
): { props: { refreshing?: boolean } } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRefreshControl(child);
      if (match) return match;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const candidate = node as {
    type?: string;
    props?: { refreshing?: boolean };
    children?: unknown;
  };
  if (candidate.type === 'RCTRefreshControl' && candidate.props) {
    return { props: candidate.props };
  }
  return findRefreshControl(candidate.children);
}

jest.mock('@tastes/firebase-client', () => ({ apiErrorMessage: String }));
jest.mock('../src/infrastructure/observability', () => ({
  captureException: jest.fn(),
}));
jest.mock('../src/infrastructure/storageImage', () => ({
  resolveStorageImageUrl: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({ colors, isDark: true }),
}));
jest.mock('../src/ui/ResponsiveModal', () => ({
  ResponsiveModal: () => null,
}));
jest.mock('../src/session/SessionProvider', () => {
  const api = {
    getCommentContext: jest.fn(),
    getCommentReplies: jest.fn(),
    reactToReview: jest.fn(),
    reportComment: jest.fn(),
  };
  return {
    useAuthenticatedUserId: () => 'viewer',
    useTastesApi: () => api,
  };
});
jest.mock('../src/features/comments/api', () => {
  const query = {
    data: {
      pages: [
        {
          review: {
            id: 'review-1',
            authorId: 'author-0',
            authorDisplayName: 'Cameron Williamson',
            authorUsername: 'cameronw',
            authorPhotoUrl: null,
            venueId: 'venue-1',
            venueName: 'Gemini750 Restaurant',
            rating: 4.5,
            text: 'Main review text',
            tags: ['quick-bites'],
            dishReviews: Array.from({ length: 15 }, (_, index) => ({
              id: `dish-${index + 1}`,
              title: `Dish ${index + 1}`,
              rating: 4.5,
            })),
            status: 'published',
            commentCount: 2,
            reactionCount: 94,
            reacted: true,
            createdAt: '2026-10-14T12:00:00.000Z',
          },
          items: [
            {
              id: 'comment-1',
              reviewId: 'review-1',
              authorId: 'author-1',
              authorDisplayName: 'Wade Warren',
              authorPhotoUrl: null,
              parentCommentId: null,
              reactionCount: 1,
              replyCount: 0,
              reacted: false,
              text: 'First comment',
              createdAt: '2026-10-15T10:30:00.000Z',
            },
            {
              id: 'comment-2',
              reviewId: 'review-1',
              authorId: 'author-2',
              authorDisplayName: 'Jane Cooper',
              authorPhotoUrl: null,
              parentCommentId: null,
              reactionCount: 0,
              replyCount: 0,
              reacted: false,
              text: 'Second comment',
              createdAt: '2026-10-15T11:30:00.000Z',
            },
          ],
          nextCursor: null,
        },
      ],
    },
    dataUpdatedAt: 1,
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isPending: false,
    isRefetching: false,
    refetch: jest.fn(),
  };
  return {
    useAddComment: () => ({ isPending: false, mutateAsync: jest.fn() }),
    useComments: () => ({
      ...query,
      isRefetching: mockCommentsRefetching,
    }),
    useDeleteComment: () => ({ mutate: jest.fn() }),
    useReactToComment: () => ({ mutate: jest.fn() }),
  };
});

it('does not show pull-to-refresh during a background reaction refetch', async () => {
  mockCommentsRefetching = true;
  const view = await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  expect(findRefreshControl(view.toJSON())?.props.refreshing).not.toBe(true);
  mockCommentsRefetching = false;
});

it('rounds the comments panel instead of each comment row', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const firstRow = screen.getByText('Wade Warren').parent!.parent!.parent!;
  const secondRow = screen.getByText('Jane Cooper').parent!.parent!.parent!;
  const panelStart = firstRow.parent!;
  const panelEnd = secondRow.parent!;

  expect(StyleSheet.flatten(panelStart.props.style)).toMatchObject({
    overflow: 'hidden',
    borderTopLeftRadius: responsiveSize(48),
    borderTopRightRadius: responsiveSize(48),
  });
  expect(StyleSheet.flatten(panelEnd.props.style)).toMatchObject({
    overflow: 'hidden',
    borderBottomLeftRadius: responsiveSize(48),
    borderBottomRightRadius: responsiveSize(48),
  });
  [firstRow, secondRow].forEach((row) => {
    const style = StyleSheet.flatten(row.props.style);
    expect(style.borderRadius).toBeUndefined();
    expect(style.marginHorizontal).toBeUndefined();
    expect(style.marginBottom).toBeUndefined();
  });
});

it('keeps the comments top bar corners clearly visible', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const header = screen.getByText('Comments').parent!;
  expect(StyleSheet.flatten(header.props.style)).toMatchObject({
    overflow: 'hidden',
    borderBottomLeftRadius: responsiveSize(48),
    borderBottomRightRadius: responsiveSize(48),
  });
});

it('matches the full-width review panel and shows the dish count tag', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  expect(screen.getByText('Dishes (15)')).toBeTruthy();
  const mainReview = screen.getByText('Gemini750 Restaurant').parent!.parent!
    .parent!;
  const style = StyleSheet.flatten(mainReview.props.style);
  expect(style.marginHorizontal).toBeUndefined();
  expect(style.borderRadius).toBeUndefined();
  expect(style.borderWidth).toBeUndefined();
});
