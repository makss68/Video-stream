import React, { useEffect, useRef, useState } from 'react';
import { TouchableHighlight, Text, View, StyleSheet, Animated, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

import { Stream } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { toProxyUrl } from '../utils/proxy';
import { describeMedia, MediaInfo } from '../utils/mediaInfo';

interface Props {
  stream: Stream;
  onPress: () => void;
  /** Long press (hold OK on the remote): toggle favorite. */
  onLongPress?: () => void;
  isFavorite?: boolean;
  /** Movie / show: part already watched (0–1), shown as a bar, and e.g. "42 min left". */
  progress?: number;
  progressLabel?: string;
  /** Provider category of the title: tells its language when the name doesn't. */
  categoryName?: string;
  hasTVPreferredFocus?: boolean;
  /** TV: native view to focus on D-pad up. */
  nextFocusUp?: number;
}

const StreamCard = React.forwardRef<any, Props>(function StreamCard(
  { stream, onPress, onLongPress, isFavorite, progress, progressLabel, categoryName, hasTVPreferredFocus, nextFocusUp },
  ref,
) {
  const media = stream.isLive ? null : describeMedia(stream.name, categoryName);
  const year = stream.year ?? media?.year;
  const [focused, setFocused] = useState(false);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!stream.isLive) return;
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [stream.isLive, blinkAnim]);

  return (
    <TouchableHighlight
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      {...({ nextFocusUp } as any) /* TV prop missing from the TS types */}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
      underlayColor={colors.surface}
      style={[styles.container, focused && styles.containerFocused]}
    >
      <View style={styles.inner}>
        <View style={[styles.stripe, { backgroundColor: stream.isLive ? colors.primary : colors.accent }]} />
        <View style={styles.thumbnail}>
          {stream.streamIcon ? (
            <Image source={{ uri: toProxyUrl(stream.streamIcon) }} style={styles.thumbnailImage} resizeMode="contain" />
          ) : (
            <MaterialCommunityIcons
              name={stream.isLive ? 'television-play' : stream.kind === 'series' ? 'television-classic' : 'filmstrip'}
              size={24}
              color="rgba(255,255,255,0.35)"
            />
          )}
          {stream.isLive && <Animated.View style={[styles.liveDot, { opacity: blinkAnim }]} />}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{media ? media.title : stream.name}</Text>
          {stream.isLive ? (
            <View style={styles.tagsRow}>
              <View style={styles.tagLive}><Text style={styles.tagLiveText}>LIVE</Text></View>
              <Text style={styles.streamId}>#{stream.id}</Text>
            </View>
          ) : (
            <View style={styles.vodMeta}>
              {media && <MediaBadges info={media} />}
              {year && <Text style={styles.vodMetaText}>{year}</Text>}
              {year && (stream.rating || stream.durationStr) && <View style={styles.metaDot} />}
              {stream.rating && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={10} color={colors.warning} />
                  <Text style={styles.vodMetaText}>{parseFloat(stream.rating).toFixed(1)}</Text>
                </View>
              )}
              {stream.durationStr && stream.rating && <View style={styles.metaDot} />}
              {stream.durationStr && <Text style={styles.vodMetaText}>{stream.durationStr}</Text>}
              {progressLabel && <Text style={styles.progressLabel}>{progressLabel}</Text>}
            </View>
          )}
        </View>
        {isFavorite && <Ionicons name="star" size={18} color={colors.warning} style={styles.star} />}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
        {progress != null && progress > 0 && (
          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` as any }]} />
          </View>
        )}
      </View>
    </TouchableHighlight>
  );
});

export default StreamCard;

/** Spoken language, subtitles and quality, as small badges. */
export function MediaBadges({ info }: { info: MediaInfo }) {
  return (
    <>
      {info.audio && (
        <View style={[styles.badge, styles.badgeAudio]}>
          <Ionicons name="volume-high" size={10} color="#93C5FD" />
          <Text style={[styles.badgeText, { color: '#BFDBFE' }]}>{info.audio.toUpperCase()}</Text>
        </View>
      )}
      {info.subs && (
        <View style={[styles.badge, styles.badgeSubs]}>
          <MaterialCommunityIcons name="subtitles-outline" size={10} color="#6EE7B7" />
          <Text style={[styles.badgeText, { color: '#A7F3D0' }]}>{info.subs.toUpperCase()}</Text>
        </View>
      )}
      {info.quality ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{info.quality}</Text></View>
      ) : null}
      {info.cam && (
        <View style={[styles.badge, styles.badgeCam]}><Text style={[styles.badgeText, { color: '#FDE68A' }]}>CAM</Text></View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: colors.card,
  },
  containerFocused: {
    borderColor: colors.primary,
    transform: [{ scale: 1.02 }],
  },
  inner: { flexDirection: 'row', alignItems: 'center' },
  stripe: { width: 3, alignSelf: 'stretch' },
  thumbnail: {
    width: 64, height: 64,
    backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  thumbnailImage: { width: 56, height: 56 },
  liveDot: {
    position: 'absolute', top: 8, right: 8,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: colors.error,
  },
  info: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 5 },
  name: { ...typography.body, color: colors.text, fontWeight: '600', lineHeight: 20 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tagLive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: radius.sm,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tagLiveText: { ...typography.caption, color: colors.error, fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  streamId: { ...typography.caption, color: colors.textMuted },
  vodMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  vodMetaText: { ...typography.caption, color: colors.textMuted },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 4, borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  badgeAudio: { borderColor: 'rgba(59,130,246,0.55)', backgroundColor: 'rgba(59,130,246,0.12)' },
  badgeSubs: { borderColor: 'rgba(16,185,129,0.55)', backgroundColor: 'rgba(16,185,129,0.12)' },
  badgeCam: { borderColor: 'rgba(245,158,11,0.6)', backgroundColor: 'rgba(245,158,11,0.15)' },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted },
  chevron: { paddingRight: spacing.md },
  star: { paddingRight: spacing.sm },
  progressLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  progressTrack: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: { height: 3, backgroundColor: colors.primary },
});
