import { create } from 'zustand';
import { EpisodeProgress, EpisodeRef, MovieProgress, SavedChannel, SavedSeries, SeriesProgress, Stream } from '../types';
import { loadJSON, saveJSON } from '../utils/prefs';

/** Ids of the built-in categories, listed before the provider's ones. */
export const FAVORITES_CATEGORY_ID = '__favorites__'; // Live TV
export const RECENTS_CATEGORY_ID = '__recent__'; // Live TV
export const MOVIE_RECENTS_CATEGORY_ID = '__movie_recent__'; // Movies
export const SERIES_RECENTS_CATEGORY_ID = '__series_recent__'; // Series
export const SERIES_FAVORITES_CATEGORY_ID = '__series_favorites__'; // Series

/** A channel enters the history after this much actual playback. */
export const RECENT_MIN_WATCH_SECONDS = 60;
/** A movie enters the history after this much actual playback (across sessions). */
export const MOVIE_RECENT_MIN_WATCH_SECONDS = 600;
/** A show enters the history after this much actual playback (across its episodes). */
export const SERIES_RECENT_MIN_WATCH_SECONDS = 300;
const MAX_RECENTS = 30;
/** Movies whose position is remembered (oldest dropped first). */
const MAX_MOVIE_PROGRESS = 300;
/** Shows kept in the history, and episodes whose position is remembered. */
const MAX_SERIES_HISTORY = 100;
const MAX_EPISODE_PROGRESS = 1000;

const FAVORITES_FILE = 'favorites';
const RECENTS_FILE = 'recents';
const MOVIE_PROGRESS_FILE = 'movie_progress';
const SERIES_FAVORITES_FILE = 'series_favorites';
const SERIES_HISTORY_FILE = 'series_history';
const EPISODE_PROGRESS_FILE = 'episode_progress';
const PLAYER_PREFS_FILE = 'player_prefs';

type Position = { position: number; duration: number };

/** In the final stretch (end credits): counts as watched. */
export function isFinished(p: Position | undefined): boolean {
  return !!p && p.duration > 0 && p.position > p.duration - Math.max(120, p.duration * 0.05);
}

/** Where to resume a movie or episode: 0 when barely started or (nearly) finished. */
export function resumePosition(p: Position | undefined): number {
  if (!p || p.position < 30 || isFinished(p)) return 0;
  return p.position;
}

