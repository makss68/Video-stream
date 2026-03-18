/**
 * Web video player — HLS.js for live streams, native <video> for VOD (MP4 etc.).
 * Metro resolves this file on web, VideoPlayer.native.tsx on iOS/Android.
 */
import React, { createElement, useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Hls from 'hls.js';

export type PlayerStatus = 'idle' | 'loading' | 'readyToPlay' | 'error';

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
}

/** Returns true if the URL should be decoded via HLS.js */
function isHlsUrl(url: string) {
  return /\/live\//i.test(url) || /\.m3u8/i.test(url);
}

export default function VideoPlayer({
  url, playing, muted, seekTo, style,
  onStatusChange, onProgress, onSeeked,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ── Initialize player whenever URL changes ────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    onStatusChange?.('loading');

    if (isHlsUrl(url) && Hls.isSupported()) {
      // Live stream — use HLS.js
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onStatusChange?.('readyToPlay');
        if (playing) video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else onStatusChange?.('error', data.details);
      });
    } else if (isHlsUrl(url) && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — native HLS
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        onStatusChange?.('readyToPlay');
        if (playing) video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', () => {
        onStatusChange?.('error', video.error?.message ?? 'Playback error');
      }, { once: true });
    } else {
      // VOD — set src directly (MP4, MKV, etc.)
      video.src = url;
      video.addEventListener('loadedmetadata', () => onStatusChange?.('readyToPlay'), { once: true });
      video.addEventListener('canplay', () => {
        if (playing) video.play().catch(() => {});
      }, { once: true });
      video.addEventListener('error', () => {
        onStatusChange?.('error', video.error?.message ?? 'Playback error');
      }, { once: true });
    }

    return () => {
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
