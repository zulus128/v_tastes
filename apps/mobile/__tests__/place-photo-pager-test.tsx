import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { PlacePhotoPager } from '../src/features/place/PlacePhotoPager';

const sources = [{ uri: 'photo-one' }, { uri: 'photo-two' }, { uri: 'photo-three' }];

afterEach(() => jest.restoreAllMocks());

it('realigns the selected photo after native content adopts a new width', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const onChange = jest.fn();
  const props = { activeIndex: 1, imageStyle: { height: 300 }, onChange, sources };
  const result = await render(<PlacePhotoPager {...props} width={402} />);
  await result.rerender(<PlacePhotoPager {...props} width={667} />);
  await fireEvent(screen.getByLabelText('Place photos'), 'contentSizeChange', 2001, 300);
  expect(scrollTo).toHaveBeenLastCalledWith({ animated: false, x: 667, y: 0 });
  expect(onChange).not.toHaveBeenCalled();
});

it('ignores stale swipe completion after rotation and clamps a shortened gallery', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const onChange = jest.fn();
  const result = await render(<PlacePhotoPager activeIndex={2} imageStyle={{ height: 300 }} onChange={onChange} sources={sources} width={667} />);
  await fireEvent(screen.getByLabelText('Place photos'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 804 }, layoutMeasurement: { width: 402 } } });
  expect(onChange).not.toHaveBeenCalled();
  await result.rerender(<PlacePhotoPager activeIndex={2} imageStyle={{ height: 300 }} onChange={onChange} sources={sources.slice(0, 1)} width={667} />);
  await fireEvent(screen.getByLabelText('Place photos'), 'contentSizeChange', 667, 300);
  expect(scrollTo).toHaveBeenLastCalledWith({ animated: false, x: 0, y: 0 });
  expect(onChange).toHaveBeenLastCalledWith(0);
});
