import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Animated,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useStreamStore } from '../store/streamStore';
import { useAuthStore } from '../store/authStore';
import {
  useLibraryStore,
  movieRecents,
  seriesRecents,
  resumePosition,
  upNext,
  FAVORITES_CATEGORY_ID,
  RECENTS_CATEGORY_ID,
  MOVIE_RECENTS_CATEGORY_ID,
  SERIES_FAVORITES_CATEGORY_ID,
  SERIES_RECENTS_CATEGORY_ID,
  RECENT_MIN_WATCH_SECONDS,
  MOVIE_RECENT_MIN_WATCH_SECONDS,
  SERIES_RECENT_MIN_WATCH_SECONDS,
} from '../store/libraryStore';
import {
  catalogStoreFor,
  searchCatalog,
  catalogToStream,
  ALL_MOVIES_CATEGORY_ID,
  ALL_SERIES_CATEGORY_ID,
} from '../store/catalogStore';
import { savedToStream, savedMovieToStream, savedSeriesToStream, streamToSavedSeries, episodeCode } from '../api/streams';
import { EpisodeProgress, MovieProgress, RootStackParamList, SeriesProgress, Stream } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { restoreTVFocus, TV_LIST_EDGE } from '../utils/tvFocus';
import StreamCard from '../components/StreamCard';
import SearchBar from '../components/SearchBar';
import { describeMedia } from '../utils/mediaInfo';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Streams'>;
type Route = RouteProp<RootStackParamList, 'Streams'>;

/**
 * Built-in lists stored on the device, or the full catalogue (All movies / All series), instead
 * of a provider category.
 */
type BuiltIn = 'favorites' | 'recents' | 'movieRecents' | 'seriesFavorites' | 'seriesRecents' | 'catalog' | null;

const BUILT_IN: Record<string, BuiltIn> = {
  [FAVORITES_CATEGORY_ID]: 'favorites',
  [RECENTS_CATEGORY_ID]: 'recents',
  [MOVIE_RECENTS_CATEGORY_ID]: 'movieRecents',
  [SERIES_FAVORITES_CATEGORY_ID]: 'seriesFavorites',
  [SERIES_RECENTS_CATEGORY_ID]: 'seriesRecents',
  [ALL_MOVIES_CATEGORY_ID]: 'catalog',
  [ALL_SERIES_CATEGORY_ID]: 'catalog',
};

const TOAST_MS = 1600;
/** All movies / series: results shown for a search (the full match count is displayed). */
const MAX_SEARCH_RESULTS = 200;
/** All movies / series: wait for a pause in typing before scanning the catalogue. */
const SEARCH_DEBOUNCE_MS = 250;

type ProgressInfo = { progress?: number; label?: string };

/** Bar fill and "x min left" for a movie with a saved position. */
function progressInfo(p: MovieProgress | undefined): ProgressInfo {
  const at = resumePosition(p);
  if (!p || !at || p.duration <= 0) return {};
  const left = Math.max(1, Math.round((p.duration - at) / 60));
  return { progress: at / p.duration, label: `${left} min left` };
}

/** A show already played: the episode to resume ("S02E03 · 12 min left") or the next one. */
function seriesProgressInfo(h: SeriesProgress | undefined, episodes: Record<string, EpisodeProgress>): ProgressInfo {
  if (!h) return {};
  const up = upNext(h, episodes);
  if (!up) return { label: `Watched up to ${episodeCode(h.last)}` };
  if (up.isNext) return { label: `Next: ${episodeCode(up.episode)}` };
  const p = episodes[up.episode.id];
  if (up.resumeAt && p && p.duration > 0) {
    const left = Math.max(1, Math.round((p.duration - up.resumeAt) / 60));
    return { progress: up.resumeAt / p.duration, label: `${episodeCode(up.episode)} · ${left} min left` };
  }
  return { label: `Continue: ${episodeCode(up.episode)}` };
}

