/**
 * Native video player — uses expo-video.
 * Metro resolves this file on iOS/Android, VideoPlayer.tsx on web.
 */
import React, { useEffect, useRef } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';

export type PlayerStatus = 'idle' | 'loading' | 'buffering' | 'readyToPlay' | 'error';

/** Stuck in 'loading' (initial connect or rebuffer) this long → report an error so the screen reloads. */
const LOADING_TIMEOUT_MS = 20_000;

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

export default function VideoPlayer({
  url, playing, muted, seekTo, style,
  onStatusChange, onProgress, onSeeked,
}: Props) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Status changes
  useEffect(() => {
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;
    let wasReady = false;
    const clear = () => { if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; } };
    const sub = player.addListener('statusChange', ({ status, error }) => {
      clear();
      if (status === 'readyToPlay') wasReady = true;
      if (status === 'loading') {
        // After the first frame, 'loading' means rebuffering.
        onStatusChange?.(wasReady ? 'buffering' : 'loading');
        loadingTimer = setTimeout(() => onStatusChange?.('error', 'Stream stalled'), LOADING_TIMEOUT_MS);
        return;
      }
      onStatusChange?.(status as PlayerStatus, error?.message);
    });
    return () => { clear(); sub.remove(); };
  }, [player, onStatusChange]);

  // Play / pause
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  // Mute
  useEffect(() => { player.muted = muted; }, [muted, player]);

  // Seek
  useEffect(() => {
    if (seekTo == null) return;
    player.seekBy(seekTo - player.currentTime);
    onSeeked?.();
  }, [seekTo]);

  // Progress polling (expo-video has no timeupdate event)
  useEffect(() => {
    if (!onProgress) return;
    progressTimer.current = setInterval(() => {
      onProgress(player.currentTime ?? 0, player.duration ?? 0);
    }, 500);
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [player, onProgress]);

  return (
    <VideoView
      player={player}
      style={style ?? styles.video}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

const styles = StyleSheet.create({ video: { flex: 1 } });
