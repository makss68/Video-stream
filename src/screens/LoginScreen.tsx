import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableHighlight,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  ScrollView,
  findNodeHandle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { validateCredentials } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { colors, spacing, radius, typography } from '../theme';

const isTV = Platform.isTV;

// ─────────────────────────────────────────────────────────────────────────────
// On Android TV / Fire TV, bare TextInput is NOT navigable via D-pad.
// Pattern: TouchableHighlight wrapper (focusable by D-pad) calls
// inputRef.focus() on OK press. nextFocusDown/Up wired via findNodeHandle
// so the D-pad chain is fully explicit and not proximity-based.
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { setAuth, lastUrl } = useAuthStore();

  const [serverUrl, setServerUrl] = useState(lastUrl || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null); // used only for phone form focus style

  // Apply focus/blur styles directly via setNativeProps — more reliable than
  // state-driven re-render on Android TV where timing can cause misses.
  const applyFocus = (ref: React.RefObject<any>) => {
    ref.current?.setNativeProps({
      style: { borderColor: '#FFFFFF', borderWidth: 3, backgroundColor: 'rgba(59,130,246,0.15)' },
    });
  };
  const applyBlur = (ref: React.RefObject<any>) => {
    ref.current?.setNativeProps({
      style: { borderColor: '#2D2D3D', borderWidth: 1, backgroundColor: '#1C1C28' },
    });
  };

  // Skip entrance animation on TV — opacity:0 makes elements invisible to focus system
  const fadeAnim = useRef(new Animated.Value(isTV ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isTV ? 0 : 30)).current;

  // TextInput refs (for programmatic .focus() to open keyboard)
  const urlInputRef = useRef<TextInput>(null);
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // TV wrapper refs (TouchableHighlight — the actual D-pad focusable nodes)
  const urlWrapperRef = useRef<any>(null);
  const usernameWrapperRef = useRef<any>(null);
  const passwordWrapperRef = useRef<any>(null);
  const loginWrapperRef = useRef<any>(null);

  useEffect(() => {
    if (!isTV) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
      return;
    }

    // Wire D-pad focus chain after layout so all native views exist
    requestAnimationFrame(() => {
      const urlId = findNodeHandle(urlWrapperRef.current);
      const usernameId = findNodeHandle(usernameWrapperRef.current);
      const passwordId = findNodeHandle(passwordWrapperRef.current);
      const loginId = findNodeHandle(loginWrapperRef.current);

      urlWrapperRef.current?.setNativeProps({ nextFocusDown: usernameId });
      usernameWrapperRef.current?.setNativeProps({ nextFocusUp: urlId, nextFocusDown: passwordId });
      passwordWrapperRef.current?.setNativeProps({ nextFocusUp: usernameId, nextFocusDown: loginId });
      loginWrapperRef.current?.setNativeProps({ nextFocusUp: passwordId });
    });
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

  // ── TV form ───────────────────────────────────────────────────────────────
  const tvForm = (
    <View style={styles.tvContainer}>
      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        <Text style={styles.appName}>StreamViewer</Text>
        <Text style={styles.appSubtitle}>Secure Stream Access</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Server URL */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Server URL</Text>
          <TouchableHighlight
            ref={urlWrapperRef}
            {...({ hasTVPreferredFocus: true } as any)}
            onPress={() => urlInputRef.current?.focus()}
            onFocus={() => { setFocusedField('url'); applyFocus(urlWrapperRef); }}
            onBlur={() => { setFocusedField(null); applyBlur(urlWrapperRef); }}
            underlayColor="transparent"
            activeOpacity={1}
            style={styles.inputContainer}
          >
            <View style={styles.inputRow}>
              <Ionicons name="globe-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={urlInputRef}
                style={styles.input}
                value={serverUrl}
                onChangeText={(v) => { setServerUrl(v); setError(''); }}
                placeholder="http://your-server.com:8080"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"

                onSubmitEditing={() => usernameInputRef.current?.focus()}
                editable={!loading}
              />
            </View>
          </TouchableHighlight>
        </View>

        {/* Username */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Username</Text>
          <TouchableHighlight
            ref={usernameWrapperRef}
            onPress={() => usernameInputRef.current?.focus()}
            onFocus={() => { setFocusedField('username'); applyFocus(usernameWrapperRef); }}
            onBlur={() => { setFocusedField(null); applyBlur(usernameWrapperRef); }}
            underlayColor="transparent"
            activeOpacity={1}
            style={styles.inputContainer}
          >
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={usernameInputRef}
                style={styles.input}
                value={username}
                onChangeText={(v) => { setUsername(v); setError(''); }}
                placeholder="Enter username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"

                onSubmitEditing={() => passwordInputRef.current?.focus()}
                editable={!loading}
              />
            </View>
          </TouchableHighlight>
        </View>

        {/* Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TouchableHighlight
            ref={passwordWrapperRef}
            onPress={() => passwordInputRef.current?.focus()}
            onFocus={() => { setFocusedField('password'); applyFocus(passwordWrapperRef); }}
            onBlur={() => { setFocusedField(null); applyBlur(passwordWrapperRef); }}
            underlayColor="transparent"
            activeOpacity={1}
            style={styles.inputContainer}
          >
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                style={styles.input}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!loading}
              />
            </View>
          </TouchableHighlight>
        </View>

        {/* Connect */}
        <TouchableHighlight
          ref={loginWrapperRef}
          onPress={handleLogin}
          onFocus={() => { setFocusedField('login'); applyFocus(loginWrapperRef); }}
          onBlur={() => { setFocusedField(null); applyBlur(loginWrapperRef); }}
          underlayColor="transparent"
          activeOpacity={1}
          disabled={loading}
          style={styles.loginBtn}
        >
          <LinearGradient
            colors={loading ? [colors.textMuted, colors.textMuted] : [colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.loginGradient}
          >
            {loading
              ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.loginText}>Connecting…</Text></>
              : <><Text style={styles.loginText}>Connect</Text><Ionicons name="arrow-forward" size={18} color={colors.white} /></>
            }
          </LinearGradient>
        </TouchableHighlight>
      </Animated.View>
    </View>
  );

  // ── Phone / Web form ──────────────────────────────────────────────────────
  const phoneForm = (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.logoContainer}>
        <View style={styles.logoIcon}>
          <MaterialCommunityIcons name="cctv" size={36} color={colors.primary} />
        </View>
        <Text style={styles.appName}>StreamViewer</Text>
        <Text style={styles.appSubtitle}>Secure Stream Access</Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Server URL</Text>
        <View style={[styles.inputContainer, focusedField === 'url' && styles.inputFocused]}>
          <View style={styles.inputRow}>
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
              onSubmitEditing={() => usernameInputRef.current?.focus()}
              onFocus={() => setFocusedField('url')}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Username</Text>
        <View style={[styles.inputContainer, focusedField === 'username' && styles.inputFocused]}>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              ref={usernameInputRef}
              style={styles.input}
              value={username}
              onChangeText={(v) => { setUsername(v); setError(''); }}
              placeholder="Enter username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <View style={[styles.inputContainer, focusedField === 'password' && styles.inputFocused]}>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              ref={passwordInputRef}
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={(v) => { setPassword(v); setError(''); }}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={12}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        onPress={handleLogin}
        disabled={loading}
        onFocus={() => setFocusedField('login')}
        onBlur={() => setFocusedField(null)}
        style={[styles.loginBtn, focusedField === 'login' && styles.loginBtnFocused]}
      >
        <LinearGradient
          colors={loading ? [colors.textMuted, colors.textMuted] : [colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.loginGradient}
        >
          {loading
            ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.loginText}>Connecting…</Text></>
            : <><Text style={styles.loginText}>Connect</Text><Ionicons name="arrow-forward" size={18} color={colors.white} /></>
          }
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0D1B2A', '#0A0A0F', '#0A0A0F']} style={StyleSheet.absoluteFill} />
      <View style={styles.bgGrid} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => <View key={i} style={styles.bgLine} />)}
      </View>

      {isTV ? tvForm : (
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {phoneForm}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bgGrid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', opacity: 0.04 },
  bgLine: { width: '8.33%', borderRightWidth: 1, borderColor: colors.primary, height: '100%' },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl },
  tvContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: '20%' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  logoContainer: { alignItems: 'center', marginBottom: spacing.xl },
  logoIcon: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  appName: { ...typography.h1, color: colors.text, letterSpacing: -1, textAlign: 'center' },
  appSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: spacing.xl },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1, lineHeight: 18 },
  inputGroup: { marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  inputContainer: {
    backgroundColor: colors.card,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder,
    height: 50,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, height: 50,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.text },
  inputFocused: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  loginBtn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  loginBtnFocused: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: radius.md,
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  loginGradient: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loginText: { ...typography.body, color: colors.white, fontWeight: '700' },
});
