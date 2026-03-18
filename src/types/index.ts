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

// ─── Internal app types ───────────────────────────────────────────────────────

export type StreamType = 'live' | 'vod';

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
}

export type RootStackParamList = {
  Login: undefined;
  StreamType: undefined;
  Categories: { type: StreamType };
  Streams: { categoryId: string; categoryName: string; type: StreamType };
  Player: { stream: Stream };
};
