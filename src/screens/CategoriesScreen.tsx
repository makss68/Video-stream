import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useStreamStore } from '../store/streamStore';
import { RootStackParamList, Category, StreamType } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import CategoryCard from '../components/CategoryCard';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Categories'>;
type Route = RouteProp<RootStackParamList, 'Categories'>;

const TYPE_LABELS: Record<StreamType, { title: string; icon: string }> = {
  live: { title: 'Live TV', icon: 'tv-outline' },
  vod: { title: 'Movies & Series', icon: 'film-outline' },
};

export default function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { type } = route.params;

  const { categories, loadingCategories, error, loadCategories, clearError } = useStreamStore();
  const typeCategories = categories[type];
  const { title } = TYPE_LABELS[type];

  useEffect(() => {
    loadCategories(type);
  }, [type]);

  const handleCategoryPress = useCallback(
    (category: Category) => {
      navigation.navigate('Streams', {
        categoryId: category.id,
        categoryName: category.name,
        type,
      });
    },
    [navigation, type],
  );

  const handleRefresh = useCallback(() => {
    // Invalidate cache for this type and reload
    useStreamStore.setState((s) => ({ categories: { ...s.categories, [type]: [] } }));
    loadCategories(type);
  }, [type, loadCategories]);

  const renderItem = useCallback(
    ({ item, index }: { item: Category; index: number }) => {
      if (index % 2 !== 0) return null;
      const next = typeCategories[index + 1];
      return (
        <View style={styles.row}>
          <CategoryCard category={item} onPress={() => handleCategoryPress(item)} />
          {next ? (
            <CategoryCard category={next} onPress={() => handleCategoryPress(next)} />
          ) : (
            <View style={{ flex: 1, margin: spacing.xs }} />
          )}
        </View>
      );
    },
    [typeCategories, handleCategoryPress],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title}</Text>
          {typeCategories.length > 0 && (
            <Text style={styles.headerSub}>{typeCategories.length} categories</Text>
          )}
        </View>
      </View>

      {/* Content */}
      {loadingCategories && typeCategories.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading categories…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { clearError(); handleRefresh(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={typeCategories}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loadingCategories}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.text },
  headerSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' },
});
