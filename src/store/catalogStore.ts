/**
 * Every movie / every show of the provider, for the "All movies" and "All series" categories
 * and title search. One store per kind, same mechanics.
 *
 * Cost control — the lists are large (100k+ movies, ~40 MB of JSON, and providers often don't
 * compress it):
 * - downloaded only when "All movies" is opened, category by category (CONCURRENCY requests at
 *   a time) instead of one huge response: each response is small, so memory stays flat on TV
 *   boxes, and it fits the web proxy's response size limit;
 * - each response is reduced at once to a compact form (no URLs, plots…) and released;
 * - results are published progressively, so search works while the rest downloads;
 * - kept in memory for the session and, on devices, on disk for CACHE_TTL_MS in chunks of
 *   CHUNK_SIZE titles (never one huge string); "Refresh list" downloads it again;
 * - search keys are normalized once; a search is one linear scan returning at most `limit` items.
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import { ApiSeries, ApiVodStream, Stream } from '../types';
import { fetchCategories, fetchSeriesCategoryRaw, fetchVodCategoryRaw, vodStreamUrl } from '../api/streams';
import { useAuthStore } from './authStore';
import { describeError } from './streamStore';
import { loadJSON, saveJSON } from '../utils/prefs';

export const ALL_MOVIES_CATEGORY_ID = '__all_movies__';
export const ALL_SERIES_CATEGORY_ID = '__all_series__';

export type CatalogKind = 'vod' | 'series';

/**
 * Only categories in these languages are downloaded: tagged "[FR]" / "[EN]" in the category
 * name, or named "FRENCH …" / "ENGLISH …" (e.g. "VOD - ACTION [FR]", "VOD - ENGLISH 4K"), plus
 * "[MULTISUB]" ones (Netflix / Apple / Disney originals in their original language with
 * subtitles in many languages).
 * If a provider tags none of its categories this way, all of them are used.
 */
export const CATALOG_LANGUAGES = ['FR', 'EN'];
const LANGUAGE_WORDS: Record<string, string> = { FR: 'FRENCH', EN: 'ENGLISH' };
const LANGUAGE_FILTER = new RegExp(
  `\\[(${[...CATALOG_LANGUAGES, 'MULTISUB'].join('|')})\\]|\\b(${CATALOG_LANGUAGES.map((l) => LANGUAGE_WORDS[l] ?? l).join('|')})\\b`,
  'i',
);
export const isCatalogLanguage = (categoryName: string) => LANGUAGE_FILTER.test(categoryName);

const CACHE_VERSION = 4; // 3: French & English categories only; 4: + MULTISUB, category names
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 10_000;
/** localStorage (web) is far too small for the list: memory only there. */
const PERSIST = Platform.OS !== 'web';
const CONCURRENCY = 3;
/** Publish partial results at most this often while downloading. */
const PUBLISH_EVERY_MS = 1000;
const RECENTLY_ADDED_COUNT = 100;

export interface CatalogItem {
  id: string;
  name: string;
  icon: string;
  /** Movies: file extension. Shows: ''. */
  ext: string;
  categoryId: string;
  /** Unix time the provider added the title (shows: last updated), 0 if unknown. */
  added: number;
  year?: string;
  rating?: string;
  /** Lower-cased, accent-free name, for search. */
  key: string;
}
/** @deprecated name kept for the movie screens */
export type CatalogMovie = CatalogItem;

/** On disk: one tuple per title, keys omitted to keep the files small. */
type CachedItem = [string, string, string, string, string, number, string, string];
interface CacheMeta { v: number; account: string; fetchedAt: number; chunks: number; categoryNames?: Record<string, string> }

export interface CatalogState {
  movies: CatalogItem[] | null;
  /** Names of the downloaded categories, by id (language badges). */
  categoryNames: Record<string, string>;
  /** Account the list belongs to (packages can differ between lines). */
  account: string | null;
  fetchedAt: number;
  loading: boolean;
  /** Download progress, in categories. */
  doneCategories: number;
  totalCategories: number;
  /** Categories that could not be downloaded in the last load. */
  failedCategories: number;
  error: string | null;
  /** Load the list (memory → disk cache → network). force: download again. */
  load: (force?: boolean) => Promise<void>;
}

const NON_ASCII = /[^\u0000-\u007f]/;
const DIACRITICS = /[̀-ͯ]/g;

/** Lower-case and strip accents ("Amélie" → "amelie"). Normalization only runs on non-ASCII text. */
export function searchKey(s: string): string {
  const lower = s.toLowerCase();
  if (!NON_ASCII.test(lower) || typeof lower.normalize !== 'function') return lower;
  return lower.normalize('NFD').replace(DIACRITICS, '');
}

