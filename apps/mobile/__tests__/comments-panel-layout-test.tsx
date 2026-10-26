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
let mockCommentsEmpty = false;
const mockReactMutation = jest.fn();

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
      data: {
        pages: query.data.pages.map((page) => ({
          ...page,
          items: mockCommentsEmpty ? [] : page.items,
        })),
      },
      isRefetching: mockCommentsRefetching,
    }),
    useDeleteComment: () => ({ mutate: jest.fn() }),
    useReactToComment: () => ({ mutate: mockReactMutation }),
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

it('rounds only the top of the comments panel', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const firstRow = screen.getByText('Wade Warren').parent!.parent!.parent!;
  const secondRow = screen.getByText('Jane Cooper').parent!.parent!.parent!;
  const panelStart = firstRow.parent!;
  const lastThread = secondRow.parent!;

  expect(StyleSheet.flatten(panelStart.props.style)).toMatchObject({
    overflow: 'hidden',
    borderTopLeftRadius: responsiveSize(24),
    borderTopRightRadius: responsiveSize(24),
    backgroundColor: colors.surface,
  });
  [panelStart, lastThread].forEach((panelEdge) => {
    const style = StyleSheet.flatten(panelEdge.props.style);
    expect(style.borderLeftWidth).toBeUndefined();
    expect(style.borderRightWidth).toBeUndefined();
  });
  const topBorder = screen.getByTestId('comments-panel-top-border');
  const topBorderShape = screen.getByTestId('comments-panel-top-border-shape');
  expect(StyleSheet.flatten(topBorder.props.style)).toMatchObject({
    top: responsiveSize(0),
    height: responsiveSize(24),
    overflow: 'hidden',
  });
  expect(StyleSheet.flatten(topBorderShape.props.style)).toMatchObject({
    height: responsiveSize(48),
    borderWidth: responsiveSize(1),
    borderColor: colors.textMuted,
    borderRadius: responsiveSize(24),
    top: responsiveSize(0),
  });
  expect(screen.queryByTestId('comments-panel-bottom-border')).toBeNull();
  expect(screen.queryByTestId('comments-panel-bottom-border-shape')).toBeNull();
  const commentsList = screen.getByTestId('comments-list');
  expect(StyleSheet.flatten(commentsList.props.style)).toMatchObject({
    backgroundColor: colors.canvas,
  });
  expect(
    StyleSheet.flatten(commentsList.props.contentContainerStyle),
  ).toMatchObject({ flexGrow: 1, paddingBottom: 0 });
  expect(
    StyleSheet.flatten(commentsList.props.ListFooterComponentStyle),
  ).toMatchObject({
    flexGrow: 1,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.canvas,
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
  const input = screen.getByPlaceholderText('Add comment');

  expect(StyleSheet.flatten(field.props.style)).toMatchObject({
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  });
  expect(input.parent).toBe(field);
  expect(StyleSheet.flatten(banner.props.style).marginBottom).toBeUndefined();
  expect(StyleSheet.flatten(input.props.style).backgroundColor).toBe(
    'transparent',
  );
  expect(input.props.accessibilityLabel).toBe('Reply to Wade Warren');

  await user.press(screen.getByLabelText('Cancel reply'));
  expect(screen.queryByText('Replying to Wade Warren')).toBeNull();
  expect(
    screen.getByPlaceholderText('Add comment').props.accessibilityLabel,
  ).toBe('Add comment');
});

it('matches the Figma composer dimensions and colors', async () => {
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  const input = screen.getByPlaceholderText('Add comment');
  const field = input.parent!;
  const composer = field.parent!;
  const send = screen.getByLabelText('Send comment');

  expect(input.props.placeholderTextColor).toBe(colors.placeholder);
  expect(StyleSheet.flatten(composer.props.style)).toMatchObject({
    paddingHorizontal: responsiveSize(16),
    paddingTop: responsiveSize(8),
    gap: responsiveSize(12),
    backgroundColor: colors.surface,
  });
  expect(StyleSheet.flatten(field.props.style)).toMatchObject({
    backgroundColor: colors.surfaceRaised,
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

it('uses a black comments area when there are no comments', async () => {
  mockCommentsEmpty = true;
  try {
    await render(
      <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
    );

    expect(screen.getByText('No comments yet. Be the first.')).toBeTruthy();
    expect(
      StyleSheet.flatten(
        screen.getByTestId('comments-list').props.contentContainerStyle,
      ),
    ).toMatchObject({ backgroundColor: colors.background });
  } finally {
    mockCommentsEmpty = false;
  }
});

it('updates a comment reaction immediately without waiting for the backend', async () => {
  mockReactMutation.mockReset();
  const user = userEvent.setup();
  await render(
    <PaginatedCommentsScreen onBack={jest.fn()} reviewId="review-1" />,
  );

  await user.press(screen.getByLabelText('Like comment by Wade Warren'));

  expect(
    screen.getByTestId('comment-reaction-count-comment-1').props.children,
  ).toBe(2);
  expect(mockReactMutation).toHaveBeenCalledTimes(1);
});
