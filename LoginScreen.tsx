import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,

  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native'
import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Remember Me — session-scoped memory. No storage package may be added, so
// the username is kept in module memory only (survives screen remounts while
// the app runs, never written to disk). The password is NEVER stored here.
// ---------------------------------------------------------------------------
let rememberedEmail = ''

type Banner = { kind: 'error' | 'info'; text: string } | null

export default function LoginScreen() {
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(rememberedEmail.length > 0)
  const [banner, setBanner] = useState<Banner>(null)
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)

  const { height: screenH } = useWindowDimensions()
  const isCompact = screenH < 700

  // ---- animation values ----
  const floatA = useRef(new Animated.Value(0)).current
  const floatB = useRef(new Animated.Value(0)).current
  const floatC = useRef(new Animated.Value(0)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const logoScale = useRef(new Animated.Value(0.7)).current
  const logoRing = useRef(new Animated.Value(0)).current
  const cardOpacity = useRef(new Animated.Value(0)).current
  const cardTranslateY = useRef(new Animated.Value(40)).current
  const bannerOpacity = useRef(new Animated.Value(0)).current
  const bannerTranslateY = useRef(new Animated.Value(-10)).current
  const knobTranslate = useRef(new Animated.Value(rememberedEmail ? 18 : 0)).current
  const eyeScale = useRef(new Animated.Value(1)).current
  const buttonScale = useRef(new Animated.Value(1)).current
  const checkScale = useRef(new Animated.Value(0)).current

  const passwordRef = useRef<TextInput>(null)

  // ---- entrance + floating background animations ----
  useEffect(() => {
    const float = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )

    const loops = [float(floatA, 3600), float(floatB, 4800), float(floatC, 4200)]
    loops.forEach((a) => a.start())

    // Animated logo entrance (fade + spring scale)
    Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      ]),
    ]).start()

    // Soft pulsing ring around the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoRing, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoRing, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start()

    // Login card fade + slide up
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 450,
      delay: 240,
      useNativeDriver: true,
    }).start()
    Animated.spring(cardTranslateY, {
      toValue: 0,
      delay: 240,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start()

    return () => {
      loops.forEach((a) => a.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- animated error/info banner ----
  useEffect(() => {
    if (!banner) return
    bannerOpacity.setValue(0)
    bannerTranslateY.setValue(-10)
    Animated.parallel([
      Animated.timing(bannerOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(bannerTranslateY, { toValue: 0, friction: 6, useNativeDriver: true }),
    ]).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner])

  // ---- animated remember-me knob ----
  useEffect(() => {
    Animated.timing(knobTranslate, {
      toValue: remember ? 18 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remember])

  // ---- success check pop ----
  useEffect(() => {
    if (!success) return
    Animated.spring(checkScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success])

  const showError = (text: string) => setBanner({ kind: 'error', text })
  const showInfo = (text: string) => setBanner({ kind: 'info', text })

  const changeEmail = (value: string) => {
    setEmail(value)
    if (banner) setBanner(null)
  }

  const changePassword = (value: string) => {
    setPassword(value)
    if (banner) setBanner(null)
  }

  const handleTogglePassword = () => {
    setShowPassword((v) => !v)
    // Animated show/hide bounce
    eyeScale.setValue(0.82)
    Animated.spring(eyeScale, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }).start()
  }

  // ---- Existing Supabase authentication (unchanged system) ----
  const handleLogin = async () => {
    if (loading || success) return // block multiple submissions

    const username = email.trim()
    if (!username || !password) {
      showError('Please enter both email and password')
      return
    }

    setBanner(null)
    setSuccess(false)
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      })

      if (error) {
        showError(error.message || 'Login failed. Please check your credentials.')
        setLoading(false)
        return
      }

      if (data.user) {
        rememberedEmail = remember ? username : ''
        // No manual navigation: App.js onAuthStateChange picks up the session
        // and the existing role resolver routes to the correct dashboard.
        setSuccess(true)
        setLoading(false)
      } else {
        showError('Login failed. Please try again.')
        setLoading(false)
      }
    } catch (err: any) {
      showError(err?.message || 'Unable to reach the server. Please try again.')
      setLoading(false)
    }
  }

  // ---- Forgot password via the SAME Supabase auth system ----
  const handleForgotPassword = async () => {
    if (loading || success || forgotLoading) return

    const username = email.trim()
    if (!username) {
      showError('Enter your username / email first, then tap Forgot Password.')
      return
    }

    setBanner(null)
    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(username, {
        // Production web app — the reset link should return here after
        // the user sets a new password.
        redirectTo: 'https://dev-school-management-app.vercel.app',
      })
      if (error) {
        showError(error.message || 'Unable to send the password reset email.')
      } else {
        showInfo(`Password reset email sent to ${username}. Check your inbox.`)
      }
    } catch (err: any) {
      showError(err?.message || 'Unable to send the password reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  const busy = loading || success

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      {/* Smooth floating background shapes */}
      <View style={styles.backgroundLayer} pointerEvents="none">
        <Animated.View
          style={[
            styles.blob,
            styles.blobNavy,
            {
              opacity: 0.07,
              transform: [
                {
                  translateY: floatA.interpolate({ inputRange: [0, 1], outputRange: [0, -26] }),
                },
                {
                  translateX: floatA.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.blob,
            styles.blobBlue,
            {
              opacity: 0.1,
              transform: [
                {
                  translateY: floatB.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.blob,
            styles.blobTint,
            {
              opacity: 0.14,
              transform: [
                {
                  translateY: floatC.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }),
                },
              ],
            },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingVertical: isCompact ? 14 : 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Branding header with animated logo entrance ---- */}
        <Animated.View
          style={[
            styles.header,
            { paddingTop: isCompact ? 12 : 30, paddingBottom: isCompact ? 16 : 26 },
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={[styles.logoWrap, isCompact && { marginBottom: 12 }]}>
            <Animated.View
              style={[
                styles.logoRing,
                {
                  opacity: logoRing.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                  transform: [
                    { scale: logoRing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) },
                  ],
                },
              ]}
            />
            <View style={[styles.logoBox, isCompact && { width: 80, height: 80, borderRadius: 24 }]}>
              <Text style={styles.logoText}>DAV</Text>
            </View>
          </View>
          <Text style={styles.brandTitle}>D A V Academy School</Text>
          <Text style={styles.brandTagline}>LEARN • GROW • BUILD YOUR FUTURE</Text>
        </Animated.View>

        {/* ---- Login card (fade + slide in) ---- */}
        <Animated.View
          style={[
            styles.card,
            { padding: isCompact ? 20 : 30 },
            { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] },
          ]}
        >
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          {/* Animated error / info banner */}
          {banner ? (
            <Animated.View
              accessibilityRole="alert"
              style={[
                styles.banner,
                banner.kind === 'error' ? styles.bannerError : styles.bannerInfo,
                { opacity: bannerOpacity, transform: [{ translateY: bannerTranslateY }] },
              ]}
            >
              <Text
                style={[
                  styles.bannerText,
                  banner.kind === 'error' ? styles.bannerTextError : styles.bannerTextInfo,
                ]}
                numberOfLines={3}
              >
                {banner.kind === 'error' ? '⚠  ' : 'ℹ  '}
                {banner.text}
              </Text>
            </Animated.View>
          ) : null}

          {/* Username / email */}
          <Text style={styles.inputLabel}>USERNAME / EMAIL</Text>
          <View
            style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}
          >
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={changeEmail}
              placeholder="Email or username"
              placeholderTextColor="#9AA6C2"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Password */}
          <Text style={styles.inputLabel}>PASSWORD</Text>
          <View
            style={[styles.inputWrap, focusedField === 'password' && styles.inputWrapFocused]}
          >
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.inputPassword]}
              value={password}
              onChangeText={changePassword}
              placeholder="Enter your password"
              placeholderTextColor="#9AA6C2"
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={handleTogglePassword}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Animated.Text
                style={[styles.eyeText, { transform: [{ scale: eyeScale }] }]}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Animated.Text>
            </TouchableOpacity>
          </View>

          {/* Remember me (animated) + Forgot password */}
          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRemember((r) => !r)}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: remember }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <View style={[styles.switchTrack, remember && styles.switchTrackOn]}>
                <Animated.View
                  style={[styles.switchKnob, { transform: [{ translateX: knobTranslate }] }]}
                />
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={handleForgotPassword}
              disabled={busy || forgotLoading}
              activeOpacity={0.6}
              accessibilityRole="button"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {forgotLoading ? (
                <ActivityIndicator size="small" color="#1976D2" />
              ) : (
                <Text style={styles.forgotText}>Forgot password?</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Animated login button with loading spinner / success state */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[styles.loginBtn, busy && styles.loginBtnBusy]}
              onPress={handleLogin}
              onPressIn={() =>
                Animated.spring(buttonScale, {
                  toValue: 0.97,
                  friction: 8,
                  tension: 160,
                  useNativeDriver: true,
                }).start()
              }
              onPressOut={() =>
                Animated.spring(buttonScale, {
                  toValue: 1,
                  friction: 6,
                  tension: 120,
                  useNativeDriver: true,
                }).start()
              }
              disabled={busy}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Login"
            >
              {success ? (
                <View style={styles.successRow}>
                  <Animated.View
                    style={[
                      styles.checkCircle,
                      { transform: [{ scale: checkScale }] },
                    ]}
                  >
                    <Text style={styles.checkText}>✓</Text>
                  </Animated.View>
                  <Text style={styles.loginBtnText}>Welcome! Redirecting…</Text>
                </View>
              ) : loading ? (
                <View style={styles.successRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.loginBtnText}>Signing in…</Text>
                </View>
              ) : (
                <Text style={styles.loginBtnText}>Login</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>
              Don't have an account?{' '}
              <Text
                style={styles.registerLinkText}
                onPress={() =>
                  showInfo(
                    'Registration coming soon — please contact the school administrator to create your account.'
                  )
                }
              >
                Register
              </Text>
            </Text>
          </View>

          <View style={styles.securityBar}>
            <Text style={styles.securityText}>Secure • Reliable • Trusted</Text>
          </View>
        </Animated.View>

        <View style={styles.waveContainer}>
          <Text style={styles.waveText}>A Better Education, A Brighter Future</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8FF',
  },
  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobNavy: {
    top: -70,
    left: -60,
    width: 230,
    height: 230,
    backgroundColor: '#1A237E',
  },
  blobBlue: {
    bottom: 50,
    right: -80,
    width: 260,
    height: 260,
    backgroundColor: '#1976D2',
  },
  blobTint: {
    top: 320,
    left: -50,
    width: 180,
    height: 180,
    backgroundColor: '#42A5F5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoRing: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: '#1976D2',
  },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: '#1A237E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  logoText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A237E',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  brandTagline: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center',
    letterSpacing: 1.6,
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '600',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A237E',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7A99',
    textAlign: 'center',
    marginBottom: 18,
  },
  banner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  bannerError: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  bannerInfo: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bannerTextError: {
    color: '#C62828',
    fontWeight: '600',
  },
  bannerTextInfo: {
    color: '#1A237E',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7A99',
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FF',
    borderWidth: 1.5,
    borderColor: '#DDE4F0',
    borderRadius: 14,
    marginBottom: 14,
    height: 54,
  },
  inputWrapFocused: {
    borderColor: '#1976D2',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1B2440',
  },
  inputPassword: {
    paddingRight: 74,
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1976D2',
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 10,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DDE4F0',
    justifyContent: 'center',
    paddingHorizontal: 3,
    marginRight: 8,
  },
  switchTrackOn: {
    backgroundColor: '#1A237E',
  },
  switchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  rememberText: {
    fontSize: 14,
    color: '#44506B',
    fontWeight: '600',
  },
  forgotBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  forgotText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '700',
  },
  loginBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  loginBtnBusy: {
    backgroundColor: '#3F51B5',
    shadowOpacity: 0.18,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginLeft: 10,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#43A047',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  registerRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  registerText: {
    color: '#6B7A99',
    fontSize: 14,
  },
  registerLinkText: {
    color: '#1A237E',
    textDecorationLine: 'underline',
    fontSize: 14,
    fontWeight: '700',
  },
  securityBar: {
    backgroundColor: '#EEF3FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 16,
    alignItems: 'center',
  },
  securityText: {
    color: '#6B7A99',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  waveContainer: {
    marginTop: 18,
    marginBottom: 8,
    padding: 14,
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
  },
  waveText: {
    fontSize: 13,
    color: '#1A237E',
    textAlign: 'center',
    fontWeight: '600',
  },
})