function fromApiMovie(m: ApiVodStream): CatalogItem {
  const name = String(m.name ?? '');
  return {
    id: String(m.stream_id),
    name,
    icon: m.stream_icon ?? '',
    ext: m.container_extension || 'mp4',
    categoryId: String(m.category_id ?? ''),
    added: Number(m.added) || 0,
    year: m.year || undefined,
    rating: m.rating || undefined,
    key: searchKey(name),
  };
}

function fromApiSeries(m: ApiSeries): CatalogItem {
  const name = String(m.name ?? '');
  const date = m.releaseDate || m.release_date || '';
  return {
    id: String(m.series_id),
    name,
    icon: m.cover ?? '',
    ext: '',
    categoryId: String(m.category_id ?? ''),
    added: Number(m.last_modified) || 0,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
    rating: m.rating && m.rating !== '0' ? m.rating : undefined,
    key: searchKey(name),
  };
}

function fromCache(t: CachedItem): CatalogItem {
  const [id, name, icon, ext, categoryId, added, year, rating] = t;
  return { id, name, icon, ext, categoryId, added, year: year || undefined, rating: rating || undefined, key: searchKey(name) };
}

function toCache(m: CatalogItem): CachedItem {
  return [m.id, m.name, m.icon, m.ext, m.categoryId, m.added, m.year ?? '', m.rating ?? ''];
}

const currentAccount = () => useAuthStore.getState().username;
const isFresh = (fetchedAt: number) => Date.now() - fetchedAt < CACHE_TTL_MS;

interface KindConfig {
  cachePrefix: string;
  /** One category's titles, already reduced to the compact form. */
  fetchCategory: (categoryId: string) => Promise<{ id: string; item: () => CatalogItem }[]>;
  errorMessage: string;
}

const KINDS: Record<CatalogKind, KindConfig> = {
  vod: {
    cachePrefix: 'vod_catalog',
    fetchCategory: async (id) =>
      (await fetchVodCategoryRaw(id)).map((m) => ({ id: String(m.stream_id), item: () => fromApiMovie(m) })),
    errorMessage: 'Failed to load the movie list',
  },
  series: {
    cachePrefix: 'series_catalog',
    fetchCategory: async (id) =>
      (await fetchSeriesCategoryRaw(id)).map((m) => ({ id: String(m.series_id), item: () => fromApiSeries(m) })),
    errorMessage: 'Failed to load the series list',
  },
};

async function readCache(cfg: KindConfig, account: string): Promise<{ movies: CatalogItem[]; fetchedAt: number; categoryNames: Record<string, string> } | null> {
  if (!PERSIST) return null;
  const meta = await loadJSON<CacheMeta | null>(`${cfg.cachePrefix}_meta`, null);
  if (!meta || meta.v !== CACHE_VERSION || meta.account !== account || !isFresh(meta.fetchedAt)) return null;
  const movies: CatalogItem[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = await loadJSON<CachedItem[] | null>(`${cfg.cachePrefix}_${i}`, null);
    if (!Array.isArray(chunk)) return null; // incomplete cache: download again
    for (const t of chunk) movies.push(fromCache(t));
  }
  return { movies, fetchedAt: meta.fetchedAt, categoryNames: meta.categoryNames ?? {} };
}

async function writeCache(cfg: KindConfig, account: string, fetchedAt: number, movies: CatalogItem[], categoryNames: Record<string, string>): Promise<void> {
  if (!PERSIST) return;
  const chunks = Math.ceil(movies.length / CHUNK_SIZE);
  for (let i = 0; i < chunks; i++) {
    await saveJSON(`${cfg.cachePrefix}_${i}`, movies.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map(toCache));
  }
  // Meta last: a cache interrupted midway is never considered complete.
  await saveJSON(`${cfg.cachePrefix}_meta`, { v: CACHE_VERSION, account, fetchedAt, chunks, categoryNames } satisfies CacheMeta);
}

