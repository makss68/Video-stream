/**
 * Native video player — uses expo-video.
 * Metro resolves this file on iOS/Android, VideoPlayer.tsx on web.
 */
import React, { useEffect, useRef } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';

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

export default function VideoPlayer({
  url, playing, muted, seekTo, style,
  onStatusChange, onProgress, onSeeked,
}: Props) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Status changes
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      onStatusChange?.(status as PlayerStatus, error?.message);
    });
    return () => sub.remove();
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
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}

const styles = StyleSheet.create({ video: { flex: 1 } });
