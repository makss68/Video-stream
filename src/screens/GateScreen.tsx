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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { validateCredentials } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { decryptCredentials } from '../utils/crypto';
import { ENCRYPTED_CREDENTIALS } from '../config';
import { colors, spacing, radius, typography } from '../theme';

const isTV = Platform.isTV;

export default function GateScreen() {
  const { setAuth } = useAuthStore();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(isTV ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(isTV ? 0 : 30)).current;

  const passwordInputRef = useRef<TextInput>(null);
  const passwordWrapperRef = useRef<any>(null);
  const loginWrapperRef = useRef<any>(null);

  const applyFocus = (ref: React.RefObject<any>) =>
    ref.current?.setNativeProps({
      style: { borderColor: '#FFFFFF', borderWidth: 3, backgroundColor: 'rgba(59,130,246,0.15)' },
    });
  const applyBlur = (ref: React.RefObject<any>) =>
    ref.current?.setNativeProps({
      style: { borderColor: '#2D2D3D', borderWidth: 1, backgroundColor: '#1C1C28' },
    });

  useEffect(() => {
    if (!isTV) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  const handleUnlock = async () => {
    if (!password) { setError('Please enter the password'); return; }
    setError('');
    setLoading(true);
    try {
      const creds = decryptCredentials(ENCRYPTED_CREDENTIALS, password);
      await validateCredentials(creds.url, creds.username, creds.password);
      await setAuth(creds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  const passwordField = (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>Password</Text>
      {isTV ? (
        <TouchableHighlight
          ref={passwordWrapperRef}
          {...({ hasTVPreferredFocus: true } as any)}
          onPress={() => passwordInputRef.current?.focus()}
          onFocus={() => applyFocus(passwordWrapperRef)}
          onBlur={() => applyBlur(passwordWrapperRef)}
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
              secureTextEntry={!showPassword}
              returnKeyType="go"
              onSubmitEditing={handleUnlock}
              editable={!loading}
            />
          </View>
        </TouchableHighlight>
      ) : (
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
              onSubmitEditing={handleUnlock}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={12}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  const connectButton = isTV ? (
    <TouchableHighlight
      ref={loginWrapperRef}
      onPress={handleUnlock}
      onFocus={() => applyFocus(loginWrapperRef)}
      onBlur={() => applyBlur(loginWrapperRef)}
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
  ) : (
    <Pressable
      onPress={handleUnlock}
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
  );

  const cardContent = (
    <>
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

      {passwordField}
      {connectButton}
    </>
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0D1B2A', '#0A0A0F', '#0A0A0F']} style={StyleSheet.absoluteFill} />
      <View style={styles.bgGrid} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => <View key={i} style={styles.bgLine} />)}
      </View>

      {isTV ? (
        <View style={styles.tvContainer}>
          <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            {cardContent}
          </Animated.View>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {cardContent}
            </Animated.View>
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
