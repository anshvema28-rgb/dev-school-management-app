import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { supabase } from './supabaseClient'

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

const FILTERS = ['All', 'Pending', 'Overdue', 'Submitted', 'Graded'] as const
type Filter = (typeof FILTERS)[number]

export default function StudentHomeworkScreen({ route, navigation }: any) {
  const [homework, setHomework] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [classNames, setClassNames] = useState<Record<string, string>>({})
  const [mySubs, setMySubs] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('All')

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const openDetail = (hw: any) => {
    if (navigation && navigation.navigate) {
      navigation.navigate('HomeworkDetail', { homework: hw })
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const u = sess && sess.session ? sess.session.user : null
      if (!u) {
        setLoading(false)
        return
      }

      // My student record -> class_id + students.id
      const { data: stu, error: stErr } = await supabase
        .from('students')
        .select('id, class_id, roll_no')
        .eq('profile_id', u.id)
        .maybeSingle()
      if (stErr) throw stErr

      const classId = stu ? stu.class_id : null
      const myStudentId = stu ? stu.id : null

      if (classId) {
        const { data: hw, error: hErr } = await supabase
          .from('homework')
          .select('id, title, description, due_date, max_marks, subject_id, class_id, created_at')
          .eq('class_id', classId)
          .order('due_date', { ascending: true })
          .limit(100)
        if (hErr) throw hErr
        setHomework((hw || []) as any[])
      } else {
        setHomework([])
      }

      // My submissions (RLS: students can view own submissions)
      if (myStudentId) {
        const { data: subs, error: subErr } = await supabase
          .from('homework_submissions')
          .select('id, homework_id, submission_text, submitted_at, status, marks_obtained, teacher_feedback, graded_at')
          .eq('student_id', myStudentId)
        if (subErr) throw subErr
        const map: Record<string, any> = {}
        ;(subs || []).forEach((s: any) => {
          if (s.homework_id) map[s.homework_id] = s
        })
        setMySubs(map)
      } else {
        setMySubs({})
      }

      const { data: subj } = await supabase.from('subjects').select('id, name')
      const sMap: Record<string, string> = {}
      ;(subj || []).forEach((s: any) => {
        if (s && s.id) sMap[s.id] = s.name
      })
      setSubjectNames(sMap)

      const { data: cls } = await supabase.from('classes').select('id, name')
      const cMap: Record<string, string> = {}
      ;(cls || []).forEach((c: any) => {
        if (c && c.id) cMap[c.id] = c.name
      })
      setClassNames(cMap)
    } catch (err: any) {
      setError(err.message || 'Unable to load homework')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ---- Derived: status per homework ----
  const nowMs = Date.now()
  const withStatus = homework.map((h) => {
    const sub = mySubs[h.id]
    let status: 'Pending' | 'Overdue' | 'Submitted' | 'Graded'
    if (sub && sub.status === 'graded') {
      status = 'Graded'
    } else if (sub) {
      status = 'Submitted'
    } else if (new Date(h.due_date).getTime() < nowMs) {
      status = 'Overdue'
    } else {
      status = 'Pending'
    }
    return { ...h, _status: status, _sub: sub }
  })

  const filtered = withStatus.filter((h) => filter === 'All' || h._status === filter)

  const counts = {
    All: withStatus.length,
    Pending: withStatus.filter((h) => h._status === 'Pending').length,
    Overdue: withStatus.filter((h) => h._status === 'Overdue').length,
    Submitted: withStatus.filter((h) => h._status === 'Submitted').length,
    Graded: withStatus.filter((h) => h._status === 'Graded').length,
  }

  const statusStyle = (s: string) =>
    s === 'Graded'
      ? { badge: styles.badgeOk, text: styles.badgeTextOk }
      : s === 'Submitted'
      ? { badge: styles.badgeInfo, text: styles.badgeTextInfo }
      : s === 'Overdue'
      ? { badge: styles.badgeWarn, text: styles.badgeTextWarn }
      : { badge: styles.badgePending, text: styles.badgeTextPending }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>My Homework</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading homework…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => {
              const active = filter === f
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {f} ({counts[f]})
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {filter === 'All' ? 'No homework assigned yet' : `No ${filter.toLowerCase()} homework`}
              </Text>
            </View>
          ) : (
            filtered.map((h) => {
              const st = statusStyle(h._status)
              return (
                <TouchableOpacity
                  key={h.id}
                  style={styles.card3d}
                  onPress={() => openDetail(h)}
                  activeOpacity={0.85}
                >
                  <View style={styles.card}>
                    <View style={styles.cardIcon}>
                      <Text style={styles.cardIconText}>📖</Text>
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {h.title}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {subjectNames[h.subject_id] || 'Subject'}
                        {classNames[h.class_id] ? ` • ${classNames[h.class_id]}` : ''}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        Due {fmtDate(h.due_date)}
                        {h.max_marks != null ? ` • ${h.max_marks} marks` : ''}
                      </Text>
                      {h._sub && h._sub.status === 'graded' ? (
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          Marks: {h._sub.marks_obtained ?? '—'}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.badge, st.badge]}>
                      <Text style={[styles.badgeText, st.text]}>{h._status}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: Platform.OS === 'android' ? 40 : 22,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'center',
  },

  // ----- Filter chips -----
  filterScroll: {
    marginBottom: 14,
  },
  filterRow: {
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  emptyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#757575',
    fontSize: 14,
  },

  // ----- 3D homework cards -----
  card3d: {
    marginBottom: 14,
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconText: {
    fontSize: 19,
  },
  cardBody: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  cardMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeOk: {
    backgroundColor: '#E8F5E9',
  },
  badgeInfo: {
    backgroundColor: '#E3F2FD',
  },
  badgeWarn: {
    backgroundColor: '#FFF3E0',
  },
  badgePending: {
    backgroundColor: '#FFF8E1',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextOk: {
    color: '#2E7D32',
  },
  badgeTextInfo: {
    color: '#1565C0',
  },
  badgeTextWarn: {
    color: '#E65100',
  },
  badgeTextPending: {
    color: '#8D6E00',
  },
})
