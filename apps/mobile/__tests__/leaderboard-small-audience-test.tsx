/// <reference types="jest" />
import { render, screen } from '@testing-library/react-native';
import type { LeaderboardEntry } from '@tastes/contracts';
import { PaginatedLeaderboardScreen } from '../src/features/leaderboard/PaginatedLeaderboardScreen';

let mockItems: LeaderboardEntry[] = [];
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/session/SessionProvider', () => ({
  useAuthenticatedUserId: () => 'current',
}));
jest.mock('../src/features/leaderboard/api', () => ({
  useLeaderboard: () => ({
    data: { pages: [{ items: mockItems }] },
    isPending: false,
  }),
}));
jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: { text: '#fff', textMuted: '#aaa', primary: '#f00' },
    isDark: true,
  }),
}));
jest.mock('../src/ui/components', () => ({
  PatternBackgroundLift: () => null,
}));
jest.mock('../src/features/profile/avatar', () => ({ UserAvatar: () => null }));

it.each([1, 2, 3])(
  'shows every participant when the audience has %i members',
  async (count) => {
    mockItems = Array.from({ length: count }, (_, index) => ({
      userId: `person-${index}`,
      displayName: `Reviewer ${index + 1}`,
      username: `reviewer${index + 1}`,
      photoUrl: null,
      xp: 100 - index,
      rank: index + 1,
    }));
    await render(
      <PaginatedLeaderboardScreen
        onAddFriends={jest.fn()}
        onBack={jest.fn()}
        onEditProfile={jest.fn()}
      />,
    );
    for (const item of mockItems)
      expect(screen.getByText(item.displayName)).toBeOnTheScreen();
  },
);
