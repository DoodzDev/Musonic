/**
 * @file Button.tsx
 * @description Design v2 button. Four looks: `tinted` (grey fill, accent text,
 *   e.g. "Play"), `filled` (accent fill, dark text, primary action), `plain`
 *   (accent text only) and `icon` (round, icon only, 36-44 pt).
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import PressableScale from './PressableScale';
import Text from './Text';
import {colors, radii, spacing, sizes} from '../../theme';
import type {HapticKind} from '../../services/haptics';

type BaseProps = {
  onPress?: () => void;
  disabled?: boolean;
  haptic?: HapticKind;
  style?: StyleProp<ViewStyle>;
};

type LabelProps = BaseProps & {
  variant?: 'tinted' | 'filled' | 'plain';
  label: string;
  /** Optional icon drawn before the label; colour it like the label. */
  icon?: React.ReactNode;
  accessibilityLabel?: string;
};

type IconProps = BaseProps & {
  variant: 'icon';
  icon: React.ReactNode;
  /** Diameter: 36 (compact) to 44 (default, full touch target). */
  size?: 36 | 40 | 44;
  /** Icon-only buttons need a spoken name. */
  accessibilityLabel: string;
};

type Props = LabelProps | IconProps;

const LABEL_COLOR = {
  tinted: colors.accent,
  filled: colors.onAccent,
  plain: colors.accent,
} as const;

export default function Button(props: Props) {
  const {onPress, disabled, haptic, style} = props;

  if (props.variant === 'icon') {
    const size = props.size ?? sizes.touchTarget;
    return (
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        haptic={haptic}
        accessibilityLabel={props.accessibilityLabel}
        accessibilityState={{disabled}}
        hitSlop={(sizes.touchTarget - size) / 2}
        style={[
          styles.icon,
          {width: size, height: size, borderRadius: size / 2},
          disabled && styles.disabled,
          style,
        ]}>
        {props.icon}
      </PressableScale>
    );
  }

  const variant = props.variant ?? 'tinted';
  const color = LABEL_COLOR[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{disabled}}
      style={[styles.base, styles[variant], disabled && styles.disabled, style]}>
      {props.icon ? <View style={styles.iconSlot}>{props.icon}</View> : null}
      <Text variant="headline" style={{color}}>
        {props.label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: radii.button,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
  },
  tinted: {backgroundColor: colors.fill},
  filled: {backgroundColor: colors.accent},
  plain: {height: sizes.touchTarget, paddingHorizontal: spacing.s},
  icon: {
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {alignItems: 'center', justifyContent: 'center'},
  disabled: {opacity: 0.4},
});
