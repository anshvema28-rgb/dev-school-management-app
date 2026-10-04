import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  Alert,
} from 'react-native'
import { supabase } from './supabaseClient'

// ---- Class options (Class 1-12) and Section options (A-E) ----
// The `classes` table stays the single source of truth — no new table.
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const SECTIONS = ['A', 'B', 'C', 'D', 'E']
const SEMESTERS = ['Fall', 'Spring']

// Class name is always generated — the admin never types it:
// Class 1-A … Class 12-E
export const classNameOf = (grade: number, section: string) =>
  `Class ${grade}-${section}`

// Default academic year, e.g. 2026-2027 (school year runs April -> March)
const computedAcademicYear = () => {
  const d = new Date()
  const y = d.getFullYear()
  return d.getMonth() + 1 >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

// Sort: Class 1-A, Class 1-B … Class 2-A … Class 12-E (legacy rows last)
const byGradeSection = (a: any, b: any) => {
  const ga = typeof a?.grade_level === 'number' ? a.grade_level : 999
  const gb = typeof b?.grade_level === 'number' ? b.grade_level : 999
  if (ga !== gb) return ga - gb
  const sa = typeof a?.section === 'string' ? a.section : 'ZZ'
  const sb = typeof b?.section === 'string' ? b.section : 'ZZ'
  if (sa !== sb) return sa < sb ? -1 : 1
  const na = a?.name || ''
  const nb = b?.name || ''
  return na < nb ? -1 : na > nb ? 1 : 0
}

export default function ClassesScreen({ route, navigation }: any) {
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ---- Add / Edit class form ----
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [grade, setGrade] = useState<number | null>(null)
  const [section, setSection] = useState('')
  const [academicYear, setAcademicYear] = useState(computedAcademicYear())
  const [semester, setSemester] = useState('Fall')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: cls, error: cErr } = await supabase
        .from('classes')
        .select('id, name, grade_level, section, academic_year, semester, homeroom_teacher_id')
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true })
      if (cErr) throw cErr
      setClasses((((cls || []) as any[]).slice().sort(byGradeSection)) as any[])

      const { data: subj, error: sErr } = await supabase
        .from('subjects')
        .select('id, name, code, credits, is_core')
        .order('name', { ascending: true })
      if (sErr) throw sErr
      setSubjects((subj || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load classes')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Add / Edit / Delete class ----
  const openAdd = () => {
    setEditingId(null)
    setGrade(null)
    setSection('')
    setSemester('Fall')
    // Default to the academic year already in use by the school (if any)
    const existing = classes.find((c) => c && c.academic_year)
    setAcademicYear(
      existing && existing.academic_year ? existing.academic_year : computedAcademicYear()
    )
    setShowForm(true)
  }

  const openEdit = (c: any) => {
    setEditingId(c.id)
    setGrade(typeof c.grade_level === 'number' ? c.grade_level : null)
    setSection(c.section || '')
    setSemester(c.semester || 'Fall')
    setAcademicYear(c.academic_year || computedAcademicYear())
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
  }

  // Duplicate = same grade_level + section + academic_year (or same generated name)
  const isDuplicate = async (g: number, s: string, year: string) => {
    const [byKey, byName] = await Promise.all([
      supabase
        .from('classes')
        .select('id')
        .eq('grade_level', g)
        .eq('section', s)
        .eq('academic_year', year),
      supabase.from('classes').select('id').eq('name', classNameOf(g, s)),
    ])
    const ids = [
      ...((byKey.data || []) as any[]),
      ...((byName.data || []) as any[]),
    ]
    return ids.some((r) => r && r.id && r.id !== editingId)
  }

  const saveClass = async () => {
    if (grade === null) {
      Alert.alert('Validation', 'Please select a class/grade.')
      return
    }
    if (!section) {
      Alert.alert('Validation', 'Please select a section.')
      return
    }
    const year = academicYear.trim()
    if (!/^\d{4}-\d{4}$/.test(year)) {
      Alert.alert('Validation', 'Academic year must look like 2026-2027.')
      return
    }

    setSaving(true)
    try {
      if (await isDuplicate(grade, section, year)) {
        Alert.alert('Duplicate', 'This class already exists.')
        setSaving(false)
        return
      }

      const name = classNameOf(grade, section)
      const payload = {
        name,
        grade_level: grade,
        section,
        academic_year: year,
        semester,
      }

      const { error: saveErr } = editingId
        ? await supabase.from('classes').update(payload).eq('id', editingId)
        : await supabase.from('classes').insert(payload)
      if (saveErr) throw saveErr

      Alert.alert('Success', editingId ? `${name} updated` : `${name} created`)
      closeForm()
      await load()
    } catch (err: any) {
      const msg = err && err.message ? String(err.message) : 'Unable to save class'
      if (
        msg.indexOf('duplicate key') >= 0 ||
        msg.indexOf('uq_') >= 0 ||
        msg.indexOf('classes_name_key') >= 0
      ) {
        Alert.alert('Duplicate', 'This class already exists.')
      } else {
        Alert.alert('Error', msg)
      }
      setSaving(false)
    }
  }

  const deleteClass = (c: any) => {
    Alert.alert(
      'Delete Class',
      `Delete ${c.name}? Classes referenced by students, attendance, homework, exams or timetable cannot be removed until those records are cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            try {
              const { error: delErr } = await supabase
                .from('classes')
                .delete()
                .eq('id', c.id)
              if (delErr) throw delErr
              await load()
            } catch (err: any) {
              const msg =
                err && err.message ? String(err.message) : 'Unable to delete class'
              if (msg.indexOf('foreign key') >= 0) {
                Alert.alert(
                  'Cannot delete',
                  'This class still has students or academic records linked to it. Remove those records first.'
                )
              } else {
                Alert.alert('Error', msg)
              }
            } finally {
              setSaving(false)
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Classes & Subjects</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading classes…</Text>
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
          <Text style={styles.sectionLabel}>Classes ({classes.length})</Text>

          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>＋ Add Class</Text>
          </TouchableOpacity>

          {showForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                {editingId ? 'Edit Class' : 'Add Class'}
              </Text>

              <Text style={styles.formLabel}>Class / Grade</Text>
              <View style={styles.chipRow}>
                {GRADES.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, grade === g && styles.chipActive]}
                    onPress={() => setGrade(g)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, grade === g && styles.chipTextActive]}>
                      Class {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Section</Text>
              <View style={styles.chipRow}>
                {SECTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, section === s && styles.chipActive]}
                    onPress={() => setSection(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, section === s && styles.chipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Academic Year</Text>
              <TextInput
                style={styles.input}
                value={academicYear}
                onChangeText={setAcademicYear}
                placeholder="2026-2027"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.formLabel}>Semester</Text>
              <View style={styles.chipRow}>
                {SEMESTERS.map((sm) => (
                  <TouchableOpacity
                    key={sm}
                    style={[styles.chip, semester === sm && styles.chipActive]}
                    onPress={() => setSemester(sm)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, semester === sm && styles.chipTextActive]}>
                      {sm}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Class name (auto-generated)</Text>
                <Text style={styles.previewName}>
                  {grade !== null && section
                    ? classNameOf(grade, section)
                    : 'Select a grade and section'}
                </Text>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeForm} activeOpacity={0.8}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={saveClass}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingId ? 'Save Changes' : 'Create Class'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {classes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No classes found</Text>
            </View>
          ) : (
            classes.map((c) => (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>🏫</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    Grade {c.grade_level != null ? c.grade_level : '—'}
                    {c.section ? ` • Section ${c.section}` : ''}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {c.academic_year || '—'}
                    {c.semester ? ` • ${c.semester}` : ''}
                  </Text>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => openEdit(c)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => deleteClass(c)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={[styles.smallBtnText, styles.smallBtnTextDanger]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionLabel}>Subjects ({subjects.length})</Text>
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
                  <Text style={styles.meta} numberOfLines={1}>
                    {s.code || '—'}
                    {s.credits != null ? ` • ${s.credits} credits` : ''}
                    {s.is_core ? ' • Core' : ''}
                  </Text>
                </View>
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

  // ----- Add / Edit class form -----
  addBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 5,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
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
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A237E',
    marginBottom: 10,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginTop: 8,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
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
  chipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
    elevation: 3,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
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
  previewBox: {
    backgroundColor: '#E8F0FE',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    padding: 12,
    marginTop: 10,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5C6BC0',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  previewName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A237E',
    marginTop: 4,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EEF1FA',
    marginRight: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  saveBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1A237E',
    minWidth: 130,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ----- Per-class actions -----
  cardActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: '#1A237E',
    marginRight: 8,
    elevation: 2,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  smallBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  smallBtnDanger: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E57373',
    elevation: 0,
    shadowOpacity: 0,
  },
  smallBtnTextDanger: {
    color: '#C62828',
  },
})