/** One category, retried once after a pause (providers throttle bursts). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

function createCatalogStore(kind: CatalogKind) {
  const cfg = KINDS[kind];
  let inflight: Promise<void> | null = null;

  return create<CatalogState>((set, get) => ({
    movies: null,
    categoryNames: {},
    account: null,
    fetchedAt: 0,
    loading: false,
    doneCategories: 0,
    totalCategories: 0,
    failedCategories: 0,
    error: null,

    load: (force = false) => {
      if (inflight) return inflight;
      inflight = (async () => {
        const account = currentAccount();
        const s = get();
        if (!force && s.movies && s.account === account && isFresh(s.fetchedAt)) return;

        set({ loading: true, error: null, failedCategories: 0, doneCategories: 0, totalCategories: 0 });
        try {
          if (!force) {
            const cached = await readCache(cfg, account);
            if (cached) {
              set({ movies: cached.movies, categoryNames: cached.categoryNames, account, fetchedAt: cached.fetchedAt });
              return;
            }
          }

          const allCategories = await fetchCategories(kind);
          const wanted = allCategories.filter((c) => isCatalogLanguage(c.name));
          const categories = wanted.length > 0 ? wanted : allCategories;
          const categoryNames = Object.fromEntries(categories.map((c) => [c.id, c.name]));
          set({ totalCategories: categories.length });
          // A refresh keeps showing the current list until the new one is complete; a first load
          // (or another account's list) is replaced by progressive partial results.
          const progressive = !(s.movies && s.account === account);
          if (progressive) set({ movies: null, categoryNames });

          const acc: CatalogItem[] = [];
          const seen = new Set<string>();
          let failed = 0;
          let done = 0;
          let lastPublish = 0;
          const publish = (final: boolean) => {
            const now = Date.now();
            if (!final && now - lastPublish < PUBLISH_EVERY_MS) return;
            lastPublish = now;
            if (final || progressive) set({ movies: acc.slice(), categoryNames, account });
            set({ doneCategories: done, failedCategories: failed });
          };

          // CONCURRENCY workers pull categories from a shared queue.
          let next = 0;
          const worker = async () => {
            while (next < categories.length) {
              const category = categories[next++];
              try {
                const raw = await withRetry(() => cfg.fetchCategory(category.id));
                for (const r of raw) {
                  if (seen.has(r.id)) continue;
                  seen.add(r.id);
                  acc.push(r.item());
                }
              } catch {
                failed++;
              }
              done++;
              publish(false);
            }
          };
          await Promise.all(Array.from({ length: CONCURRENCY }, worker));

          if (currentAccount() !== account) return; // account switched meanwhile: discard
          const fetchedAt = Date.now();
          publish(true);
          set({ fetchedAt: failed > 0 ? 0 : fetchedAt }); // incomplete: retried on next open
          if (failed === 0) writeCache(cfg, account, fetchedAt, acc, categoryNames).catch(() => {});
        } catch (err) {
          set({ error: describeError(err, cfg.errorMessage) });
        } finally {
          set({ loading: false });
        }
      })().finally(() => { inflight = null; });
      return inflight;
    },
  }));
}

export const useMovieCatalog = createCatalogStore('vod');
export const useSeriesCatalog = createCatalogStore('series');
/** @deprecated name kept for the movie screens */
export const useCatalogStore = useMovieCatalog;
export const catalogStoreFor = (kind: CatalogKind) => (kind === 'series' ? useSeriesCatalog : useMovieCatalog);

// Most recently added titles, shown before any search; computed once per loaded list.
const recentCache = new WeakMap<CatalogItem[], CatalogItem[]>();
function recentlyAdded(movies: CatalogItem[]): CatalogItem[] {
  let recent = recentCache.get(movies);
  if (!recent) {
    recent = [...movies].sort((a, b) => b.added - a.added).slice(0, RECENTLY_ADDED_COUNT);
    recentCache.set(movies, recent);
  }
  return recent;
}

export interface CatalogSearch {
  items: CatalogItem[];
  /** All matches (items is capped at the limit). */
  total: number;
  /** True when no query: items are the most recently added titles. */
  recent: boolean;
}

/** Titles containing every word of the query, in any order; accents and case ignored. */
export function searchCatalog(movies: CatalogItem[], query: string, limit: number): CatalogSearch {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    const items = recentlyAdded(movies);
    return { items, total: items.length, recent: true };
  }
  const items: CatalogItem[] = [];
  let total = 0;
  for (let i = 0; i < movies.length; i++) {
    const key = movies[i].key;
    let match = true;
    for (let w = 0; w < words.length; w++) {
      if (!key.includes(words[w])) { match = false; break; }
    }
    if (match) {
      total++;
      if (items.length < limit) items.push(movies[i]);
    }
  }
  return { items, total, recent: false };
}

export function catalogToStream(m: CatalogItem, kind: CatalogKind = 'vod'): Stream {
  if (kind === 'series') {
    return {
      id: m.id, name: m.name, categoryId: m.categoryId, url: '', streamIcon: m.icon,
      isLive: false, kind: 'series', year: m.year, rating: m.rating,
    };
  }
  return {
    id: m.id,
    name: m.name,
    categoryId: m.categoryId,
    url: vodStreamUrl(m.id, m.ext),
    streamIcon: m.icon,
    isLive: false,
    year: m.year,
    rating: m.rating,
    containerExt: m.ext,
  };
}
