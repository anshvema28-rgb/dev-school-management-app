import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
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

const fmtDateTime = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function HomeworkDetailScreen({ route, navigation }: any) {
  const hw = route && route.params && route.params.homework ? route.params.homework : null

  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [classNames, setClassNames] = useState<Record<string, string>>({})
  const [mySub, setMySub] = useState<any>(null)
  const [submissionText, setSubmissionText] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isStudent, setIsStudent] = useState(false)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const load = async () => {
    setLoading(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const u = sess && sess.session ? sess.session.user : null
      if (!u) {
        setLoading(false)
        return
      }

      // Role
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.id)
        .maybeSingle()
      const role = prof && prof.role ? prof.role : null
      setIsStudent(role === 'student')

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

      // If student, load my submission for this homework
      if (role === 'student' && hw && hw.id) {
        const { data: stu } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', u.id)
          .maybeSingle()
        if (stu && stu.id) {
          const { data: sub } = await supabase
            .from('homework_submissions')
            .select('id, submission_text, submitted_at, status, marks_obtained, teacher_feedback, graded_at')
            .eq('homework_id', hw.id)
            .eq('student_id', stu.id)
            .maybeSingle()
          if (sub) {
            setMySub(sub)
            setSubmissionText(sub.submission_text || '')
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to load homework')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hw) load()
  }, [hw && hw.id])

  const submitHomework = async () => {
    if (!submissionText.trim()) {
      Alert.alert('Validation', 'Please enter your submission text.')
      return
    }
    if (!hw || !hw.id) return

    setSubmitting(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const u = sess && sess.session ? sess.session.user : null
      if (!u) {
        Alert.alert('Error', 'Your session has expired. Please log in again.')
        setSubmitting(false)
        return
      }

      const { data: stu } = await supabase
        .from('students')
        .select('id')
        .eq('profile_id', u.id)
        .maybeSingle()
      if (!stu || !stu.id) {
        Alert.alert('Error', 'No student record found for your account.')
        setSubmitting(false)
        return
      }

      if (mySub && mySub.id) {
        // Update existing submission
        const { error } = await supabase
          .from('homework_submissions')
          .update({
            submission_text: submissionText.trim(),
            submitted_at: new Date().toISOString(),
            status: 'submitted',
          })
          .eq('id', mySub.id)
        if (error) throw error
      } else {
        // Insert new submission
        const { error } = await supabase.from('homework_submissions').insert({
          homework_id: hw.id,
          student_id: stu.id,
          submission_text: submissionText.trim(),
          submitted_at: new Date().toISOString(),
          status: 'submitted',
        })
        if (error) throw error
      }

      Alert.alert('Success', 'Homework submitted')
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to submit homework')
    } finally {
      setSubmitting(false)
    }
  }

  if (!hw) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Homework</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>No homework selected</Text>
        </View>
      </View>
    )
  }

  const nowMs = Date.now()
  const overdue = new Date(hw.due_date).getTime() < nowMs

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Homework Details</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title + status */}
          <View style={styles.titleCard}>
            <Text style={styles.title}>{hw.title}</Text>
            <View
              style={[
                styles.badge,
                mySub && mySub.status === 'graded'
                  ? styles.badgeOk
                  : mySub
                  ? styles.badgeInfo
                  : overdue
                  ? styles.badgeWarn
                  : styles.badgePending,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  mySub && mySub.status === 'graded'
                    ? styles.badgeTextOk
                    : mySub
                    ? styles.badgeTextInfo
                    : overdue
                    ? styles.badgeTextWarn
                    : styles.badgeTextPending,
                ]}
              >
                {mySub && mySub.status === 'graded'
                  ? 'Graded'
                  : mySub
                  ? 'Submitted'
                  : overdue
                  ? 'Overdue'
                  : 'Pending'}
              </Text>
            </View>
          </View>

          {/* Meta grid */}
          <View style={styles.metaCard}>
            <MetaRow label="Subject" value={subjectNames[hw.subject_id] || '—'} />
            <MetaRow label="Class" value={classNames[hw.class_id] || '—'} />
            <MetaRow label="Due Date" value={fmtDate(hw.due_date)} />
            <MetaRow
              label="Maximum Marks"
              value={hw.max_marks != null ? String(hw.max_marks) : '—'}
            />
            <MetaRow
              label="Assigned"
              value={hw.created_at ? fmtDate(hw.created_at) : '—'}
            />
          </View>

          {/* Description */}
          <Text style={styles.sectionLabel}>Instructions</Text>
          <View style={styles.descCard}>
            <Text style={styles.descText}>
              {hw.description || 'No description provided.'}
            </Text>
          </View>

          {/* Submission status / grading */}
          {mySub ? (
            <>
              <Text style={styles.sectionLabel}>Your Submission</Text>
              <View style={styles.descCard}>
                <Text style={styles.descText}>
                  {mySub.submission_text || '(empty submission)'}
                </Text>
                <Text style={styles.submittedAt}>
                  Submitted {fmtDateTime(mySub.submitted_at)}
                </Text>
              </View>

              {mySub.status === 'graded' ? (
                <>
                  <Text style={styles.sectionLabel}>Grading</Text>
                  <View style={styles.metaCard}>
                    <MetaRow
                      label="Marks"
                      value={
                        mySub.marks_obtained != null
                          ? `${mySub.marks_obtained} / ${hw.max_marks ?? '—'}`
                          : '—'
                      }
                    />
                    <MetaRow
                      label="Feedback"
                      value={mySub.teacher_feedback || 'No feedback yet'}
                    />
                    <MetaRow
                      label="Graded On"
                      value={mySub.graded_at ? fmtDateTime(mySub.graded_at) : '—'}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.pendingNote}>
                  Submitted — awaiting teacher grading
                </Text>
              )}
            </>
          ) : null}

          {/* Student submission input */}
          {isStudent ? (
            <>
              <Text style={styles.sectionLabel}>
                {mySub ? 'Resubmit Homework' : 'Submit Homework'}
              </Text>
              <TextInput
                style={styles.submitInput}
                value={submissionText}
                onChangeText={setSubmissionText}
                placeholder="Type your submission here…"
                placeholderTextColor="#9E9E9E"
                multiline
                numberOfLines={5}
              />
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={submitHomework}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? 'Submitting…' : mySub ? 'Update Submission' : 'Submit Homework'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const MetaRow = ({ label, value }: { label: string; value: any }) => (
  <View style={styles.metaRow}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue} numberOfLines={2}>
      {value || '—'}
    </Text>
  </View>
)

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

  // ----- Title -----
  titleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    borderLeftWidth: 5,
    borderLeftColor: '#2196F3',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A237E',
    flex: 1,
    marginRight: 10,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
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

  // ----- Meta -----
  metaCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 4,
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  metaLabel: {
    width: 120,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 6,
  },
  descCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 14,
    marginBottom: 14,
  },
  descText: {
    fontSize: 13,
    color: '#424242',
    lineHeight: 19,
  },
  submittedAt: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 8,
  },
  pendingNote: {
    fontSize: 12,
    color: '#8D6E00',
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    textAlign: 'center',
    fontWeight: '600',
  },

  // ----- Submission -----
  submitInput: {
    height: 110,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    padding: 12,
    fontSize: 14,
    color: '#212121',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
})
