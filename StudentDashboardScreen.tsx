import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import { supabase } from './supabaseClient'

// Responsive 2-column grid sizing (Android friendly)
const SCREEN_WIDTH = Dimensions.get('window').width
const PAGE_PADDING = 16
const GRID_GAP = 14
const COLUMN_WIDTH = Math.min(
  Math.floor((SCREEN_WIDTH - PAGE_PADDING * 2 - GRID_GAP) / 2),
  260
)

// Deep Navy -> Light Blue gradient bands (no extra packages)
const HEADER_GRADIENT = [
  '#1A237E',
  '#1E3A96',
  '#224FAF',
  '#2866C4',
  '#2E7DD6',
  '#3492E6',
  '#3A9FEF',
  '#42A5F5',
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const fmtShortDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}

const fmtTime = (t: string) => (t ? t.slice(0, 5) : '')
const money = (n: number) => '₹' + Math.round(n)

const feeLabel = (t: string) => {
  const map: Record<string, string> = {
    tuition: 'Tuition Fee',
    registration: 'Registration Fee',
    materials: 'Materials Fee',
    extracurricular: 'Extracurricular Fee',
    other: 'Other Fee',
  }
  return (t && map[t]) || 'Fee'
}

const gradeTone = (g: string): 'ok' | 'warn' | 'info' => {
  if (g === 'A' || g === 'B') return 'ok'
  if (g === 'F' || g === 'Incomplete') return 'warn'
  return 'info'
}

const SectionTitle = ({ text }: { text: string }) => (
  <View style={styles.sectionRow}>
    <View style={styles.sectionBar} />
    <Text style={styles.sectionTitle}>{text}</Text>
  </View>
)

const Chip = ({
  text,
  tone = 'info',
}: {
  text: string
  tone?: 'info' | 'ok' | 'warn'
}) => (
  <View
    style={[
      styles.chip,
      tone === 'ok' ? styles.chipOk : tone === 'warn' ? styles.chipWarn : styles.chipInfo,
    ]}
  >
    <Text
      style={[
        styles.chipText,
        tone === 'ok'
          ? styles.chipTextOk
          : tone === 'warn'
          ? styles.chipTextWarn
          : styles.chipTextInfo,
      ]}
    >
      {text}
    </Text>
  </View>
)

