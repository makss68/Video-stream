import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import VideoPlayer, { PlayerStatus } from '../components/VideoPlayer';
import { RootStackParamList } from '../types';
import { colors, spacing, radius, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'Player'>;

const CONTROLS_TIMEOUT = 4000;

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
  const { stream } = route.params;

  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

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
      controlsOpacity.value = withTiming(0, { duration: 300 });
      setControlsVisible(false);
    }, CONTROLS_TIMEOUT);
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    controlsOpacity.value = withTiming(1, { duration: 200 });
    setControlsVisible(true);
    scheduleHide();
  }, [controlsOpacity, scheduleHide]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      controlsOpacity.value = withTiming(0, { duration: 200 });
      setControlsVisible(false);
    } else {
      showControls();
    }
  }, [controlsVisible, controlsOpacity, showControls]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  const handleStatusChange = useCallback((s: PlayerStatus, msg?: string) => {
    setStatus(s);
    if (s === 'error') setErrorMsg(msg ?? 'Stream unavailable');
  }, []);

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

  const handleRetry = () => {
    setStatus('loading');
    setErrorMsg('');
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
    setRetryKey((k) => k + 1);
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

      {/* Loading */}
      {(status === 'idle' || status === 'loading') && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Connecting…</Text>
        </View>
      )}

      {/* Error */}
      {status === 'error' && (
        <View style={styles.errorOverlay}>
          <MaterialCommunityIcons name="cctv-off" size={56} color={colors.textMuted} />
          <Text style={styles.errorTitle}>Unavailable</Text>
          <Text style={styles.errorSub}>{errorMsg || 'Could not connect to this stream'}</Text>
          <Pressable onPress={handleRetry} style={styles.retryBtn}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtnError}>
            <Text style={styles.backBtnErrorText}>Go Back</Text>
          </Pressable>
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
            <Pressable
              onPress={() => { setIsPlaying((v) => !v); showControls(); }}
              style={styles.controlBtn}
              hitSlop={16}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color={colors.white} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => { setIsMuted((v) => !v); showControls(); }}
              style={styles.controlBtn}
              hitSlop={16}
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
  errorTitle: { ...typography.h2, color: colors.text },
  errorSub: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' },
  backBtnError: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  backBtnErrorText: { ...typography.body, color: colors.textMuted },
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
});
