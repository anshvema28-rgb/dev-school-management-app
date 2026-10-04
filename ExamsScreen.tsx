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

export default function ExamsScreen({ route, navigation }: any) {
  const [exams, setExams] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [classNames, setClassNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: ex, error: eErr } = await supabase
        .from('exams')
        .select('id, title, description, exam_date, total_marks, subject_id, class_id')
        .order('exam_date', { ascending: true })
        .limit(50)
      if (eErr) throw eErr
      setExams((ex || []) as any[])

      const { data: res, error: rErr } = await supabase
        .from('results')
        .select('id, student_id, exam_id, marks_obtained, percentage, grade, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      if (rErr) throw rErr
      setResults((res || []) as any[])

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
      setError(err.message || 'Unable to load exams')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const nowMs = Date.now()
  const upcoming = exams
    .filter((e) => new Date(e.exam_date).getTime() >= nowMs)
    .slice(0, 10)
  const recent = exams
    .filter((e) => new Date(e.exam_date).getTime() < nowMs)
    .sort((a, b) => new Date(b.exam_date).getTime() - new Date(a.exam_date).getTime())
    .slice(0, 10)

  const examTitle = (id: string) => {
    const e = exams.find((x) => x.id === id)
    return e ? e.title : 'Exam result'
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Exams & Results</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading exams…</Text>
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
          <Text style={styles.sectionLabel}>Upcoming Exams ({upcoming.length})</Text>
          {upcoming.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No upcoming exams</Text>
            </View>
          ) : (
            upcoming.map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>📝</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {subjectNames[e.subject_id] || 'Subject'}
                    {classNames[e.class_id] ? ` • ${classNames[e.class_id]}` : ''}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {fmtDate(e.exam_date)}
                    {e.total_marks != null ? ` • ${e.total_marks} marks` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Recent Exams ({recent.length})</Text>
          {recent.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent exams</Text>
            </View>
          ) : (
            recent.map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>🗓️</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {subjectNames[e.subject_id] || 'Subject'}
                    {classNames[e.class_id] ? ` • ${classNames[e.class_id]}` : ''}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {fmtShortDate(e.exam_date)}
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Recent Results ({results.length})</Text>
          {results.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No results recorded</Text>
            </View>
          ) : (
            results.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>🏆</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {examTitle(r.exam_id)}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {r.grade ? `Grade ${r.grade}` : 'Not graded'}
                    {r.marks_obtained != null ? ` • ${r.marks_obtained} marks` : ''}
                  </Text>
                </View>
                <Text style={styles.score}>
                  {r.percentage != null ? `${r.percentage}%` : '—'}
                </Text>
              </View>
            ))
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginTop: 6,
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
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardIconText: {
    fontSize: 18,
  },
  body: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  meta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  score: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
})
