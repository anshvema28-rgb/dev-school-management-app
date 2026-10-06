import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'

// Responsive width breakpoints: < 600 mobile • 600–1024 tablet • > 1024 desktop.
// All layout values are derived inside the component with useWindowDimensions,
// so rotation / window-size changes re-flow every grid correctly.
const MOBILE_BP = 600
const DESKTOP_BP = 1024
const MAX_CONTENT = 1160 // keeps the dashboard readable on wide laptop screens

// Deep Purple -> Soft Violet gradient bands for the header (no extra packages)
const HEADER_GRADIENT = [
  '#4C1D95',
  '#592DA3',
  '#663DB1',
  '#734CBF',
  '#805CCD',
  '#8B5CF6',
  '#9A7BE9',
  '#A78BFA',
]

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

// Local calendar date (avoids UTC drift when filtering the DATE column)
const localISODate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const fmtShortDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]}`
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const initialsOf = (name: string, fallback: string) => {
  const parts = (name || '').trim().split(/\s+/)
  const first = parts[0] ? parts[0][0] : fallback
  const second = parts[1] ? parts[1][0] : ''
  return String(first).toUpperCase() + String(second).toUpperCase()
}

const SectionTitle = ({ text }: { text: string }) => (
  <View style={styles.sectionRow}>
    <View style={styles.sectionBar} />
    <Text style={styles.sectionTitle}>{text}</Text>
  </View>
)

// Lightweight one-shot entrance animation (fade + slide + gentle scale).
// Runs once on mount with the native driver and never loops, so it stays
// smooth on low-end Android phones.
const Entrance = ({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode
  delay?: number
  style?: any
}) => {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ])
    seq.start()
    return () => seq.stop()
  }, [])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

export default function DashboardScreen({
  onOpenStudentView,
  onNavigate,
}: {
  onOpenStudentView?: () => void
  onNavigate?: (screen: string) => void
}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadProblems, setLoadProblems] = useState<string[]>([])

  // Live overview statistics
  const [totalStudents, setTotalStudents] = useState(0)
  const [totalTeachers, setTotalTeachers] = useState(0)
  const [totalClasses, setTotalClasses] = useState(0)
  const [totalSubjects, setTotalSubjects] = useState(0)
  const [todayPct, setTodayPct] = useState<number | null>(null)
  const [pendingFees, setPendingFees] = useState(0)
  const [pendingFeeCount, setPendingFeeCount] = useState(0)

  // Recent activity
  const [recentStudents, setRecentStudents] = useState<any[]>([])
  const [recentAttendance, setRecentAttendance] = useState<any[]>([])
  const [recentFees, setRecentFees] = useState<any[]>([])
  const [recentNotices, setRecentNotices] = useState<any[]>([])

  // Notices section
  const [notices, setNotices] = useState<any[]>([])

  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})

  const todayDate = localISODate()

  // ---- Responsive layout (recomputed on rotation / window resize) ----
  const { width: winWidth } = useWindowDimensions()
  const isMobile = winWidth < MOBILE_BP
  const isDesktop = winWidth > DESKTOP_BP
  const PAGE_PADDING = isMobile ? 16 : isDesktop ? 32 : 24
  const GRID_GAP = isMobile ? 14 : isDesktop ? 18 : 16
  const contentW = Math.min(winWidth - PAGE_PADDING * 2, MAX_CONTENT)
  const colWidth = (cols: number) =>
    Math.floor((contentW - GRID_GAP * (cols - 1)) / cols)
  const statsCols = isMobile ? 2 : isDesktop ? 6 : 3
  const actionCols = isMobile ? 2 : 3
  const sideCols = isMobile ? 1 : 2
  const statW = colWidth(statsCols)
  const actionW = colWidth(actionCols)
  const halfW = colWidth(2)

  // ---- Simple scroll-driven animation -----------------------------------
  // One Animated.Value driven directly by the native scroll event
  // (useNativeDriver: true). No JS runs per scroll event, no layout
  // measurement, no frame-scheduling callbacks — fixed interpolations only.
  const scrollY = useRef(new Animated.Value(0)).current

  // Header: subtle scroll-linked fade + a small slide of the inner bar
  // (clipped by the header's overflow: 'hidden', so no seam appears and the
  // header stays fully visible and usable).
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 90],
    outputRange: [1, 0.75],
    extrapolate: 'clamp',
  })
  const headerShift = scrollY.interpolate({
    inputRange: [0, 90],
    outputRange: [0, -14],
    extrapolate: 'clamp',
  })

  // Welcome: simple opacity + translateY interpolation while scrolling.
  const welcomeOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  })
  const welcomeShift = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -28],
    extrapolate: 'clamp',
  })

  const handleLogout = async () => {
    console.log('[Dashboard] onPress -> Logout')
    try {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const reg = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[key] = e.nativeEvent.layout.y
  }

  const scrollTo = (key: string) => {
    console.log('[Dashboard] onPress -> Notifications (scroll to', key + ')')
    const y = sectionY.current[key]
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true })
    } else {
      console.log('[Dashboard] section layout not registered yet:', key)
    }
  }

  const go = (screen: string) => {
    if (onNavigate) {
      console.log('[Dashboard] onPress -> quick action:', screen)
      onNavigate(screen)
    } else {
      console.warn(
        '[Dashboard] onPress FIRED but navigation handler missing for:',
        screen,
        '- App.js did not pass onNavigate (role gate failed)'
      )
    }
  }

  const openSettings = () => {
    console.log('[Dashboard] onPress -> Settings')
    go('settings')
  }

  // Load real data from Supabase (admin RLS applies server side)
  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const problems: string[] = []
      try {
        const { data: sess } = await supabase.auth.getSession()
        const u = sess && sess.session ? sess.session.user : null
        if (!active) return
        setUser(u)
        if (!u) {
          return
        }

        // Own profile (admins can read all profiles)
        const profRes = await supabase
          .from('profiles')
          .select('id, role, full_name, email, phone, avatar_url')
          .eq('id', u.id)
          .maybeSingle()
        if (!active) return
        if (profRes.error) problems.push(profRes.error.message)
        setProfile(profRes.data ?? null)

        // ---- Live counts ----
        const count = async (table: string, role?: string) => {
          let q: any = supabase
            .from(table)
            .select('id', { count: 'exact', head: true })
          if (role) q = q.eq('role', role)
          return await q
        }

        const [stuRes, tchRes, clsRes, subjRes] = await Promise.all([
          count('students'),
          count('teachers'),
          count('classes'),
          count('subjects'),
        ])
        if (!active) return
        ;[stuRes, tchRes, clsRes, subjRes].forEach((r) => {
          if (r.error) problems.push(r.error.message)
        })
        setTotalStudents(stuRes.count ?? 0)
        setTotalTeachers(tchRes.count ?? 0)
        setTotalClasses(clsRes.count ?? 0)
        setTotalSubjects(subjRes.count ?? 0)

        // ---- Today's attendance % ----
        const attRes = await supabase
          .from('attendance')
          .select('status')
          .eq('date', todayDate)
        if (!active) return
        if (attRes.error) problems.push(attRes.error.message)
        const attList = (attRes.data as any[]) ?? []
        const attAttended = attList.filter(
          (a) => a.status === 'present' || a.status === 'late'
        ).length
        setTodayPct(
          attList.length > 0
            ? Math.round((attAttended / attList.length) * 100)
            : null
        )

        // ---- Pending fees ----
        const feeRes = await supabase
          .from('fees')
          .select('id, amount')
          .in('payment_status', ['unpaid', 'partial'])
        if (!active) return
        if (feeRes.error) problems.push(feeRes.error.message)
        const pf = (feeRes.data as any[]) ?? []
        setPendingFeeCount(pf.length)
        setPendingFees(pf.reduce((s, f) => s + Number(f.amount || 0), 0))

        // ---- Recent activity ----
        const rStu = await supabase
          .from('students')
          .select('id, roll_no, admission_no, parent_name, class_id, created_at, profiles!students_profile_id_fkey (full_name)')
          .order('created_at', { ascending: false })
          .limit(5)
        if (!active) return
        if (rStu.error) problems.push(rStu.error.message)
        setRecentStudents((rStu.data as any[]) ?? [])

        const rAtt = await supabase
          .from('attendance')
          .select('id, student_id, class_id, date, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        if (!active) return
        if (rAtt.error) problems.push(rAtt.error.message)
        setRecentAttendance((rAtt.data as any[]) ?? [])

        const rFee = await supabase
          .from('fees')
          .select('id, student_id, amount, fee_type, due_date, payment_status, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        if (!active) return
        if (rFee.error) problems.push(rFee.error.message)
        setRecentFees((rFee.data as any[]) ?? [])

        const rNtc = await supabase
          .from('notices')
          .select('id, title, content, target_audience, published_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(5)
        if (!active) return
        if (rNtc.error) problems.push(rNtc.error.message)
        setRecentNotices((rNtc.data as any[]) ?? [])

        // ---- Notices section ----
        const nList = await supabase
          .from('notices')
          .select('id, title, content, target_audience, published_at, created_at')
          .eq('is_published', true)
          .order('published_at', { ascending: false })
          .limit(5)
        if (!active) return
        if (nList.error) problems.push(nList.error.message)
        setNotices((nList.data as any[]) ?? [])
      } catch (err: any) {
        if (active) {
          problems.push(err && err.message ? err.message : 'Unable to load dashboard')
        }
      } finally {
        if (active) {
          setLoadProblems(problems)
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  // ---- Derived values (all from Supabase data, never hard-coded) ----
  const adminName =
    (profile && profile.full_name) ||
    (user && user.email ? user.email.split('@')[0] : '') ||
    'Admin'
  const adminEmail = (profile && profile.email) || (user && user.email) || ''
  const initials = initialsOf(adminName, 'A')

  const notificationCount = pendingFeeCount

  const stats = [
    { emoji: '👨‍🎓', value: String(totalStudents), label: 'Total Students' },
    { emoji: '👩‍🏫', value: String(totalTeachers), label: 'Total Teachers' },
    { emoji: '🏫', value: String(totalClasses), label: 'Total Classes' },
    { emoji: '📚', value: String(totalSubjects), label: 'Total Subjects' },
    {
      emoji: '📋',
      value: todayPct !== null ? `${todayPct}%` : '—',
      label: "Today's Attendance",
    },
    { emoji: '💰', value: money(pendingFees), label: 'Pending Fees' },
  ]

  const quickActions = [
    { key: 'students', title: 'Manage Students', emoji: '👨‍🎓', subtitle: `Student accounts and records • ${totalStudents} enrolled` },
    { key: 'teachers', title: 'Manage Teachers', emoji: '👩‍🏫', subtitle: `Teacher accounts and assignments • ${totalTeachers} teachers` },
    { key: 'parents', title: 'Manage Parents', emoji: '👪', subtitle: 'Parent accounts and linked children' },
    { key: 'staff', title: 'Staff Directory', emoji: '🧑‍🏫', subtitle: 'Teaching and admin staff' },
    { key: 'classes', title: 'Manage Classes', emoji: '🏫', subtitle: 'Grades, sections and academic years' },
    { key: 'attendance', title: 'Attendance', emoji: '📋', subtitle: `Record student attendance${todayPct !== null ? ` • ${todayPct}% today` : ''}` },
    { key: 'fees', title: 'Fees', emoji: '💰', subtitle: `Fee records and payments • ${pendingFeeCount > 0 ? `${pendingFeeCount} pending` : 'no dues'}` },
    { key: 'exams', title: 'Exams & Results', emoji: '📝', subtitle: 'Exams, marks and results' },
    { key: 'homework', title: 'Homework', emoji: '📖', subtitle: 'Assignments and submissions' },
    { key: 'timetable', title: 'Timetable', emoji: '🕐', subtitle: 'Class schedules' },
    { key: 'notices', title: 'Notices', emoji: '📢', subtitle: `School announcements • ${notices.length} published` },
    { key: 'subjects', title: 'Subjects', emoji: '📚', subtitle: 'Subjects and class assignments' },
    { key: 'syllabus', title: 'Syllabus', emoji: '📘', subtitle: 'Course outlines by class' },
    { key: 'transport', title: 'Transport', emoji: '🚌', subtitle: 'Routes, stops and students' },
    { key: 'complaints', title: 'Complaints', emoji: '🎫', subtitle: 'Tickets, status and responses' },
    { key: 'calendar', title: 'Academic Calendar', emoji: '🗓️', subtitle: 'Events and important dates' },
    { key: 'reports', title: 'Reports / Analytics', emoji: '📊', subtitle: 'Live school statistics' },
    { key: 'settings', title: 'Settings', emoji: '⚙️', subtitle: 'Account and system information' },
  ]

  const summaryRows = [
    { label: 'Students', value: String(totalStudents), emoji: '👨‍🎓' },
    { label: 'Teachers', value: String(totalTeachers), emoji: '👩‍🏫' },
    { label: 'Classes', value: String(totalClasses), emoji: '🏫' },
    {
      label: 'Attendance',
      value: todayPct !== null ? `${todayPct}%` : '—',
      emoji: '📋',
    },
    { label: 'Pending Fees', value: money(pendingFees), emoji: '💰' },
  ]

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6D28D9" />
        <Text style={styles.loadingText}>Loading admin dashboard…</Text>
      </View>
    )
  }

  if (!user) {
    return null
  }

  return (
    <View style={styles.container}>
      {/* ---------- Fixed gradient header ---------- */}
      <Animated.View
        style={[
          styles.header,
          !isMobile && { paddingHorizontal: PAGE_PADDING },
          { opacity: headerOpacity },
        ]}
      >
        <View style={styles.headerGradient} pointerEvents="none">
          {HEADER_GRADIENT.map((bandColor, bandIndex) => (
            <View
              key={bandIndex}
              style={[styles.gradientBand, { backgroundColor: bandColor }]}
            />
          ))}
        </View>
        <View style={styles.headerBlob1} pointerEvents="none" />
        <View style={styles.headerBlob2} pointerEvents="none" />

        <Animated.View
          style={[
            styles.headerRow,
            styles.headerBar,
            { transform: [{ translateY: headerShift }] },
          ]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Logout"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backBtnText}>← Logout</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text
              style={[styles.brandName, !isMobile && { fontSize: isDesktop ? 18 : 17 }]}
              numberOfLines={1}
            >
              D A V Academy School
            </Text>
            <Text style={styles.brandTagline} numberOfLines={1}>
              LEARN • GROW • BUILD YOUR FUTURE
            </Text>
            <View style={styles.adminLabel}>
              <Text style={styles.adminLabelText}>Admin Dashboard</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => scrollTo('activity')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.iconBtnText}>🔔</Text>
              {notificationCount > 0 ? (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={openSettings}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.iconBtnText}>⚙️</Text>
            </TouchableOpacity>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* ---------- Scrollable content ---------- */}
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingHorizontal: PAGE_PADDING, paddingTop: PAGE_PADDING },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        <View style={styles.contentInner}>
        {loadProblems.length > 0 ? (
          <Entrance delay={0}>
            <View style={styles.banner}>
              <Text style={styles.bannerText} numberOfLines={3}>
                ⚠ {loadProblems[0]}
              </Text>
            </View>
          </Entrance>
        ) : null}

        {/* ---------- Welcome ---------- */}
        <Animated.View
          style={{
            opacity: welcomeOpacity,
            transform: [{ translateY: welcomeShift }],
          }}
        >
        <Entrance delay={40}>
          <View style={styles.welcomeCard}>
            <View
              style={[
                styles.welcomeAvatar,
                !isMobile && {
                  width: isDesktop ? 68 : 62,
                  height: isDesktop ? 68 : 62,
                  borderRadius: isDesktop ? 34 : 31,
                },
              ]}
            >
              <Text style={styles.welcomeAvatarText}>{initials}</Text>
            </View>
            <View style={styles.welcomeInfo}>
              <Text style={[styles.welcomeText, !isMobile && { fontSize: isDesktop ? 20 : 19 }]}>
                Welcome Back!
              </Text>
            <Text style={styles.userName} numberOfLines={1}>
              {adminName}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {adminEmail}
            </Text>
            <View style={styles.roleRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>ADMIN</Text>
              </View>
              <Text style={styles.welcomeMsg}>Manage your school from one place.</Text>
            </View>
          </View>
        </View>
        </Entrance>
        </Animated.View>

        {/* ---------- Overview statistics ---------- */}
        <Entrance delay={70}>
          <SectionTitle text="Overview" />
        </Entrance>
        <View style={styles.grid}>
          {stats.map((s, idx) => (
            <Entrance
              key={`${s.label}-${idx}`}
              delay={100 + idx * 45}
              style={{ width: statW, marginBottom: GRID_GAP }}
            >
              <View style={styles.statWrap}>
                <View style={styles.statCard}>
                  <View style={styles.statIcon}>
                    <Text style={styles.statIconText}>{s.emoji}</Text>
                  </View>
                  <Text
                    style={[styles.statValue, !isMobile && { fontSize: 22 }]}
                    numberOfLines={1}
                  >
                    {s.value}
                  </Text>
                  <Text
                    style={[styles.statLabel, !isMobile && { fontSize: 12 }]}
                    numberOfLines={2}
                  >
                    {s.label}
                  </Text>
                </View>
              </View>
            </Entrance>
          ))}
        </View>

        {/* ---------- Quick modules ---------- */}
        <Entrance delay={90}>
          <SectionTitle text="Quick Modules" />
        </Entrance>
        <View style={styles.grid}>
          {quickActions.map((m, idx) => (
            <Entrance
              key={m.key}
              delay={120 + idx * 25}
              style={{ width: actionW, marginBottom: GRID_GAP }}
            >
              <TouchableOpacity
                style={styles.modWrap}
                activeOpacity={0.85}
                onPress={() => go(m.key)}
                accessibilityRole="button"
                accessibilityLabel={m.title}
              >
                <View style={styles.modCard}>
                  <View style={styles.modTop}>
                    <View style={styles.modIcon}>
                      <Text style={styles.modIconText}>{m.emoji}</Text>
                    </View>
                    <Text style={styles.modArrow}>→</Text>
                  </View>
                  <Text
                    style={[styles.modTitle, !isMobile && { fontSize: 14 }]}
                    numberOfLines={2}
                  >
                    {m.title}
                  </Text>
                  <View style={styles.modValuePill}>
                    <Text style={styles.modValueText}>{m.subtitle}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Entrance>
          ))}
        </View>

        {/* ---------- Recent activity ---------- */}
        <View onLayout={reg('activity')}>
          <Entrance delay={150}>
            <SectionTitle text="Recent Activity" />
          </Entrance>

          <View style={styles.grid}>
          <Entrance delay={170} style={{ width: sideCols === 1 ? '100%' : halfW }}>
          <Text style={styles.subLabel}>Recently Added Students</Text>
          <View style={styles.listCard}>
            {recentStudents.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity</Text>
            ) : (
              recentStudents.map((s) => (
                <View key={s.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>👨‍🎓</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {(s.profiles && s.profiles.full_name) || s.roll_no || s.parent_name || 'Student'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {s.roll_no ? `Roll ${s.roll_no}` : '—'}
                      {s.admission_no ? ` • Adm ${s.admission_no}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(s.created_at)}</Text>
                </View>
              ))
            )}
          </View>
          </Entrance>

          <Entrance delay={200} style={{ width: sideCols === 1 ? '100%' : halfW }}>
          <Text style={styles.subLabel}>Recent Attendance</Text>
          <View style={styles.listCard}>
            {recentAttendance.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity</Text>
            ) : (
              recentAttendance.map((a) => (
                <View key={a.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📋</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : '—'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {fmtDate(a.date)}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(a.created_at)}</Text>
                </View>
              ))
            )}
          </View>
          </Entrance>

          <Entrance delay={230} style={{ width: sideCols === 1 ? '100%' : halfW }}>
          <Text style={styles.subLabel}>Recent Fee Payments</Text>
          <View style={styles.listCard}>
            {recentFees.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity</Text>
            ) : (
              recentFees.map((f) => (
                <View key={f.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>💰</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {money(f.amount)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {f.fee_type ? f.fee_type : 'Fee'}
                      {f.payment_status ? ` • ${f.payment_status}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(f.created_at)}</Text>
                </View>
              ))
            )}
          </View>
          </Entrance>

          <Entrance delay={260} style={{ width: sideCols === 1 ? '100%' : halfW }}>
          <Text style={styles.subLabel}>Recent Notices</Text>
          <View style={styles.listCard}>
            {recentNotices.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity</Text>
            ) : (
              recentNotices.map((n) => (
                <View key={n.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📢</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {n.target_audience ? `For ${n.target_audience}` : '—'}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>
                    {fmtShortDate(n.published_at || n.created_at)}
                  </Text>
                </View>
              ))
            )}
          </View>
          </Entrance>
          </View>
        </View>

        {/* ---------- Notices ---------- */}
        <View style={styles.grid}>
        <Entrance delay={290} style={{ width: sideCols === 1 ? '100%' : halfW }}>
        <View onLayout={reg('notices')}>
          <SectionTitle text="Notices" />
          <View style={styles.listCard}>
            {notices.length === 0 ? (
              <Text style={styles.emptyText}>No recent notices</Text>
            ) : (
              notices.map((n) => (
                <View key={n.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📢</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={2}>
                      {n.content}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>
                    {fmtShortDate(n.published_at || n.created_at)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
        </Entrance>

        <Entrance delay={320} style={{ width: sideCols === 1 ? '100%' : halfW }}>
        {/* ---------- School summary ---------- */}
        <View onLayout={reg('summary')}>
          <SectionTitle text="School Summary" />
          <View style={styles.summaryCard}>
            {summaryRows.map((r) => (
              <View key={r.label} style={styles.summaryRow}>
                <Text style={styles.summaryEmoji}>{r.emoji}</Text>
                <Text style={styles.summaryLabel}>{r.label}</Text>
                <Text style={styles.summaryValue}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>
        </Entrance>
        </View>

        <Entrance delay={350}>
        <View style={styles.footer}>
          <Text style={styles.footerText}>D A V Academy School</Text>
          <Text style={styles.footerSub}>LEARN • GROW • BUILD YOUR FUTURE</Text>
          {onOpenStudentView ? (
            <TouchableOpacity
              style={styles.studentViewBtn}
              activeOpacity={0.75}
              onPress={onOpenStudentView}
            >
              <Text style={styles.studentViewBtnText}>🎓 Open Student View</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        </Entrance>
        </View>
      </Animated.ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },

  // ----- Header -----
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 20,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  gradientBand: {
    flex: 1,
  },
  headerBlob1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -70,
    right: -40,
  },
  headerBlob2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -50,
    left: -30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  brandTagline: {
    color: '#A78BFA',
    fontSize: 9,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 3,
  },
  adminLabel: {
    marginTop: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  adminLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconBtnText: {
    fontSize: 15,
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  // ----- Scroll area -----
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 48,
    alignItems: 'center',
  },
  // Centered, readable content column (caps the width on wide screens)
  contentInner: {
    width: '100%',
    maxWidth: MAX_CONTENT,
  },
  headerBar: {
    width: '100%',
    maxWidth: MAX_CONTENT,
    alignSelf: 'center',
  },

  // ----- Error / notice banner -----
  banner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 14,
  },
  bannerText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '600',
  },

  // ----- Welcome card -----
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
    borderLeftColor: '#6D28D9',
    elevation: 5,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  welcomeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  welcomeAvatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  welcomeInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E1B4B',
    marginBottom: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  userEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  roleBadge: {
    backgroundColor: '#6D28D9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  welcomeMsg: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },

  // ----- Section titles -----
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionBar: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#6D28D9',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E1B4B',
    letterSpacing: 0.5,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6D28D9',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 4,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // ----- Stat cards (3D extruded) -----
  statWrap: {
    backgroundColor: '#4C1D95',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconText: {
    fontSize: 20,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6D28D9',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  // ----- Quick-action cards (3D extruded) -----
  modWrap: {
    backgroundColor: '#4C1D95',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  modCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modIconText: {
    fontSize: 20,
  },
  modArrow: {
    color: '#A78BFA',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    marginRight: 2,
  },
  modTitle: {
    color: '#1E1B4B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  modValuePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  modValueText: {
    color: '#6D28D9',
    fontSize: 10,
    fontWeight: '700',
  },

  // ----- List cards -----
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowIconText: {
    fontSize: 16,
  },
  rowBody: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  rowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  rowDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    paddingVertical: 10,
    textAlign: 'center',
  },

  // ----- School summary -----
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 6,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryEmoji: {
    fontSize: 18,
    marginRight: 12,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E1B4B',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E1B4B',
  },

  // ----- Footer -----
  footer: {
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerText: {
    color: '#1E1B4B',
    fontSize: 13,
    fontWeight: '800',
  },
  footerSub: {
    color: '#64748B',
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 3,
  },
  studentViewBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#6D28D9',
    elevation: 4,
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  studentViewBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
})
