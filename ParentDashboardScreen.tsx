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

const SCREEN_WIDTH = Dimensions.get('window').width
const PAGE_PADDING = 16
const GRID_GAP = 14
const COLUMN_WIDTH = Math.min(
  Math.floor((SCREEN_WIDTH - PAGE_PADDING * 2 - GRID_GAP) / 2),
  260
)

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

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

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

export default function ParentDashboardScreen({
  onNavigate,
}: {
  onNavigate?: (screen: string) => void
} = {}) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [children, setChildren] = useState<any[]>([])
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)

  // Child-specific data
  const [attendance, setAttendance] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [homework, setHomework] = useState<any[]>([])
  const [mySubs, setMySubs] = useState<Record<string, any>>({})
  const [fees, setFees] = useState<any[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [notices, setNotices] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [classNames, setClassNames] = useState<Record<string, string>>({})
  const [examTitles, setExamTitles] = useState<Record<string, string>>({})

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

  // ---- Load parent profile + linked children ----
  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const { data: sess } = await supabase.auth.getSession()
        const u = sess && sess.session ? sess.session.user : null
        if (!u) return

        const { data: prof } = await supabase
          .from('profiles')
          .select('id, role, full_name, email, phone, avatar_url')
          .eq('id', u.id)
          .maybeSingle()
        if (!active) return
        setProfile(prof ?? null)

        // Linked children (RLS: parents can view own relationships)
        const { data: rels } = await supabase
          .from('parent_students')
          .select('id, student_id, relationship')
          .eq('parent_id', u.id)
        if (!active) return

        const studentIds = (rels || []).map((r: any) => r.student_id)

        if (studentIds.length > 0) {
          const { data: stu } = await supabase
            .from('students')
            .select(
              'id, profile_id, roll_no, admission_no, date_of_birth, gender, address, class_id, profiles!students_profile_id_fkey (full_name, email), classes!students_class_id_fkey (name, grade_level, section)'
            )
            .in('id', studentIds)
            .order('roll_no', { ascending: true })
          if (!active) return

          const relMap: Record<string, any> = {}
          ;(rels || []).forEach((r: any) => {
            relMap[r.student_id] = r
          })

          const childList = (stu || []).map((s: any) => ({
            ...s,
            _relationship: relMap[s.id] ? relMap[s.id].relationship : '',
          }))
          setChildren(childList)

          // Auto-select if only one child
          if (childList.length === 1) {
            setSelectedChildId(childList[0].id)
          }
        } else {
          setChildren([])
          setSelectedChildId(null)
        }
      } catch (err) {
        console.error('Parent dashboard load error:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  // ---- Load selected child's data (scoped by RLS to linked children) ----
  useEffect(() => {
    let active = true
    if (!selectedChildId) {
      setAttendance([])
      setResults([])
      setHomework([])
      setMySubs({})
      setFees([])
      setTimetable([])
      return
    }

    const loadChild = async () => {
      try {
        const child = children.find((c) => c.id === selectedChildId)
        if (!child) return
        // attendance/results/fees keys are profiles(id): use the child's profile_id
        // (the embedded profiles row above does not request id, so child.profiles.id
        //  would be undefined and every filtered query would match nothing).
        const profileId = child.profile_id || (child.profiles ? child.profiles.id : null)
        const classId = child.class_id

        // Subjects + classes + exams name maps
        const { data: subj } = await supabase.from('subjects').select('id, name')
        if (!active) return
        const sMap: Record<string, string> = {}
        ;(subj || []).forEach((s: any) => {
          if (s && s.id) sMap[s.id] = s.name
        })
        setSubjectNames(sMap)

        const { data: cls } = await supabase.from('classes').select('id, name')
        if (!active) return
        const cMap: Record<string, string> = {}
        ;(cls || []).forEach((c: any) => {
          if (c && c.id) cMap[c.id] = c.name
        })
        setClassNames(cMap)

        const { data: ex } = await supabase.from('exams').select('id, title')
        if (!active) return
        const eMap: Record<string, string> = {}
        ;(ex || []).forEach((e: any) => {
          if (e && e.id) eMap[e.id] = e.title
        })
        setExamTitles(eMap)

        // Attendance (RLS: parents can view linked student attendance)
        const { data: att } = await supabase
          .from('attendance')
          .select('id, status, date')
          .eq('student_id', profileId)
          .order('date', { ascending: false })
          .limit(200)
        if (!active) return
        setAttendance((att || []) as any[])

        // Results (RLS: parents can view linked student results)
        const { data: res } = await supabase
          .from('results')
          .select('id, exam_id, marks_obtained, percentage, grade, created_at')
          .eq('student_id', profileId)
          .order('created_at', { ascending: false })
          .limit(20)
        if (!active) return
        setResults((res || []) as any[])

        // Homework for the child's class (RLS: parents can view linked student homework)
        if (classId) {
          const { data: hw } = await supabase
            .from('homework')
            .select('id, title, description, due_date, max_marks, subject_id, class_id')
            .eq('class_id', classId)
            .order('due_date', { ascending: true })
            .limit(50)
          if (!active) return
          setHomework((hw || []) as any[])

          // My child's submissions (RLS: parents can view linked student submissions)
          const { data: subs } = await supabase
            .from('homework_submissions')
            .select('id, homework_id, submission_text, submitted_at, status, marks_obtained, teacher_feedback')
            .eq('student_id', selectedChildId)
          if (!active) return
          const subMap: Record<string, any> = {}
          ;(subs || []).forEach((s: any) => {
            if (s.homework_id) subMap[s.homework_id] = s
          })
          setMySubs(subMap)
        } else {
          setHomework([])
          setMySubs({})
        }

        // Fees (RLS: parents can view linked student fees)
        const { data: fee } = await supabase
          .from('fees')
          .select('id, amount, fee_type, due_date, payment_status, paid_date')
          .eq('student_id', profileId)
          .order('due_date', { ascending: true })
          .limit(50)
        if (!active) return
        setFees((fee || []) as any[])

        // Timetable for the child's class (RLS: parents can view linked student timetable)
        if (classId) {
          const { data: tt } = await supabase
            .from('timetable')
            .select('id, period, start_time, end_time, room, subject_id, day_of_week')
            .eq('class_id', classId)
            .eq('day_of_week', todayName)
            .order('period', { ascending: true })
          if (!active) return
          setTimetable((tt || []) as any[])
        } else {
          setTimetable([])
        }
      } catch (err) {
        console.error('Parent child data load error:', err)
      }
    }

    loadChild()
    return () => {
      active = false
    }
  }, [selectedChildId, children, todayName])

  // ---- Notices (RLS: parents see published 'all'/'parents' notices) ----
  useEffect(() => {
    let active = true
    const loadNotices = async () => {
      try {
        const { data } = await supabase
          .from('notices')
          .select('id, title, content, target_audience, published_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(10)
        if (!active) return
        setNotices((data || []) as any[])
      } catch (err) {
        console.error('Notices load error:', err)
      }
    }
    loadNotices()
    return () => {
      active = false
    }
  }, [])

  // ---- Derived values ----
  const selectedChild = children.find((c) => c.id === selectedChildId) || null
  const childName = selectedChild
    ? (selectedChild.profiles && selectedChild.profiles.full_name) ||
      selectedChild.roll_no ||
      'Student'
    : ''
  const childClass = selectedChild && selectedChild.classes ? selectedChild.classes : null

  const totalAtt = attendance.length
  const presentCount = attendance.filter((a) => a.status === 'present').length
  const absentCount = attendance.filter((a) => a.status === 'absent').length
  const lateCount = attendance.filter((a) => a.status === 'late').length
  const excusedCount = attendance.filter((a) => a.status === 'excused').length
  const attPct =
    totalAtt > 0 ? Math.round(((presentCount + lateCount) / totalAtt) * 100) : null

  const nowMs = Date.now()
  const pendingHomework = homework.filter((h) => !mySubs[h.id])
  const submittedHomework = homework.filter((h) => {
    const s = mySubs[h.id]
    return s && s.status !== 'graded'
  })
  const gradedHomework = homework.filter((h) => {
    const s = mySubs[h.id]
    return s && s.status === 'graded'
  })

  const totalFees = fees.reduce((s, f) => s + Number(f.amount || 0), 0)
  const paidFees = fees
    .filter((f) => f.payment_status === 'paid')
    .reduce((s, f) => s + Number(f.amount || 0), 0)
  const pendingFees = fees.filter(
    (f) => f.payment_status === 'unpaid' || f.payment_status === 'partial'
  )
  const pendingFeeAmt = pendingFees.reduce((s, f) => s + Number(f.amount || 0), 0)

  const parentName =
    (profile && profile.full_name) || (profile && profile.email ? profile.email.split('@')[0] : '') || 'Parent'
  const initials = initialsOf(parentName, 'P')

  const moduleCards: any[] = [
    {
      key: 'children',
      title: 'My Children',
      emoji: '👨‍👩‍👧',
      subtitle: children.length > 0 ? `${children.length} linked` : 'No children',
    },
    {
      key: 'attendance',
      title: 'Attendance',
      emoji: '📋',
      subtitle: attPct !== null ? `${attPct}% attended` : 'No records',
    },
    {
      key: 'results',
      title: 'Results',
      emoji: '📝',
      subtitle: results.length > 0 ? `${results.length} results` : 'No results',
    },
    {
      key: 'homework',
      title: 'Homework',
      emoji: '📖',
      subtitle: pendingHomework.length > 0 ? `${pendingHomework.length} pending` : 'All clear',
    },
    {
      key: 'fees',
      title: 'Fees',
      emoji: '💰',
      subtitle: pendingFeeAmt > 0 ? `${money(pendingFeeAmt)} due` : 'No dues',
    },
    {
      key: 'timetable',
      title: 'Timetable',
      emoji: '🕐',
      subtitle: timetable.length > 0 ? `${timetable.length} periods` : 'No timetable',
    },
    {
      key: 'notices',
      title: 'Notices',
      emoji: '📢',
      subtitle: notices.length > 0 ? `${notices.length} updates` : 'No notices',
    },
    { key: 'subjects', title: 'Subjects', emoji: '📖', subtitle: 'Subjects studied', route: 'subjects' },
    { key: 'syllabus', title: 'Syllabus', emoji: '📚', subtitle: 'Course plans', route: 'syllabus' },
    { key: 'staff', title: 'Staff', emoji: '🧑‍🏫', subtitle: 'Staff directory', route: 'staff' },
    { key: 'transport', title: 'Transport', emoji: '🚌', subtitle: "Child's route", route: 'transport' },
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
        <Text style={styles.loadingText}>Loading parent dashboard…</Text>
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
            <View style={styles.roleLabel}>
              <Text style={styles.roleLabelText}>Parent Dashboard</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
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
        {/* Welcome card */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeAvatar}>
            <Text style={styles.welcomeAvatarText}>{initials}</Text>
          </View>
          <View style={styles.welcomeInfo}>
            <Text style={styles.welcomeText}>Welcome Back!</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {parentName}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {(profile && profile.email) || ''}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>PARENT</Text>
            </View>
          </View>
        </View>

        {/* Child selector */}
        {children.length > 0 ? (
          <View onLayout={reg('children')}>
            <SectionTitle text="My Children" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.childScroll}
              contentContainerStyle={styles.childRow}
            >
              {children.map((c) => {
                const name =
                  (c.profiles && c.profiles.full_name) || c.roll_no || 'Student'
                const active = c.id === selectedChildId
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.childCard, active && styles.childCardActive]}
                    onPress={() => setSelectedChildId(c.id)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.childAvatar, active && styles.childAvatarActive]}>
                      <Text style={styles.childAvatarText}>{initialsOf(name, 'S')}</Text>
                    </View>
                    <Text style={[styles.childName, active && styles.childNameActive]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.childMeta, active && styles.childMetaActive]} numberOfLines={1}>
                      {c.classes ? c.classes.name : '—'}
                    </Text>
                    <Text style={[styles.childMeta, active && styles.childMetaActive]} numberOfLines={1}>
                      {c.roll_no ? `Roll ${c.roll_no}` : ''}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No children linked to your account</Text>
          </View>
        )}

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

        {/* Child profile */}
        <View onLayout={reg('profile')}>
          <SectionTitle text="Child Profile" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child above to view their profile</Text>
            ) : (
              <View style={styles.profileGrid}>
                <ProfileRow label="Name" value={childName} />
                <ProfileRow
                  label="Class"
                  value={
                    childClass
                      ? `${childClass.name}${childClass.section ? ` • ${childClass.section}` : ''}`
                      : '—'
                  }
                />
                <ProfileRow label="Roll Number" value={selectedChild.roll_no} />
                <ProfileRow label="Admission No" value={selectedChild.admission_no} />
                <ProfileRow
                  label="Date of Birth"
                  value={selectedChild.date_of_birth ? fmtDate(selectedChild.date_of_birth) : '—'}
                />
                <ProfileRow label="Gender" value={selectedChild.gender} />
                <ProfileRow label="Address" value={selectedChild.address} />
                <ProfileRow
                  label="Relationship"
                  value={selectedChild._relationship || '—'}
                />
              </View>
            )}
          </View>
        </View>

        {/* Attendance */}
        <View onLayout={reg('attendance')}>
          <SectionTitle text="Attendance" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child to view attendance</Text>
            ) : totalAtt === 0 ? (
              <Text style={styles.emptyText}>No attendance records</Text>
            ) : (
              <>
                <View style={styles.attTop}>
                  <View style={styles.attPctCircle}>
                    <Text style={styles.attPctValue}>
                      {attPct !== null ? `${attPct}%` : '—'}
                    </Text>
                    <Text style={styles.attPctLabel}>Overall</Text>
                  </View>
                  <View style={styles.attCounts}>
                    <View style={styles.attCountRow}>
                      <View style={[styles.attCountDot, styles.dotOk]} />
                      <Text style={styles.attCountLabel}>Present</Text>
                      <Text style={styles.attCountValue}>{presentCount}</Text>
                    </View>
                    <View style={styles.attCountRow}>
                      <View style={[styles.attCountDot, styles.dotWarn]} />
                      <Text style={styles.attCountLabel}>Absent</Text>
                      <Text style={styles.attCountValue}>{absentCount}</Text>
                    </View>
                    <View style={styles.attCountRow}>
                      <View style={[styles.attCountDot, styles.dotLate]} />
                      <Text style={styles.attCountLabel}>Late</Text>
                      <Text style={styles.attCountValue}>{lateCount}</Text>
                    </View>
                    {excusedCount > 0 ? (
                      <View style={styles.attCountRow}>
                        <View style={[styles.attCountDot, styles.dotExcused]} />
                        <Text style={styles.attCountLabel}>Excused</Text>
                        <Text style={styles.attCountValue}>{excusedCount}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.emptyText}>
                  {totalAtt} record{totalAtt === 1 ? '' : 's'} total
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Results */}
        <View onLayout={reg('results')}>
          <SectionTitle text="Results" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child to view results</Text>
            ) : results.length === 0 ? (
              <Text style={styles.emptyText}>No results published yet</Text>
            ) : (
              results.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={styles.rowIcon}>
                    <Text style={styles.rowIconText}>🏆</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {examTitles[r.exam_id] || 'Exam result'}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {r.grade ? `Grade ${r.grade}` : 'Not graded'}
                      {r.marks_obtained != null ? ` • ${r.marks_obtained} marks` : ''}
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

        {/* Homework */}
        <View onLayout={reg('homework')}>
          <SectionTitle text="Homework" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child to view homework</Text>
            ) : homework.length === 0 ? (
              <Text style={styles.emptyText}>No homework assigned</Text>
            ) : (
              homework.map((h) => {
                const sub = mySubs[h.id]
                const status = sub
                  ? sub.status === 'graded'
                    ? 'Graded'
                    : 'Submitted'
                  : 'Pending'
                return (
                  <View key={h.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Text style={styles.rowIconText}>📖</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {h.title}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {subjectNames[h.subject_id] || 'Subject'} • Due {fmtShortDate(h.due_date)}
                      </Text>
                      {sub && sub.status === 'graded' ? (
                        <Text style={styles.rowSub} numberOfLines={1}>
                          Marks: {sub.marks_obtained ?? '—'}
                          {sub.teacher_feedback ? ` • ${sub.teacher_feedback}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        status === 'Graded'
                          ? styles.statusOk
                          : status === 'Submitted'
                          ? styles.statusInfo
                          : styles.statusWarn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          status === 'Graded'
                            ? styles.statusTextOk
                            : status === 'Submitted'
                            ? styles.statusTextInfo
                            : styles.statusTextWarn,
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        </View>

        {/* Fees */}
        <View onLayout={reg('fees')}>
          <SectionTitle text="Fees" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child to view fees</Text>
            ) : fees.length === 0 ? (
              <Text style={styles.emptyText}>No fee records</Text>
            ) : (
              <>
                <View style={styles.feeSummary}>
                  <View style={styles.feeBox}>
                    <Text style={styles.feeValue}>{money(totalFees)}</Text>
                    <Text style={styles.feeLabel}>Total</Text>
                  </View>
                  <View style={styles.feeBox}>
                    <Text style={styles.feeValue}>{money(paidFees)}</Text>
                    <Text style={styles.feeLabel}>Paid</Text>
                  </View>
                  <View style={styles.feeBox}>
                    <Text style={styles.feeValue}>{money(pendingFeeAmt)}</Text>
                    <Text style={styles.feeLabel}>Pending</Text>
                  </View>
                </View>
                {fees.map((f) => (
                  <View key={f.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Text style={styles.rowIconText}>💰</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {f.fee_type ? f.fee_type : 'Fee'} • {money(f.amount)}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        Due {fmtShortDate(f.due_date)} • {f.payment_status}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>

        {/* Timetable */}
        <View onLayout={reg('timetable')}>
          <SectionTitle text="Today's Timetable" />
          <View style={styles.listCard}>
            {!selectedChild ? (
              <Text style={styles.emptyText}>Select a child to view timetable</Text>
            ) : timetable.length === 0 ? (
              <Text style={styles.emptyText}>No timetable available for {todayName}</Text>
            ) : (
              timetable.map((t) => (
                <View key={t.id} style={styles.row}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>{t.period}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {subjectNames[t.subject_id] || 'Subject'}
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

        {/* Notices */}
        <View onLayout={reg('notices')}>
          <SectionTitle text="Notices" />
          <View style={styles.listCard}>
            {notices.length === 0 ? (
              <Text style={styles.emptyText}>No published notices for you</Text>
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

        <View style={styles.footer}>
          <Text style={styles.footerText}>D A V Academy School</Text>
          <Text style={styles.footerSub}>LEARN • GROW • BUILD YOUR FUTURE</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const ProfileRow = ({ label, value }: { label: string; value: any }) => (
  <View style={styles.profileRow}>
    <Text style={styles.profileLabel}>{label}</Text>
    <Text style={styles.profileValue} numberOfLines={2}>
      {value || '—'}
    </Text>
  </View>
)

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
  roleLabel: {
    marginTop: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  roleLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // ----- Welcome card -----
  welcomeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    borderLeftWidth: 5,
    borderLeftColor: '#42A5F5',
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
  userEmail: {
    fontSize: 12,
    color: '#757575',
    marginTop: 1,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
  },
  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
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
    backgroundColor: '#42A5F5',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.5,
  },

  // ----- Child selector -----
  childScroll: {
    marginBottom: 8,
  },
  childRow: {
    paddingVertical: 4,
  },
  childCard: {
    width: 110,
    backgroundColor: '#F5F8FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3ECFA',
    padding: 10,
    marginRight: 10,
    alignItems: 'center',
  },
  childCardActive: {
    backgroundColor: '#EAF4FF',
    borderColor: '#1A237E',
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  childAvatarActive: {
    backgroundColor: '#42A5F5',
  },
  childAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  childName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
    textAlign: 'center',
  },
  childNameActive: {
    color: '#1A237E',
  },
  childMeta: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
  },
  childMetaActive: {
    color: '#1B5FBF',
  },

  emptyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyText: {
    color: '#757575',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // ----- Module cards (3D extruded) -----
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
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
    backgroundColor: '#EDE7F6',
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

  // ----- Child profile -----
  profileGrid: {
    paddingVertical: 4,
  },
  profileRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  profileLabel: {
    width: 110,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  profileValue: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },

  // ----- Attendance -----
  attTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  attPctCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#EAF4FF',
    borderWidth: 2,
    borderColor: '#42A5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  attPctValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A237E',
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
    color: '#1A237E',
  },

  // ----- Rows -----
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

  // ----- Status badge -----
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusOk: {
    backgroundColor: '#E8F5E9',
  },
  statusInfo: {
    backgroundColor: '#E3F2FD',
  },
  statusWarn: {
    backgroundColor: '#FFF3E0',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusTextOk: {
    color: '#2E7D32',
  },
  statusTextInfo: {
    color: '#1565C0',
  },
  statusTextWarn: {
    color: '#E65100',
  },

  // ----- Fees -----
  feeSummary: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  feeBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F5F8FF',
    borderRadius: 12,
    paddingVertical: 12,
    marginRight: 8,
  },
  feeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A237E',
  },
  feeLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
  },

  // ----- Timetable -----
  periodBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  periodBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
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
