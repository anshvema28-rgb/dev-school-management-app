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

// Grade scale (percentage-based)
const computePercentage = (marks: number, total: number) =>
  total > 0 ? Math.round((marks / total) * 10000) / 100 : 0

const computeGrade = (pct: number) => {
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

const gradeTone = (g: string): 'ok' | 'warn' | 'info' => {
  if (g === 'A' || g === 'B') return 'ok'
  if (g === 'F' || g === 'Incomplete') return 'warn'
  return 'info'
}

const EMPTY_FORM = {
  title: '',
  class_id: null as string | null,
  subject_id: null as string | null,
  exam_date: '',
  total_marks: '100',
  description: '',
}

export default function ExamManagementScreen({ route, navigation }: any) {
  const [tab, setTab] = useState<'exams' | 'results'>('exams')
  const [exams, setExams] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Exam form
  const [showForm, setShowForm] = useState(false)
  const [editingExam, setEditingExam] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Results entry
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null)
  const [resultStudents, setResultStudents] = useState<any[]>([])
  const [marksMap, setMarksMap] = useState<Record<string, string>>({})
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({})
  const [existingResults, setExistingResults] = useState<Record<string, any>>({})
  const [resultsLoading, setResultsLoading] = useState(false)
  const [savingResults, setSavingResults] = useState(false)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Load exams / classes / subjects ----
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: ex, error: eErr } = await supabase
        .from('exams')
        .select('id, title, description, exam_date, total_marks, subject_id, class_id')
        .order('exam_date', { ascending: true })
        .limit(100)
      if (eErr) throw eErr
      setExams((ex || []) as any[])

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
      setError(err.message || 'Unable to load exams')
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

  // ---- Exam CRUD ----
  const openAddForm = () => {
    setEditingExam(null)
    setForm({ ...EMPTY_FORM, exam_date: localISODate() })
    setShowForm(true)
  }

  const openEditForm = (exam: any) => {
    setEditingExam(exam)
    setForm({
      title: exam.title || '',
      class_id: exam.class_id || null,
      subject_id: exam.subject_id || null,
      exam_date: exam.exam_date ? String(exam.exam_date).slice(0, 10) : localISODate(),
      total_marks: exam.total_marks != null ? String(exam.total_marks) : '100',
      description: exam.description || '',
    })
    setShowForm(true)
  }

  const saveExam = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Please enter an exam title.')
      return
    }
    if (!form.class_id) {
      Alert.alert('Validation', 'Please select a class.')
      return
    }
    if (!form.exam_date) {
      Alert.alert('Validation', 'Please enter an exam date.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        class_id: form.class_id,
        subject_id: form.subject_id || null,
        exam_date: form.exam_date,
        total_marks: Number(form.total_marks) || 100,
        description: form.description.trim(),
      }

      if (editingExam && editingExam.id) {
        const { error } = await supabase
          .from('exams')
          .update(payload)
          .eq('id', editingExam.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('exams').insert(payload)
        if (error) throw error
      }

      Alert.alert('Success', editingExam ? 'Exam updated' : 'Exam added')
      setShowForm(false)
      setEditingExam(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save exam')
    } finally {
      setSaving(false)
    }
  }

  const deleteExam = (exam: any) => {
    Alert.alert(
      'Delete Exam',
      `Delete "${exam.title}"? Any recorded results for this exam will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('exams').delete().eq('id', exam.id)
              if (error) throw error
              if (selectedExamId === exam.id) {
                setSelectedExamId(null)
                setResultStudents([])
                setMarksMap({})
                setRemarksMap({})
                setExistingResults({})
              }
              load()
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unable to delete exam')
            }
          },
        },
      ]
    )
  }

  // ---- Results entry ----
  const selectExam = async (exam: any) => {
    setSelectedExamId(exam.id)
    setResultsLoading(true)
    setMarksMap({})
    setRemarksMap({})
    setExistingResults({})
    try {
      // Students in the exam's class (name via profiles)
      const { data: stu, error: sErr } = await supabase
        .from('students')
        .select('id, profile_id, roll_no, class_id, profiles!students_profile_id_fkey (full_name)')
        .eq('class_id', exam.class_id)
        .order('roll_no', { ascending: true })
        .limit(200)
      if (sErr) throw sErr
      const list = (stu || []) as any[]
      setResultStudents(list)

      // Existing results for this exam
      const { data: res, error: rErr } = await supabase
        .from('results')
        .select('id, student_id, marks_obtained, remarks')
        .eq('exam_id', exam.id)
      if (rErr) throw rErr

      const mMap: Record<string, string> = {}
      const rMap: Record<string, string> = {}
      const exMap: Record<string, any> = {}
      ;(res || []).forEach((r: any) => {
        if (r.student_id) {
          exMap[r.student_id] = r
          mMap[r.student_id] = r.marks_obtained != null ? String(r.marks_obtained) : ''
          rMap[r.student_id] = r.remarks || ''
        }
      })
      setMarksMap(mMap)
      setRemarksMap(rMap)
      setExistingResults(exMap)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to load students')
    } finally {
      setResultsLoading(false)
    }
  }

  const saveResults = async () => {
    if (!selectedExamId) return
    const exam = exams.find((e) => e.id === selectedExamId)
    const total = exam ? Number(exam.total_marks) || 100 : 100

    setSavingResults(true)
    try {
      // Record who is entering the marks
      const { data: sess } = await supabase.auth.getSession()
      const recordedBy = sess && sess.session && sess.session.user ? sess.session.user.id : null

      let saved = 0
      for (const stu of resultStudents) {
        const pid = stu.profile_id
        const raw = (marksMap[pid] || '').trim()
        if (raw === '') continue // skip students with no marks entered

        const marks = Number(raw)
        if (isNaN(marks)) {
          Alert.alert('Invalid marks', `Marks for ${stu.profiles?.full_name || stu.roll_no} must be a number.`)
          setSavingResults(false)
          return
        }

        const percentage = computePercentage(marks, total)
        const grade = computeGrade(percentage)
        const payload = {
          student_id: pid,
          exam_id: selectedExamId,
          marks_obtained: marks,
          percentage,
          grade,
          remarks: (remarksMap[pid] || '').trim(),
          recorded_by: recordedBy,
        }

        const existing = existingResults[pid]
        if (existing && existing.id) {
          const { error } = await supabase
            .from('results')
            .update(payload)
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('results').insert(payload)
          if (error) throw error
        }
        saved++
      }

      Alert.alert('Success', saved > 0 ? `${saved} result${saved === 1 ? '' : 's'} saved` : 'No marks entered')
      if (saved > 0 && selectedExamId) {
        // Refresh existing results
        const { data: res } = await supabase
          .from('results')
          .select('id, student_id, marks_obtained, remarks')
          .eq('exam_id', selectedExamId)
        const exMap: Record<string, any> = {}
        ;(res || []).forEach((r: any) => {
          if (r.student_id) exMap[r.student_id] = r
        })
        setExistingResults(exMap)
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save results')
    } finally {
      setSavingResults(false)
    }
  }

  const nowMs = Date.now()
  const upcomingExams = exams
    .filter((e) => new Date(e.exam_date).getTime() >= nowMs)
    .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())
  const recentExams = exams
    .filter((e) => new Date(e.exam_date).getTime() < nowMs)
    .sort((a, b) => new Date(b.exam_date).getTime() - new Date(a.exam_date).getTime())

  const selectedExam = exams.find((e) => e.id === selectedExamId) || null
  const selectedTotal = selectedExam ? Number(selectedExam.total_marks) || 100 : 100

  const examSummary = (e: any) => {
    const parts = [
      classNames[e.class_id] || 'Class —',
      subjectNames[e.subject_id] || 'Subject',
    ]
    return parts.join(' • ')
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Exams & Results</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* ---- Tab bar ---- */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'exams' && styles.tabActive]}
          onPress={() => setTab('exams')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'exams' && styles.tabTextActive]}>
            Exams ({exams.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'results' && styles.tabActive]}
          onPress={() => setTab('results')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'results' && styles.tabTextActive]}>
            Results Entry
          </Text>
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
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'exams' ? (
            <>
              <TouchableOpacity style={styles.addBtn} onPress={openAddForm} activeOpacity={0.85}>
                <Text style={styles.addBtnText}>＋ Add Exam</Text>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>Upcoming Exams ({upcomingExams.length})</Text>
              {upcomingExams.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No upcoming exams</Text>
                </View>
              ) : (
                upcomingExams.map((e) => (
                  <View key={e.id} style={styles.examCard}>
                    <TouchableOpacity
                      style={styles.examCardMain}
                      onPress={() => openEditForm(e)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.examIcon}>
                        <Text style={styles.examIconText}>📝</Text>
                      </View>
                      <View style={styles.examBody}>
                        <Text style={styles.examTitle} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Text style={styles.examMeta} numberOfLines={1}>
                          {examSummary(e)}
                        </Text>
                        <Text style={styles.examMeta} numberOfLines={1}>
                          {fmtDate(e.exam_date)}
                          {e.total_marks != null ? ` • ${e.total_marks} marks` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => deleteExam(e)}
                      activeOpacity={0.7}
                      accessibilityLabel="Delete exam"
                    >
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <Text style={styles.sectionLabel}>Recent Exams ({recentExams.length})</Text>
              {recentExams.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No recent exams</Text>
                </View>
              ) : (
                recentExams.map((e) => (
                  <View key={e.id} style={styles.examCard}>
                    <TouchableOpacity
                      style={styles.examCardMain}
                      onPress={() => openEditForm(e)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.examIcon}>
                        <Text style={styles.examIconText}>🗓️</Text>
                      </View>
                      <View style={styles.examBody}>
                        <Text style={styles.examTitle} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Text style={styles.examMeta} numberOfLines={1}>
                          {examSummary(e)}
                        </Text>
                        <Text style={styles.examMeta} numberOfLines={1}>
                          {fmtShortDate(e.exam_date)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => deleteExam(e)}
                      activeOpacity={0.7}
                      accessibilityLabel="Delete exam"
                    >
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Select Exam</Text>
              {exams.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No exams found. Add an exam first.</Text>
                </View>
              ) : (
                <View style={styles.chipRow}>
                  {exams.map((e) => {
                    const active = e.id === selectedExamId
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={[styles.examChip, active && styles.examChipActive]}
                        onPress={() => selectExam(e)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.examChipText, active && styles.examChipTextActive]}
                          numberOfLines={1}
                        >
                          {e.title}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}

              {resultsLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color="#1A237E" />
                  <Text style={styles.hint}>Loading students…</Text>
                </View>
              ) : selectedExam ? (
                <>
                  <View style={styles.selectedExamBar}>
                    <Text style={styles.selectedExamTitle} numberOfLines={1}>
                      {selectedExam.title}
                    </Text>
                    <Text style={styles.selectedExamMeta}>
                      {examSummary(selectedExam)} • {fmtDate(selectedExam.exam_date)} •{' '}
                      {selectedTotal} marks
                    </Text>
                  </View>

                  {resultStudents.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No students in this class</Text>
                    </View>
                  ) : (
                    resultStudents.map((stu) => {
                      const pid = stu.profile_id
                      const raw = (marksMap[pid] || '').trim()
                      const marks = raw === '' ? null : Number(raw)
                      const pct =
                        marks != null && !isNaN(marks)
                          ? computePercentage(marks, selectedTotal)
                          : null
                      const grade = pct != null ? computeGrade(pct) : null
                      const name =
                        (stu.profiles && stu.profiles.full_name) ||
                        stu.roll_no ||
                        'Student'
                      return (
                        <View key={stu.id} style={styles.studentRow}>
                          <View style={styles.studentAvatar}>
                            <Text style={styles.studentAvatarText}>
                              {initialsOf(name)}
                            </Text>
                          </View>
                          <View style={styles.studentBody}>
                            <Text style={styles.studentName} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={styles.studentMeta} numberOfLines={1}>
                              {stu.roll_no ? `Roll ${stu.roll_no}` : '—'}
                            </Text>
                          </View>
                          <View style={styles.marksBox}>
                            <TextInput
                              style={styles.marksInput}
                              value={marksMap[pid] || ''}
                              onChangeText={(text) =>
                                setMarksMap({ ...marksMap, [pid]: text })
                              }
                              keyboardType="numeric"
                              placeholder="Marks"
                              placeholderTextColor="#9E9E9E"
                            />
                          </View>
                          <View style={styles.gradeBox}>
                            <Text style={styles.pctText}>
                              {pct != null ? `${pct}%` : '—'}
                            </Text>
                            {grade ? (
                              <View
                                style={[
                                  styles.gradeBadge,
                                  grade === 'A' || grade === 'B'
                                    ? styles.gradeOk
                                    : grade === 'F'
                                    ? styles.gradeWarn
                                    : styles.gradeInfo,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.gradeText,
                                    grade === 'A' || grade === 'B'
                                      ? styles.gradeTextOk
                                      : grade === 'F'
                                      ? styles.gradeTextWarn
                                      : styles.gradeTextInfo,
                                  ]}
                                >
                                  {grade}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.gradePlaceholder}>—</Text>
                            )}
                          </View>
                        </View>
                      )
                    })
                  )}

                  {resultStudents.length > 0 ? (
                    <TouchableOpacity
                      style={styles.saveResultsBtn}
                      onPress={saveResults}
                      activeOpacity={0.85}
                      disabled={savingResults}
                    >
                      <Text style={styles.saveResultsText}>
                        {savingResults ? 'Saving…' : 'Save Results'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Select an exam to enter results</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ---- Exam form overlay ---- */}
      {showForm ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingExam ? 'Edit Exam' : 'Add Exam'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false)
                setEditingExam(null)
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
              placeholder="e.g. Mid-Term Mathematics"
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
                <Text
                  style={[
                    styles.chipText,
                    !form.subject_id && styles.chipTextActive,
                  ]}
                >
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

            <Text style={styles.formLabel}>Exam Date</Text>
            <TextInput
              style={styles.formInput}
              value={form.exam_date}
              onChangeText={(t) => setForm({ ...form, exam_date: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Total Marks</Text>
            <TextInput
              style={styles.formInput}
              value={form.total_marks}
              onChangeText={(t) => setForm({ ...form, total_marks: t })}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={form.description}
              onChangeText={(t) => setForm({ ...form, description: t })}
              placeholder="Optional description"
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={3}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveExam}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : editingExam ? 'Update Exam' : 'Add Exam'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
                  setEditingExam(null)
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

  // ----- Exams tab -----
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
  examCard: {
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
  examCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  examIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  examIconText: {
    fontSize: 19,
  },
  examBody: {
    flex: 1,
    marginRight: 8,
  },
  examTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  examMeta: {
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

  // ----- Results tab -----
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  examChip: {
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
  examChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  examChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  examChipTextActive: {
    color: '#FFFFFF',
  },
  selectedExamBar: {
    backgroundColor: '#EAF4FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    padding: 12,
    marginBottom: 14,
  },
  selectedExamTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A237E',
  },
  selectedExamMeta: {
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
  marksBox: {
    width: 64,
    marginRight: 8,
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
  gradeBox: {
    width: 52,
    alignItems: 'center',
  },
  pctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3949AB',
  },
  gradeBadge: {
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
  },
  gradeOk: {
    backgroundColor: '#E8F5E9',
  },
  gradeWarn: {
    backgroundColor: '#FFEBEE',
  },
  gradeInfo: {
    backgroundColor: '#E3F2FD',
  },
  gradeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gradeTextOk: {
    color: '#2E7D32',
  },
  gradeTextWarn: {
    color: '#C62828',
  },
  gradeTextInfo: {
    color: '#1565C0',
  },
  gradePlaceholder: {
    fontSize: 11,
    color: '#BDBDBD',
    marginTop: 3,
  },
  saveResultsBtn: {
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
  saveResultsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // ----- Exam form overlay -----
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
  saveBtn: {
    flex: 1,
    backgroundColor: '#1A237E',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginRight: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
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
