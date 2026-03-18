import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View, StyleSheet, Animated as RNAnimated, Image } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Stream } from '../types';
import { colors, spacing, radius, typography } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  stream: Stream;
  onPress: () => void;
}

export default function StreamCard({ stream, onPress }: Props) {
  const scale = useSharedValue(1);
  const blinkAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    if (!stream.isLive) return;
    const blink = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(blinkAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(blinkAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [stream.isLive, blinkAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.container, animatedStyle]}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      onPress={onPress}
    >
      <View style={[styles.stripe, { backgroundColor: stream.isLive ? colors.primary : colors.accent }]} />

      {/* Thumbnail */}
      <View style={styles.thumbnail}>
        {stream.streamIcon ? (
          <Image source={{ uri: stream.streamIcon }} style={styles.thumbnailImage} resizeMode="contain" />
        ) : (
          <MaterialCommunityIcons
            name={stream.isLive ? 'television-play' : 'filmstrip'}
            size={24}
            color="rgba(255,255,255,0.35)"
          />
        )}
        {stream.isLive && (
          <RNAnimated.View style={[styles.liveDot, { opacity: blinkAnim }]} />
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{stream.name}</Text>

        {stream.isLive ? (
          <View style={styles.tagsRow}>
            <View style={styles.tagLive}>
              <Text style={styles.tagLiveText}>LIVE</Text>
            </View>
            <Text style={styles.streamId}>#{stream.id}</Text>
          </View>
        ) : (
          <View style={styles.vodMeta}>
            {stream.year && <Text style={styles.vodMetaText}>{stream.year}</Text>}
            {stream.year && (stream.rating || stream.durationStr) && (
              <View style={styles.metaDot} />
            )}
            {stream.rating && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={10} color={colors.warning} />
                <Text style={styles.vodMetaText}>{parseFloat(stream.rating).toFixed(1)}</Text>
              </View>
            )}
            {stream.durationStr && stream.rating && <View style={styles.metaDot} />}
            {stream.durationStr && (
              <Text style={styles.vodMetaText}>{stream.durationStr}</Text>
            )}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  stripe: { width: 3, alignSelf: 'stretch' },
  thumbnail: {
    width: 64, height: 64,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tagLiveText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  streamId: { ...typography.caption, color: colors.textMuted },
  vodMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  vodMetaText: { ...typography.caption, color: colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: colors.textMuted,
  },
  chevron: { paddingRight: spacing.md },
});
