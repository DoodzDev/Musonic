/**
 * @file haptics.test.ts
 * @description Unit tests of the haptic feedback switch: an action run for the
 *   car (Android Auto) never vibrates, the same action from the app still does.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
jest.mock('react-native-haptic-feedback', () => ({trigger: jest.fn()}));
jest.mock('../src/store/settingsStore', () => ({
  useSettingsStore: {getState: () => ({hapticsEnabled: true})},
}));

import {trigger} from 'react-native-haptic-feedback';
import {haptic, withoutHaptics} from '../src/services/haptics';

const triggerMock = trigger as jest.Mock;

beforeEach(() => triggerMock.mockClear());

it('vibrates outside withoutHaptics only', () => {
  const result = withoutHaptics(() => {
    haptic('selection');
    return 42;
  });
  expect(result).toBe(42);
  expect(triggerMock).not.toHaveBeenCalled();
  haptic('selection');
  expect(triggerMock).toHaveBeenCalledTimes(1);
});

it('vibrates again after an action that throws', () => {
  expect(() => withoutHaptics(() => { throw new Error('boom'); })).toThrow('boom');
  haptic('light');
  expect(triggerMock).toHaveBeenCalledTimes(1);
});
