import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuthStore } from '../store/authStore';
import { RootStackParamList, StreamType } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import { pingServer, PingResult, fetchAccountInfo, AccountInfo } from '../api/auth';
import { useStreamStore } from '../store/streamStore';
import { CREDENTIAL_SETS, isConfigured } from '../config';
import { getMacAddress } from '../utils/mac';
import { restoreTVFocus } from '../utils/tvFocus';

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
  const { username, password, url, servers, accountId, setServer, setAccount } = useAuthStore();
  const { clearAll } = useStreamStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  const [pinging, setPinging] = useState(false);
  const [pings, setPings] = useState<Record<string, PingResult>>({});

  const account = CREDENTIAL_SETS.find((s) => s.id === accountId);

  // Subscription status of the active line (Active / Expired …, expiry, connections)
  const [lineInfo, setLineInfo] = useState<AccountInfo | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setLineInfo(undefined);
    fetchAccountInfo(url, username, password).then((info) => { if (!cancelled) setLineInfo(info); });
    return () => { cancelled = true; };
  }, [url, username, password]);

  const applyServer = (next: string) => {
    if (next === url) return;
    clearAll(); // cached categories/streams belong to the previous server
    setServer(next);
  };

  const handlePickServer = (next: string) => {
    setPickerOpen(false);
    applyServer(next);
  };

  const handlePickAccount = (id: string) => {
    setAccountPickerOpen(false);
    if (id === accountId) return;
    clearAll(); // stream URLs embed the credentials of the previous account
    setPings({}); // ping results were measured with the previous credentials
    setAccount(id);
  };

  /** Ping every server in parallel and switch to the fastest one that accepts the login. */
  const handleFindBest = async () => {
    setPinging(true);
    setPings({});
    const results = await Promise.all(
      servers.map(async (server) => {
        const result = await pingServer(server, username, password);
        setPings((prev) => ({ ...prev, [server]: result }));
        return { server, result };
      }),
    );
    const best = results
      .filter((r) => r.result.ok)
      .sort((a, b) => a.result.ms - b.result.ms)[0];
    setPinging(false);
    if (best) applyServer(best.server);
  };

  const bestServer = Object.entries(pings)
    .filter(([, r]) => r.ok)
    .sort(([, a], [, b]) => a.ms - b.ms)[0]?.[0];

  const [mac, setMac] = useState('');

  useEffect(() => {
    getMacAddress().then(setMac);
  }, []);

  const isTV = Platform.isTV;
  const fadeAnim = useRef(new Animated.Value(isTV ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isTV ? 0 : 20)).current;

  useEffect(() => {
    if (isTV) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  // TV: back on this screen, focus the card that was opened (Android would pick the first badge).
  const cardRefs = useRef<Partial<Record<StreamType, any>>>({});
  const lastOpened = useRef<StreamType>('live');
  useEffect(() => {
    let cancel = () => {};
    const unsub = navigation.addListener('transitionEnd' as any, (e: any) => {
      if (e.data.closing) return;
      cancel();
      cancel = restoreTVFocus(() => cardRefs.current[lastOpened.current]);
    });
    return () => { cancel(); unsub(); };
  }, [navigation]);

  const handleSelect = (type: StreamType) => {
    lastOpened.current = type;
    navigation.navigate('Categories', { type });
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
            <MaterialCommunityIcons name="human" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.greeting}>Signed in as</Text>
            <Text style={styles.username}>{username}</Text>
            <LineStatus info={lineInfo} />
            {mac ? <Text style={styles.mac}>{mac}</Text> : null}
          </View>
        </View>
      </View>

      {/* Account + server badges */}
      <View style={styles.badges}>
        <Pressable
          onPress={() => setAccountPickerOpen(true)}
          style={({ focused }: any) => [styles.badge, focused && styles.badgeFocused]}
        >
          <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.badgeText} numberOfLines={1}>{account?.label ?? username}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ focused }: any) => [styles.badge, focused && styles.badgeFocused]}
        >
          <Ionicons name="server-outline" size={12} color={colors.textMuted} />
          <Text style={styles.badgeText} numberOfLines={1}>{serverDisplay}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal visible={accountPickerOpen} transparent animationType="fade" onRequestClose={() => setAccountPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          {/* Not focusable: on TV the remote's Back button closes the picker. */}
          <Pressable style={StyleSheet.absoluteFill} focusable={false} onPress={() => setAccountPickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose account</Text>
            {CREDENTIAL_SETS.map((set) => {
              const ready = isConfigured(set);
              const active = set.id === accountId;
              return (
                <Pressable
                  key={set.id}
                  onPress={() => handlePickAccount(set.id)}
                  disabled={!ready}
                  hasTVPreferredFocus={active}
                  style={({ focused }: any) => [styles.serverRow, !ready && styles.rowDisabled, focused && styles.serverRowFocused]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.serverRowText, active && styles.serverRowActive]} numberOfLines={1}>
                      {set.label}
                    </Text>
                    <Text style={styles.pingText} numberOfLines={1}>
                      {ready ? set.username : 'Not configured · add it in src/config.ts'}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: spacing.sm }} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          {/* Not focusable: on TV the remote's Back button closes the picker. */}
          <Pressable style={StyleSheet.absoluteFill} focusable={false} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose server</Text>
            <Pressable
              onPress={handleFindBest}
              disabled={pinging}
              style={({ focused }: any) => [styles.findBestBtn, pinging && { opacity: 0.6 }, focused && styles.findBestFocused]}
            >
              {pinging ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="speedometer-outline" size={16} color={colors.white} />
              )}
              <Text style={styles.findBestText}>{pinging ? 'Testing servers…' : 'Find best'}</Text>
            </Pressable>
            {servers.map((server) => (
              <Pressable
                key={server}
                onPress={() => handlePickServer(server)}
                hasTVPreferredFocus={server === url}
                style={({ focused }: any) => [styles.serverRow, focused && styles.serverRowFocused]}
              >
                <Text style={[styles.serverRowText, server === url && styles.serverRowActive]} numberOfLines={1}>
                  {server.replace(/^https?:\/\//, '')}
                </Text>
                {pings[server] && (
                  <Text style={[styles.pingText, pings[server].ok ? (server === bestServer && !pinging ? styles.pingBest : null) : styles.pingFail]}>
                    {pings[server].ok ? `${pings[server].ms} ms` : pings[server].error}
                  </Text>
                )}
                {server === url && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: spacing.sm }} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Title */}
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Text style={styles.title}>What are we watching?</Text>
      </Animated.View>

      {/* Type cards */}
      <Animated.View
        style={[styles.cards, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {CARDS.map((card, i) => (
          <TypeCard
            key={card.type}
            ref={(r: any) => { cardRefs.current[card.type] = r; }}
            card={card}
            onPress={() => handleSelect(card.type)}
            isFirst={i === 0}
          />
        ))}
      </Animated.View>
    </SafeAreaView>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** One line under the user name: subscription status, expiry and connection limit. */
function LineStatus({ info }: { info: AccountInfo | null | undefined }) {
  if (info === undefined) return <Text style={styles.lineStatus}>Checking subscription…</Text>;
  if (info === null) return <Text style={styles.lineStatus}>Subscription status unavailable on this server</Text>;
  const active = info.status === 'Active';
  const parts = [
    active ? 'Active' : info.status,
    info.expiresAt
      ? `${info.expiresAt.getTime() < Date.now() ? 'ended' : 'until'} ${formatDate(info.expiresAt)}`
      : null,
    info.maxConnections ? `${info.maxConnections} screen${info.maxConnections > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  return (
    <Text style={[styles.lineStatus, { color: active ? colors.success : colors.error }]}>
      {parts.join(' · ')}
    </Text>
  );
}

const TypeCard = React.forwardRef<any, { card: TypeCard; onPress: () => void; isFirst?: boolean }>(function TypeCard(
  { card, onPress, isFirst },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      style={({ focused }: any) => [styles.cardWrapper, focused && styles.cardWrapperFocused]}
      onPress={onPress}
      hasTVPreferredFocus={isFirst}
    >
      <LinearGradient
        colors={card.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
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
  );
});

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
  lineStatus: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  mac: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.5,
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
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  badgeFocused: {
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: {
    ...typography.caption,
    color: colors.textMuted,
    maxWidth: 250,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cardBorder,
    padding: spacing.md, gap: spacing.xs,
  },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  serverRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm,
  },
  findBestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: spacing.sm, marginBottom: spacing.xs,
  },
  findBestText: { ...typography.body, color: colors.white, fontWeight: '600' },
  pingText: { ...typography.caption, color: colors.textMuted },
  pingBest: { color: colors.success ?? '#22C55E', fontWeight: '700' },
  pingFail: { color: colors.error },
  serverRowFocused: { backgroundColor: 'rgba(255,255,255,0.12)' },
  findBestFocused: { borderWidth: 2, borderColor: colors.white },
  rowDisabled: { opacity: 0.45 },
  serverRowText: { ...typography.body, color: colors.textSecondary, flex: 1 },
  serverRowActive: { color: colors.text, fontWeight: '600' },
  title: {
    ...typography.h1,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    lineHeight: 38,
  },
  cards: {
    flex: 1,
    flexDirection: Platform.isTV ? 'row' : 'column',
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.isTV ? spacing.xl : 0,
    gap: spacing.md,
  },
  cardWrapper: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardWrapperFocused: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.03 }],
  },
  card: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'flex-end',
    minHeight: 180,
    overflow: 'hidden',
    borderRadius: radius.xl,
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
