/**
 * @file SearchField.tsx
 * @description Design v2 search field: magnifier, text input and a clear
 *   button shown once something is typed. 40 pt high, 12 pt corners.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {forwardRef} from 'react';
import {Pressable, StyleSheet, TextInput, View, type TextInputProps} from 'react-native';
import SearchIcon from '../icons/SearchIcon';
import CloseIcon from '../icons/CloseIcon';
import {colors, radii, spacing, typography, MAX_FONT_SCALE} from '../../theme';
import {useT} from '../../i18n';

type Props = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
};

const SearchField = forwardRef<TextInput, Props>(function SearchField(
  {value, onChangeText, ...rest},
  ref,
) {
  const t = useT();
  return (
    <View style={styles.field}>
      <SearchIcon size={18} color={colors.textSecondary} />
      <TextInput
        ref={ref}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        returnKeyType="search"
        style={styles.input}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={t.ui.clearSearch}
          hitSlop={12}
          style={styles.clear}>
          <CloseIcon size={10} color={colors.surface1} />
        </Pressable>
      )}
    </View>
  );
});

export default SearchField;

const styles = StyleSheet.create({
  field: {
    height: 40,
    borderRadius: radii.tile,
    backgroundColor: colors.fill,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  input: {
    flex: 1,
    height: 40,
    padding: 0,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    letterSpacing: typography.body.letterSpacing,
  },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
