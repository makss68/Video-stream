import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';
import { useStreamStore } from '../store/streamStore';
import { RootStackParamList, StreamType } from '../types';
import { colors, spacing, radius, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'StreamType'>;

interface TypeCard {
  type: StreamType;
  label: string;
  subtitle: string;
  icon: string;
  gradient: [string, string];
  accentColor: string;
}

const CARDS: TypeCard[] = [
  {
    type: 'live',
    label: 'Live TV',
    subtitle: 'Live channels & streams',
    icon: 'television-play',
    gradient: ['#1E3A5F', '#0A1628'],
    accentColor: colors.primary,
  },
  {
    type: 'vod',
    label: 'Movies & Series',
    subtitle: 'On-demand content',
    icon: 'filmstrip',
    gradient: ['#2A1A3A', '#100A20'],
    accentColor: colors.accent,
  },
];

export default function StreamTypeScreen() {
  const navigation = useNavigation<Nav>();
  const { username, url, logout } = useAuthStore();
  const { clearAll } = useStreamStore();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSelect = (type: StreamType) => {
    navigation.navigate('Categories', { type });
  };

  const handleLogout = () => {
    clearAll();
    logout();
  };

  // Strip protocol for display
  const serverDisplay = url.replace(/^https?:\/\//, '');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoIcon}>
            <MaterialCommunityIcons name="cctv" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.greeting}>Signed in as</Text>
            <Text style={styles.username}>{username}</Text>
          </View>
        </View>
        <Pressable onPress={handleLogout} style={styles.logoutBtn} hitSlop={12}>
          <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Server badge */}
      <View style={styles.serverBadge}>
        <Ionicons name="server-outline" size={12} color={colors.textMuted} />
        <Text style={styles.serverText} numberOfLines={1}>{serverDisplay}</Text>
      </View>

      {/* Title */}
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Text style={styles.title}>What do you{'\n'}want to watch?</Text>
      </Animated.View>

      {/* Type cards */}
      <Animated.View
        style={[styles.cards, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {CARDS.map((card) => (
          <TypeCard key={card.type} card={card} onPress={() => handleSelect(card.type)} />
        ))}
      </Animated.View>
    </SafeAreaView>
  );
}

function TypeCard({ card, onPress }: { card: TypeCard; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, damping: 15 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 15 }).start();

  return (
    <Animated.View style={[styles.cardWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <LinearGradient
          colors={card.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Decorative circles */}
          <View style={[styles.decor1, { backgroundColor: card.accentColor + '18' }]} />
          <View style={[styles.decor2, { backgroundColor: card.accentColor + '0C' }]} />

          <View style={[styles.cardIconBox, { backgroundColor: card.accentColor + '22', borderColor: card.accentColor + '44' }]}>
            <MaterialCommunityIcons name={card.icon as any} size={36} color={card.accentColor} />
          </View>

          <Text style={styles.cardLabel}>{card.label}</Text>
          <Text style={styles.cardSubtitle}>{card.subtitle}</Text>

          <View style={[styles.cardArrow, { backgroundColor: card.accentColor + '22' }]}>
            <Ionicons name="arrow-forward" size={16} color={card.accentColor} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    ...typography.caption,
    color: colors.textMuted,
  },
  username: {
    ...typography.label,
    color: colors.text,
    fontWeight: '600',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignSelf: 'flex-start',
  },
  serverText: {
    ...typography.caption,
    color: colors.textMuted,
    maxWidth: 250,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    lineHeight: 38,
  },
  cards: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  cardWrapper: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  card: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'flex-end',
    minHeight: 180,
    overflow: 'hidden',
  },
  decor1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -40,
    right: -40,
  },
  decor2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    top: 60,
    right: 30,
  },
  cardIconBox: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    ...typography.h2,
    color: colors.white,
    marginBottom: 4,
  },
  cardSubtitle: {
    ...typography.body,
    color: 'rgba(255,255,255,0.55)',
  },
  cardArrow: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
