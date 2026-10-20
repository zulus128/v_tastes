/// <reference types="jest" />

import { render, screen, userEvent } from '@testing-library/react-native';
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
    borderTopWidth: responsiveSize(1),
    borderLeftWidth: responsiveSize(1),
    borderRightWidth: responsiveSize(1),
    borderTopColor: colors.border,
    borderLeftColor: colors.border,
    borderRightColor: colors.border,
    borderTopLeftRadius: responsiveSize(24),
    borderTopRightRadius: responsiveSize(24),
    backgroundColor: 'transparent',
  });
  expect(StyleSheet.flatten(panelEnd.props.style)).toMatchObject({
    overflow: 'hidden',
    borderBottomWidth: responsiveSize(1),
    borderLeftWidth: responsiveSize(1),
    borderRightWidth: responsiveSize(1),
    borderBottomColor: colors.border,
    borderBottomLeftRadius: responsiveSize(24),
    borderBottomRightRadius: responsiveSize(24),
    backgroundColor: 'transparent',
  });
  [firstRow, secondRow].forEach((row) => {
    const style = StyleSheet.flatten(row.props.style);
    expect(style.borderRadius).toBeUndefined();
    expect(style.marginHorizontal).toBeUndefined();
    expect(style.marginBottom).toBeUndefined();
  });
});

it('shows the Figma top bar radius over the raised review backdrop', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const header = screen.getByText('Comments').parent!;
  expect(StyleSheet.flatten(header.props.style)).toMatchObject({
    overflow: 'hidden',
    borderBottomLeftRadius: responsiveSize(24),
    borderBottomRightRadius: responsiveSize(24),
  });
  expect(StyleSheet.flatten(header.parent!.props.style)).toMatchObject({
    backgroundColor: colors.surfaceRaised,
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

it('keeps the reply target and input in one gapless composer field', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const user = userEvent.setup();
  await user.press(screen.getByLabelText('Reply to Wade Warren'));

  const banner = screen.getByText('Replying to Wade Warren').parent!;
  const field = banner.parent!;
  const input = screen.getByPlaceholderText('Reply to Wade Warren');

  expect(StyleSheet.flatten(field.props.style)).toMatchObject({
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  });
  expect(input.parent).toBe(field);
  expect(StyleSheet.flatten(banner.props.style).marginBottom).toBeUndefined();
  expect(StyleSheet.flatten(input.props.style).backgroundColor).toBe(
    'transparent',
  );
});

it('matches the Figma composer dimensions and colors', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const input = screen.getByPlaceholderText('Add comment');
  const field = input.parent!;
  const composer = field.parent!;
  const send = screen.getByLabelText('Send comment');

  expect(input.props.placeholderTextColor).toBe('rgba(217,221,229,0.4)');
  expect(StyleSheet.flatten(composer.props.style)).toMatchObject({
    paddingHorizontal: responsiveSize(16),
    paddingTop: responsiveSize(8),
    gap: responsiveSize(12),
    backgroundColor: colors.background,
  });
  expect(StyleSheet.flatten(field.props.style)).toMatchObject({
    backgroundColor: 'rgba(255,255,255,0.08)',
  });
  expect(StyleSheet.flatten(input.props.style)).toMatchObject({
    height: responsiveSize(40),
    paddingLeft: responsiveSize(14),
    paddingRight: responsiveSize(4),
    paddingVertical: 0,
    fontSize: responsiveSize(16),
    lineHeight: responsiveSize(22),
    letterSpacing: responsiveSize(-0.41),
  });
  expect(StyleSheet.flatten(send.props.style)).toMatchObject({
    width: responsiveSize(40),
    height: responsiveSize(40),
    borderColor: colors.primary,
    borderRadius: responsiveSize(36),
    backgroundColor: colors.primary,
  });
});
