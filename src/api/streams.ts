import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import {
  ApiCategory, ApiEpisode, ApiSeries, ApiSeriesInfo, ApiStream, ApiVodStream, Category, Episode, EpisodeRef,
  SavedChannel, SavedMovie, SavedSeries, SeriesDetails, Stream, StreamType,
} from '../types';
import { shouldUseProxy } from '../utils/proxy';

// Browsers can't play raw MPEG-TS — use HLS on web for live streams
const LIVE_EXT = Platform.OS === 'web' ? 'm3u8' : 'ts';

// ─── Gradient palette (cycles by index) ──────────────────────────────────────
const GRADIENTS: [string, string][] = [
  ['#1E3A5F', '#0F2040'],
  ['#2D3748', '#1A2232'],
  ['#1A3A2A', '#0D2018'],
  ['#3A2D1A', '#201808'],
  ['#1A1A3A', '#0D0D20'],
  ['#3A1A1A', '#200808'],
  ['#2A1A3A', '#180D20'],
  ['#1A3A3A', '#0D2020'],
];

// ─── Icon inference ───────────────────────────────────────────────────────────
function inferIcon(name: string, type: StreamType): string {
  const n = name.toLowerCase();
  if (type !== 'live') {
    if (/action|thriller|horror/.test(n)) return 'movie-filter';
    if (/comedy|humor/.test(n)) return 'emoticon-happy-outline';
    if (/docu|nature|history/.test(n)) return 'earth';
    if (/anime|cartoon|kids/.test(n)) return 'baby-face-outline';
    if (/series|show|tv/.test(n)) return 'television-play';
    return 'filmstrip';
  }
  if (/sport|foot|soccer|tennis|basket|cricket/.test(n)) return 'soccer';
  if (/news|info|actual/.test(n)) return 'newspaper-variant';
  if (/movie|film|cinema/.test(n)) return 'filmstrip';
  if (/music|radio|concert/.test(n)) return 'music';
  if (/kids|child|cartoon|anime/.test(n)) return 'baby-face-outline';
  if (/docu|nature|history|science/.test(n)) return 'earth';
  return 'television-play';
}

// ─── Mappers ──────────────────────────────────────────────────────────────────
function mapCategory(apiCat: ApiCategory, index: number, type: StreamType): Category {
  return {
    id: apiCat.category_id,
    name: apiCat.category_name,
    icon: inferIcon(apiCat.category_name, type),
    iconFamily: 'MaterialCommunityIcons',
    streamCount: 0,
    gradientColors: GRADIENTS[index % GRADIENTS.length],
  };
}

/** Playback URL of a live channel for the active account and server. */
export function liveStreamUrl(streamId: string | number): string {
  const { url, username, password } = useAuthStore.getState();
  return `${url}/live/${username}/${password}/${streamId}.${LIVE_EXT}`;
}

function mapLiveStream(apiStream: ApiStream): Stream {
  return {
    id: String(apiStream.stream_id),
    name: apiStream.name,
    categoryId: apiStream.category_id,
    url: liveStreamUrl(apiStream.stream_id),
    streamIcon: apiStream.stream_icon ?? '',
    isLive: true,
  };
}

/** A saved favorite/history channel as a playable stream of the active account. */
export function savedToStream(c: SavedChannel): Stream {
  return { ...c, url: liveStreamUrl(c.id), isLive: true };
}

/** Playback URL of a movie for the active account and server. */
export function vodStreamUrl(streamId: string | number, ext: string): string {
  const { url, username, password } = useAuthStore.getState();
  return `${url}/movie/${username}/${password}/${streamId}.${ext}`;
}

function mapVodStream(apiStream: ApiVodStream): Stream {
  return {
    id: String(apiStream.stream_id),
    name: apiStream.name,
    categoryId: apiStream.category_id,
    url: vodStreamUrl(apiStream.stream_id, apiStream.container_extension),
    streamIcon: apiStream.stream_icon ?? '',
    isLive: false,
    rating: apiStream.rating || undefined,
    year: apiStream.year || undefined,
    durationStr: apiStream.duration || undefined,
    plot: apiStream.plot || undefined,
    containerExt: apiStream.container_extension,
  };
}

/** Playback URL of an episode for the active account and server. */
export function episodeStreamUrl(episodeId: string | number, ext: string): string {
  const { url, username, password } = useAuthStore.getState();
  return `${url}/series/${username}/${password}/${episodeId}.${ext}`;
}

function mapSeries(s: ApiSeries): Stream {
  const date = s.releaseDate || s.release_date || '';
  return {
    id: String(s.series_id),
    name: s.name,
    categoryId: String(s.category_id ?? ''),
    url: '',
    streamIcon: s.cover ?? '',
    isLive: false,
    kind: 'series',
    rating: s.rating && s.rating !== '0' ? s.rating : undefined,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
    plot: s.plot || undefined,
  };
}

/** A show from favorites or history, as a list item (opens its episodes). */
export function savedSeriesToStream(s: SavedSeries): Stream {
  return { id: s.id, name: s.name, categoryId: s.categoryId, url: '', streamIcon: s.cover, isLive: false, kind: 'series', rating: s.rating };
}

export function streamToSavedSeries(s: Stream): SavedSeries {
  return { id: s.id, name: s.name, cover: s.streamIcon, categoryId: s.categoryId, rating: s.rating };
}

/** An episode as a playable stream of the active account. */
export function episodeToStream(series: SavedSeries, e: EpisodeRef): Stream {
  return {
    id: e.id,
    name: e.title,
    categoryId: series.categoryId,
    url: episodeStreamUrl(e.id, e.ext),
    streamIcon: series.cover,
    isLive: false,
    containerExt: e.ext,
    kind: 'episode',
    episode: { id: e.id, ext: e.ext, season: e.season, episode: e.episode, title: e.title, series },
  };
}