export default function StudentDashboardScreen({
  onSwitchToAdmin,
  onNavigate,
}: {
  onSwitchToAdmin?: () => void
  onNavigate?: (screen: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [student, setStudent] = useState<any>(null)
  const [className, setClassName] = useState('')
  const [attendance, setAttendance] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [homework, setHomework] = useState<any[]>([])
  // Own homework_submissions keyed by homework_id (the real submission workflow)
  const [mySubs, setMySubs] = useState<Record<string, string>>({})
  const [fees, setFees] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})

  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})

  const todayName = DAY_NAMES[new Date().getDay()]

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const reg = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[key] = e.nativeEvent.layout.y
  }

  const scrollTo = (key: string) => {
    const y = sectionY.current[key]
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true })
    }
  }

  // Fetch ONLY the current signed-in student's data (RLS applies server side)
  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const { data: sess } = await supabase.auth.getSession()
        const u = sess?.session?.user ?? null
        if (!active) return
        setUser(u)
        if (!u) {
          setLoading(false)
          return
        }

        // 1. Profile (own row only)
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url')
          .eq('id', u.id)
          .maybeSingle()
        if (!active) return
        setProfile(prof ?? null)

        // 2. Subjects (readable by everyone per RLS)
        const { data: subj } = await supabase.from('subjects').select('id, name')
        if (!active) return
        const sMap: Record<string, string> = {}
        const subjList = (subj as any[]) ?? []
        subjList.forEach((s) => {
          sMap[s.id] = s.name
        })
        setSubjectNames(sMap)

        // 3. Student record -> roll number + class
        const { data: stu } = await supabase
          .from('students')
          .select('id, roll_no, admission_no, class_id')
          .eq('profile_id', u.id)
          .maybeSingle()
        if (!active) return
        setStudent(stu ?? null)
        const classId = stu ? stu.class_id : null

        // 4. Class name
        if (classId) {
          const { data: cls } = await supabase
            .from('classes')
            .select('name')
            .eq('id', classId)
            .maybeSingle()
          if (!active) return
          setClassName(cls && cls.name ? cls.name : '')
        } else {
          setClassName('')
        }

        // 5. Own attendance
        const att = await supabase
          .from('attendance')
          .select('status, date')
          .eq('student_id', u.id)
        if (!active) return
        setAttendance((att.data as any[]) ?? [])

        // 6. Exam schedule (RLS lets students read exams; scope to own class)
        let exmQ: any = supabase
          .from('exams')
          .select('id, title, exam_date, total_marks, subject_id, class_id')
          .order('exam_date', { ascending: true })
        if (classId) exmQ = exmQ.eq('class_id', classId)
        const exmRes = await exmQ
        if (!active) return
        setExams((exmRes.data as any[]) ?? [])

        // 7. Own results
        const res = await supabase
          .from('results')
          .select('id, marks_obtained, percentage, grade, created_at, exam_id')
          .eq('student_id', u.id)
          .order('created_at', { ascending: false })
          .limit(6)
        if (!active) return
        setResults((res.data as any[]) ?? [])

        // 8. Homework for the student's class
        if (classId) {
          const hw = await supabase
            .from('homework')
            .select('id, title, due_date, max_marks, subject_id, submitted_by')
            .eq('class_id', classId)
            .order('due_date', { ascending: true })
            .limit(20)
          if (!active) return
          setHomework((hw.data as any[]) ?? [])

          // Own submissions — homework_submissions.student_id = students.id.
          // (submitted_by on homework is a legacy single-UUID column that is
          //  never written, so it can never show a real submission status.)
          if (stu && stu.id) {
            const subs = await supabase
              .from('homework_submissions')
              .select('homework_id, status')
              .eq('student_id', stu.id)
            if (!active) return
            const subMap: Record<string, string> = {}
            ;((subs.data as any[]) || []).forEach((s: any) => {
              if (s && s.homework_id) subMap[s.homework_id] = s.status || 'submitted'
            })
            setMySubs(subMap)
          } else {
            setMySubs({})
          }
        } else {
          setHomework([])
          setMySubs({})
        }

        // 9. Own fees
        const fee = await supabase
          .from('fees')
          .select('amount, payment_status, due_date, fee_type')
          .eq('student_id', u.id)
        if (!active) return
        setFees((fee.data as any[]) ?? [])

        // 10. Today's timetable for the student's class
        if (classId) {
          const tt = await supabase
            .from('timetable')
            .select('id, period, start_time, end_time, room, subject_id')
            .eq('class_id', classId)
            .eq('day_of_week', todayName)
            .order('period', { ascending: true })
          if (!active) return
          setTimetable((tt.data as any[]) ?? [])
        } else {
          setTimetable([])
        }

        // 11. Published school notices
        const ntc = await supabase
          .from('notices')
          .select('id, title, content, target_audience, created_at, published_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(5)
        if (!active) return
        setNotices((ntc.data as any[]) ?? [])
      } catch (err) {
        console.error('Student dashboard load error:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  // ---- Derived values (all from Supabase data, never hard-coded) ----
  const totalDays = attendance.length
  const attended = attendance.filter(
    (a: any) => a.status === 'present' || a.status === 'late'
  ).length
  const attPct = totalDays > 0 ? Math.round((attended / totalDays) * 100) : null

  const nowMs = Date.now()
  const upcomingExams = exams
    .filter((e: any) => new Date(e.exam_date).getTime() >= nowMs)
    .slice(0, 4)
  const recentResults = results.slice(0, 4)
  const pendingHomework = homework
    .filter((h: any) => !mySubs[h.id])
    .slice(0, 4)

  const dueFees = fees.filter(
    (f: any) => f.payment_status === 'unpaid' || f.payment_status === 'partial'
  )
  const pendingAmt = dueFees.reduce(
    (s: number, f: any) => s + Number(f.amount || 0),
    0
  )
  const paidAmt = fees
    .filter((f: any) => f.payment_status === 'paid')
    .reduce((s: number, f: any) => s + Number(f.amount || 0), 0)
  const feeStatus =
    fees.length === 0 ? 'No records' : pendingAmt > 0 ? 'Payment due' : 'All cleared'

  const examMap: Record<string, string> = {}
  exams.forEach((e: any) => {
    examMap[e.id] = e.title
  })

  const subjectName = (id: string | null) =>
    id && subjectNames[id] ? subjectNames[id] : 'Subject'

  const studentName =
    (profile && profile.full_name) ||
    (user && user.email ? user.email.split('@')[0] : '') ||
    'Student'
  const nameParts = studentName.trim().split(/\s+/)
  const initials =
    (nameParts[0] ? nameParts[0][0] : 'S').toUpperCase() +
    (nameParts[1] ? nameParts[1][0].toUpperCase() : '')

  const moduleCards: any[] = [
    {
      key: 'attendance',
      title: 'My Attendance',
      emoji: '📅',
      subtitle: attPct !== null ? `${attPct}% attended` : 'View records',
    },
    {
      key: 'results',
      title: 'My Results',
      emoji: '📝',
      subtitle: recentResults.length > 0 ? `${recentResults.length} recent` : 'No results yet',
    },
    {
      key: 'homework',
      title: 'Homework',
      emoji: '📖',
      subtitle: pendingHomework.length > 0 ? `${pendingHomework.length} pending` : 'All clear',
    },
    {
      key: 'timetable',
      title: 'Timetable',
      emoji: '🕐',
      subtitle: timetable.length > 0 ? `${timetable.length} classes today` : 'No classes',
    },
    {
      key: 'fees',
      title: 'Fees',
      emoji: '💰',
      subtitle: pendingAmt > 0 ? 'Payment due' : 'No dues',
    },
    {
      key: 'notices',
      title: 'Notices',
      emoji: '📢',
      subtitle: notices.length > 0 ? `${notices.length} updates` : 'No notices',
    },
    { key: 'staff', title: 'Staff', emoji: '👥', subtitle: 'Staff directory', route: 'staff' },
    { key: 'subjects', title: 'Subjects', emoji: '📚', subtitle: 'My subjects', route: 'subjects' },
    { key: 'syllabus', title: 'Syllabus', emoji: '📘', subtitle: 'Course outline', route: 'syllabus' },
    { key: 'transport', title: 'Transport', emoji: '🚌', subtitle: 'Bus & route', route: 'transport' },
    {
      key: 'complaints',
      title: 'Complaints',
      emoji: '🎫',
      subtitle: 'Raise an issue',
      route: 'complaints',
    },
    {
      key: 'calendar',
      title: 'Academic Calendar',
      emoji: '🗓️',
      subtitle: 'Events & dates',
      route: 'calendar',
    },
    { key: 'profile', title: 'My Profile', emoji: '👤', subtitle: 'View details' },
  ].filter((m: any) => !m.route || !!onNavigate)

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1A237E" />
        <Text style={styles.loadingText}>Loading your student dashboard…</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* ---------- Fixed gradient header ---------- */}
      <View style={styles.header}>
        <View style={styles.headerGradient} pointerEvents="none">
          {HEADER_GRADIENT.map((bandColor, bandIndex) => (
            <View key={bandIndex} style={[styles.gradientBand, { backgroundColor: bandColor }]} />
          ))}
        </View>
        <View style={styles.headerBlob1} pointerEvents="none" />
        <View style={styles.headerBlob2} pointerEvents="none" />

        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>← Logout</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.brandName} numberOfLines={1}>
              D A V Academy School
            </Text>
            <Text style={styles.brandTagline} numberOfLines={1}>
              LEARN • GROW • BUILD YOUR FUTURE
            </Text>
          </View>

          <View style={styles.headerActions}>
            {onSwitchToAdmin ? (
              <TouchableOpacity
                style={styles.adminBtn}
                onPress={onSwitchToAdmin}
                activeOpacity={0.7}
              >
                <Text style={styles.adminBtnText}>↩ Admin</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ---------- Scrollable content ---------- */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Student profile / avatar + welcome */}
        <View style={styles.welcomeCard} onLayout={reg('profile')}>
          <View style={styles.welcomeAvatar}>
            <Text style={styles.welcomeAvatarText}>{initials}</Text>
          </View>
          <View style={styles.welcomeInfo}>
            <Text style={styles.welcomeText}>Welcome Back!</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {studentName}
            </Text>
            <Text style={styles.userMeta} numberOfLines={1}>
              {className || 'Class —'}
              {student && student.roll_no ? ` • Roll ${student.roll_no}` : ''}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {(profile && profile.email) || (user && user.email) || ''}
            </Text>
          </View>
        </View>

        {/* Class / Roll / Attendance stats */}
        <View onLayout={reg('attendance')}>
          <SectionTitle text="Class & Attendance" />
          <View style={styles.grid}>
            <View style={styles.statWrap}>
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Text style={styles.statIconText}>🏫</Text>
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {className || '—'}
                </Text>
                <Text style={styles.statLabel}>Class</Text>
              </View>
            </View>

            <View style={styles.statWrap}>
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Text style={styles.statIconText}>🏷️</Text>
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {(student && student.roll_no) || '—'}
                </Text>
                <Text style={styles.statLabel}>Roll Number</Text>
              </View>
            </View>

            <View style={styles.statWrap}>
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Text style={styles.statIconText}>📊</Text>
                </View>
                <Text style={styles.statValue}>{attPct !== null ? `${attPct}%` : '—'}</Text>
                <Text style={styles.statLabel}>Attendance</Text>
              </View>
            </View>

            <View style={styles.statWrap}>
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Text style={styles.statIconText}>📅</Text>
                </View>
                <Text style={styles.statValue}>{String(upcomingExams.length)}</Text>
                <Text style={styles.statLabel}>Upcoming Exams</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Upcoming exams */}
        <View>
          <SectionTitle text="Upcoming Exams" />
          <View style={styles.listCard}>
            {upcomingExams.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming exams right now</Text>
            ) : (
              upcomingExams.map((ex: any) => (
                <View key={ex.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📝</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {ex.title}
                    </Text>
                    <Text style={styles.rowSub}>{subjectName(ex.subject_id)}</Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(ex.exam_date)}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Recent results / marks */}
        <View onLayout={reg('results')}>
          <SectionTitle text="Recent Results" />
          <View style={styles.listCard}>
            {recentResults.length === 0 ? (
              <Text style={styles.emptyText}>No results published yet</Text>
            ) : (
              recentResults.map((r: any) => (
                <View key={r.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>🏆</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {examMap[r.exam_id] || 'Exam result'}
                    </Text>
                    <Text style={styles.rowSub}>
                      {r.marks_obtained != null ? `${r.marks_obtained} marks` : '—'}
                      {r.percentage != null ? ` • ${r.percentage}%` : ''}
                    </Text>
                  </View>
                  <Chip text={r.grade || '—'} tone={gradeTone(r.grade)} />
                </View>
              ))
            )}
          </View>
        </View>

        {/* Pending homework */}
        <View onLayout={reg('homework')}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>Pending Homework</Text>
            {onNavigate ? (
              <TouchableOpacity
                style={styles.viewAllBtn}
                onPress={() => onNavigate('studentHomework')}
                activeOpacity={0.8}
              >
                <Text style={styles.viewAllText}>View All →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.listCard}>
            {pendingHomework.length === 0 ? (
              <Text style={styles.emptyText}>No pending homework — all caught up!</Text>
            ) : (
              pendingHomework.map((h: any) => (
                <View key={h.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📖</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {h.title}
                    </Text>
                    <Text style={styles.rowSub}>
                      {subjectName(h.subject_id)} • Due {fmtDate(h.due_date)}
                    </Text>
                  </View>
                  <Chip text="Pending" tone="warn" />
                </View>
              ))
            )}
          </View>
        </View>

        {/* Fee status */}
        <View onLayout={reg('fees')}>
          <SectionTitle text="Fee Status" />
          <View style={styles.listCard}>
            <View style={styles.feeSummary}>
              <View style={styles.feeBox}>
                <Text style={styles.feeBoxLabel}>Pending</Text>
                <Text style={styles.feeBoxPending}>{money(pendingAmt)}</Text>
              </View>
              <View style={styles.feeBox}>
                <Text style={styles.feeBoxLabel}>Paid</Text>
                <Text style={styles.feeBoxPaid}>{money(paidAmt)}</Text>
              </View>
            </View>

            <View style={styles.feeStatusRow}>
              <Chip text={feeStatus} tone={pendingAmt > 0 ? 'warn' : 'ok'} />
            </View>

            {fees.length === 0 ? (
              <Text style={styles.emptyText}>No fee records found</Text>
            ) : (
              dueFees.slice(0, 3).map((f: any, i: number) => (
                <View key={i} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>💰</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {feeLabel(f.fee_type)}
                    </Text>
                    <Text style={styles.rowSub}>Due {fmtDate(f.due_date)}</Text>
                  </View>
                  <Text style={styles.rowAmount}>{money(Number(f.amount || 0))}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Today's timetable */}
        <View onLayout={reg('timetable')}>
          <SectionTitle text="Today's Timetable" />
          <View style={styles.listCard}>
            {timetable.length === 0 ? (
              <Text style={styles.emptyText}>{`No classes scheduled for ${todayName}`}</Text>
            ) : (
              timetable.map((t: any) => (
                <View key={t.id} style={styles.row}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>{t.period}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {subjectName(t.subject_id)}
                    </Text>
                    <Text style={styles.rowSub}>
                      {`${fmtTime(t.start_time)} – ${fmtTime(t.end_time)}${
                        t.room ? ` • ${t.room}` : ''
                      }`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* School notices */}
        <View onLayout={reg('notices')}>
          <SectionTitle text="School Notices" />
          <View style={styles.listCard}>
            {notices.length === 0 ? (
              <Text style={styles.emptyText}>No notices published yet</Text>
            ) : (
              notices.map((n: any) => (
                <View key={n.id} style={styles.noticeRow}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📢</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text style={styles.noticeContent} numberOfLines={2}>
                      {n.content}
                    </Text>
                    <Text style={styles.rowSub}>{fmtDate(n.published_at || n.created_at)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Module cards */}
        <SectionTitle text="Quick Modules" />
        <View style={styles.grid}>
          {moduleCards.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={styles.modWrap}
              activeOpacity={0.85}
              onPress={() => (m.route && onNavigate ? onNavigate(m.route) : scrollTo(m.key))}
            >
              <View style={styles.modCard}>
                <View style={styles.modTop}>
                  <View style={styles.modIcon}>
                    <Text style={styles.modIconText}>{m.emoji}</Text>
                  </View>
                  <Text style={styles.modArrow}>→</Text>
                </View>
                <Text style={styles.modTitle} numberOfLines={2}>
                  {m.title}
                </Text>
                <View style={styles.modValuePill}>
                  <Text style={styles.modValueText} numberOfLines={1}>
                    {m.subtitle}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>D A V Academy School</Text>
          <Text style={styles.footerSub}>LEARN • GROW • BUILD YOUR FUTURE</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    color: '#1A237E',
    fontSize: 14,
    fontWeight: '600',
  },

  // ----- Header -----
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#1A237E',
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
    color: '#BBDEFB',
    fontSize: 9,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 8,
  },
  adminBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    padding: PAGE_PADDING,
    paddingBottom: 40,
  },

  // ----- Profile / welcome card -----
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    borderLeftWidth: 5,
    borderLeftColor: '#1E88E5',
    elevation: 5,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  welcomeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1A237E',
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
    color: '#1A237E',
    marginBottom: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  userMeta: {
    fontSize: 12,
    color: '#3949AB',
    fontWeight: '600',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 11,
    color: '#757575',
    marginTop: 1,
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
    backgroundColor: '#1E88E5',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.5,
  },
  viewAllBtn: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#EAF4FF',
  },
  viewAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // ----- Stat cards (3D extruded) -----
  statWrap: {
    width: COLUMN_WIDTH,
    marginBottom: GRID_GAP,
    backgroundColor: '#101652',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEF1FA',
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconText: {
    fontSize: 18,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A237E',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },

  // ----- List cards -----
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    elevation: 4,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#E3F2FD',
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
    color: '#1A237E',
  },
  rowSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  rowDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3949AB',
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
  },
  emptyText: {
    fontSize: 12,
    color: '#9E9E9E',
    paddingVertical: 10,
    textAlign: 'center',
  },

  // ----- Chips -----
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  chipInfo: {
    backgroundColor: '#E3F2FD',
  },
  chipOk: {
    backgroundColor: '#E8F5E9',
  },
  chipWarn: {
    backgroundColor: '#FFF3E0',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  chipTextInfo: {
    color: '#1565C0',
  },
  chipTextOk: {
    color: '#2E7D32',
  },
  chipTextWarn: {
    color: '#E65100',
  },

  // ----- Fee summary -----
  feeSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feeBox: {
    width: '48%',
    backgroundColor: '#F6F8FE',
    borderRadius: 12,
    padding: 12,
  },
  feeBoxLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
  },
  feeBoxPending: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E65100',
    marginTop: 4,
  },
  feeBoxPaid: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2E7D32',
    marginTop: 4,
  },
  feeStatusRow: {
    marginTop: 10,
    marginBottom: 4,
  },

  // ----- Timetable period badge -----
  periodBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  periodBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ----- Notices -----
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  noticeContent: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 17,
  },

  // ----- Module cards (3D extruded) -----
  modWrap: {
    width: COLUMN_WIDTH,
    marginBottom: GRID_GAP,
    backgroundColor: '#241C66',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#5E35B1',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  modCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1EEFA',
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
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modIconText: {
    fontSize: 20,
  },
  modArrow: {
    color: '#9E9E9E',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
    marginRight: 2,
  },
  modTitle: {
    color: '#1A237E',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  modValuePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EAF6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  modValueText: {
    color: '#3949AB',
    fontSize: 10,
    fontWeight: '700',
  },

  // ----- Footer -----
  footer: {
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  footerText: {
    color: '#1A237E',
    fontSize: 13,
    fontWeight: '800',
  },
  footerSub: {
    color: '#9E9E9E',
    fontSize: 10,
    letterSpacing: 1.5,
    marginTop: 3,
  },
})
