import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useStreamStore } from '../store/streamStore';
import {
  useLibraryStore,
  movieRecents,
  seriesRecents,
  FAVORITES_CATEGORY_ID,
  RECENTS_CATEGORY_ID,
  MOVIE_RECENTS_CATEGORY_ID,
  SERIES_FAVORITES_CATEGORY_ID,
  SERIES_RECENTS_CATEGORY_ID,
} from '../store/libraryStore';
import { useMovieCatalog, useSeriesCatalog, ALL_MOVIES_CATEGORY_ID, ALL_SERIES_CATEGORY_ID } from '../store/catalogStore';
import { RootStackParamList, Category, StreamType } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { restoreTVFocus, TV_LIST_EDGE } from '../utils/tvFocus';
import CategoryCard from '../components/CategoryCard';
import SearchBar from '../components/SearchBar';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Categories'>;
type Route = RouteProp<RootStackParamList, 'Categories'>;

const TYPE_LABELS: Record<StreamType, { title: string; icon: string }> = {
  live: { title: 'Live TV', icon: 'tv-outline' },
  vod: { title: 'Movies', icon: 'film-outline' },
  series: { title: 'Series', icon: 'tv-outline' },
};

export default function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { type } = route.params;

  const { categories, loadingCategories, error, loadCategories, clearError } = useStreamStore();
  const typeCategories = categories[type];
  const { title } = TYPE_LABELS[type];

  const favoriteCount = useLibraryStore((s) => s.favorites.length);
  const recentCount = useLibraryStore((s) => s.recents.length);
  const movieProgress = useLibraryStore((s) => s.movieProgress);
  const movieRecentCount = useMemo(() => movieRecents(movieProgress).length, [movieProgress]);
  const allMoviesCount = useMovieCatalog((s) => s.movies?.length ?? 0);
  const allMoviesLoading = useMovieCatalog((s) => s.loading);
  const seriesFavoriteCount = useLibraryStore((s) => s.seriesFavorites.length);
  const seriesHistory = useLibraryStore((s) => s.seriesHistory);
  const seriesRecentCount = useMemo(() => seriesRecents(seriesHistory).length, [seriesHistory]);
  const allSeriesCount = useSeriesCatalog((s) => s.movies?.length ?? 0);
  const allSeriesLoading = useSeriesCatalog((s) => s.loading);

  const [search, setSearch] = useState('');
  const searchRef = useRef<any>(null);
  // TV: the top row's "up" goes to the search bar (wired explicitly, like the login form).
  const [searchHandle, setSearchHandle] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.isTV) setSearchHandle(findNodeHandle(searchRef.current));
  }, []);
  const firstItemRef = useRef<any>(null);
  const itemRefs = useRef(new Map<string, any>());
  // TV: the first card takes the focus once, when the list first shows content. Android requests
  // focus each time a view mounts with hasTVPreferredFocus, so leaving it on the first card would
  // pull focus out of the search field — closing the keyboard — whenever the list changes (typing,
  // refresh, progressive loading). Returning from another screen is handled by restoreTVFocus.
  const initialFocusDone = useRef(false);
  useEffect(() => {
    if (typeCategories.length > 0) initialFocusDone.current = true;
  });
  // The category last opened. (Not the last focused one: while a screen is pushed, Android
  // briefly hands focus to the first card underneath, which would overwrite it.)
  const lastOpenedId = useRef<string | null>(null);

  // Built-in categories first: Favorites + Recently watched (Live TV), Recently watched + All movies
  // (Movies), Recently watched + Favorites + All series (Series).
  const builtIn = useMemo<Category[]>(() => (type === 'series' ? [
    {
      id: SERIES_RECENTS_CATEGORY_ID, name: 'Recently watched', icon: 'history', iconFamily: 'MaterialCommunityIcons',
      streamCount: seriesRecentCount, gradientColors: ['#0E4A52', '#06222A'],
    },
    {
      id: SERIES_FAVORITES_CATEGORY_ID, name: 'Favorites', icon: 'star', iconFamily: 'MaterialCommunityIcons',
      streamCount: seriesFavoriteCount, gradientColors: ['#6B4E0F', '#2A1E05'],
    },
    {
      id: ALL_SERIES_CATEGORY_ID, name: 'All series (FR, EN)', icon: 'television-classic', iconFamily: 'MaterialCommunityIcons',
      streamCount: allSeriesCount, gradientColors: ['#5B2A86', '#22103A'],
    },
  ] : type === 'live' ? [
    {
      id: FAVORITES_CATEGORY_ID, name: 'Favorites', icon: 'star', iconFamily: 'MaterialCommunityIcons',
      streamCount: favoriteCount, gradientColors: ['#6B4E0F', '#2A1E05'],
    },
    {
      id: RECENTS_CATEGORY_ID, name: 'Recently watched', icon: 'history', iconFamily: 'MaterialCommunityIcons',
      streamCount: recentCount, gradientColors: ['#0E4A52', '#06222A'],
    },
  ] : [
    {
      id: MOVIE_RECENTS_CATEGORY_ID, name: 'Recently watched', icon: 'history', iconFamily: 'MaterialCommunityIcons',
      streamCount: movieRecentCount, gradientColors: ['#0E4A52', '#06222A'],
    },
    {
      id: ALL_MOVIES_CATEGORY_ID, name: 'All movies', icon: 'movie-search', iconFamily: 'MaterialCommunityIcons',
      streamCount: allMoviesCount, gradientColors: ['#2E3192', '#11123D'],
    },
  ]), [type, favoriteCount, recentCount, movieRecentCount, allMoviesCount, seriesRecentCount, seriesFavoriteCount, allSeriesCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [...builtIn, ...typeCategories];
    return typeCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [builtIn, typeCategories, search]);

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
          nextFocusUp={index === 0 && searchHandle ? searchHandle : undefined}
          ref={(r: any) => {
            if (r) itemRefs.current.set(c.id, r); else itemRefs.current.delete(c.id);
            if (first) firstItemRef.current = r;
          }}
          category={c}
          busy={(c.id === ALL_MOVIES_CATEGORY_ID && allMoviesLoading) || (c.id === ALL_SERIES_CATEGORY_ID && allSeriesLoading)}
          onPress={() => handleCategoryPress(c)}
          hasTVPreferredFocus={first && !initialFocusDone.current}
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
    [filtered, handleCategoryPress, searchHandle, allMoviesLoading, allSeriesLoading],
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
        {/* Reloading while the list is shown (no pull-to-refresh spinner on TV) */}
        {loadingCategories && typeCategories.length > 0 && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* Search */}
      <SearchBar
        ref={searchRef}
        value={search}
        onChangeText={setSearch}
        placeholder="Search categories…"
        onSubmit={() => restoreTVFocus(() => firstItemRef.current)}
      />

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
        <View style={styles.listBox}>
          {/* TV: react-native-tvos wraps lists in an unstyled focus guide that takes the whole screen
             height, pushing the list's bottom off screen (focused cards ended up cut off at the
             bottom). This flex: 1 box bounds it to the space left under the header. */}
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // TV: keep the focused row clear of the screen edges (see TV_LIST_EDGE).
            fadingEdgeLength={TV_LIST_EDGE}
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
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listBox: { flex: 1 },
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