/** Shows watched long enough to be listed in Recently watched, most recent first. */
export function seriesRecents(history: Record<string, SeriesProgress>): SeriesProgress[] {
  return Object.values(history)
    .filter((h) => h.watched >= SERIES_RECENT_MIN_WATCH_SECONDS)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * What to play next in a show, from the history alone: the last episode if it was left midway
 * (or barely started), else the one after it. null when the last episode was finished and was
 * the last one known.
 */
export function upNext(
  h: SeriesProgress,
  episodes: Record<string, EpisodeProgress>,
): { episode: EpisodeRef; resumeAt: number; isNext: boolean } | null {
  const p = episodes[h.last.id];
  if (!isFinished(p)) return { episode: h.last, resumeAt: resumePosition(p), isNext: false };
  return h.next ? { episode: h.next, resumeAt: resumePosition(episodes[h.next.id]), isNext: true } : null;
}

/** Movies watched long enough to be listed in Recently watched, most recent first. */
export function movieRecents(progress: Record<string, MovieProgress>): MovieProgress[] {
  return Object.values(progress)
    .filter((p) => p.watched >= MOVIE_RECENT_MIN_WATCH_SECONDS)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

interface LibraryStore {
  /** Favorite live channels, in the order they were added. */
  favorites: SavedChannel[];
  /** Recently watched live channels, most recent first. */
  recents: SavedChannel[];
  /** Movie positions and watch time, by movie id. */
  movieProgress: Record<string, MovieProgress>;
  /** Favorite shows, in the order they were added. */
  seriesFavorites: SavedSeries[];
  /** Shows played, by show id: last episode, next one, time watched. */
  seriesHistory: Record<string, SeriesProgress>;
  /** Episode positions, by episode id. */
  episodeProgress: Record<string, EpisodeProgress>;
  /** Subtitles last chosen in the player: a language ("fr"), null for none, undefined if never chosen. */
  subtitleLanguage: string | null | undefined;

  hydrate: () => Promise<void>;
  /** Add or remove a favorite. Returns true when the channel is now a favorite. */
  toggleFavorite: (stream: Stream) => boolean;
  /** Move the channel to the top of the history. */
  addRecent: (stream: Stream) => void;
  /**
   * Record a movie's position (null: keep the saved one) and add watchedDelta seconds of
   * actual playback.
   */
  saveMovieProgress: (stream: Stream, position: number | null, duration: number, watchedDelta: number) => void;
  /** Add or remove a favorite show. Returns true when it is now a favorite. */
  toggleSeriesFavorite: (series: SavedSeries) => boolean;
  /**
   * Record an episode's position (null: keep the saved one), add watchedDelta seconds of playback
   * to its show, and remember the episode after it (null: none).
   */
  saveEpisodeProgress: (stream: Stream, position: number | null, duration: number, watchedDelta: number, next: EpisodeRef | null) => void;
  setSubtitleLanguage: (language: string | null) => void;
}

/** Keep only what is needed to list and replay a channel: the URL embeds the account
 *  credentials and is rebuilt for the active account when played. */
function toSaved(stream: Stream): SavedChannel {
  return { id: stream.id, name: stream.name, streamIcon: stream.streamIcon, categoryId: stream.categoryId };
}

function isSavedList(v: unknown): v is SavedChannel[] {
  return Array.isArray(v) && v.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
}

function isSeriesList(v: unknown): v is SavedSeries[] {
  return Array.isArray(v) && v.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
}

/** Saved list → map by id, keeping entries that pass the check. */
function toMap<T extends { id: string }>(v: unknown, ok: (x: any) => boolean): Record<string, T> {
  const map: Record<string, T> = {};
  if (Array.isArray(v)) for (const x of v) if (x && typeof x.id === 'string' && ok(x)) map[x.id] = x;
  return map;
}

/** Newest first, capped, as a map (and the list that is saved). */
function capByDate<T extends { id: string; updatedAt: number }>(map: Record<string, T>, max: number): [Record<string, T>, T[]] {
  const list = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, max);
  return [Object.fromEntries(list.map((x) => [x.id, x])), list];
}

function toProgressMap(v: unknown): Record<string, MovieProgress> {
  const map: Record<string, MovieProgress> = {};
  if (!Array.isArray(v)) return map;
  for (const p of v) {
    if (p && typeof p.id === 'string' && typeof p.position === 'number' && typeof p.containerExt === 'string') map[p.id] = p;
  }
  return map;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  favorites: [],
  recents: [],
  movieProgress: {},
  seriesFavorites: [],
  seriesHistory: {},
  episodeProgress: {},
  subtitleLanguage: undefined,

  hydrate: async () => {
    const [favorites, recents, movieProgress, seriesFavorites, seriesHistory, episodeProgress, playerPrefs] = await Promise.all([
      loadJSON<unknown>(FAVORITES_FILE, []),
      loadJSON<unknown>(RECENTS_FILE, []),
      loadJSON<unknown>(MOVIE_PROGRESS_FILE, []),
      loadJSON<unknown>(SERIES_FAVORITES_FILE, []),
      loadJSON<unknown>(SERIES_HISTORY_FILE, []),
      loadJSON<unknown>(EPISODE_PROGRESS_FILE, []),
      loadJSON<any>(PLAYER_PREFS_FILE, {}),
    ]);
    const sub = playerPrefs?.subtitleLanguage;
    set({
      favorites: isSavedList(favorites) ? favorites : [],
      recents: isSavedList(recents) ? recents.slice(0, MAX_RECENTS) : [],
      movieProgress: toProgressMap(movieProgress),
      seriesFavorites: isSeriesList(seriesFavorites) ? seriesFavorites : [],
      seriesHistory: toMap<SeriesProgress>(seriesHistory, (h) => h.last && typeof h.last.id === 'string'),
      episodeProgress: toMap<EpisodeProgress>(episodeProgress, (p) => typeof p.position === 'number'),
      subtitleLanguage: sub === null || typeof sub === 'string' ? sub : undefined,
    });
  },

  setSubtitleLanguage: (language) => {
    set({ subtitleLanguage: language });
    saveJSON(PLAYER_PREFS_FILE, { subtitleLanguage: language });
  },

  toggleFavorite: (stream) => {
    const { favorites } = get();
    const exists = favorites.some((f) => f.id === stream.id);
    const next = exists ? favorites.filter((f) => f.id !== stream.id) : [...favorites, toSaved(stream)];
    set({ favorites: next });
    saveJSON(FAVORITES_FILE, next);
    return !exists;
  },

  addRecent: (stream) => {
    const next = [toSaved(stream), ...get().recents.filter((r) => r.id !== stream.id)].slice(0, MAX_RECENTS);
    set({ recents: next });
    saveJSON(RECENTS_FILE, next);
  },

  saveMovieProgress: (stream, position, duration, watchedDelta) => {
    const prev = get().movieProgress[stream.id];
    const entry: MovieProgress = {
      id: stream.id,
      name: stream.name,
      streamIcon: stream.streamIcon,
      categoryId: stream.categoryId,
      containerExt: stream.containerExt ?? prev?.containerExt ?? 'mp4',
      year: stream.year,
      rating: stream.rating,
      position: position ?? prev?.position ?? 0,
      duration: duration > 0 ? duration : prev?.duration ?? 0,
      watched: (prev?.watched ?? 0) + watchedDelta,
      updatedAt: Date.now(),
    };
    const list = Object.values({ ...get().movieProgress, [stream.id]: entry })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_MOVIE_PROGRESS);
    set({ movieProgress: Object.fromEntries(list.map((p) => [p.id, p])) });
    saveJSON(MOVIE_PROGRESS_FILE, list);
  },

  toggleSeriesFavorite: (series) => {
    const { seriesFavorites } = get();
    const exists = seriesFavorites.some((f) => f.id === series.id);
    const saved: SavedSeries = { id: series.id, name: series.name, cover: series.cover, categoryId: series.categoryId, rating: series.rating };
    const next = exists ? seriesFavorites.filter((f) => f.id !== series.id) : [...seriesFavorites, saved];
    set({ seriesFavorites: next });
    saveJSON(SERIES_FAVORITES_FILE, next);
    return !exists;
  },

  saveEpisodeProgress: (stream, position, duration, watchedDelta, next) => {
    const ctx = stream.episode;
    if (!ctx) return;
    const now = Date.now();
    const prevEp = get().episodeProgress[stream.id];
    const ep: EpisodeProgress = {
      id: stream.id,
      seriesId: ctx.series.id,
      position: position ?? prevEp?.position ?? 0,
      duration: duration > 0 ? duration : prevEp?.duration ?? 0,
      updatedAt: now,
    };
    const prevShow = get().seriesHistory[ctx.series.id];
    const show: SeriesProgress = {
      ...ctx.series,
      last: { id: ctx.id, ext: ctx.ext, season: ctx.season, episode: ctx.episode, title: ctx.title },
      next,
      watched: (prevShow?.watched ?? 0) + watchedDelta,
      updatedAt: now,
    };
    const [episodeProgress, epList] = capByDate({ ...get().episodeProgress, [ep.id]: ep }, MAX_EPISODE_PROGRESS);
    const [seriesHistory, showList] = capByDate({ ...get().seriesHistory, [show.id]: show }, MAX_SERIES_HISTORY);
    set({ episodeProgress, seriesHistory });
    saveJSON(EPISODE_PROGRESS_FILE, epList);
    saveJSON(SERIES_HISTORY_FILE, showList);
  },
}));
