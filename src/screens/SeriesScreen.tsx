import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableHighlight,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Episode, RootStackParamList, SeriesDetails } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { fetchSeriesDetails, episodeToStream, episodeCode } from '../api/streams';
import { useAuthStore } from '../store/authStore';
import { describeError, useStreamStore } from '../store/streamStore';
import { useSeriesCatalog } from '../store/catalogStore';
import { useLibraryStore, isFinished, resumePosition } from '../store/libraryStore';
import { describeMedia } from '../utils/mediaInfo';
import { languageName } from '../utils/languages';
import { toProxyUrl } from '../utils/proxy';
import { restoreTVFocus, TV_LIST_EDGE } from '../utils/tvFocus';
import { MediaBadges } from '../components/StreamCard';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Series'>;
type Route = RouteProp<RootStackParamList, 'Series'>;

const minutes = (secs: number) => `${Math.max(1, Math.round(secs / 60))} min`;

/**
 * A show: what to watch next (resume the episode in progress, or the next one), favorite
 * toggle, and its episodes season by season. The player gets the whole show as its list, so
 * "next" in the player continues into the following season.
 */
export default function SeriesScreen() {
  const navigation = useNavigation<Nav>();
  const { series } = useRoute<Route>().params;
  const { url, username, password } = useAuthStore();

  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Season picked by the user; null: the season of the episode to watch next. */
  const [pickedSeason, setPickedSeason] = useState<number | null>(null);

  const history = useLibraryStore((s) => s.seriesHistory[series.id]);
  const episodeProgress = useLibraryStore((s) => s.episodeProgress);
  const isFavorite = useLibraryStore((s) => s.seriesFavorites.some((f) => f.id === series.id));
  const toggleSeriesFavorite = useLibraryStore((s) => s.toggleSeriesFavorite);

  const categoryName = useStreamStore((s) => s.categories.series.find((c) => c.id === series.categoryId)?.name)
    ?? useSeriesCatalog.getState().categoryNames[series.categoryId];
  const media = describeMedia(series.name, categoryName);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetails(await fetchSeriesDetails(series.id));
    } catch (err) {
      setError(describeError(err, 'Failed to load the episodes'));
    } finally {
      setLoading(false);
    }
  }, [series.id]);
  useEffect(() => { load(); }, [load]);

  const episodes = useMemo<Episode[]>(() => details?.seasons.flatMap((s) => s.episodes) ?? [], [details]);
  // Playable streams of the whole show (URLs of the active account and server).
  const episodeStreams = useMemo(
    () => episodes.map((e) => episodeToStream(series, e)),
    [episodes, series, url, username, password],
  );
  const indexById = useMemo(() => new Map(episodes.map((e, i) => [e.id, i])), [episodes]);

  // Main button: resume the episode in progress, else the next one, else start.
  const primary = useMemo<{ index: number; label: string; sub?: string } | null>(() => {
    if (episodes.length === 0) return null;
    const lastIndex = history ? indexById.get(history.last.id) : undefined;
    if (history && lastIndex != null) {
      const p = episodeProgress[history.last.id];
      const code = episodeCode(episodes[lastIndex]);
      if (!isFinished(p)) {
        const at = resumePosition(p);
        return at && p
          ? { index: lastIndex, label: `Resume ${code}`, sub: p.duration > 0 ? `${minutes(p.duration - at)} left` : undefined }
          : { index: lastIndex, label: `Play ${code}` };
      }
      if (lastIndex + 1 < episodes.length) {
        return { index: lastIndex + 1, label: `Next episode · ${episodeCode(episodes[lastIndex + 1])}` };
      }
      return { index: 0, label: `Watch again · ${episodeCode(episodes[0])}`, sub: 'All episodes watched' };
    }
    return { index: 0, label: `Play ${episodeCode(episodes[0])}` };
  }, [episodes, indexById, history, episodeProgress]);

  const seasonNumbers = details?.seasons.map((s) => s.season) ?? [];
  const season = pickedSeason ?? (primary ? episodes[primary.index].season : seasonNumbers[0]);
  const seasonEpisodes = useMemo(
    () => details?.seasons.find((s) => s.season === season)?.episodes ?? [],
    [details, season],
  );

  const play = useCallback((index: number) => {
    const stream = episodeStreams[index];
    if (!stream) return;
    navigation.navigate('Player', { stream, streams: episodeStreams, streamIndex: index });
  }, [navigation, episodeStreams]);

  // TV: the main button takes the focus once loaded (one-shot: a re-request would steal focus),
  // and again on return from the player — it then offers the episode after the one just watched.
  const primaryRef = useRef<any>(null);
  const [preferPrimary, setPreferPrimary] = useState(true);
  useEffect(() => { if (primary && preferPrimary) setPreferPrimary(false); }, [primary]);
  useEffect(() => {
    if (!Platform.isTV) return;
    let cancel = () => {};
    const unsub = navigation.addListener('transitionEnd' as any, (e: any) => {
      if (e.data.closing) return;
      setPickedSeason(null); // follow the episode to watch next
      cancel();
      cancel = restoreTVFocus(() => primaryRef.current);
    });
    return () => { cancel(); unsub(); };
  }, [navigation]);

  const renderEpisode = useCallback(({ item }: { item: Episode }) => {
    const index = indexById.get(item.id) ?? 0;
    const p = episodeProgress[item.id];
    const done = isFinished(p);
    const at = resumePosition(p);
    const length = item.duration || p?.duration || 0;
    return (
      <EpisodeRow
        episode={item}
        progress={at && p && p.duration > 0 ? at / p.duration : undefined}
        done={done}
        length={length}
        onPress={() => play(index)}
      />
    );
  }, [indexById, episodeProgress, play]);

  const year = details?.year ?? media.year;
  const rating = details?.rating ?? series.rating;
  const cover = details?.cover || series.cover;

  const header = (
    <View>
      <View style={styles.hero}>
        <View style={styles.poster}>
          {cover ? (
            <Image source={{ uri: toProxyUrl(cover) }} style={styles.posterImage} resizeMode="cover" />
          ) : (
            <MaterialCommunityIcons name="television-classic" size={40} color="rgba(255,255,255,0.35)" />
          )}
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.title} numberOfLines={2}>{media.title}</Text>
          <View style={styles.metaRow}>
            <MediaBadges info={media} />
            {year ? <Text style={styles.meta}>{year}</Text> : null}
            {rating && parseFloat(rating) > 0 ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={11} color={colors.warning} />
                <Text style={styles.meta}>{parseFloat(rating).toFixed(1)}</Text>
              </View>
            ) : null}
            {details?.genre ? <Text style={styles.meta} numberOfLines={1}>{details.genre}</Text> : null}
            {details ? (
              <Text style={styles.meta}>
                {details.seasons.length} season{details.seasons.length === 1 ? '' : 's'} · {episodes.length} episode{episodes.length === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
          {details?.plot ? <Text style={styles.plot} numberOfLines={3}>{details.plot}</Text> : null}
          <View style={styles.actions}>
            {primary && (
              <Pressable
                ref={primaryRef}
                onPress={() => play(primary.index)}
                hasTVPreferredFocus={preferPrimary}
                style={({ focused }: any) => [styles.primaryBtn, focused && styles.btnFocused]}
              >
                <Ionicons name="play" size={18} color={colors.white} />
                <View>
                  <Text style={styles.primaryText}>{primary.label}</Text>
                  {primary.sub ? <Text style={styles.primarySub}>{primary.sub}</Text> : null}
                </View>
              </Pressable>
            )}
            <Pressable
              onPress={() => toggleSeriesFavorite(series)}
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              style={({ focused }: any) => [styles.secondaryBtn, focused && styles.btnFocused]}
            >
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={18} color={isFavorite ? colors.warning : colors.text} />
              <Text style={styles.secondaryText}>{isFavorite ? 'Favorite' : 'Add to favorites'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {seasonNumbers.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasons}>
          {seasonNumbers.map((n) => (
            <Pressable
              key={n}
              onPress={() => setPickedSeason(n)}
              style={({ focused }: any) => [styles.seasonPill, n === season && styles.seasonPillActive, focused && styles.btnFocused]}
            >
              <Text style={[styles.seasonText, n === season && styles.seasonTextActive]}>Season {n}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {seasonNumbers.length === 1 && <Text style={styles.sectionTitle}>Season {seasonNumbers[0]}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />
      {!Platform.isTV && (
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        </View>
      )}
      <View style={styles.listBox}>
        {/* TV: react-native-tvos wraps lists in an unstyled focus guide that takes the whole screen
           height, pushing the list's bottom off screen (focused cards ended up cut off at the
           bottom). This flex: 1 box bounds it to the space left under the header. */}
        <FlatList
          data={seasonEpisodes}
          keyExtractor={(e) => e.id}
          renderItem={renderEpisode}
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.muted}>Loading episodes…</Text>
              </View>
            ) : error ? (
              <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable
                  onPress={load}
                  hasTVPreferredFocus
                  style={({ focused }: any) => [styles.primaryBtn, focused && styles.btnFocused]}
                >
                  <Text style={styles.primaryText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.muted}>No episodes available</Text>
              </View>
            )
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          fadingEdgeLength={TV_LIST_EDGE}
          initialNumToRender={Platform.isTV ? 30 : 12}
          windowSize={Platform.isTV ? 21 : 5}
        />
      </View>
    </SafeAreaView>
  );
}

function EpisodeRow({ episode, progress, done, length, onPress }: {
  episode: Episode;
  progress?: number;
  done: boolean;
  length: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const audio = languageName(episode.audioLanguage);
  return (
    <TouchableHighlight
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      underlayColor={colors.surface}
      style={[styles.episode, focused && styles.episodeFocused]}
    >
      <View style={styles.episodeInner}>
        <View style={styles.episodeNumber}>
          <Text style={styles.episodeNumberText}>{episode.episode || '•'}</Text>
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={1}>
            {episode.title || `Episode ${episode.episode}`}
          </Text>
          <View style={styles.episodeMeta}>
            <Text style={styles.meta}>{episodeCode(episode)}</Text>
            {length > 0 && <Text style={styles.meta}>· {minutes(length)}</Text>}
            {audio ? (
              <View style={styles.ratingRow}>
                <Ionicons name="volume-high" size={10} color={colors.textMuted} />
                <Text style={styles.meta}>{audio}</Text>
              </View>
            ) : null}
            {done && (
              <View style={styles.ratingRow}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={[styles.meta, { color: colors.success }]}>Watched</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="play-circle-outline" size={22} color={focused ? colors.text : colors.textMuted} style={{ marginRight: spacing.md }} />
        {progress != null && progress > 0 && (
          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` as any }]} />
          </View>
        )}
      </View>
    </TouchableHighlight>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listBox: { flex: 1 },
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  hero: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  poster: {
    width: 120, height: 176, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  posterImage: { width: '100%', height: '100%' },
  heroInfo: { flex: 1, gap: spacing.sm },
  title: { ...typography.h1, color: colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  meta: { ...typography.caption, color: colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  plot: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderWidth: 2, borderColor: 'transparent',
  },
  primaryText: { ...typography.body, color: colors.white, fontWeight: '700' },
  primarySub: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 2, borderColor: colors.cardBorder,
  },
  secondaryText: { ...typography.body, color: colors.text, fontWeight: '600' },
  btnFocused: { borderColor: colors.white, transform: [{ scale: 1.04 }] },
  seasons: { gap: spacing.sm, paddingVertical: spacing.sm },
  seasonPill: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 2, borderColor: colors.cardBorder,
  },
  seasonPillActive: { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: colors.primary },
  seasonText: { ...typography.label, color: colors.textSecondary },
  seasonTextActive: { color: colors.text, fontWeight: '700' },
  sectionTitle: { ...typography.h3, color: colors.text, paddingVertical: spacing.sm },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  muted: { ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  episode: {
    marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 3, borderColor: 'transparent', backgroundColor: colors.card,
  },
  episodeFocused: { borderColor: colors.primary, transform: [{ scale: 1.02 }] },
  episodeInner: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  episodeNumber: {
    width: 52, alignSelf: 'stretch', backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  episodeNumberText: { ...typography.h3, color: colors.textSecondary },
  episodeInfo: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 3 },
  episodeTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  episodeMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  progressTrack: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: { height: 3, backgroundColor: colors.primary },
});
