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

// Deep Navy -> Bright Blue gradient bands (no extra packages)
const HEADER_GRADIENT = [
  '#17217E',
  '#1A2AA6',
  '#1B3CBC',
  '#1C4DD0',
  '#1D5EE0',
  '#1E6FEB',
  '#2085F0',
  '#2196F3',
]

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

// Local calendar date (avoids UTC drift when filtering the DATE column)
const localISODate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const isoDaysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return localISODate(d)
}

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

const fmtTime = (t: string) => (t ? String(t).slice(0, 5) : '—')

const statusLabel = (s: string) => {
  if (s === 'present') return 'Present'
  if (s === 'absent') return 'Absent'
  if (s === 'late') return 'Late'
  if (s === 'excused') return 'Excused'
  return ''
}

const statusTone = (s: string): 'ok' | 'warn' | 'info' => {
  if (s === 'present' || s === 'excused') return 'ok'
  if (s === 'absent') return 'warn'
  return 'info'
}

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

export default function TeacherDashboardScreen({
  onOpenAttendance,
  onNavigate,
}: {
  onOpenAttendance?: () => void
  onNavigate?: (screen: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [teacher, setTeacher] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [homework, setHomework] = useState<any[]>([])
  // submissions per homework_id from homework_submissions (the real workflow)
  const [hwSubStats, setHwSubStats] = useState<Record<string, { count: number; ungraded: number }>>({})
  const [exams, setExams] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [loadProblems, setLoadProblems] = useState<string[]>([])

  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})

  const todayName = DAY_NAMES[new Date().getDay()]
  const todayDate = localISODate()

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

  // Load ONLY data belonging to the signed-in teacher.
  // Every query below runs as the authenticated user, so Supabase RLS
  // is what ultimately decides visibility -- nothing is bypassed.
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

        // 1. Own profile  (profiles: role, full_name, email, avatar_url)
        const profRes = await supabase
          .from('profiles')
          .select('id, role, full_name, email, avatar_url')
          .eq('id', u.id)
          .maybeSingle()
        if (!active) return
        if (profRes.error) problems.push(profRes.error.message)
        setProfile(profRes.data ?? null)

        // 2. Own teacher record (teachers: specialization / qualifications)
        const tchRes = await supabase
          .from('teachers')
          .select('id, profile_id, specialization, qualifications, status, hire_date')
          .eq('profile_id', u.id)
          .maybeSingle()
        if (!active) return
        if (tchRes.error) problems.push(tchRes.error.message)
        const teacherRow: any = tchRes.data ?? null
        setTeacher(teacherRow)

        // 3. Subjects (readable by everyone per RLS)
        const subjRes = await supabase.from('subjects').select('id, name')
        if (!active) return
        if (subjRes.error) problems.push(subjRes.error.message)
        const sMap: Record<string, string> = {}
        const subjList = (subjRes.data as any[]) ?? []
        subjList.forEach((s) => {
          if (s && s.id) sMap[s.id] = s.name
        })
        setSubjectNames(sMap)

        // 4. Classes where I am the homeroom teacher
        const clsRes = await supabase
          .from('classes')
          .select(
            'id, name, grade_level, section, academic_year, semester, homeroom_teacher_id'
          )
          .eq('homeroom_teacher_id', u.id)
          .order('name', { ascending: true })
        if (!active) return
        if (clsRes.error) problems.push(clsRes.error.message)
        const classList = (clsRes.data as any[]) ?? []
        setClasses(classList)
        const classIds = classList.map((c) => c.id)

        // Add the class scope only when we actually know our classes;
        // otherwise let RLS decide what this teacher may see.
        const scoped = (q: any) => {
          if (classIds.length > 0) return q.in('class_id', classIds)
          return q
        }

        // 5. Students enrolled in my classes
        //    (student name comes from the embedded profiles row)
        if (classIds.length > 0) {
          const stuRes = await supabase
            .from('students')
            .select(
              'id, profile_id, roll_no, admission_no, class_id, profiles!students_profile_id_fkey (full_name)'
            )
            .in('class_id', classIds)
            .order('roll_no', { ascending: true })
          if (!active) return
          if (stuRes.error) {
            // Fallback: retry without the profile embed
            const altRes = await supabase
              .from('students')
              .select('id, profile_id, roll_no, admission_no, class_id')
              .in('class_id', classIds)
              .order('roll_no', { ascending: true })
            if (!active) return
            if (altRes.error) problems.push(altRes.error.message)
            setStudents((altRes.data as any[]) ?? [])
          } else {
            setStudents((stuRes.data as any[]) ?? [])
          }
        } else {
          setStudents([])
        }

        // 6. Attendance for my classes, last 30 days
        let attQ: any = supabase
          .from('attendance')
          .select('id, student_id, class_id, date, status')
          .gte('date', isoDaysAgo(30))
          .order('date', { ascending: false })
          .limit(1000)
        attQ = scoped(attQ)
        const attRes = await attQ
        if (!active) return
        if (attRes.error) problems.push(attRes.error.message)
        setAttendance((attRes.data as any[]) ?? [])

        // 7. Homework assigned to my classes
        let hwQ: any = supabase
          .from('homework')
          .select(
            'id, title, description, due_date, max_marks, subject_id, class_id, submitted_by, teacher_id'
          )
          .order('due_date', { ascending: true })
          .limit(20)
        hwQ = scoped(hwQ)
        const hwRes = await hwQ
        if (!active) return
        if (hwRes.error) problems.push(hwRes.error.message)
        const hwList = (hwRes.data as any[]) ?? []
        setHomework(hwList)

        // Submission stats for these assignments (teachers may read submissions
        // for their own classes). `homework.submitted_by` is a legacy single
        // UUID that is never written, so it cannot reflect real submissions.
        const hwIds = hwList.map((h) => h.id).filter(Boolean)
        if (hwIds.length > 0) {
          const subRes = await supabase
            .from('homework_submissions')
            .select('homework_id, status')
            .in('homework_id', hwIds)
          if (!active) return
          if (subRes.error) problems.push(subRes.error.message)
          const stats: Record<string, { count: number; ungraded: number }> = {}
          ;((subRes.data as any[]) || []).forEach((s: any) => {
            if (!s || !s.homework_id) return
            if (!stats[s.homework_id]) stats[s.homework_id] = { count: 0, ungraded: 0 }
            stats[s.homework_id].count += 1
            if (s.status !== 'graded') stats[s.homework_id].ungraded += 1
          })
          setHwSubStats(stats)
        } else {
          setHwSubStats({})
        }

        // 8. Exams for my classes
        let exmQ: any = supabase
          .from('exams')
          .select('id, title, description, exam_date, total_marks, subject_id, class_id')
          .order('exam_date', { ascending: true })
          .limit(50)
        exmQ = scoped(exmQ)
        const exmRes = await exmQ
        if (!active) return
        if (exmRes.error) problems.push(exmRes.error.message)
        const examList = (exmRes.data as any[]) ?? []
        setExams(examList)

        // 9. Results recorded for those exams
        const examIds = examList.map((e) => e.id)
        let resQ: any = supabase
          .from('results')
          .select(
            'id, student_id, exam_id, marks_obtained, percentage, grade, remarks, recorded_by, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(50)
        if (examIds.length > 0) {
          // results has no class_id column — scope it by exam, never by class
          resQ = resQ.in('exam_id', examIds)
          const resD = await resQ
          if (!active) return
          if (resD.error) problems.push(resD.error.message)
          setResults((resD.data as any[]) ?? [])
        } else {
          // No exams in my classes => no results to show (avoids an invalid
          // class_id filter on results that previously returned a PGRST error)
          setResults([])
        }

        // 10. Today's timetable
        let ttQ: any = supabase
          .from('timetable')
          .select(
            'id, class_id, day_of_week, period, subject_id, teacher_id, room, start_time, end_time'
          )
          .eq('day_of_week', todayName)
          .order('period', { ascending: true })
          .limit(50)
        if (classIds.length > 0) {
          ttQ = ttQ.in('class_id', classIds)
        } else if (teacherRow && teacherRow.id) {
          ttQ = ttQ.eq('teacher_id', teacherRow.id)
        }
        const ttRes = await ttQ
        if (!active) return
        if (ttRes.error) problems.push(ttRes.error.message)
        setTimetable((ttRes.data as any[]) ?? [])

        // 11. Published notices addressed to teachers
        const ntcRes = await supabase
          .from('notices')
          .select('id, title, content, target_audience, created_at, published_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(10)
        if (!active) return
        if (ntcRes.error) problems.push(ntcRes.error.message)
        setNotices((ntcRes.data as any[]) ?? [])
      } catch (err: any) {
        if (active) {
          problems.push(err && err.message ? err.message : 'Unable to load dashboard data')
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

  // ---- Derived values (all computed from Supabase data, never hard-coded) ----
  const classNames: Record<string, string> = {}
  classes.forEach((c) => {
    if (c && c.id) classNames[c.id] = c.name
  })

  const examTitles: Record<string, string> = {}
  exams.forEach((e) => {
    if (e && e.id) examTitles[e.id] = e.title
  })

  const subjectName = (id: string | null) =>
    id && subjectNames[id] ? subjectNames[id] : 'Subject'

  const examTitle = (id: string) =>
    id && examTitles[id] ? examTitles[id] : 'Exam result'

  const studentCount = (classId: string) =>
    students.filter((s) => s && s.class_id === classId).length

  // Subjects actually used by my classes (via exams / homework / timetable)
  const subjectsFor = (classId: string): string[] => {
    const ids: string[] = []
    const push = (row: any) => {
      if (
        row &&
        row.class_id === classId &&
        row.subject_id &&
        subjectNames[row.subject_id] &&
        ids.indexOf(row.subject_id) < 0
      ) {
        ids.push(row.subject_id)
      }
    }
    exams.forEach(push)
    homework.forEach(push)
    timetable.forEach(push)
    return ids.map((id) => subjectNames[id])
  }

  // ---- Attendance (today) ----
  const todayRecords = attendance.filter((a) => a && a.date === todayDate)
  const todayPresent = todayRecords.filter((a) => a.status === 'present').length
  const todayAbsent = todayRecords.filter((a) => a.status === 'absent').length
  const todayLate = todayRecords.filter((a) => a.status === 'late').length
  const todayExcused = todayRecords.filter((a) => a.status === 'excused').length
  const todayTotal = todayRecords.length
  const todayPct =
    todayTotal > 0 ? Math.round(((todayPresent + todayLate) / todayTotal) * 100) : null

  const statusByStudent: Record<string, string> = {}
  todayRecords.forEach((a) => {
    if (a.student_id) statusByStudent[a.student_id] = a.status
  })
  const statusFor = (profileId: string | null) =>
    profileId && statusByStudent[profileId] ? statusByStudent[profileId] : ''

  // ---- Homework ----
  const hasSubmissions = (homeworkId: string) => {
    const s = hwSubStats[homeworkId]
    return !!s && s.count > 0
  }
  // "Pending" = no submissions yet, or submissions still awaiting grading
  const pendingHomework = homework.filter((h) => {
    if (!h) return false
    const s = hwSubStats[h.id]
    if (!s) return true
    return s.ungraded > 0
  })
  const overdueHomework = pendingHomework.filter(
    (h) => new Date(h.due_date).getTime() < Date.now()
  )
  const homeworkList = homework
    .slice()
    .sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )
    .slice(0, 5)

  // ---- Exams & results ----
  const nowMs = Date.now()
  const upcomingExams = exams
    .filter((e) => new Date(e.exam_date).getTime() >= nowMs)
    .sort(
      (a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime()
    )
    .slice(0, 5)
  const recentExams = exams
    .filter((e) => new Date(e.exam_date).getTime() < nowMs)
    .sort(
      (a, b) => new Date(b.exam_date).getTime() - new Date(a.exam_date).getTime()
    )
    .slice(0, 5)
  const recentResults = results.slice(0, 5)

  const resultExamIds: string[] = []
  results.forEach((r) => {
    if (r && r.exam_id && resultExamIds.indexOf(r.exam_id) < 0) {
      resultExamIds.push(r.exam_id)
    }
  })
  const awaitingGrading = exams.filter(
    (e) =>
      new Date(e.exam_date).getTime() < nowMs && resultExamIds.indexOf(e.id) < 0
  ).length

  // ---- Timetable / notices ----
  const timetableToday = timetable
    .filter((t) => t && t.day_of_week === todayName)
    .sort((a, b) => (a.period || 0) - (b.period || 0))

  const teacherNotices = notices
    .filter(
      (n) =>
        n && (n.target_audience === 'all' || n.target_audience === 'teachers')
    )
    .slice(0, 5)

  // ---- Identity ----
  const teacherName =
    (profile && profile.full_name) ||
    (user && user.email ? user.email.split('@')[0] : '') ||
    'Teacher'
  const initials = initialsOf(teacherName, 'T')
  const teacherEmail = (profile && profile.email) || (user && user.email) || ''
  const designation =
    (teacher && (teacher.specialization || teacher.qualifications)) || ''
  const roleDisplay = (() => {
    const r = profile && profile.role ? String(profile.role) : 'teacher'
    return r.charAt(0).toUpperCase() + r.slice(1)
  })()

  // ---- Overview statistics (live) ----
  const resultsStatValue =
    awaitingGrading > 0
      ? String(awaitingGrading)
      : String(recentResults.length)
  const resultsStatLabel =
    awaitingGrading > 0 ? 'Unchecked Results' : 'Recent Results'

  const stats = [
    { emoji: '📚', value: String(classes.length), label: 'My Classes' },
    {
      emoji: '👨‍🎓',
      value: students.length > 0 ? String(students.length) : '—',
      label: 'My Students',
    },
    {
      emoji: '📋',
      value: todayPct !== null ? `${todayPct}%` : '—',
      label: "Today's Attendance",
    },
    { emoji: '📖', value: String(pendingHomework.length), label: 'Pending Homework' },
    { emoji: '📝', value: String(upcomingExams.length), label: 'Upcoming Exams' },
    { emoji: '🏅', value: resultsStatValue, label: resultsStatLabel },
  ]

  const moduleCards: any[] = [
    {
      key: 'classes',
      route: 'classes',
      title: 'My Classes',
      emoji: '📚',
      subtitle: classes.length > 0 ? `${classes.length} assigned` : 'No classes yet',
    },
    {
      key: 'students',
      route: 'students',
      title: 'My Students',
      emoji: '👨‍🎓',
      subtitle: students.length > 0 ? `${students.length} enrolled` : 'No records yet',
    },
    {
      key: 'attendance',
      route: 'attendance',
      title: 'Attendance',
      emoji: '📋',
      subtitle: todayPct !== null ? `${todayPct}% today` : 'Not marked yet',
    },
    {
      key: 'homework',
      route: 'homework',
      title: 'Homework',
      emoji: '📖',
      subtitle:
        pendingHomework.length > 0 ? `${pendingHomework.length} pending` : 'All clear',
    },
    {
      key: 'exams',
      route: 'exams',
      title: 'Exams & Results',
      emoji: '📝',
      subtitle:
        upcomingExams.length > 0 ? `${upcomingExams.length} upcoming` : 'No exams',
    },
    {
      key: 'timetable',
      route: 'timetable',
      title: 'Timetable',
      emoji: '🕐',
      subtitle:
        timetableToday.length > 0 ? `${timetableToday.length} periods` : 'No timetable',
    },
    {
      key: 'notices',
      route: 'notices',
      title: 'Notices',
      emoji: '📢',
      subtitle:
        teacherNotices.length > 0 ? `${teacherNotices.length} updates` : 'No notices',
    },
    { key: 'staff', title: 'Staff', emoji: '👥', subtitle: 'Staff directory', route: 'staff' },
    { key: 'subjects', title: 'Subjects', emoji: '📚', subtitle: 'My subjects', route: 'subjects' },
    { key: 'syllabus', title: 'Syllabus', emoji: '📘', subtitle: 'Class syllabus', route: 'syllabus' },
    {
      key: 'complaints',
      title: 'Complaints',
      emoji: '🎫',
      subtitle: 'Student issues',
      route: 'complaints',
    },
    {
      key: 'calendar',
      title: 'Academic Calendar',
      emoji: '🗓️',
      subtitle: 'Events & dates',
      route: 'calendar',
    },
    { key: 'transport', title: 'Transport', emoji: '🚌', subtitle: 'Routes overview', route: 'transport' },
    { key: 'profile', title: 'My Profile', emoji: '👤', subtitle: 'View details' },
  ].filter((m: any) => !m.route || !!onNavigate)

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17217E" />
        <Text style={styles.loadingText}>Loading your teacher dashboard…</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* ---------- Fixed gradient header ---------- */}
      <View style={styles.header}>
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

        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
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
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => scrollTo('profile')}
              activeOpacity={0.7}
              accessibilityLabel="Settings"
            >
              <Text style={styles.settingsBtnText}>⚙</Text>
            </TouchableOpacity>
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
        {loadProblems.length > 0 ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText} numberOfLines={3}>
              ⚠ {loadProblems[0]}
            </Text>
          </View>
        ) : null}

        {/* Teacher profile / avatar + welcome */}
        <View style={styles.welcomeCard} onLayout={reg('profile')}>
          <View style={styles.welcomeAvatar}>
            <Text style={styles.welcomeAvatarText}>{initials}</Text>
          </View>
          <View style={styles.welcomeInfo}>
            <Text style={styles.welcomeText}>Welcome Back!</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {teacherName}
            </Text>
            <Text style={styles.userMeta} numberOfLines={1}>
              {designation || roleDisplay}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {teacherEmail}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleDisplay}</Text>
            </View>
          </View>
        </View>

        {/* ---------- Overview ---------- */}
        <SectionTitle text="Overview" />
        <View style={styles.grid}>
          {stats.map((s, idx) => (
            <View key={`${s.label}-${idx}`} style={styles.statWrap}>
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Text style={styles.statIconText}>{s.emoji}</Text>
                </View>
                <Text style={styles.statValue} numberOfLines={1}>
                  {s.value}
                </Text>
                <Text style={styles.statLabel} numberOfLines={2}>
                  {s.label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ---------- Quick Modules (primary navigation, directly after Overview) ---------- */}
        <SectionTitle text="Quick Modules" />
        <View style={styles.grid}>
          {moduleCards.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={styles.modWrap}
              activeOpacity={0.85}
              onPress={() =>
                (m.key === 'attendance' && onOpenAttendance)
                  ? onOpenAttendance()
                  : (m.route && onNavigate ? onNavigate(m.route) : scrollTo(m.key))
              }
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

        {/* ---------- My Classes ---------- */}
        <View onLayout={reg('classes')}>
          <SectionTitle text="My Classes" />
          <View style={styles.listCard}>
            {classes.length === 0 ? (
              <Text style={styles.emptyText}>
                No classes assigned to you yet
              </Text>
            ) : (
              classes.map((c) => {
                const subs = subjectsFor(c.id)
                const count = studentCount(c.id)
                return (
                  <View key={c.id} style={styles.classCard}>
                    <View style={styles.classHead}>
                      <View style={styles.classIcon}>
                        <Text style={styles.classIconText}>🏫</Text>
                      </View>
                      <View style={styles.classHeadBody}>
                        <Text style={styles.classTitle} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.classMeta} numberOfLines={1}>
                          Grade {c.grade_level != null ? c.grade_level : '—'}
                          {c.section ? ` • Section ${c.section}` : ''}
                        </Text>
                      </View>
                      <View style={styles.classBadge}>
                        <Text style={styles.classBadgeText} numberOfLines={1}>
                          {c.academic_year || '—'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.classStats}>
                      <View style={styles.classStat}>
                        <Text style={styles.classStatValue}>
                          {String(count)}
                        </Text>
                        <Text style={styles.classStatLabel}>Students</Text>
                      </View>
                      <View style={styles.classStat}>
                        <Text style={styles.classStatValue}>
                          {subs.length > 0 ? String(subs.length) : '—'}
                        </Text>
                        <Text style={styles.classStatLabel}>Subjects</Text>
                      </View>
                      <View style={styles.classStat}>
                        <Text style={styles.classStatValue} numberOfLines={1}>
                          {c.semester || '—'}
                        </Text>
                        <Text style={styles.classStatLabel}>Semester</Text>
                      </View>
                    </View>

                    {subs.length > 0 ? (
                      <Text style={styles.classSubjects} numberOfLines={2}>
                        {subs.join(' • ')}
                      </Text>
                    ) : null}
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* ---------- My Students ---------- */}
        <View onLayout={reg('students')}>
          <SectionTitle text="My Students" />
          <View style={styles.listCard}>
            {students.length === 0 ? (
              <Text style={styles.emptyText}>
                No student records available for your classes yet
              </Text>
            ) : (
              students.map((s) => {
                const name =
                  (s.profiles && s.profiles.full_name) ||
                  s.roll_no ||
                  'Student'
                const st = statusFor(s.profile_id)
                return (
                  <View key={s.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Text style={styles.rowIconText}>
                        {initialsOf(name, 'S')}
                      </Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {s.roll_no ? `Roll ${s.roll_no}` : 'Roll —'}
                        {classNames[s.class_id]
                          ? ` • ${classNames[s.class_id]}`
                          : ''}
                      </Text>
                    </View>
                    {st ? (
                      <Chip text={statusLabel(st)} tone={statusTone(st)} />
                    ) : (
                      <Text style={styles.rowDate}>—</Text>
                    )}
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* ---------- Attendance ---------- */}
        <View onLayout={reg('attendance')}>
          <SectionTitle text="Attendance" />
          <View style={styles.listCard}>
            <View style={styles.attTop}>
              <View style={styles.attPctCircle}>
                <Text style={styles.attPctValue}>
                  {todayPct !== null ? `${todayPct}%` : '—'}
                </Text>
                <Text style={styles.attPctLabel}>Today</Text>
              </View>

              <View style={styles.attCounts}>
                <View style={styles.attCountRow}>
                  <View style={[styles.attCountDot, styles.dotOk]} />
                  <Text style={styles.attCountLabel}>Present</Text>
                  <Text style={styles.attCountValue}>{todayPresent}</Text>
                </View>
                <View style={styles.attCountRow}>
                  <View style={[styles.attCountDot, styles.dotWarn]} />
                  <Text style={styles.attCountLabel}>Absent</Text>
                  <Text style={styles.attCountValue}>{todayAbsent}</Text>
                </View>
                <View style={styles.attCountRow}>
                  <View style={[styles.attCountDot, styles.dotLate]} />
                  <Text style={styles.attCountLabel}>Late</Text>
                  <Text style={styles.attCountValue}>{todayLate}</Text>
                </View>
                {todayExcused > 0 ? (
                  <View style={styles.attCountRow}>
                    <View style={[styles.attCountDot, styles.dotExcused]} />
                    <Text style={styles.attCountLabel}>Excused</Text>
                    <Text style={styles.attCountValue}>{todayExcused}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Text style={styles.emptyText}>
              {todayTotal > 0
                ? `${todayTotal} record${todayTotal === 1 ? '' : 's'} marked today`
                : 'No attendance marked yet today'}
            </Text>
          </View>

          {onOpenAttendance ? (
            <TouchableOpacity
              style={styles.ctaWrap}
              onPress={onOpenAttendance}
              activeOpacity={0.85}
            >
              <View style={styles.ctaCard}>
                <Text style={styles.ctaIcon}>📋</Text>
                <View style={styles.ctaBody}>
                  <Text style={styles.ctaTitle}>Open Attendance Tool</Text>
                  <Text style={styles.ctaSub}>
                    Mark or review attendance for your classes
                  </Text>
                </View>
                <Text style={styles.ctaArrow}>→</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ---------- Homework ---------- */}
        <View onLayout={reg('homework')}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionBar} />
            <Text style={styles.sectionTitle}>Homework</Text>
            {onNavigate ? (
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={() => onNavigate('homework')}
                activeOpacity={0.8}
              >
                <Text style={styles.manageBtnText}>Manage →</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.listCard}>
            {homeworkList.length === 0 ? (
              <Text style={styles.emptyText}>No homework assigned yet</Text>
            ) : (
              homeworkList.map((h) => (
                <View key={h.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📖</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {h.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {subjectName(h.subject_id)}
                      {classNames[h.class_id]
                        ? ` • ${classNames[h.class_id]}`
                        : ''}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      Due {fmtDate(h.due_date)}
                    </Text>
                  </View>
                  <Chip
                    text={hasSubmissions(h.id) ? 'Submitted' : 'Pending'}
                    tone={hasSubmissions(h.id) ? 'ok' : 'warn'}
                  />
                </View>
              ))
            )}

            {homework.length > 0 ? (
              <Text style={styles.summaryLine}>
                {pendingHomework.length} pending
                {overdueHomework.length > 0
                  ? ` • ${overdueHomework.length} overdue`
                  : ''}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ---------- Exams & Results ---------- */}
        <View onLayout={reg('exams')}>
          <SectionTitle text="Exams & Results" />

          {awaitingGrading > 0 ? (
            <View style={styles.badgeRow}>
              <View style={styles.goldBadge}>
                <Text style={styles.goldBadgeText}>
                  ⏳ {awaitingGrading} awaiting grading
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.subTitle}>Upcoming Exams</Text>
          <View style={styles.listCard}>
            {upcomingExams.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming exams scheduled</Text>
            ) : (
              upcomingExams.map((e) => (
                <View key={e.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>📝</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {subjectName(e.subject_id)}
                      {classNames[e.class_id]
                        ? ` • ${classNames[e.class_id]}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(e.exam_date)}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.subTitle}>Recent Exams</Text>
          <View style={styles.listCard}>
            {recentExams.length === 0 ? (
              <Text style={styles.emptyText}>No past exams yet</Text>
            ) : (
              recentExams.map((e) => (
                <View key={e.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>🗓️</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {subjectName(e.subject_id)}
                      {classNames[e.class_id]
                        ? ` • ${classNames[e.class_id]}`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>{fmtShortDate(e.exam_date)}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.subTitle}>Recent Results</Text>
          <View style={styles.listCard}>
            {recentResults.length === 0 ? (
              <Text style={styles.emptyText}>No results recorded yet</Text>
            ) : (
              recentResults.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>🏆</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {examTitle(r.exam_id)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {r.grade ? `Grade ${r.grade}` : 'Not graded'}
                      {r.marks_obtained != null
                        ? ` • ${r.marks_obtained} marks`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowAmount}>
                    {r.percentage != null ? `${r.percentage}%` : '—'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* ---------- Timetable ---------- */}
        <View onLayout={reg('timetable')}>
          <SectionTitle text="Today's Timetable" />
          <View style={styles.listCard}>
            {timetableToday.length === 0 ? (
              <Text style={styles.emptyText}>
                No timetable available for {todayName}
              </Text>
            ) : (
              timetableToday.map((t) => (
                <View key={t.id} style={styles.row}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>{t.period}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {subjectName(t.subject_id)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {classNames[t.class_id] || 'Class —'}
                      {t.room ? ` • Room ${t.room}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>
                    {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* ---------- Notices ---------- */}
        <View onLayout={reg('notices')}>
          <SectionTitle text="Notices" />
          <View style={styles.listCard}>
            {teacherNotices.length === 0 ? (
              <Text style={styles.emptyText}>No published notices yet</Text>
            ) : (
              teacherNotices.map((n) => (
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
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },

  // ----- Header -----
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#17217E',
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
    backgroundColor: 'rgba(255,255,255,0.07)',
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
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  settingsBtnText: {
    fontSize: 16,
    color: '#FFFFFF',
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

  // ----- Error / notice banner -----
  banner: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    padding: 12,
    marginBottom: 14,
  },
  bannerText: {
    color: '#8D6E00',
    fontSize: 12,
    fontWeight: '600',
  },

  // ----- Welcome / profile card -----
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    borderLeftWidth: 5,
    borderLeftColor: '#2196F3',
    elevation: 5,
    shadowColor: '#17217E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  welcomeAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#17217E',
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
    color: '#17217E',
    marginBottom: 2,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  userMeta: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 11,
    color: '#757575',
    marginTop: 1,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  roleBadgeText: {
    color: '#8D6E00',
    fontSize: 10,
    fontWeight: '800',
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
    backgroundColor: '#2196F3',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#17217E',
    letterSpacing: 0.5,
  },
  manageBtn: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#EAF4FF',
  },
  manageBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2196F3',
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
    width: COLUMN_WIDTH,
    marginBottom: GRID_GAP,
    backgroundColor: '#0E1560',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#17217E',
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
    backgroundColor: '#EAF4FF',
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
    color: '#17217E',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 2,
  },

  // ----- Module cards (3D extruded) -----
  modWrap: {
    width: COLUMN_WIDTH,
    marginBottom: GRID_GAP,
    backgroundColor: '#123A6B',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  modCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EAF4FF',
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
    backgroundColor: '#EAF4FF',
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
    color: '#17217E',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  modValuePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF4FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  modValueText: {
    color: '#1B5FBF',
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
    borderColor: '#EEF1FA',
    elevation: 4,
    shadowColor: '#17217E',
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
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowIconText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#17217E',
  },
  rowBody: {
    flex: 1,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#17217E',
  },
  rowSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  rowDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },
  rowAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#17217E',
  },
  emptyText: {
    fontSize: 12,
    color: '#9E9E9E',
    paddingVertical: 10,
    textAlign: 'center',
  },
  summaryLine: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8D6E00',
    marginTop: 10,
    textAlign: 'center',
  },

  // ----- Class cards -----
  classCard: {
    backgroundColor: '#FAFCFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3ECFA',
    padding: 12,
    marginBottom: 10,
  },
  classHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  classIconText: {
    fontSize: 18,
  },
  classHeadBody: {
    flex: 1,
    marginRight: 8,
  },
  classTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#17217E',
  },
  classMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  classBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  classBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8D6E00',
  },
  classStats: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E9F0FB',
  },
  classStat: {
    flex: 1,
    alignItems: 'center',
  },
  classStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2196F3',
  },
  classStatLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },
  classSubjects: {
    fontSize: 11,
    color: '#1B5FBF',
    marginTop: 10,
    fontWeight: '600',
  },

  // ----- Attendance summary -----
  attTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  attPctCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#EAF4FF',
    borderWidth: 2,
    borderColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  attPctValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#17217E',
  },
  attPctLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
    marginTop: 2,
  },
  attCounts: {
    flex: 1,
  },
  attCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  attCountDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  dotOk: {
    backgroundColor: '#2E7D32',
  },
  dotWarn: {
    backgroundColor: '#C62828',
  },
  dotLate: {
    backgroundColor: '#F9A825',
  },
  dotExcused: {
    backgroundColor: '#78909C',
  },
  attCountLabel: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  attCountValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#17217E',
  },

  // ----- Attendance CTA -----
  ctaWrap: {
    marginBottom: 18,
    backgroundColor: '#0E2A52',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 16,
    padding: 14,
  },
  ctaIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  ctaBody: {
    flex: 1,
  },
  ctaTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  ctaSub: {
    color: '#E3F2FD',
    fontSize: 11,
    marginTop: 2,
  },
  ctaArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 8,
  },

  // ----- Gold highlight badge -----
  badgeRow: {
    marginBottom: 10,
  },
  goldBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FFD54F',
  },
  goldBadgeText: {
    color: '#8D6E00',
    fontSize: 11,
    fontWeight: '800',
  },

  // ----- Timetable period badge -----
  periodBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#17217E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  periodBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ----- Chips -----
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  chipInfo: {
    backgroundColor: '#EAF4FF',
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
    color: '#1B5FBF',
  },
  chipTextOk: {
    color: '#2E7D32',
  },
  chipTextWarn: {
    color: '#E65100',
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
    color: '#17217E',
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
