import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  GestureResponderEvent,
  Platform,
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
import VideoPlayer, { PlayerStatus } from '../components/VideoPlayer';
import { RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'Player'>;

const CONTROLS_TIMEOUT = 4000;
const SKIP_SECONDS = 10;
/** Wait before reload attempt n (ms). Backing off avoids hammering a provider that is throttling us. */
const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const MAX_RETRIES = RETRY_BACKOFF_MS.length;

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

  const [status, setStatus] = useState<PlayerStatus>('loading');
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

  const skipBy = useCallback((delta: number) => {
    setSeekTo(Math.max(0, Math.min(currentTime + delta, duration || Infinity)));
    showControls();
  }, [currentTime, duration, showControls]);

  // Arrow down/up → next/prev stream (only when controls are hidden)
  useTVEventHandlerSafe((evt) => {
    if (!Platform.isTV) return;
    if (evt.eventKeyAction !== 1 || controlsVisibleRef.current) return;
    if (evt.eventType === 'down') goToIndex(streamIndex + 1);
    else if (evt.eventType === 'up') goToIndex(streamIndex - 1);
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
  }, []);

  const handleSeekPress = (e: GestureResponderEvent) => {
    if (!duration || !progressBarWidth.current) return;
    const ratio = e.nativeEvent.locationX / progressBarWidth.current;
    setSeekTo(Math.max(0, Math.min(ratio * duration, duration)));
    showControls();
  };

  const animatedControls = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const isVod = !stream.isLive;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video */}
      <Pressable onPress={toggleControls} style={StyleSheet.absoluteFill}>
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
        />
      </Pressable>

      {/* Connecting / reconnecting */}
      {(status === 'idle' || status === 'loading') && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {retryAttempt > 0 ? `Reconnecting… (attempt ${retryAttempt}/${MAX_RETRIES})` : 'Connecting…'}
          </Text>
        </View>
      )}

      {/* Rebuffering mid-stream */}
      {status === 'buffering' && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={styles.bufferingText}>Buffering…</Text>
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
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={16}>
            <Ionicons name="chevron-down" size={24} color={colors.white} />
          </Pressable>
          <View style={styles.streamInfo}>
            <Text style={styles.streamName} numberOfLines={1}>{stream.name}</Text>
            {stream.year && (
              <Text style={styles.streamMeta}>{stream.year}{stream.rating ? `  ★ ${parseFloat(stream.rating).toFixed(1)}` : ''}</Text>
            )}
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
                onPress={() => skipBy(-SKIP_SECONDS)}
                onFocus={showControls}
                style={({ focused }: any) => [styles.controlBtn, focused && styles.controlBtnFocused]}
              >
                <MaterialCommunityIcons name="rewind-10" size={26} color={colors.white} />
              </Pressable>
            )}
            <Pressable
              onPress={() => { setIsPlaying((v) => !v); showControls(); }}
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
            {streams.length > 1 && (
              <Text style={styles.timeText}>{streamIndex + 1} / {streams.length}</Text>
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
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  controlBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  controlBtnDisabled: { opacity: 0.3 },
  controlBtnFocused: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 22 },
});