export default function StreamsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { categoryId, categoryName, type } = route.params;
  const builtIn = BUILT_IN[categoryId] ?? null;

  const { streams, categories, loadingStreams, error, loadStreams, invalidateStreams, clearError } = useStreamStore();
  const favorites = useLibraryStore((s) => s.favorites);
  const recents = useLibraryStore((s) => s.recents);
  const movieProgress = useLibraryStore((s) => s.movieProgress);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const seriesFavorites = useLibraryStore((s) => s.seriesFavorites);
  const seriesHistory = useLibraryStore((s) => s.seriesHistory);
  const episodeProgress = useLibraryStore((s) => s.episodeProgress);
  const toggleSeriesFavorite = useLibraryStore((s) => s.toggleSeriesFavorite);
  const isSeries = type === 'series';
  // All movies or All series (the screen's type never changes, so the hook is always the same).
  const catalogKind = isSeries ? 'series' : 'vod';
  const catalog = catalogStoreFor(catalogKind)();
  const isCatalog = builtIn === 'catalog';
  const noun = isSeries ? 'series' : 'movie';
  // Saved items get playback URLs of the active account/server.
  const { url, username, password } = useAuthStore();

  const [search, setSearch] = useState('');
  // All movies: the catalogue scan runs on a debounced copy of the query.
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!isCatalog) { setQuery(search); return; }
    const t = setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, isCatalog]);

  const searchRef = useRef<any>(null);
  // TV: "up" from the first card goes to the search bar (wired explicitly, like the login form).
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
  /** Show last opened (series lists open a show's page instead of the player). */
  const lastOpenedId = useRef<string | null>(null);

  // TV: on open, and again on return from the player or a show (react-native-screens fires
  // onAppear → transitionEnd), focus the show last opened or the stream last played (set by the
  // player, also after zapping), else the first one — or, in All movies / series, the search bar
  // (searching is what it is for).
  useEffect(() => {
    if (!Platform.isTV) return;
    let cancel = () => {};
    const unsub = navigation.addListener('transitionEnd' as any, (e: any) => {
      if (e.data.closing) return;
      cancel();
      cancel = restoreTVFocus(() => {
        const { lastPlayedId } = useStreamStore.getState();
        return (lastOpenedId.current && itemRefs.current.get(lastOpenedId.current))
          || (lastPlayedId && itemRefs.current.get(lastPlayedId))
          || (isCatalog ? searchRef.current : firstItemRef.current);
      });
    });
    return () => { cancel(); unsub(); };
  }, [navigation, isCatalog]);

  useEffect(() => {
    if (!builtIn) loadStreams(type, categoryId);
    if (isCatalog) catalog.load();
  }, [type, categoryId, builtIn]);

  const cacheKey = `${type}:${categoryId}`;
  const movieRecentsSource = builtIn === 'movieRecents' ? movieProgress : null;
  const seriesRecentsSource = builtIn === 'seriesRecents' ? seriesHistory : null;
  const categoryStreams = useMemo<Stream[]>(() => {
    if (builtIn === 'favorites') return favorites.map(savedToStream);
    if (builtIn === 'recents') return recents.map(savedToStream);
    if (movieRecentsSource) return movieRecents(movieRecentsSource).map(savedMovieToStream);
    if (builtIn === 'seriesFavorites') return seriesFavorites.map(savedSeriesToStream);
    if (seriesRecentsSource) return seriesRecents(seriesRecentsSource).map(savedSeriesToStream);
    if (isCatalog) return [];
    return streams[cacheKey] ?? [];
    // url/username/password: rebuild saved items' URLs when the account or server changes.
  }, [builtIn, favorites, recents, movieRecentsSource, seriesFavorites, seriesRecentsSource, isCatalog, streams, cacheKey, url, username, password]);

  // All movies / series: search the catalogue (capped), everything else: filter the loaded list.
  const catalogResult = useMemo(
    () => (isCatalog && catalog.movies ? searchCatalog(catalog.movies, query, MAX_SEARCH_RESULTS) : null),
    [isCatalog, catalog.movies, query],
  );
  const filtered = useMemo(() => {
    if (catalogResult) return catalogResult.items.map((m) => catalogToStream(m, catalogKind));
    if (!query.trim()) return categoryStreams;
    const q = query.toLowerCase();
    return categoryStreams.filter((s) => s.name.toLowerCase().includes(q));
  }, [catalogResult, categoryStreams, query, url, username, password]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const seriesFavoriteIds = useMemo(() => new Set(seriesFavorites.map((f) => f.id)), [seriesFavorites]);

  // Category names, for the language badges of titles listed outside their category.
  const typeCategories = categories[type];
  const categoryNames = useMemo(() => {
    const names: Record<string, string> = { ...catalog.categoryNames };
    for (const c of typeCategories) names[c.id] = c.name;
    return names;
  }, [catalog.categoryNames, typeCategories]);

  // Short confirmation after a long press (the star alone is easy to miss on a TV).
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
    }, TOAST_MS);
  }, [toastOpacity]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const handleStreamPress = useCallback(
    (stream: Stream, index: number) => {
      if (stream.kind === 'series') {
        lastOpenedId.current = stream.id;
        navigation.navigate('Series', { series: streamToSavedSeries(stream) });
        return;
      }
      lastOpenedId.current = null;
      navigation.navigate('Player', { stream, streams: filtered, streamIndex: index });
    },
    [navigation, filtered],
  );

  // Favorites: live channels and shows.
  const handleLongPress = useCallback((stream: Stream, index: number) => {
    const show = stream.kind === 'series';
    if (!stream.isLive && !show) return;
    const added = show ? toggleSeriesFavorite(streamToSavedSeries(stream)) : toggleFavorite(stream);
    const name = show ? describeMedia(stream.name).title : stream.name;
    showToast(added ? `★  ${name} added to favorites` : `${name} removed from favorites`);
    // In Favorites the card disappears: keep TV focus on the neighbouring one.
    if (!added && (builtIn === 'favorites' || builtIn === 'seriesFavorites')) {
      const neighbor = filtered[index + 1] ?? filtered[index - 1];
      if (neighbor) restoreTVFocus(() => itemRefs.current.get(neighbor.id));
    }
  }, [toggleFavorite, toggleSeriesFavorite, showToast, builtIn, filtered]);

  const handleRefresh = useCallback(() => {
    if (isCatalog) { catalog.load(true); return; }
    invalidateStreams(type, categoryId);
    loadStreams(type, categoryId);
  }, [isCatalog, type, categoryId, invalidateStreams, loadStreams, catalog.load]);

  const handleSubmitSearch = useCallback(() => {
    setQuery(search); // skip the debounce
    restoreTVFocus(() => firstItemRef.current);
  }, [search]);

  const renderItem = useCallback(
    ({ item, index }: { item: Stream; index: number }) => {
      const show = item.kind === 'series';
      const { progress, label } = item.isLive ? {}
        : show ? seriesProgressInfo(seriesHistory[item.id], episodeProgress)
        : progressInfo(movieProgress[item.id]);
      return (
        <StreamCard
          ref={(r: any) => {
            if (r) itemRefs.current.set(item.id, r); else itemRefs.current.delete(item.id);
            if (index === 0) firstItemRef.current = r;
          }}
          stream={item}
          onPress={() => handleStreamPress(item, index)}
          onLongPress={item.isLive || show ? () => handleLongPress(item, index) : undefined}
          isFavorite={item.isLive ? favoriteIds.has(item.id) : show && seriesFavoriteIds.has(item.id)}
          progress={progress}
          progressLabel={label}
          categoryName={categoryNames[item.categoryId] ?? (builtIn ? undefined : categoryName)}
          hasTVPreferredFocus={index === 0 && !isCatalog && !initialFocusDone.current}
          nextFocusUp={index === 0 && searchHandle ? searchHandle : undefined}
        />
      );
    },
    [handleStreamPress, handleLongPress, favoriteIds, seriesFavoriteIds, movieProgress, seriesHistory, episodeProgress,
      categoryNames, categoryName, searchHandle, builtIn, isCatalog],
  );

  const emptyState = (icon: any, title: string, subtitle: string) => (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );

  const renderEmpty = () => {
    if (query) {
      return emptyState('search-outline', 'No results', isCatalog
        ? `No ${noun} matches “${query.trim()}”`
        : 'Try a different search term');
    }
    switch (builtIn) {
      case 'favorites':
        return emptyState('star-outline', 'No favorites yet',
          `${Platform.isTV ? 'Hold OK' : 'Long-press'} on a channel to add it to your favorites`);
      case 'recents':
        return emptyState('time-outline', 'Nothing watched yet',
          `Channels you watch for at least ${RECENT_MIN_WATCH_SECONDS / 60} minute appear here`);
      case 'movieRecents':
        return emptyState('time-outline', 'No movies yet',
          `Movies you watch for more than ${MOVIE_RECENT_MIN_WATCH_SECONDS / 60} minutes appear here, ready to resume`);
      case 'seriesFavorites':
        return emptyState('star-outline', 'No favorite shows yet',
          `${Platform.isTV ? 'Hold OK' : 'Long-press'} on a show to add it to your favorites`);
      case 'seriesRecents':
        return emptyState('time-outline', 'No shows yet',
          `Shows you watch for more than ${SERIES_RECENT_MIN_WATCH_SECONDS / 60} minutes appear here, with the next episode to watch`);
      case 'catalog':
        return emptyState('film-outline', `No ${noun}${isSeries ? '' : 's'}`, 'The provider returned an empty list');
      default:
        return emptyState('videocam-off-outline', `No ${type === 'live' ? 'streams' : 'titles'} found`, 'Nothing in this category yet');
    }
  };

  // All movies: download state, what the list shows (latest additions or matches), Refresh.
  const listHeader = catalogResult ? (
    <View style={styles.listInfoRow}>
      <View style={{ flex: 1 }}>
        {catalog.loading && (
          <Text style={styles.listInfoLoading}>
            Loading… {catalog.doneCategories} / {catalog.totalCategories} categories · search already works on what is loaded
          </Text>
        )}
        {!catalog.loading && catalog.failedCategories > 0 && (
          <Text style={styles.listInfoWarn}>
            {catalog.failedCategories} categor{catalog.failedCategories === 1 ? 'y' : 'ies'} could not be loaded · Refresh to retry
          </Text>
        )}
        {catalogResult.items.length > 0 && (
          <Text style={styles.listInfo}>
            {catalogResult.recent
              ? `Recently ${isSeries ? 'updated' : 'added'} · search ${catalog.movies!.length.toLocaleString()} French & English titles by name`
              : catalogResult.total > catalogResult.items.length
                ? `${catalogResult.total.toLocaleString()} matches · first ${catalogResult.items.length} shown, refine your search`
                : `${catalogResult.total} match${catalogResult.total === 1 ? '' : 'es'}`}
          </Text>
        )}
      </View>
      {!catalog.loading && (
        <Pressable
          onPress={() => catalog.load(true)}
          style={({ focused }: any) => [styles.refreshBtn, focused && styles.refreshBtnFocused]}
        >
          <Ionicons name="refresh" size={14} color={colors.textSecondary} />
          <Text style={styles.refreshText}>Refresh list</Text>
        </Pressable>
      )}
    </View>
  ) : null;

  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 || word === 'series' ? '' : 's'}`;
  let countLabel: string;
  if (isCatalog) {
    countLabel = catalog.movies ? plural(catalog.movies.length, noun)
      : catalog.loading ? `Loading the ${noun} list…` : '';
  } else if (builtIn) {
    const word = builtIn === 'movieRecents' ? 'movie' : isSeries ? 'show' : 'channel';
    countLabel = plural(categoryStreams.length, word);
  } else {
    countLabel = categoryStreams.length > 0
      ? `${categoryStreams.length} ${type === 'live' ? 'streams' : isSeries ? 'shows' : 'titles'}` : 'Loading…';
  }

  const isLoading = isCatalog
    ? catalog.loading && !catalog.movies
    : !builtIn && loadingStreams && categoryStreams.length === 0;
  const shownError = isCatalog ? (catalog.movies ? null : catalog.error) : !builtIn ? error : null;

  useEffect(() => {
    if (!isLoading && filtered.length > 0) initialFocusDone.current = true;
  });

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
          <Text style={styles.headerTitle} numberOfLines={1}>{categoryName}</Text>
          {countLabel ? <Text style={styles.headerSub}>{countLabel}</Text> : null}
        </View>
        {/* Working while the list is shown: refresh, or All movies still downloading */}
        {(isCatalog ? catalog.loading && !!catalog.movies : !builtIn && loadingStreams && categoryStreams.length > 0) && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>

      {/* Search */}
      <SearchBar
        ref={searchRef}
        value={search}
        onChangeText={setSearch}
        placeholder={isCatalog ? `Search a ${isSeries ? 'show' : 'movie'} by name…`
          : `Search ${type === 'live' ? 'streams' : isSeries ? 'shows' : 'movies'}…`}
        onSubmit={handleSubmitSearch}
        hasTVPreferredFocus={isCatalog}
        busy={isCatalog && search !== query}
      />

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          {isCatalog ? (
            <>
              <Text style={styles.loadingText}>
                Loading the {noun} list{catalog.totalCategories > 0 ? ` · ${catalog.doneCategories} / ${catalog.totalCategories} categories` : '…'}
              </Text>
              <Text style={styles.loadingHint}>Done once, then kept on this device for 3 days</Text>
            </>
          ) : (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>
      ) : shownError ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{shownError}</Text>
          <Pressable
            onPress={() => { clearError(); handleRefresh(); }}
            hasTVPreferredFocus
            style={({ focused }: any) => [styles.retryBtn, focused && styles.retryBtnFocused]}
          >
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
            ListHeaderComponent={listHeader}
            ListEmptyComponent={renderEmpty}
            refreshControl={builtIn && !isCatalog ? undefined : (
              <RefreshControl
                refreshing={isCatalog ? catalog.loading : loadingStreams}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            )}
            removeClippedSubviews={!Platform.isTV}
            // TV: keep the focused card clear of the screen edges (see TV_LIST_EDGE).
            fadingEdgeLength={TV_LIST_EDGE}
            initialNumToRender={Platform.isTV ? 30 : 12}
            maxToRenderPerBatch={12}
            windowSize={Platform.isTV ? 21 : 5}
          />
        </View>
      )}

      {toast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <Text style={styles.toastText} numberOfLines={1}>{toast}</Text>
        </Animated.View>
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
  headerSub: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  listInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginLeft: spacing.xs },
  listInfo: { ...typography.caption, color: colors.textMuted },
  listInfoLoading: { ...typography.caption, color: colors.primary, marginBottom: 2 },
  listInfoWarn: { ...typography.caption, color: colors.warning, marginBottom: 2 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.cardBorder,
  },
  refreshBtnFocused: { borderColor: colors.white, backgroundColor: 'rgba(255,255,255,0.12)' },
  refreshText: { ...typography.caption, color: colors.textSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingText: { ...typography.body, color: colors.textMuted },
  loadingHint: { ...typography.caption, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  retryBtnFocused: { borderWidth: 2, borderColor: colors.white },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' },
  empty: { marginTop: spacing.xxl, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.textSecondary },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  toast: {
    position: 'absolute', bottom: spacing.xl, alignSelf: 'center', maxWidth: '90%',
    backgroundColor: 'rgba(28,28,40,0.96)', borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  toastText: { ...typography.body, color: colors.text, fontWeight: '600' },
});