/** "S02E05" */
export function episodeCode(e: { season: number; episode: number }): string {
  return `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`;
}

/**
 * Title of an episode without the show name and code the provider repeats in it
 * ("FR - Show (2018) (US) - S01E01 - Pilot" → "Pilot"); "" when there is none.
 */
function episodeTitle(raw: string): string {
  const m = /S\d+\s*E\d+\s*(?:[-–:|]\s*)?(.*)$/i.exec(raw);
  const rest = (m ? m[1] : raw).trim();
  return /^(episode|épisode)?\s*\d+$/i.test(rest) ? '' : rest;
}

function mapEpisode(e: ApiEpisode, seasonKey: string): Episode {
  const info = e.info ?? {};
  const audio = info.audio && !Array.isArray(info.audio) ? info.audio.tags?.language : undefined;
  return {
    id: String(e.id),
    ext: e.container_extension || 'mp4',
    season: Number(e.season ?? seasonKey) || Number(seasonKey) || 1,
    episode: Number(e.episode_num) || 0,
    title: episodeTitle(String(e.title ?? '')),
    image: info.movie_image ?? '',
    plot: info.plot || undefined,
    duration: Number(info.duration_secs) || 0,
    audioLanguage: audio && audio !== 'und' ? audio : undefined,
  };
}

/** A movie from the watch history as a playable stream of the active account. */
export function savedMovieToStream(m: SavedMovie): Stream {
  return {
    id: m.id,
    name: m.name,
    categoryId: m.categoryId,
    url: vodStreamUrl(m.id, m.containerExt),
    streamIcon: m.streamIcon,
    isLive: false,
    year: m.year,
    rating: m.rating,
    containerExt: m.containerExt,
  };
}

// ─── API calls ────────────────────────────────────────────────────────────────
function buildApiUrl(action: string, extra?: Record<string, string>) {
  const { url, username, password } = useAuthStore.getState();
  if (shouldUseProxy()) {
    return {
      url: '/api/proxy',
      params: { serverUrl: url, username, password, action, ...extra },
    };
  }
  return {
    url: `${url}/player_api.php`,
    params: { username, password, action, ...extra },
  };
}

const CATEGORY_ACTIONS: Record<StreamType, string> = {
  live: 'get_live_categories',
  vod: 'get_vod_categories',
  series: 'get_series_categories',
};

export async function fetchCategories(type: StreamType): Promise<Category[]> {
  const action = CATEGORY_ACTIONS[type];
  const { url, params } = buildApiUrl(action);
  const { data } = await axios.get<ApiCategory[]>(url, { params, timeout: 10_000 });
  return data.map((c, i) => mapCategory(c, i, type));
}

/**
 * Raw movies of one category (no URLs built). Used to assemble the full catalogue
 * category by category, which keeps each response small.
 */
export async function fetchVodCategoryRaw(categoryId: string): Promise<ApiVodStream[]> {
  const { url, params } = buildApiUrl('get_vod_streams', { category_id: categoryId });
  const { data } = await axios.get<ApiVodStream[]>(url, { params, timeout: 30_000 });
  return Array.isArray(data) ? data : [];
}

/** Raw shows of one category, for the full catalogue. */
export async function fetchSeriesCategoryRaw(categoryId: string): Promise<ApiSeries[]> {
  const { url, params } = buildApiUrl('get_series', { category_id: categoryId });
  const { data } = await axios.get<ApiSeries[]>(url, { params, timeout: 30_000 });
  return Array.isArray(data) ? data : [];
}

/** Seasons and episodes of a show, in order. */
export async function fetchSeriesDetails(seriesId: string): Promise<SeriesDetails> {
  const { url, params } = buildApiUrl('get_series_info', { series_id: seriesId });
  const { data } = await axios.get<ApiSeriesInfo>(url, { params, timeout: 20_000 });
  const bySeason = new Map<number, Episode[]>();
  const raw = data?.episodes;
  const groups: [string, ApiEpisode[]][] = Array.isArray(raw)
    ? [['1', raw]]
    : Object.entries(raw ?? {}).filter(([, v]) => Array.isArray(v));
  for (const [key, list] of groups) {
    for (const e of list) {
      if (!e || e.id == null) continue;
      const ep = mapEpisode(e, key);
      const season = bySeason.get(ep.season) ?? [];
      season.push(ep);
      bySeason.set(ep.season, season);
    }
  }
  const seasons = [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, episodes]) => ({ season, episodes: episodes.sort((a, b) => a.episode - b.episode) }));
  const info = data?.info ?? {};
  const date = info.releaseDate ?? '';
  return {
    plot: info.plot || undefined,
    genre: info.genre || undefined,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
    rating: info.rating && info.rating !== '0' ? String(info.rating) : undefined,
    cover: info.cover || undefined,
    seasons,
  };
}

export async function fetchStreamsByCategory(type: StreamType, categoryId: string): Promise<Stream[]> {
  if (type === 'series') {
    const { url, params } = buildApiUrl('get_series', { category_id: categoryId });
    const { data } = await axios.get<ApiSeries[]>(url, { params, timeout: 20_000 });
    return (Array.isArray(data) ? data : []).map(mapSeries);
  }
  if (type === 'live') {
    const { url, params } = buildApiUrl('get_live_streams', { category_id: categoryId });
    const { data } = await axios.get<ApiStream[]>(url, { params, timeout: 15_000 });
    return data.map(mapLiveStream);
  } else {
    const { url, params } = buildApiUrl('get_vod_streams', { category_id: categoryId });
    const { data } = await axios.get<ApiVodStream[]>(url, { params, timeout: 15_000 });
    return data.map(mapVodStream);
  }
}
