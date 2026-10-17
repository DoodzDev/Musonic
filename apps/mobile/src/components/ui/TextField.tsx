/**
 * @file TextField.tsx
 * @description Labelled text input of the Design v2 forms (server setup,
 *   Musonic API settings): footnote label above a filled, rounded field.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {forwardRef} from 'react';
import {StyleSheet, TextInput, View, type TextInputProps} from 'react-native';
import Text from './Text';
import {colors, radii, typography} from '../../theme';

const TextField = forwardRef<TextInput, TextInputProps & {label: string}>(function TextField({label, ...input}, ref) {
  return (
    <View style={styles.field}>
      <Text variant="footnote" color="textSecondary" style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        {...input}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        style={styles.input}
      />
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  field: {gap: 6},
  label: {paddingHorizontal: 4},
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radii.tile,
    backgroundColor: colors.fill,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    letterSpacing: typography.body.letterSpacing,
  },
});
