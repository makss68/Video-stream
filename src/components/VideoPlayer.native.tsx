/**
 * Native video player — uses expo-video.
 * Metro resolves this file on iOS/Android, VideoPlayer.tsx on web.
 */
import React, { useEffect, useRef, useState } from 'react';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';

export type PlayerStatus = 'idle' | 'loading' | 'buffering' | 'readyToPlay' | 'error';

/** A subtitle track embedded in the video. */
export interface SubtitleOption {
  id: string;
  /** e.g. "fr", "en"; may be empty or "und". */
  language: string;
  label: string;
}

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
  /** Playback reached the end. */
  onEnd?: () => void;
  /** Subtitle tracks of the video (reported when known, and again if they change). */
  onSubtitleTracks?: (tracks: SubtitleOption[]) => void;
  /** Subtitle track to show: a track id, null for none, undefined to leave the player's choice. */
  subtitleTrackId?: string | null;
  /** The subtitle track shown changed (null: none). */
  onSubtitleTrackChange?: (id: string | null) => void;
}

export default function VideoPlayer({
  url, playing, muted, seekTo, style,
  onStatusChange, onProgress, onSeeked, onEnd, onSubtitleTracks, subtitleTrackId, onSubtitleTrackChange,
}: Props) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest callbacks, so listeners are attached once per player.
  const cb = useRef({ onEnd, onSubtitleTracks, onSubtitleTrackChange });
  cb.current = { onEnd, onSubtitleTracks, onSubtitleTrackChange };

  // End of playback, subtitle tracks. tracksKnown re-applies the subtitle choice once they are listed.
  const [tracksKnown, setTracksKnown] = useState(0);
  useEffect(() => {
    const emitTracks = (tracks: SubtitleOption[]) =>
      cb.current.onSubtitleTracks?.((tracks ?? []).map((t) => ({ id: t.id, language: t.language ?? '', label: t.label ?? '' })));
    emitTracks(player.availableSubtitleTracks);
    const subs = [
      player.addListener('playToEnd', () => cb.current.onEnd?.()),
      player.addListener('availableSubtitleTracksChange', ({ availableSubtitleTracks }) => {
        emitTracks(availableSubtitleTracks);
        setTracksKnown((n) => n + 1);
      }),
      player.addListener('subtitleTrackChange', ({ subtitleTrack }) => cb.current.onSubtitleTrackChange?.(subtitleTrack?.id ?? null)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [player]);

  // Subtitle choice
  useEffect(() => {
    if (subtitleTrackId === undefined) return;
    try {
      if (subtitleTrackId === null) { player.subtitleTrack = null; return; }
      const track = player.availableSubtitleTracks.find((t) => t.id === subtitleTrackId);
      if (track) player.subtitleTrack = track;
    } catch {
      // released player
    }
  }, [subtitleTrackId, player, tracksKnown]);

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
