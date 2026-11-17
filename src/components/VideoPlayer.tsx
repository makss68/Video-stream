/**
 * Web video player — HLS.js for live streams, native <video> for VOD (MP4 etc.).
 * Metro resolves this file on web, VideoPlayer.native.tsx on iOS/Android.
 */
import React, { createElement, useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Hls from 'hls.js';
import { toProxyUrl } from '../utils/proxy';

export type PlayerStatus = 'idle' | 'loading' | 'buffering' | 'readyToPlay' | 'error';

/** A subtitle track embedded in the video (native players only). */
export interface SubtitleOption {
  id: string;
  language: string;
  label: string;
}

/** No manifest / first frame within this time → report an error so the screen reloads. */
const CONNECT_TIMEOUT_MS = 20_000;
/** Rebuffering (or a frozen picture) for this long → report a stall. */
const STALL_TIMEOUT_MS = 12_000;
/** Fatal HLS network errors we retry in place before asking for a full reload. */
const MAX_INPLACE_RECOVERIES = 2;

interface Props {
  url: string;
  playing: boolean;
  muted: boolean;
  /** Seek to this absolute timestamp (seconds). Reset to null after onSeeked fires. */
  seekTo?: number | null;
  style?: StyleProp<ViewStyle>;
  onStatusChange?: (status: PlayerStatus, errorMsg?: string) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  onSeeked?: () => void;
  /** Playback reached the end. */
  onEnd?: () => void;
  /** Subtitles: native players only (browsers don't expose the tracks of these files). */
  onSubtitleTracks?: (tracks: SubtitleOption[]) => void;
  subtitleTrackId?: string | null;
  onSubtitleTrackChange?: (id: string | null) => void;
}

/** Returns true if the URL should be decoded via HLS.js */
function isHlsUrl(url: string) {
  return /\/live\//i.test(url) || /\.m3u8/i.test(url);
}


// Custom HLS.js loader: intercepts every request (manifest + segments) and
// routes any http: URL through the proxy so the browser never touches HTTP directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HlsDefaultLoader = Hls.DefaultConfig.loader as any;
class ProxyLoader extends HlsDefaultLoader {
  load(context: any, config: any, callbacks: any): void {
    if (typeof context.url === 'string' && context.url.startsWith('http:')) {
      context = { ...context, url: toProxyUrl(context.url) };
    }
    super.load(context, config, callbacks);
  }
}

export default function VideoPlayer({
  url, playing, muted, seekTo, style,
  onStatusChange, onProgress, onSeeked, onEnd,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const hlsRef = useRef<Hls | null>(null);
  const statusCb = useRef(onStatusChange);
  statusCb.current = onStatusChange;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // ── Initialize player whenever URL changes ────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    onStatusChange?.('loading');

    // ── Watchdogs: connect timeout, rebuffer timeout, frozen-picture detection ──
    let ready = false;
    let failed = false;
    let bufferingSince = 0;
    let lastTime = -1;
    let frozenSince = 0;
    const fail = (msg: string) => {
      if (failed) return;
      failed = true;
      statusCb.current?.('error', msg);
    };
    const connectTimer = setTimeout(() => { if (!ready) fail('Connection timed out'); }, CONNECT_TIMEOUT_MS);
    const markReady = () => {
      ready = true;
      bufferingSince = 0;
      clearTimeout(connectTimer);
      statusCb.current?.('readyToPlay');
    };
    const onWaiting = () => {
      if (!ready || failed) return;
      bufferingSince = bufferingSince || Date.now();
      statusCb.current?.('buffering');
    };
    const onPlaying = () => { if (ready && !failed) markReady(); };
    const watchdog = setInterval(() => {
      if (!ready || failed) return;
      const now = Date.now();
      if (bufferingSince && now - bufferingSince > STALL_TIMEOUT_MS) return fail('Stream stalled');
      // Picture frozen while we think we're playing (no 'waiting' event fired)
      if (playingRef.current && !video.paused && !bufferingSince) {
        if (video.currentTime === lastTime) {
          frozenSince = frozenSince || now;
          if (now - frozenSince > STALL_TIMEOUT_MS) return fail('Stream stalled');
        } else {
          frozenSince = 0;
        }
      } else {
        frozenSince = 0;
      }
      lastTime = video.currentTime;
    }, 2000);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onPlaying);

    const src = toProxyUrl(url);

    if (isHlsUrl(url) && Hls.isSupported()) {
      // Live stream — use HLS.js with ProxyLoader so every request (manifest +
      // segments) is routed via the server-side relay, regardless of what URLs
      // appear inside the manifest itself.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hls = new Hls({ enableWorker: true, loader: ProxyLoader as any });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      let recoveries = 0;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        markReady();
        if (playingRef.current) video.play().catch(() => {});
      });
      hls.on(Hls.Events.FRAG_LOADED, () => { recoveries = 0; });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        const code = data.response?.code;
        // The server answered with an error (blocked / limit reached): retrying
        // in place just hammers it — let the screen back off and reload instead.
        if (code && code >= 400) return fail(`Server error ${code}`);
        if (recoveries < MAX_INPLACE_RECOVERIES) {
          recoveries++;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { onWaiting(); hls.startLoad(); return; }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { onWaiting(); hls.recoverMediaError(); return; }
        }
        fail(data.details || 'Playback error');
      });
    } else if (isHlsUrl(url) && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — native HLS
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        markReady();
        if (playingRef.current) video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', () => fail(video.error?.message ?? 'Playback error'), { once: true });
    } else {
      // VOD — set src directly (MP4, MKV, etc.)
      video.src = src;
      video.addEventListener('loadedmetadata', markReady, { once: true });
      video.addEventListener('canplay', () => {
        if (playingRef.current) video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', () => fail(video.error?.message ?? 'Playback error'), { once: true });
    }

    return () => {
      failed = true; // silence late events from the torn-down player
      clearTimeout(connectTimer);
      clearInterval(watchdog);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onPlaying);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ── Sync play / pause ─────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => {});
    else video.pause();
  }, [playing]);

  // ── Sync mute ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // ── Seek ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (seekTo == null || !videoRef.current) return;
    videoRef.current.currentTime = seekTo;
    onSeeked?.();
  }, [seekTo, onSeeked]);

  // ── End of playback ───────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => onEndRef.current?.();
    video.addEventListener('ended', handler);
    return () => video.removeEventListener('ended', handler);
  }, []);

  // ── Progress reporting ────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onProgress) return;
    const handler = () => onProgress(video.currentTime, isFinite(video.duration) ? video.duration : 0);
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
  }, [onProgress]);

  return (
    <View style={[styles.container, style]}>
      {createElement('video', {
        ref: videoRef,
        style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
        playsInline: true,
        muted,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
