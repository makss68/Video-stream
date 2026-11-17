import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  GestureResponderEvent,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';

// useTVEventHandler may be unavailable on some builds (non-TV bundles, web, etc.)
const _rn = require('react-native') as any;
const useTVEventHandlerSafe: (handler: (evt: any) => void) => void =
  typeof _rn.useTVEventHandler === 'function' ? _rn.useTVEventHandler : () => {};
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useKeepAwake } from 'expo-keep-awake';
import VideoPlayer, { PlayerStatus, SubtitleOption } from '../components/VideoPlayer';
import { EpisodeRef, RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { useStreamStore } from '../store/streamStore';
import { useLibraryStore, RECENT_MIN_WATCH_SECONDS, resumePosition, isFinished } from '../store/libraryStore';
import { episodeCode } from '../api/streams';
import { describeMedia } from '../utils/mediaInfo';
import { languageName, normalizeLanguage } from '../utils/languages';

type Route = RouteProp<RootStackParamList, 'Player'>;

const CONTROLS_TIMEOUT = 4000;
const SKIP_SECONDS = 10;
/** Wait before reload attempt n (ms). Backing off avoids hammering a provider that is throttling us. */
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_RETRIES = RETRY_BACKOFF_MS.length;
/** End of an episode: the next one starts after this countdown. */
const UP_NEXT_SECONDS = 10;

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '--:--';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { stream, streams = [], streamIndex = 0 } = route.params;
  const isVod = !stream.isLive;
  const episode = stream.kind === 'episode' ? stream.episode : undefined;
  /** Series: the episode after this one (the player gets the whole show as its list). */
  const nextEpisode = useMemo<EpisodeRef | null>(() => {
    const n = episode ? streams[streamIndex + 1]?.episode : undefined;
    return n ? { id: n.id, ext: n.ext, season: n.season, episode: n.episode, title: n.title } : null;
  }, [episode, streams, streamIndex]);

  useEffect(() => { useStreamStore.getState().setLastPlayed(stream.id); }, [stream.id]);

  const [status, setStatus] = useState<PlayerStatus>('loading');
  const statusRef = useRef<PlayerStatus>(status);
  statusRef.current = status;
  const [errorMsg, setErrorMsg] = useState('');
  const [isPlaying, setIsPlayingState] = useState(true);
  const setIsPlaying = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setIsPlayingState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      isPlayingRef.current = next;
      return next;
    });
  }, []);
  const [isMuted, setIsMuted] = useState(false);
  useKeepAwake(); // prevent screen sleep while player screen is active
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsVisibleRef = useRef(controlsVisible);
  const isPlayingRef = useRef(true);
  const [retryKey, setRetryKey] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [retryIn, setRetryIn] = useState(0); // seconds until the next automatic reload

  // VOD progress
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  // Movies and episodes: resume where the user stopped last time (or where a reload interrupted
  // playback). Applied on the first readyToPlay of each player instance.
  const resumeAtRef = useRef(isVod ? resumePosition(
    episode ? useLibraryStore.getState().episodeProgress[stream.id] : useLibraryStore.getState().movieProgress[stream.id],
  ) : 0);
  const startedRef = useRef(false);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  useEffect(() => {
    if (!resumeHint) return;
    const t = setTimeout(() => setResumeHint(null), 5000);
    return () => clearTimeout(t);
  }, [resumeHint]);
  const progressBarWidth = useRef(0);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useSharedValue(1);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!isPlayingRef.current) return; // keep controls up while paused
      controlsOpacity.value = withTiming(0, { duration: 300 });
      setControlsVisible(false);
      controlsVisibleRef.current = false;
    }, CONTROLS_TIMEOUT);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    controlsOpacity.value = withTiming(1, { duration: 200 });
    setControlsVisible(true);
    controlsVisibleRef.current = true;
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      controlsOpacity.value = withTiming(0, { duration: 200 });
      setControlsVisible(false);
      controlsVisibleRef.current = false;
    } else {
      showControls();
    }
  }, [controlsVisible, controlsOpacity, showControls]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  // History: a live channel counts as watched after RECENT_MIN_WATCH_SECONDS of actual
  // playback (not while connecting, buffering, paused or in error). Zapping remounts this screen.
  useEffect(() => {
    if (!stream.isLive) return;
    let watched = 0;
    const timer = setInterval(() => {
      if (statusRef.current !== 'readyToPlay' || !isPlayingRef.current) return;
      watched += 1;
      if (watched >= RECENT_MIN_WATCH_SECONDS) {
        clearInterval(timer);
        useLibraryStore.getState().addRecent(stream);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stream]);

  /** Save a movie's or episode's position (null: keep the saved one) and time watched. */
  const saveProgress = useCallback((position: number | null, watched: number) => {
    const lib = useLibraryStore.getState();
    if (episode) lib.saveEpisodeProgress(stream, position, durationRef.current, watched, nextEpisode);
    else lib.saveMovieProgress(stream, position, durationRef.current, watched);
  }, [stream, episode, nextEpisode]);

  // Movies and episodes: save the position every 15 s of playback and on leaving, with the time
  // actually watched (Recently watched lists titles past a minimum). Positions under 30 s aren't
  // saved, so a reconnect or an early exit never overwrites a real resume point.
  useEffect(() => {
    if (stream.isLive) return;
    let watched = 0;
    let sinceSave = 0;
    const flush = () => {
      const at = currentTimeRef.current;
      if (watched === 0 && at < 30) return;
      saveProgress(at >= 30 ? at : null, watched);
      watched = 0;
    };
    const timer = setInterval(() => {
      if (statusRef.current === 'readyToPlay' && isPlayingRef.current) { watched += 1; sinceSave += 1; }
      if (sinceSave >= 15) { sinceSave = 0; flush(); }
    }, 1000);
    return () => { clearInterval(timer); flush(); };
  }, [stream, saveProgress]);

  const clearRetryTimers = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    retryTimer.current = null;
    countdownTimer.current = null;
  }, []);

  useEffect(() => clearRetryTimers, [clearRetryTimers]);

  /** Remount the player (fresh connection). The old one is destroyed first, so the
   *  provider never sees two simultaneous connections on a 1-connection line. */
  const reload = useCallback(() => {
    clearRetryTimers();
    // A movie picks up where the dropped connection left it.
    if (!stream.isLive && currentTimeRef.current > 5) resumeAtRef.current = currentTimeRef.current;
    startedRef.current = false;
    setRetryIn(0);
    setStatus('loading');
    setErrorMsg('');
    setIsPlaying(true);
    setRetryKey((k) => k + 1);
  }, [clearRetryTimers, setIsPlaying]);

  const handleRetryNow = useCallback(() => {
    retryCountRef.current = 0;
    setRetryAttempt(0);
    reload();
  }, [reload]);

  const handleStatusChange = useCallback((s: PlayerStatus, msg?: string) => {
    if (s === 'error') {
      if (retryTimer.current) return; // a reload is already scheduled
      setStatus('error');
      setErrorMsg(msg ?? 'Stream unavailable');
      const attempt = retryCountRef.current + 1;
      retryCountRef.current = attempt;
      setRetryAttempt(attempt);
      if (attempt <= MAX_RETRIES) {
        const delay = RETRY_BACKOFF_MS[attempt - 1];
        setRetryIn(Math.ceil(delay / 1000));
        countdownTimer.current = setInterval(() => setRetryIn((n) => Math.max(0, n - 1)), 1000);
        retryTimer.current = setTimeout(reload, delay);
      }
      return;
    }
    // Ignore stale non-error events while a reload is pending
    if (retryTimer.current) return;
    setStatus(s);
    if (s === 'readyToPlay') {
      retryCountRef.current = 0;
      setRetryAttempt(0);
      if (!startedRef.current) {
        startedRef.current = true;
        const at = resumeAtRef.current;
        if (at > 0) {
          setSeekTo(at);
          setResumeHint(`Resumed at ${formatTime(at)}`);
        }
      }
    }
  }, [reload]);

  const hasPrev = streamIndex > 0;
  const hasNext = streamIndex + 1 < streams.length;

  const goToIndex = useCallback((target: number) => {
    if (target < 0 || target >= streams.length) return;
    (navigation as any).replace('Player', {
      stream: streams[target],
      streams,
      streamIndex: target,
    });
  }, [navigation, streams]);

  // Series: at the end of an episode, the next one starts after a countdown.
  const [ended, setEnded] = useState(false);
  const [upNextIn, setUpNextIn] = useState(0);
  const handleEnd = useCallback(() => { if (nextEpisode) setEnded(true); }, [nextEpisode]);
  useEffect(() => {
    if (!ended) return;
    let left = UP_NEXT_SECONDS;
    setUpNextIn(left);
    const timer = setInterval(() => {
      left -= 1;
      setUpNextIn(left);
      if (left <= 0) { clearInterval(timer); goToIndex(streamIndex + 1); }
    }, 1000);
    return () => clearInterval(timer);
  }, [ended, goToIndex, streamIndex]);
  // Offered during the end credits too.
  const showUpNext = !!nextEpisode && status !== 'error'
    && (ended || (duration > 0 && isFinished({ position: currentTime, duration })));

  // Subtitles embedded in the video. The last choice (a language, or none) is applied to the next
  // videos; until one is made, the player's default applies.
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleOption[]>([]);
  const [subtitleTrackId, setSubtitleTrackId] = useState<string | null | undefined>(undefined);
  const [shownSubtitleId, setShownSubtitleId] = useState<string | null>(null);
  const [subtitleMenuOpen, setSubtitleMenuOpenState] = useState(false);
  const subtitleMenuOpenRef = useRef(false);
  const setSubtitleMenuOpen = useCallback((open: boolean) => {
    subtitleMenuOpenRef.current = open;
    setSubtitleMenuOpenState(open);
  }, []);
  const subtitlePrefApplied = useRef(false);
  const handleSubtitleTracks = useCallback((tracks: SubtitleOption[]) => {
    setSubtitleTracks(tracks);
    if (subtitlePrefApplied.current || tracks.length === 0) return;
    subtitlePrefApplied.current = true;
    const pref = useLibraryStore.getState().subtitleLanguage;
    if (pref === null) setSubtitleTrackId(null);
    else if (pref) {
      const match = tracks.find((t) => normalizeLanguage(t.language) === pref);
      if (match) setSubtitleTrackId(match.id);
    }
  }, []);
  const chooseSubtitle = useCallback((track: SubtitleOption | null) => {
    setSubtitleMenuOpen(false);
    setSubtitleTrackId(track ? track.id : null);
    const language = track ? normalizeLanguage(track.language) : null;
    if (!track || language) useLibraryStore.getState().setSubtitleLanguage(language);
    showControls();
  }, [setSubtitleMenuOpen, showControls]);

  const skipBy = useCallback((delta: number) => {
    setSeekTo(Math.max(0, Math.min(currentTime + delta, duration || Infinity)));
    if (delta < 0) setEnded(false); // rewinding after the end cancels the next-episode countdown
    showControls();
  }, [currentTime, duration, showControls]);

  /** Play/pause button. With the controls hidden, OK only brings them back (no surprise pause). */
  const handlePlayPausePress = useCallback(() => {
    if (Platform.isTV && !controlsVisibleRef.current) { showControls(); return; }
    setIsPlaying((v) => !v);
    showControls();
  }, [setIsPlaying, showControls]);

  // Remote control. Key-up only (eventKeyAction 1) so a press acts once.
  useTVEventHandlerSafe((evt) => {
    if (!Platform.isTV || evt.eventKeyAction !== 1 || subtitleMenuOpenRef.current) return;
    switch (evt.eventType) {
      // Media keys work whether or not the controls are shown
      case 'playPause': setIsPlaying((v) => !v); showControls(); return;
      case 'play': setIsPlaying(true); showControls(); return;
      case 'pause': setIsPlaying(false); showControls(); return;
      case 'fastForward': if (isVod) skipBy(SKIP_SECONDS); return;
      case 'rewind': if (isVod) skipBy(-SKIP_SECONDS); return;
      case 'channelUp': case 'next': goToIndex(streamIndex + 1); return;
      case 'channelDown': case 'previous': goToIndex(streamIndex - 1); return;
      // Arrow down/up → next/prev stream, only when the controls are hidden
      case 'down': if (!controlsVisibleRef.current) goToIndex(streamIndex + 1); return;
      case 'up': if (!controlsVisibleRef.current) goToIndex(streamIndex - 1); return;
    }
  });

  // Web keyboard shortcuts: space/k play-pause, m mute, f fullscreen,
  // ←/→ seek (VOD), ↑/↓ or p/n prev/next channel, Esc back
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); setIsPlaying((v) => !v); break;
        case 'm': setIsMuted((v) => !v); break;
        case 'f': {
          const d = document as any;
          if (d.fullscreenElement) d.exitFullscreen?.();
          else d.documentElement.requestFullscreen?.();
          break;
        }
        case 'ArrowLeft': if (!stream.isLive) skipBy(-SKIP_SECONDS); break;
        case 'ArrowRight': if (!stream.isLive) skipBy(SKIP_SECONDS); break;
        case 'ArrowUp': case 'p': goToIndex(streamIndex - 1); break;
        case 'ArrowDown': case 'n': goToIndex(streamIndex + 1); break;
        case 'Escape': navigation.goBack(); return;
        default: return;
      }
      showControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goToIndex, skipBy, showControls, navigation, streamIndex, stream.isLive, setIsPlaying]);

  const handleProgress = useCallback((ct: number, dur: number) => {
    setCurrentTime(ct);
    setDuration(dur);
    currentTimeRef.current = ct;
    durationRef.current = dur;
  }, []);

  /** Movies and episodes: back to the beginning, and forget the saved position. */
  const handleRestart = useCallback(() => {
    setSeekTo(0);
    resumeAtRef.current = 0;
    setResumeHint(null);
    setEnded(false);
    saveProgress(0, 0);
    showControls();
  }, [saveProgress, showControls]);

  const handleSeekPress = (e: GestureResponderEvent) => {
    if (!duration || !progressBarWidth.current) return;
    const ratio = e.nativeEvent.locationX / progressBarWidth.current;
    setSeekTo(Math.max(0, Math.min(ratio * duration, duration)));
    showControls();
  };

  const animatedControls = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  // Title without the provider's prefixes and tags; episodes: show name, then code and title.
  const info = describeMedia(episode ? episode.series.name : stream.name);
  const subtitleLine = episode
    ? [episodeCode(episode), episode.title].filter(Boolean).join(' · ')
    : [stream.year ?? info.year, stream.rating && parseFloat(stream.rating) > 0 ? `★ ${parseFloat(stream.rating).toFixed(1)}` : '']
      .filter(Boolean).join('  ');
  const trackName = (t: SubtitleOption, i: number) => {
    const lang = languageName(t.language);
    const label = t.label && t.label !== lang ? t.label : '';
    return [lang, label].filter(Boolean).join(' · ') || `Track ${i + 1}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video */}
      <Pressable onPress={toggleControls} style={StyleSheet.absoluteFill} focusable={!Platform.isTV}>
        <VideoPlayer
          key={retryKey}
          url={stream.url}
          playing={isPlaying}
          muted={isMuted}
          seekTo={seekTo}
          style={StyleSheet.absoluteFill}
          onStatusChange={handleStatusChange}
          onProgress={isVod ? handleProgress : undefined}
          onSeeked={() => setSeekTo(null)}
          onEnd={handleEnd}
          onSubtitleTracks={isVod ? handleSubtitleTracks : undefined}
          subtitleTrackId={subtitleTrackId}
          onSubtitleTrackChange={setShownSubtitleId}
        />
      </Pressable>

      {/* Connecting / reconnecting */}
      {(status === 'idle' || status === 'loading') && !ended && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {retryAttempt > 0 ? `Reconnecting… (attempt ${retryAttempt}/${MAX_RETRIES})` : 'Connecting…'}
          </Text>
        </View>
      )}

      {/* Rebuffering mid-stream */}
      {status === 'buffering' && !ended && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={styles.bufferingText}>Buffering…</Text>
        </View>
      )}

      {/* Resumed movie */}
      {resumeHint && status === 'readyToPlay' && (
        <View style={styles.resumeHint} pointerEvents="none">
          <MaterialCommunityIcons name="history" size={16} color={colors.white} />
          <Text style={styles.bufferingText}>{resumeHint}</Text>
        </View>
      )}

      {/* Error: automatic reload with countdown, or manual retry once attempts run out */}
      {status === 'error' && (
        <View style={styles.errorOverlay}>
          <MaterialCommunityIcons name="cctv-off" size={56} color={colors.textMuted} />
          <Text style={styles.errorTitle}>{retryAttempt <= MAX_RETRIES ? 'Connection lost' : 'Unavailable'}</Text>
          <Text style={styles.errorSub}>{errorMsg || 'Could not connect to this stream'}</Text>
          {retryAttempt <= MAX_RETRIES ? (
            <Text style={styles.retryStatus}>
              Reloading in {retryIn}s · attempt {retryAttempt}/{MAX_RETRIES}
            </Text>
          ) : (
            <Text style={styles.retryStatus}>Gave up after {MAX_RETRIES} attempts</Text>
          )}
          <View style={styles.errorActions}>
            <Pressable
              onPress={handleRetryNow}
              hasTVPreferredFocus
              style={({ focused }: any) => [styles.errorBtn, styles.errorBtnPrimary, focused && styles.errorBtnFocused]}
            >
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text style={styles.errorBtnText}>Retry now</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ focused }: any) => [styles.errorBtn, focused && styles.errorBtnFocused]}
            >
              <Text style={styles.errorBtnText}>Back</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Controls overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedControls]} pointerEvents="box-none">

        {/* Top bar */}
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.scrim} pointerEvents="none" />
          <Pressable
            onPress={() => navigation.goBack()}
            onFocus={showControls}
            style={({ focused }: any) => [styles.backBtn, focused && styles.controlBtnFocused]}
            hitSlop={16}
          >
            <Ionicons name="chevron-down" size={24} color={colors.white} />
          </Pressable>
          <View style={styles.streamInfo}>
            <Text style={styles.streamName} numberOfLines={1}>{stream.isLive ? stream.name : info.title}</Text>
            {!stream.isLive && subtitleLine ? (
              <Text style={styles.streamMeta} numberOfLines={1}>{subtitleLine}</Text>
            ) : null}
          </View>
          {stream.isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Bottom bar */}
        <View style={styles.bottomBar} pointerEvents="box-none">
          <View style={styles.scrim} pointerEvents="none" />

          {/* VOD seek bar */}
          {isVod && duration > 0 && (
            <View style={styles.progressSection}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Pressable
                style={styles.progressTrack}
                // Tap-to-seek needs a touch position; on TV, OK here would jump to 0:00.
                focusable={!Platform.isTV}
                onPress={handleSeekPress}
                onLayout={(e) => { progressBarWidth.current = e.nativeEvent.layout.width; }}
              >
                <View style={styles.progressBg} />
                <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
                <View style={[styles.progressThumb, { left: `${progress * 100}%` as any }]} />
              </Pressable>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          )}

          <View style={styles.controls}>
            {streams.length > 1 && (
              <Pressable
                onPress={() => goToIndex(streamIndex - 1)}
                disabled={!hasPrev}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, !hasPrev && styles.controlBtnDisabled, focused && styles.controlBtnFocused]}
              >
                <Ionicons name="play-skip-back" size={22} color={colors.white} />
              </Pressable>
            )}
            {isVod && (
              <Pressable
                onPress={handleRestart}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              >
                <MaterialCommunityIcons name="restart" size={24} color={colors.white} />
              </Pressable>
            )}
            {isVod && (
              <Pressable
                onPress={() => skipBy(-SKIP_SECONDS)}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              >
                <MaterialCommunityIcons name="rewind-10" size={26} color={colors.white} />
              </Pressable>
            )}
            <Pressable
              onPress={handlePlayPausePress}
              onFocus={showControls}
              style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              hasTVPreferredFocus
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color={colors.white} />
            </Pressable>
            {isVod && (
              <Pressable
                onPress={() => skipBy(SKIP_SECONDS)}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              >
                <MaterialCommunityIcons name="fast-forward-10" size={26} color={colors.white} />
              </Pressable>
            )}
            {streams.length > 1 && (
              <Pressable
                onPress={() => goToIndex(streamIndex + 1)}
                disabled={!hasNext}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, !hasNext && styles.controlBtnDisabled, focused && styles.controlBtnFocused]}
              >
                <Ionicons name="play-skip-forward" size={22} color={colors.white} />
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            {streams.length > 1 && !episode && (
              <Text style={styles.timeText}>{streamIndex + 1} / {streams.length}</Text>
            )}
            {subtitleTracks.length > 0 && (
              <Pressable
                onPress={() => setSubtitleMenuOpen(true)}
                onFocus={showControls}
                accessibilityLabel="Subtitles"
                style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              >
                <MaterialCommunityIcons
                  name={shownSubtitleId ? 'closed-caption' : 'closed-caption-outline'}
                  size={24}
                  color={colors.white}
                />
              </Pressable>
            )}
            <Pressable
              onPress={() => { setIsMuted((v) => !v); showControls(); }}
              onFocus={showControls}
              style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
            >
              <Ionicons
                name={isMuted ? 'volume-mute' : 'volume-high'}
                size={22}
                color={colors.white}
              />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Series: next episode, during the end credits and after the end (with a countdown) */}
      {showUpNext && nextEpisode && (
        <Pressable
          onPress={() => goToIndex(streamIndex + 1)}
          hasTVPreferredFocus
          style={({ focused }: any) => [styles.upNext, focused && styles.upNextFocused]}
        >
          <Ionicons name="play" size={18} color={colors.white} />
          <View>
            <Text style={styles.upNextTitle}>
              Next episode{ended ? ` in ${upNextIn}s` : ''}
            </Text>
            <Text style={styles.upNextSub} numberOfLines={1}>
              {[episodeCode(nextEpisode), nextEpisode.title].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Subtitle choice (Back closes it) */}
      <Modal visible={subtitleMenuOpen} transparent animationType="fade" onRequestClose={() => setSubtitleMenuOpen(false)}>
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} focusable={false} onPress={() => setSubtitleMenuOpen(false)} />
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Subtitles</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[null, ...subtitleTracks].map((t, i) => {
                const active = t ? t.id === shownSubtitleId : !shownSubtitleId;
                return (
                  <Pressable
                    key={t ? t.id : 'off'}
                    onPress={() => chooseSubtitle(t)}
                    hasTVPreferredFocus={active}
                    style={({ focused }: any) => [styles.menuRow, focused && styles.menuRowFocused]}
                  >
                    <Text style={[styles.menuRowText, active && styles.menuRowActive]} numberOfLines={1}>
                      {t ? trackName(t, i - 1) : 'Off'}
                    </Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textSecondary },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  bufferingOverlay: {
    position: 'absolute', top: spacing.xl, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  bufferingText: { ...typography.caption, color: colors.white, fontWeight: '600' },
  resumeHint: {
    position: 'absolute', top: 96, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  errorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  errorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  errorBtnPrimary: { backgroundColor: colors.primary },
  errorBtnFocused: { borderWidth: 2, borderColor: colors.white },
  errorBtnText: { ...typography.body, color: colors.white, fontWeight: '600' },
  errorTitle: { ...typography.h2, color: colors.text },
  errorSub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  retryStatus: { ...typography.body, color: colors.textMuted },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: spacing.xl, paddingBottom: spacing.lg, paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: spacing.xxl, paddingTop: spacing.sm, paddingHorizontal: spacing.md,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  streamInfo: { flex: 1 },
  streamName: { ...typography.h3, color: colors.white },
  streamMeta: { ...typography.caption, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  liveText: { ...typography.caption, color: colors.white, fontWeight: '800', letterSpacing: 1 },
  progressSection: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xs, marginBottom: spacing.sm,
  },
  timeText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', minWidth: 40, textAlign: 'center' },
  progressTrack: {
    flex: 1, height: 20, justifyContent: 'center',
  },
  progressBg: {
    position: 'absolute', left: 0, right: 0,
    height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    position: 'absolute', left: 0,
    height: 3, borderRadius: 2,
    backgroundColor: colors.primary,
  },
  progressThumb: {
    position: 'absolute',
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.white,
    marginLeft: -6, top: 4,
  },
  upNext: {
    position: 'absolute', right: spacing.xl, bottom: 140,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(20,20,30,0.92)', borderRadius: radius.md,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: 420,
  },
  upNextFocused: { borderColor: colors.white, backgroundColor: colors.primary },
  upNextTitle: { ...typography.body, color: colors.white, fontWeight: '700' },
  upNextSub: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'flex-end', padding: spacing.xl },
  menu: {
    width: 320, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.sm, marginBottom: 80,
  },
  menuTitle: { ...typography.h3, color: colors.text, padding: spacing.sm },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm,
  },
  menuRowFocused: { backgroundColor: 'rgba(255,255,255,0.12)' },
  menuRowText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  menuRowActive: { color: colors.text, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  controlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  controlBtnDisabled: { opacity: 0.3 },
  controlBtnFocused: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 22 },
});
