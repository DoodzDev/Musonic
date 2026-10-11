/**
 * @file Text.tsx
 * @description Design v2 text. Every new component renders text through this
 *   instead of the raw React Native `Text`, so sizes, weights and tracking all
 *   come from the type scale. Follows the OS font size up to MAX_FONT_SCALE.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Text as RNText, type TextProps} from 'react-native';
import {colors, typography, MAX_FONT_SCALE, type ColorToken, type TextVariant} from '../../theme';

type Props = TextProps & {
  variant?: TextVariant;
  color?: ColorToken;
};

export default function Text({
  variant = 'body',
  color = 'textPrimary',
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  style,
  ...rest
}: Props) {
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], {color: colors[color]}, style]}
    />
  );
}
