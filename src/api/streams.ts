import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { ApiCategory, ApiStream, ApiVodStream, Category, Stream, StreamType } from '../types';

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
  if (type === 'vod') {
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

function mapLiveStream(apiStream: ApiStream): Stream {
  const { url, username, password } = useAuthStore.getState();
  return {
    id: String(apiStream.stream_id),
    name: apiStream.name,
    categoryId: apiStream.category_id,
    url: `${url}/live/${username}/${password}/${apiStream.stream_id}.${LIVE_EXT}`,
    streamIcon: apiStream.stream_icon ?? '',
    isLive: true,
  };
}

function mapVodStream(apiStream: ApiVodStream): Stream {
  const { url, username, password } = useAuthStore.getState();
  return {
    id: String(apiStream.stream_id),
    name: apiStream.name,
    categoryId: apiStream.category_id,
    url: `${url}/movie/${username}/${password}/${apiStream.stream_id}.${apiStream.container_extension}`,
    streamIcon: apiStream.stream_icon ?? '',
    isLive: false,
    rating: apiStream.rating || undefined,
    year: apiStream.year || undefined,
    durationStr: apiStream.duration || undefined,
    plot: apiStream.plot || undefined,
  };
}

// ─── API calls ────────────────────────────────────────────────────────────────
function buildApiUrl(action: string, extra?: Record<string, string>) {
  const { url, username, password } = useAuthStore.getState();
  return {
    url: `${url}/player_api.php`,
    params: { username, password, action, ...extra },
  };
}

export async function fetchCategories(type: StreamType): Promise<Category[]> {
  const action = type === 'live' ? 'get_live_categories' : 'get_vod_categories';
  const { url, params } = buildApiUrl(action);
  const { data } = await axios.get<ApiCategory[]>(url, { params, timeout: 10_000 });
  return data.map((c, i) => mapCategory(c, i, type));
}

export async function fetchStreamsByCategory(type: StreamType, categoryId: string): Promise<Stream[]> {
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
