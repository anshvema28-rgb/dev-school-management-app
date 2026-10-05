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

  KeyboardAvoidingView,
} from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const pad2 = (n: number) => String(n).padStart(2, '0')

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

const initialsOf = (name: string) => {
  const parts = (name || '').trim().split(/\s+/)
  const first = parts[0] ? parts[0][0] : 'S'
  const second = parts[1] ? parts[1][0] : ''
  return String(first).toUpperCase() + String(second).toUpperCase()
}

const EMPTY_FORM = {
  title: '',
  description: '',
  class_id: null as string | null,
  subject_id: null as string | null,
  due_date: '',
  max_marks: '100',
  published: true,
}

export default function HomeworkScreen({ route, navigation }: any) {
  const [tab, setTab] = useState<'homework' | 'submissions'>('homework')
  const [homework, setHomework] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingHw, setEditingHw] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Submissions
  const [selectedHwId, setSelectedHwId] = useState<string | null>(null)
  const [subStudents, setSubStudents] = useState<any[]>([])
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any>>({})
  const [marksMap, setMarksMap] = useState<Record<string, string>>({})
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({})
  const [subLoading, setSubLoading] = useState(false)
  const [savingGrade, setSavingGrade] = useState(false)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Load homework + classes + subjects ----
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: hw, error: hErr } = await supabase
        .from('homework')
        .select('id, title, description, due_date, max_marks, subject_id, class_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (hErr) throw hErr
      setHomework((hw || []) as any[])

      const { data: cls, error: cErr } = await supabase
        .from('classes')
        .select('id, name, grade_level, section')
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true })
      if (cErr) throw cErr
      setClasses((cls || []) as any[])

      const { data: subj, error: sErr } = await supabase
        .from('subjects')
        .select('id, name, code')
        .order('name', { ascending: true })
      if (sErr) throw sErr
      setSubjects((subj || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load homework')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const classNames: Record<string, string> = {}
  classes.forEach((c) => {
    if (c && c.id) classNames[c.id] = c.name
  })
  const subjectNames: Record<string, string> = {}
  subjects.forEach((s) => {
    if (s && s.id) subjectNames[s.id] = s.name
  })

  // ---- Homework CRUD ----
  const openAddForm = () => {
    setEditingHw(null)
    setForm({ ...EMPTY_FORM, due_date: localISODate() })
    setShowForm(true)
  }

  const openEditForm = (hw: any) => {
    setEditingHw(hw)
    setForm({
      title: hw.title || '',
      description: hw.description || '',
      class_id: hw.class_id || null,
      subject_id: hw.subject_id || null,
      due_date: hw.due_date ? String(hw.due_date).slice(0, 10) : localISODate(),
      max_marks: hw.max_marks != null ? String(hw.max_marks) : '100',
      published: hw.published !== false,
    })
    setShowForm(true)
  }

  const saveHomework = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Please enter a title.')
      return
    }
    if (!form.class_id) {
      Alert.alert('Validation', 'Please select a class.')
      return
    }
    if (!form.due_date) {
      Alert.alert('Validation', 'Please enter a due date.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        class_id: form.class_id,
        subject_id: form.subject_id || null,
        due_date: form.due_date,
        max_marks: Number(form.max_marks) || 100,
      }

      if (editingHw && editingHw.id) {
        const { error } = await supabase
          .from('homework')
          .update(payload)
          .eq('id', editingHw.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('homework').insert(payload)
        if (error) throw error
      }

      Alert.alert('Success', editingHw ? 'Homework updated' : 'Homework published')
      setShowForm(false)
      setEditingHw(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save homework')
    } finally {
      setSaving(false)
    }
  }

  const deleteHomework = (hw: any) => {
    Alert.alert(
      'Delete Homework',
      `Delete "${hw.title}"? All student submissions for it will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('homework').delete().eq('id', hw.id)
              if (error) throw error
              if (selectedHwId === hw.id) {
                setSelectedHwId(null)
                setSubStudents([])
                setSubmissionsMap({})
                setMarksMap({})
                setFeedbackMap({})
              }
              load()
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unable to delete homework')
            }
          },
        },
      ]
    )
  }

  // ---- Submissions ----
  const selectHomework = async (hw: any) => {
    setSelectedHwId(hw.id)
    setSubLoading(true)
    setMarksMap({})
    setFeedbackMap({})
    setSubmissionsMap({})
    try {
      // Students in the homework's class
      const { data: stu, error: sErr } = await supabase
        .from('students')
        .select('id, profile_id, roll_no, class_id, profiles!students_profile_id_fkey (full_name)')
        .eq('class_id', hw.class_id)
        .order('roll_no', { ascending: true })
        .limit(200)
      if (sErr) throw sErr
      const list = (stu || []) as any[]
      setSubStudents(list)

      // Existing submissions for this homework
      const { data: subs, error: subErr } = await supabase
        .from('homework_submissions')
        .select('id, student_id, submission_text, submitted_at, status, marks_obtained, teacher_feedback')
        .eq('homework_id', hw.id)
      if (subErr) throw subErr

      const subMap: Record<string, any> = {}
      const mMap: Record<string, string> = {}
      const fMap: Record<string, string> = {}
      ;(subs || []).forEach((s: any) => {
        if (s.student_id) {
          subMap[s.student_id] = s
          mMap[s.student_id] = s.marks_obtained != null ? String(s.marks_obtained) : ''
          fMap[s.student_id] = s.teacher_feedback || ''
        }
      })
      setSubmissionsMap(subMap)
      setMarksMap(mMap)
      setFeedbackMap(fMap)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to load submissions')
    } finally {
      setSubLoading(false)
    }
  }

  const saveGrades = async () => {
    if (!selectedHwId) return
    const hw = homework.find((h) => h.id === selectedHwId)
    const maxMarks = hw ? Number(hw.max_marks) || 100 : 100

    setSavingGrade(true)
    try {
      let graded = 0
      for (const stu of subStudents) {
        const sid = stu.id // students.id (homework_submissions.student_id references students.id)
        const existing = submissionsMap[sid]
        const rawMarks = (marksMap[sid] || '').trim()
        const feedback = (feedbackMap[sid] || '').trim()

        // Only save if there's an existing submission and marks were entered
        if (!existing || rawMarks === '') continue

        const marks = Number(rawMarks)
        if (isNaN(marks) || marks < 0 || marks > maxMarks) {
          Alert.alert(
            'Invalid marks',
            `Marks for ${stu.profiles?.full_name || stu.roll_no} must be between 0 and ${maxMarks}.`
          )
          setSavingGrade(false)
          return
        }

        const { error } = await supabase
          .from('homework_submissions')
          .update({
            marks_obtained: marks,
            teacher_feedback: feedback,
            status: 'graded',
            graded_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        if (error) throw error
        graded++
      }

      Alert.alert('Success', graded > 0 ? `${graded} submission${graded === 1 ? '' : 's'} graded` : 'No marks entered')
      if (graded > 0 && selectedHwId) {
        const hw2 = homework.find((h) => h.id === selectedHwId)
        if (hw2) selectHomework(hw2)
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save grades')
    } finally {
      setSavingGrade(false)
    }
  }

  const nowMs = Date.now()
  const selectedHw = homework.find((h) => h.id === selectedHwId) || null

  const hwSummary = (h: any) => {
    const parts = [
      classNames[h.class_id] || 'Class —',
      subjectNames[h.subject_id] || 'Subject',
    ]
    return parts.join(' • ')
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Homework Management</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'homework' && styles.tabActive]}
          onPress={() => setTab('homework')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'homework' && styles.tabTextActive]}>
            Homework ({homework.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'submissions' && styles.tabActive]}
          onPress={() => setTab('submissions')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'submissions' && styles.tabTextActive]}>
            Submissions
          </Text>
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
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'homework' ? (
            <>
              <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>＋ Add Homework</Text>
              </TouchableOpacity>

              {homework.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No homework assigned yet</Text>
                </View>
              ) : (
                homework.map((h) => {
                  const overdue = new Date(h.due_date).getTime() < nowMs
                  return (
                    <View key={h.id} style={styles.hwCard}>
                      <TouchableOpacity
                        style={styles.hwCardMain}
                        onPress={() => openEditForm(h)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.hwIcon}>
                          <Text style={styles.hwIconText}>📖</Text>
                        </View>
                        <View style={styles.hwBody}>
                          <Text style={styles.hwTitle} numberOfLines={1}>
                            {h.title}
                          </Text>
                          <Text style={styles.hwMeta} numberOfLines={1}>
                            {hwSummary(h)}
                          </Text>
                          <Text style={styles.hwMeta} numberOfLines={1}>
                            Due {fmtDate(h.due_date)}
                            {h.max_marks != null ? ` • ${h.max_marks} marks` : ''}
                            {overdue ? ' • Overdue' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => deleteHomework(h)}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete homework"
                      >
                        <Text style={styles.deleteBtnText}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  )
                })
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Select Homework</Text>
              {homework.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No homework found. Add homework first.</Text>
                </View>
              ) : (
                <View style={styles.chipRow}>
                  {homework.map((h) => {
                    const active = h.id === selectedHwId
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={[styles.hwChip, active && styles.hwChipActive]}
                        onPress={() => selectHomework(h)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.hwChipText, active && styles.hwChipTextActive]}
                          numberOfLines={1}
                        >
                          {h.title}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {subLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color="#1A237E" />
                  <Text style={styles.hint}>Loading students…</Text>
                </View>
              ) : selectedHw ? (
                <>
                  <View style={styles.selectedBar}>
                    <Text style={styles.selectedTitle} numberOfLines={1}>
                      {selectedHw.title}
                    </Text>
                    <Text style={styles.selectedMeta}>
                      {hwSummary(selectedHw)} • {fmtDate(selectedHw.due_date)} •{' '}
                      {selectedHw.max_marks} marks
                    </Text>
                  </View>

                  {subStudents.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No students in this class</Text>
                    </View>
                  ) : (
                    subStudents.map((stu) => {
                      const sub = submissionsMap[stu.id]
                      const name =
                        (stu.profiles && stu.profiles.full_name) || stu.roll_no || 'Student'
                      return (
                        <View key={stu.id} style={styles.studentRow}>
                          <View style={styles.studentAvatar}>
                            <Text style={styles.studentAvatarText}>{initialsOf(name)}</Text>
                          </View>
                          <View style={styles.studentBody}>
                            <Text style={styles.studentName} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={styles.studentMeta} numberOfLines={1}>
                              {stu.roll_no ? `Roll ${stu.roll_no}` : '—'}
                            </Text>
                            {sub ? (
                              <Text style={styles.subStatus}>
                                {sub.status === 'graded'
                                  ? `Graded${sub.marks_obtained != null ? ` • ${sub.marks_obtained}` : ''}`
                                  : 'Submitted'}
                              </Text>
                            ) : (
                              <Text style={styles.subStatusPending}>Not submitted</Text>
                            )}
                          </View>
                          <View style={styles.gradeBox}>
                            <TextInput
                              style={styles.marksInput}
                              value={marksMap[stu.id] || ''}
                              onChangeText={(t) => setMarksMap({ ...marksMap, [stu.id]: t })}
                              keyboardType="numeric"
                              placeholder="Marks"
                              placeholderTextColor="#9E9E9E"
                              editable={!!sub}
                            />
                          </View>
                        </View>
                      )
                    })
                  )}

                  {subStudents.length > 0 ? (
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={saveGrades}
                      activeOpacity={0.85}
                      disabled={savingGrade}
                    >
                      <Text style={styles.saveBtnText}>
                        {savingGrade ? 'Saving…' : 'Save Grades'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Select a homework to review submissions</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Form overlay */}
      {showForm ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingHw ? 'Edit Homework' : 'Add Homework'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false)
                setEditingHw(null)
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.formClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formLabel}>Title</Text>
            <TextInput
              style={styles.formInput}
              value={form.title}
              onChangeText={(t) => setForm({ ...form, title: t })}
              placeholder="e.g. Chapter 5 Exercises"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Class</Text>
            <View style={styles.chipRow}>
              {classes.map((c) => {
                const active = form.class_id === c.id
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm({ ...form, class_id: c.id })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.formLabel}>Subject</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !form.subject_id && styles.chipActive]}
                onPress={() => setForm({ ...form, subject_id: null })}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, !form.subject_id && styles.chipTextActive]}>
                  None
                </Text>
              </TouchableOpacity>
              {subjects.map((s) => {
                const active = form.subject_id === s.id
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm({ ...form, subject_id: s.id })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.formLabel}>Due Date</Text>
            <TextInput
              style={styles.formInput}
              value={form.due_date}
              onChangeText={(t) => setForm({ ...form, due_date: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Maximum Marks</Text>
            <TextInput
              style={styles.formInput}
              value={form.max_marks}
              onChangeText={(t) => setForm({ ...form, max_marks: t })}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={form.description}
              onChangeText={(t) => setForm({ ...form, description: t })}
              placeholder="Instructions for students"
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={3}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveHomework}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : editingHw ? 'Update Homework' : 'Publish Homework'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
                  setEditingHw(null)
                  setForm(EMPTY_FORM)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}
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

  // ----- Tab bar -----
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#EAF4FF',
    borderBottomWidth: 1,
    borderBottomColor: '#D6E6F7',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#1A237E',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#1A237E',
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

  // ----- Homework tab -----
  addBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
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
  hwCard: {
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
  hwCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hwIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hwIconText: {
    fontSize: 19,
  },
  hwBody: {
    flex: 1,
    marginRight: 8,
  },
  hwTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  hwMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 14,
  },

  // ----- Submissions tab -----
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  hwChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
    maxWidth: '48%',
  },
  hwChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  hwChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  hwChipTextActive: {
    color: '#FFFFFF',
  },
  selectedBar: {
    backgroundColor: '#EAF4FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    padding: 12,
    marginBottom: 14,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  selectedMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 10,
    marginBottom: 8,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  studentAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  studentBody: {
    flex: 1,
    marginRight: 8,
  },
  studentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
  },
  studentMeta: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  subStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
    marginTop: 2,
  },
  subStatusPending: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E65100',
    marginTop: 2,
  },
  gradeBox: {
    width: 64,
  },
  marksInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#1A237E',
    paddingHorizontal: 4,
  },
  saveBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
    elevation: 4,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ----- Form overlay -----
  formOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 50,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  formClose: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    padding: 4,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 10,
  },
  formInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#212121',
  },
  formTextArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#546E7A',
    fontSize: 14,
    fontWeight: '700',
  },
})
