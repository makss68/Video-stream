import React, { useEffect, useRef, useState } from 'react';
import { TouchableHighlight, Text, View, StyleSheet, Animated, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

import { Stream } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { toProxyUrl } from '../utils/proxy';

interface Props {
  stream: Stream;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

const StreamCard = React.forwardRef<any, Props>(function StreamCard(
  { stream, onPress, hasTVPreferredFocus },
  ref,
) {
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
              name={stream.isLive ? 'television-play' : 'filmstrip'}
              size={24}
              color="rgba(255,255,255,0.35)"
            />
          )}
          {stream.isLive && <Animated.View style={[styles.liveDot, { opacity: blinkAnim }]} />}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{stream.name}</Text>
          {stream.isLive ? (
            <View style={styles.tagsRow}>
              <View style={styles.tagLive}><Text style={styles.tagLiveText}>LIVE</Text></View>
              <Text style={styles.streamId}>#{stream.id}</Text>
            </View>
          ) : (
            <View style={styles.vodMeta}>
              {stream.year && <Text style={styles.vodMetaText}>{stream.year}</Text>}
              {stream.year && (stream.rating || stream.durationStr) && <View style={styles.metaDot} />}
              {stream.rating && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={10} color={colors.warning} />
                  <Text style={styles.vodMetaText}>{parseFloat(stream.rating).toFixed(1)}</Text>
                </View>
              )}
              {stream.durationStr && stream.rating && <View style={styles.metaDot} />}
              {stream.durationStr && <Text style={styles.vodMetaText}>{stream.durationStr}</Text>}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
      </View>
    </TouchableHighlight>
  );
});

export default StreamCard;

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
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted },
  chevron: { paddingRight: spacing.md },
});
