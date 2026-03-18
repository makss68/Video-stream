import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useStreamStore } from '../store/streamStore';
import { RootStackParamList, Stream } from '../types';
import { colors, spacing, radius, typography } from '../theme';
import StreamCard from '../components/StreamCard';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Streams'>;
type Route = RouteProp<RootStackParamList, 'Streams'>;

export default function StreamsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { categoryId, categoryName, type } = route.params;

  const { streams, loadingStreams, error, loadStreams, invalidateStreams, clearError } = useStreamStore();
  const [search, setSearch] = useState('');

  const cacheKey = `${type}:${categoryId}`;
  const categoryStreams = streams[cacheKey] ?? [];

  useEffect(() => {
    loadStreams(type, categoryId);
  }, [type, categoryId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return categoryStreams;
    const q = search.toLowerCase();
    return categoryStreams.filter((s) => s.name.toLowerCase().includes(q));
  }, [categoryStreams, search]);

  const handleStreamPress = useCallback(
    (stream: Stream) => navigation.navigate('Player', { stream }),
    [navigation],
  );

  const handleRefresh = useCallback(() => {
    invalidateStreams(type, categoryId);
    loadStreams(type, categoryId);
  }, [type, categoryId, invalidateStreams, loadStreams]);

  const renderItem = useCallback(
    ({ item }: { item: Stream }) => (
      <StreamCard stream={item} onPress={() => handleStreamPress(item)} />
    ),
    [handleStreamPress],
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="videocam-off-outline" size={48} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No {type === 'vod' ? 'titles' : 'streams'} found</Text>
      <Text style={styles.emptySubtitle}>
        {search ? 'Try a different search term' : 'Nothing in this category yet'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{categoryName}</Text>
          <Text style={styles.headerSub}>
            {categoryStreams.length > 0 ? `${categoryStreams.length} ${type === 'vod' ? 'titles' : 'streams'}` : 'Loading…'}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${type === 'vod' ? 'movies & series' : 'streams'}…`}
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Content */}
      {loadingStreams && categoryStreams.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => { clearError(); handleRefresh(); }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={loadingStreams}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.cardBorder,
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.h2, color: colors.text },
  headerSub: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.cardBorder,
    height: 44,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, ...typography.body, color: colors.text },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  retryText: { ...typography.body, color: colors.white, fontWeight: '600' },
  empty: { marginTop: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.textSecondary },
  emptySubtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
