import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, TextInput, Pressable, TouchableHighlight, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius, typography } from '../theme';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  /** Called when the keyboard's search/enter key is pressed. */
  onSubmit?: () => void;
  /** TV: take the initial focus on this screen. */
  hasTVPreferredFocus?: boolean;
  /** Show a spinner while results are being computed or loaded. */
  busy?: boolean;
}

/**
 * Search field reachable with a TV remote. On Android TV a bare TextInput can't take
 * D-pad focus, so on TV it sits in a focusable wrapper: arrows land on the wrapper,
 * OK opens the keyboard. The forwarded ref is the wrapper (for nextFocus wiring).
 */
const SearchBar = React.forwardRef<any, Props>(function SearchBar(
  { value, onChangeText, placeholder, onSubmit, hasTVPreferredFocus, busy },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const wrapperRef = useRef<any>(null);
  const [focused, setFocused] = useState(false);
  useImperativeHandle(ref, () => wrapperRef.current);
  // Initial focus only: a later re-request would take focus from the text field and close the keyboard.
  const [preferFocus, setPreferFocus] = useState(!!hasTVPreferredFocus);
  useEffect(() => { if (preferFocus) setPreferFocus(false); }, []);

  const input = (
    <TextInput
      ref={inputRef}
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      clearButtonMode="while-editing"
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      onSubmitEditing={onSubmit}
      onFocus={Platform.isTV ? undefined : () => setFocused(true)}
      onBlur={Platform.isTV ? undefined : () => setFocused(false)}
    />
  );

  if (Platform.isTV) {
    return (
      <TouchableHighlight
        ref={wrapperRef}
        onPress={() => inputRef.current?.focus()}
        hasTVPreferredFocus={preferFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        underlayColor="transparent"
        activeOpacity={1}
        style={[styles.container, focused && styles.containerFocused]}
      >
        <View style={styles.row}>
          <Ionicons name="search-outline" size={16} color={focused ? colors.text : colors.textMuted} style={styles.icon} />
          {input}
          {busy && <ActivityIndicator size="small" color={colors.primary} style={styles.busy} />}
        </View>
      </TouchableHighlight>
    );
  }

  return (
    <View ref={wrapperRef} style={[styles.container, focused && styles.containerFocused]}>
      <View style={styles.row}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.icon} />
        {input}
        {busy && <ActivityIndicator size="small" color={colors.primary} style={styles.busy} />}
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default SearchBar;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    height: 44,
  },
  containerFocused: {
    borderColor: colors.white,
    borderWidth: 2,
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  icon: { marginRight: spacing.sm },
  busy: { marginHorizontal: spacing.xs },
  input: { flex: 1, ...typography.body, color: colors.text },
});
