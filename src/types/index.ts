// ─── Xtream Codes API response shapes ────────────────────────────────────────

export interface ApiCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface ApiStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface ApiVodStream {
  stream_id: number;
  num: number;
  name: string;
  stream_icon: string;
  rating: string;
  added: string;
  category_id: string;
  container_extension: string; // 'mp4', 'mkv', 'avi', etc.
  plot?: string;
  director?: string;
  year?: string;
  duration?: string;
}

export interface ApiSeries {
  series_id: number;
  name: string;
  cover?: string;
  plot?: string;
  genre?: string;
  releaseDate?: string;
  release_date?: string;
  last_modified?: string;
  rating?: string;
  category_id: string;
}

export interface ApiEpisode {
  id: string;
  episode_num: number | string;
  title: string;
  container_extension: string;
  season?: number | string;
  info?: {
    duration_secs?: number | string;
    movie_image?: string;
    plot?: string;
    /** First audio stream, as probed by the provider (often missing). */
    audio?: { tags?: { language?: string } } | unknown[];
  };
}

export interface ApiSeriesInfo {
  info?: { name?: string; cover?: string; plot?: string; genre?: string; releaseDate?: string; rating?: string };
  /** Episodes by season number ("1", "2"…); some providers send an array instead. */
  episodes?: Record<string, ApiEpisode[]> | ApiEpisode[];
}

// ─── Internal app types ───────────────────────────────────────────────────────

export type StreamType = 'live' | 'vod' | 'series';

export interface Credentials {
  url: string;
  username: string;
  password: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  iconFamily: string;
  streamCount: number; // 0 until streams are loaded
  gradientColors: [string, string];
}

export interface Stream {
  id: string;
  name: string;
  categoryId: string;
  url: string;
  streamIcon: string;
  isLive: boolean;
  // VOD-specific (optional)
  rating?: string;
  year?: string;
  durationStr?: string;
  plot?: string;
  /** VOD file extension (mp4, mkv…), needed to rebuild the URL of a saved movie. */
  containerExt?: string;
  /** 'series': a show (opens its episode list, no URL); 'episode': one episode of a show. */
  kind?: 'series' | 'episode';
  /** Episode: the show it belongs to and its place in it. */
  episode?: EpisodeContext;
}

/** A show, as kept in favorites and history (no URL). */
export interface SavedSeries {
  id: string;
  name: string;
  cover: string;
  categoryId: string;
  rating?: string;
}

/** Enough to name and replay an episode (the URL is rebuilt for the active account). */
export interface EpisodeRef {
  id: string;
  ext: string;
  season: number;
  episode: number;
  title: string;
}

export interface EpisodeContext extends EpisodeRef {
  series: SavedSeries;
}

/** One episode of a show, from the provider's episode list. */
export interface Episode extends EpisodeRef {
  image: string;
  plot?: string;
  /** Length in seconds (0 if unknown). */
  duration: number;
  /** Language of the first audio track (ISO 639-2, e.g. "fre", "eng"), when the provider probed it. */
  audioLanguage?: string;
}

export interface SeriesDetails {
  plot?: string;
  genre?: string;
  year?: string;
  rating?: string;
  cover?: string;
  /** Seasons in order, each with its episodes in order. */
  seasons: { season: number; episodes: Episode[] }[];
}

/** Where an episode was left. */
export interface EpisodeProgress {
  id: string;
  seriesId: string;
  position: number;
  duration: number;
  updatedAt: number;
}

/** A show in the watch history: the episode last played and the one after it. */
export interface SeriesProgress extends SavedSeries {
  last: EpisodeRef;
  /** Episode following `last` in the provider's list when it was played (null: it was the last one). */
  next: EpisodeRef | null;
  /** Total time actually played, across episodes and sessions, in seconds. */
  watched: number;
  updatedAt: number;
}

/** A live channel saved in favorites or history (no URL: rebuilt for the active account). */
export interface SavedChannel {
  id: string;
  name: string;
  streamIcon: string;
  categoryId: string;
}

/** A movie saved in the watch history (no URL: rebuilt for the active account). */
export interface SavedMovie {
  id: string;
  name: string;
  streamIcon: string;
  categoryId: string;
  containerExt: string;
  year?: string;
  rating?: string;
}

/** Where a movie was left, and how long it has actually been watched. */
export interface MovieProgress extends SavedMovie {
  /** Last playback position, in seconds. */
  position: number;
  /** Movie length in seconds (0 if unknown). */
  duration: number;
  /** Total time actually played, across sessions, in seconds. */
  watched: number;
  updatedAt: number;
}

export type RootStackParamList = {
  Login: undefined;
  StreamType: undefined;
  Categories: { type: StreamType };
  Streams: { categoryId: string; categoryName: string; type: StreamType };
  Series: { series: SavedSeries };
  Player: { stream: Stream; streams?: Stream[]; streamIndex?: number };
};
