import { fireEvent, render, screen } from '@testing-library/react-native';
import { DishListContent } from '../src/features/reviews/DishListContent';

jest.mock('../src/ui/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: {
      text: '#fff',
      textSecondary: '#aaa',
      primary: '#b82f29',
      surfaceRaised: '#222',
      border: '#444',
    },
  }),
}));

const visits = [
  {
    id: 'first',
    createdAt: '2026-10-01T12:00:00Z',
    rating: 4.5,
    text: 'First visit',
  },
  {
    id: 'latest',
    createdAt: '2026-10-21T12:00:00Z',
    rating: 4,
    text: 'Returned',
  },
];
const dishes = [
  {
    id: 'tuna',
    title: 'Tuna Tartare',
    rating: 4,
    firstVisitId: 'first',
    latestVisitId: 'latest',
    history: [
      { visitId: 'first', createdAt: visits[0].createdAt, rating: 4.5 },
      { visitId: 'latest', createdAt: visits[1].createdAt, rating: 4 },
    ],
  },
  {
    id: 'dessert',
    title: 'Dessert',
    rating: 5,
    firstVisitId: 'latest',
    latestVisitId: 'latest',
    history: [{ visitId: 'latest', createdAt: visits[1].createdAt, rating: 5 }],
  },
];

it('shows each dish once and distinguishes new and re-rated dishes', async () => {
  await render(
    <DishListContent dishes={dishes} visits={visits} onOpen={jest.fn()} />,
  );
  expect(screen.getAllByText('Tuna Tartare')).toHaveLength(1);
  expect(screen.getByText('New dish')).toBeTruthy();
  expect(screen.getByText('Re-rated')).toBeTruthy();
  expect(screen.getByText('Highest rated ↕')).toBeTruthy();
});

it('shows historical scores without latest-visit tags when a visit is selected', async () => {
  await render(
    <DishListContent dishes={dishes} visits={visits} onOpen={jest.fn()} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Oct 1, 2026' }));
  expect(screen.getByText('★ 4.5')).toBeTruthy();
  expect(screen.queryByText('Dessert')).toBeNull();
  expect(screen.queryByText('Re-rated')).toBeNull();
  expect(screen.queryByText('New dish')).toBeNull();
});

it('filters by dish name and opens the original dish index', async () => {
  const open = jest.fn();
  await render(
    <DishListContent dishes={dishes} visits={visits} onOpen={open} />,
  );
  await fireEvent.changeText(screen.getByLabelText('Search dishes'), ' tuna ');
  expect(screen.queryByText('Dessert')).toBeNull();
  await fireEvent.press(
    screen.getByLabelText('Open dish review for Tuna Tartare'),
  );
  expect(open).toHaveBeenCalledWith(0);
});
