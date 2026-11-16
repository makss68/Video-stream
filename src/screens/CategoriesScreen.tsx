import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useStreamStore } from '../store/streamStore';
import { RootStackParamList, Category, StreamType } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { restoreTVFocus } from '../utils/tvFocus';
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

  const [search, setSearch] = useState('');
  const firstItemRef = useRef<any>(null);
  const itemRefs = useRef(new Map<string, any>());
  // The category last opened. (Not the last focused one: while a screen is pushed, Android
  // briefly hands focus to the first card underneath, which would overwrite it.)
  const lastOpenedId = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return typeCategories;
    return typeCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [typeCategories, search]);

  // TV: on open, and again on return from a category (react-native-screens fires onAppear →
  // transitionEnd), focus the category last opened, else the first one.
  useEffect(() => {
    if (!Platform.isTV) return;
    let cancel = () => {};
    const unsub = navigation.addListener('transitionEnd' as any, (e: any) => {
      if (e.data.closing) return;
      cancel();
      cancel = restoreTVFocus(
        () => (lastOpenedId.current && itemRefs.current.get(lastOpenedId.current)) || firstItemRef.current,
      );
    });
    return () => { cancel(); unsub(); };
  }, [navigation]);

  useEffect(() => {
    loadCategories(type);
  }, [type]);

  const handleCategoryPress = useCallback(
    (category: Category) => {
      lastOpenedId.current = category.id;
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
      const next = filtered[index + 1];
      const card = (c: Category, first: boolean) => (
        <CategoryCard
          ref={(r: any) => {
            if (r) itemRefs.current.set(c.id, r); else itemRefs.current.delete(c.id);
            if (first) firstItemRef.current = r;
          }}
          category={c}
          onPress={() => handleCategoryPress(c)}
          hasTVPreferredFocus={first}
        />
      );
      return (
        <View style={styles.row}>
          {card(item, index === 0)}
          {next ? (
            card(next, false)
          ) : (
            <View style={{ flex: 1, margin: spacing.xs }} />
          )}
        </View>
      );
    },
    [filtered, handleCategoryPress],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        {!Platform.isTV && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{title}</Text>
          {typeCategories.length > 0 && (
            <Text style={styles.headerSub}>{search.trim() ? `${filtered.length} of ${typeCategories.length}` : typeCategories.length} categories</Text>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories…"
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
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
          <Pressable onPress={() => { clearError(); handleRefresh(); }} hasTVPreferredFocus
            style={({ focused }: any) => [styles.retryBtn, focused && styles.retryBtnFocused]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No categories found</Text>
              <Text style={styles.emptySubtitle}>Try a different search term</Text>
            </View>
          }
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder,
    height: 44,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, ...typography.body, color: colors.text },
  empty: { marginTop: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.textSecondary },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  retryBtnFocused: { borderWidth: 2, borderColor: colors.white },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' },
});
