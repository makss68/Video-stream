import React, { useState } from 'react';
import { TouchableHighlight, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Category } from '../types';
import { colors, spacing, radius, typography } from '../theme';

interface Props {
  category: Category;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  /** TV: native view to focus on D-pad up. */
  nextFocusUp?: number;
  /** Show a spinner (content loading in the background). */
  busy?: boolean;
}

const CategoryCard = React.forwardRef<any, Props>(function CategoryCard(
  { category, onPress, hasTVPreferredFocus, nextFocusUp, busy },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableHighlight
      ref={ref}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      {...({ nextFocusUp } as any) /* TV prop missing from the TS types */}
      underlayColor="transparent"
      style={[styles.container, focused && styles.containerFocused]}
    >
      <LinearGradient
        colors={category.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name={category.icon as any} size={28} color={colors.white} />
        </View>
        <Text style={styles.name} numberOfLines={1}>{category.name}</Text>
        {category.streamCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{category.streamCount}</Text>
          </View>
        )}
        {busy && <ActivityIndicator size="small" color={colors.white} style={styles.busy} />}
        <View style={styles.decorCircle} />
      </LinearGradient>
    </TouchableHighlight>
  );
});

export default CategoryCard;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  containerFocused: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.05 }],
  },
  gradient: {
    padding: spacing.md,
    minHeight: 130,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 48, height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  name: { ...typography.h3, color: colors.white, marginTop: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    marginTop: spacing.xs,
  },
  badgeText: { ...typography.caption, color: colors.white, fontWeight: '600' },
  busy: { position: 'absolute', top: spacing.md, right: spacing.md },
  decorCircle: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: -30, right: -20,
  },
});
