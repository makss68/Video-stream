import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { validateCredentials } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { colors, spacing, radius, typography } from '../theme';

export default function LoginScreen() {
  const { setAuth, lastUrl } = useAuthStore();

  // Pre-fill server URL from last successful login
  const [serverUrl, setServerUrl] = useState(lastUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const normalizeUrl = (raw: string) => {
    let u = raw.trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u;
  };

  const handleLogin = async () => {
    const url = normalizeUrl(serverUrl);
    if (!url) { setError('Please enter the server URL'); return; }
    if (!username.trim()) { setError('Please enter your username'); return; }
    if (!password.trim()) { setError('Please enter your password'); return; }

    setError('');
    setLoading(true);
    try {
      await validateCredentials(url, username.trim(), password);
      await setAuth({ url, username: username.trim(), password });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0D1B2A', '#0A0A0F', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <View style={styles.bgGrid} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={styles.bgLine} />
        ))}
      </View>

      <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <View style={styles.logoIcon}>
                <MaterialCommunityIcons name="cctv" size={36} color={colors.primary} />
              </View>
              <Text style={styles.appName}>StreamViewer</Text>
              <Text style={styles.appSubtitle}>Secure Stream Access</Text>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Server URL */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Server URL</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="globe-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={serverUrl}
                  onChangeText={(v) => { setServerUrl(v); setError(''); }}
                  placeholder="http://your-server.com:8080"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="next"
                  onSubmitEditing={() => usernameRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Username */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  ref={usernameRef}
                  style={styles.input}
                  value={username}
                  onChangeText={(v) => { setUsername(v); setError(''); }}
                  placeholder="Enter username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(''); }}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!loading}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={12}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>

            {/* Login button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed]}
            >
              <LinearGradient
                colors={loading ? [colors.textMuted, colors.textMuted] : [colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginGradient}
              >
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.loginText}>Connecting…</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.loginText}>Connect</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bgGrid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', opacity: 0.04 },
  bgLine: { width: '8.33%', borderRightWidth: 1, borderColor: colors.primary, height: '100%' },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  logoContainer: { alignItems: 'center', marginBottom: spacing.xl },
  logoIcon: {
    width: 72, height: 72,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  appName: { ...typography.h1, color: colors.text, letterSpacing: -1 },
  appSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  inputGroup: { marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md, height: 50,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.text },
  loginBtn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  loginBtnPressed: { opacity: 0.85 },
  loginGradient: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loginText: { ...typography.body, color: colors.white, fontWeight: '700' },
});
