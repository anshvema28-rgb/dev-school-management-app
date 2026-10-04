import React, { useCallback, useEffect, useState } from 'react'
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
} from 'react-native'
import { supabase } from './supabaseClient'

// Subjects module — reuses the EXISTING `subjects` table (001) and the new
// `class_subjects` join table (migration 011). No duplicate subjects table.
//   admin   -> add / edit / delete subjects + assign subject to class/teacher
//   teacher -> view assigned subjects/classes
//   student -> view subjects for their own class
//   parent  -> view subjects of a linked child's class (RLS enforced)

const EMPTY_SUBJECT = { id: null as string | null, name: '', code: '', description: '', credits: '1', is_core: true }

export default function SubjectsScreen({
  navigation,
  role = 'admin',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const isAdmin = role === 'admin' || role === null

  const [subjects, setSubjects] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [teachers, setTeachers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Subject form (admin)
  const [showSubjectForm, setShowSubjectForm] = useState(false)
  const [subjectForm, setSubjectForm] = useState(EMPTY_SUBJECT)
  const [saving, setSaving] = useState(false)

  // Assignment form (admin)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignClass, setAssignClass] = useState<string | null>(null)
  const [assignSubject, setAssignSubject] = useState<string | null>(null)
  const [assignTeacher, setAssignTeacher] = useState<string | null>(null)
  const [assignYear, setAssignYear] = useState('')

  const currentYear = () => {
    const d = new Date()
    const y = d.getFullYear()
    return d.getMonth() + 1 >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
  }

  const nameOf = (map: Record<string, string>, id: string | null, fallback: string) =>
    id && map[id] ? map[id] : fallback

  const classMap: Record<string, string> = {}
  classes.forEach((c) => (classMap[c.id] = c.name))
  const subjectMap: Record<string, string> = {}
  subjects.forEach((s) => (subjectMap[s.id] = s.name))
  const teacherMap: Record<string, string> = {}
  teachers.forEach((t) => (teacherMap[t.id] = t.full_name || t.email || 'Teacher'))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const subs = await supabase
        .from('subjects')
        .select('id, name, code, description, credits, is_core')
        .order('name', { ascending: true })
      if (subs.error) throw subs.error
      setSubjects((subs.data || []) as any[])

      const asg = await supabase
        .from('class_subjects')
        .select('id, class_id, subject_id, teacher_id, academic_year')
        .order('academic_year', { ascending: false })
      if (asg.error) throw asg.error
      setAssignments((asg.data || []) as any[])

      const cls = await supabase.from('classes').select('id, name').order('name')
      setClasses((cls.data || []) as any[])

      if (isAdmin) {
        const tch = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', 'teacher')
          .order('full_name')
        setTeachers((tch.data || []) as any[])
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load subjects')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---------- Admin: subject CRUD ----------
  const openAddSubject = () => {
    setSubjectForm(EMPTY_SUBJECT)
    setShowSubjectForm(true)
  }

  const openEditSubject = (s: any) => {
    setSubjectForm({
      id: s.id,
      name: s.name || '',
      code: s.code || '',
      description: s.description || '',
      credits: s.credits != null ? String(s.credits) : '1',
      is_core: !!s.is_core,
    })
    setShowSubjectForm(true)
  }

  const saveSubject = async () => {
    const name = subjectForm.name.trim()
    if (!name) {
      Alert.alert('Validation', 'Please enter the subject name.')
      return
    }
    const payload = {
      name,
      code: subjectForm.code.trim() || null,
      description: subjectForm.description.trim() || null,
      credits: Number(subjectForm.credits) || 1,
      is_core: subjectForm.is_core,
    }
    setSaving(true)
    try {
      const { error: err } = subjectForm.id
        ? await supabase.from('subjects').update(payload).eq('id', subjectForm.id)
        : await supabase.from('subjects').insert(payload)
      if (err) throw err
      Alert.alert('Success', subjectForm.id ? 'Subject updated' : 'Subject added')
      setShowSubjectForm(false)
      await load()
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : 'Unable to save subject'
      if (msg.indexOf('duplicate key') >= 0) {
        Alert.alert('Duplicate', 'A subject with this name or code already exists.')
      } else {
        Alert.alert('Error', msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteSubject = (s: any) => {
    Alert.alert('Delete Subject', `Delete ${s.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const { error: err } = await supabase.from('subjects').delete().eq('id', s.id)
            if (err) throw err
            await load()
          } catch (err: any) {
            const msg = err && err.message ? String(err.message) : 'Unable to delete'
            if (msg.indexOf('foreign key') >= 0) {
              Alert.alert('Cannot delete', 'This subject is used by exams, timetable or syllabus. Remove those first.')
            } else {
              Alert.alert('Error', msg)
            }
          } finally {
            setSaving(false)
          }
        },
      },
    ])
  }

  // ---------- Admin: assign subject to class ----------
  const openAssign = () => {
    setAssignClass(null)
    setAssignSubject(null)
    setAssignTeacher(null)
    setAssignYear(currentYear())
    setShowAssignForm(true)
  }

  const saveAssignment = async () => {
    if (!assignClass) {
      Alert.alert('Validation', 'Please select a class.')
      return
    }
    if (!assignSubject) {
      Alert.alert('Validation', 'Please select a subject.')
      return
    }
    const year = assignYear.trim() || currentYear()
    setSaving(true)
    try {
      const dup = await supabase
        .from('class_subjects')
        .select('id')
        .eq('class_id', assignClass)
        .eq('subject_id', assignSubject)
        .eq('academic_year', year)
      if ((dup.data || []).length > 0) {
        Alert.alert('Duplicate', 'This subject is already assigned to that class.')
        setSaving(false)
        return
      }
      const { error: err } = await supabase.from('class_subjects').insert({
        class_id: assignClass,
        subject_id: assignSubject,
        teacher_id: assignTeacher,
        academic_year: year,
      })
      if (err) throw err
      Alert.alert('Success', 'Subject assigned to class')
      setShowAssignForm(false)
      await load()
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : 'Unable to assign'
      if (msg.indexOf('duplicate key') >= 0) {
        Alert.alert('Duplicate', 'This subject is already assigned to that class.')
      } else {
        Alert.alert('Error', msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const removeAssignment = (a: any) => {
    Alert.alert('Remove Assignment', 'Remove this subject from the class?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('class_subjects').delete().eq('id', a.id)
          if (err) Alert.alert('Error', err.message)
          else load()
        },
      },
    ])
  }

  const renderChipRow = (
    items: { key: string; label: string }[],
    selected: string | null,
    onSelect: (k: string) => void
  ) => (
    <View style={styles.chipRow}>
      {items.map((it) => (
        <TouchableOpacity
          key={it.key}
          style={[styles.chip, selected === it.key && styles.chipActive]}
          onPress={() => onSelect(it.key)}
          activeOpacity={0.8}
        >
          <Text style={[styles.chipText, selected === it.key && styles.chipTextActive]}>
            {it.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Subjects</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading subjects…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {isAdmin ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.addBtn} onPress={openAddSubject} activeOpacity={0.8}>
                <Text style={styles.addBtnText}>＋ Add Subject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={openAssign} activeOpacity={0.8}>
                <Text style={styles.addBtnText}>＋ Assign to Class</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {showSubjectForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{subjectForm.id ? 'Edit Subject' : 'Add Subject'}</Text>

              <Text style={styles.formLabel}>Subject name *</Text>
              <TextInput
                style={styles.input}
                value={subjectForm.name}
                onChangeText={(t) => setSubjectForm({ ...subjectForm, name: t })}
                placeholder="e.g. Mathematics"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Code</Text>
              <TextInput
                style={styles.input}
                value={subjectForm.code}
                onChangeText={(t) => setSubjectForm({ ...subjectForm, code: t })}
                placeholder="e.g. MATH10"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="characters"
              />

              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={subjectForm.description}
                onChangeText={(t) => setSubjectForm({ ...subjectForm, description: t })}
                placeholder="Optional"
                placeholderTextColor="#9AA5C4"
                multiline
              />

              <Text style={styles.formLabel}>Credits</Text>
              <TextInput
                style={styles.input}
                value={subjectForm.credits}
                onChangeText={(t) => setSubjectForm({ ...subjectForm, credits: t })}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#9AA5C4"
              />

              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, subjectForm.is_core && styles.chipActive]}
                  onPress={() => setSubjectForm({ ...subjectForm, is_core: true })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, subjectForm.is_core && styles.chipTextActive]}>
                    Core
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, !subjectForm.is_core && styles.chipActive]}
                  onPress={() => setSubjectForm({ ...subjectForm, is_core: false })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, !subjectForm.is_core && styles.chipTextActive]}>
                    Elective
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowSubjectForm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={saveSubject}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {showAssignForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Assign Subject to Class</Text>

              <Text style={styles.formLabel}>Class *</Text>
              {renderChipRow(
                classes.map((c) => ({ key: c.id, label: c.name })),
                assignClass,
                (k) => setAssignClass(k)
              )}

              <Text style={styles.formLabel}>Subject *</Text>
              {renderChipRow(
                subjects.map((s) => ({ key: s.id, label: s.name })),
                assignSubject,
                (k) => setAssignSubject(k)
              )}

              <Text style={styles.formLabel}>Teacher (optional)</Text>
              {renderChipRow(
                teachers.map((t) => ({ key: t.id, label: t.full_name || t.email })),
                assignTeacher,
                (k) => setAssignTeacher(k)
              )}

              <Text style={styles.formLabel}>Academic year</Text>
              <TextInput
                style={styles.input}
                value={assignYear}
                onChangeText={setAssignYear}
                placeholder="2026-2027"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="none"
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAssignForm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={saveAssignment}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Assign</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>
            {role === 'student' ? 'My Class Subjects' : 'Class Assignments'} ({assignments.length})
          </Text>
          {assignments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No subject assignments found</Text>
            </View>
          ) : (
            assignments.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>📘</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {nameOf(subjectMap, a.subject_id, 'Subject')}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {nameOf(classMap, a.class_id, 'My class')} • {a.academic_year}
                  </Text>
                  {a.teacher_id ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      👩‍🏫 {nameOf(teacherMap, a.teacher_id, 'Assigned teacher')}
                    </Text>
                  ) : null}
                </View>
                {isAdmin ? (
                  <TouchableOpacity
                    style={styles.smallBtn}
                    onPress={() => removeAssignment(a)}
                    activeOpacity={0.8}
                    disabled={saving}
                  >
                    <Text style={styles.smallBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>All Subjects ({subjects.length})</Text>
          {subjects.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No subjects found</Text>
            </View>
          ) : (
            subjects.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>📚</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {s.code ? `${s.code} • ` : ''}
                    {s.credits != null ? `${s.credits} credit(s) • ` : ''}
                    {s.is_core ? 'Core' : 'Elective'}
                  </Text>
                  {s.description ? (
                    <Text style={styles.meta} numberOfLines={2}>
                      {s.description}
                    </Text>
                  ) : null}
                </View>
                {isAdmin ? (
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => openEditSubject(s)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => deleteSubject(s)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={[styles.smallBtnText, styles.smallBtnTextDanger]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  headerText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', flex: 1 },
  backButton: {
    position: 'absolute',
    left: 12,
    top: Platform.OS === 'android' ? 40 : 22,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { marginTop: 12, fontSize: 13, color: '#6B7280' },
  errorText: { color: '#C62828', fontSize: 13, textAlign: 'center' },
  retryBtn: {
    marginTop: 14,
    backgroundColor: '#1A237E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 22,
    elevation: 4,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', marginBottom: 12 },
  addBtn: {
    flex: 1,
    backgroundColor: '#1A237E',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
    elevation: 5,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  formCard: {
    backgroundColor: '#FAFBFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4F7',
    padding: 14,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  formTitle: { fontSize: 15, fontWeight: '800', color: '#1A237E', marginBottom: 8 },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 8, marginBottom: 6 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#D7DEEE',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#212121',
    backgroundColor: '#FFFFFF',
  },
  textArea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1A237E', borderColor: '#1A237E', elevation: 3 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#424242' },
  chipTextActive: { color: '#FFFFFF' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EEF1FA',
    marginRight: 10,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  saveBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1A237E',
    minWidth: 110,
    alignItems: 'center',
    elevation: 5,
  },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  disabled: { opacity: 0.7 },
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
  emptyText: { color: '#757575', fontSize: 14 },
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
  cardIconText: { fontSize: 18 },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: '#1A237E' },
  meta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowActions: { flexDirection: 'row' },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#1A237E',
    marginLeft: 6,
    elevation: 2,
  },
  smallBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  smallBtnDanger: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E57373', elevation: 0 },
  smallBtnTextDanger: { color: '#C62828' },
})
