import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,

} from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

const fmtTime = (t: string) => (t ? String(t).slice(0, 5) : '—')

// Add/Edit form day selector: the timetable.day_of_week CHECK (001) allows
// Monday–Saturday only, so Sunday exists in the viewer but never in the form.
const FORM_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const PERIOD_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)
const isValidTime = (t: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || '').trim())
const toMinutes = (t: string) => {
  const p = String(t || '').trim().split(':')
  return Number(p[0]) * 60 + Number(p[1])
}
const EMPTY_FORM = {
  class_id: '',
  day_of_week: 'Monday',
  period: '',
  subject_id: '',
  teacher_id: '',
  room: '',
  start_time: '',
  end_time: '',
}

export default function TimetableScreen({ route, navigation }: any) {
  const [timetable, setTimetable] = useState<any[]>([])
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({})
  const [classNames, setClassNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState(DAY_NAMES[new Date().getDay()])

  // Add / Edit form (admin CRUD)
  const [teachersList, setTeachersList] = useState<{ id: string; name: string }[]>([])
  const [teacherNotice, setTeacherNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: tt, error: tErr } = await supabase
        .from('timetable')
        .select('id, class_id, day_of_week, period, subject_id, teacher_id, room, start_time, end_time')
        .order('day_of_week', { ascending: true })
        .order('period', { ascending: true })
        .limit(500)
      if (tErr) throw tErr
      setTimetable((tt || []) as any[])

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

      // Teachers for the Add/Edit form. timetable.teacher_id references
      // teachers.id (the detail row) — NEVER profiles.id. Display names
      // come from the profiles table. Non-fatal: the list screen still
      // works if this lookup fails (teacher is optional in the form).
      const { data: tRows, error: tRowsErr } = await supabase
        .from('teachers')
        .select('id, profile_id')
      const { data: tProfs, error: tProfsErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'teacher')
      if (tRowsErr || tProfsErr) {
        const msg = (tRowsErr || tProfsErr)!.message
        console.log('[Timetable] teachers load failed:', msg)
        setTeachersList([])
        setTeacherNotice(msg)
      } else {
        const nameById: Record<string, string> = {}
        ;(tProfs || []).forEach((p: any) => {
          if (p && p.id) nameById[p.id] = p.full_name || ''
        })
        setTeachersList(
          (tRows || [])
            .filter((r: any) => r && r.id)
            .map((r: any) => ({ id: r.id, name: nameById[r.profile_id] || 'Teacher' }))
        )
        setTeacherNotice('')
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load timetable')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Admin CRUD: Add / Edit / Remove period ----
  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (t: any) => {
    setEditingId(t.id)
    setForm({
      class_id: t.class_id || '',
      day_of_week: FORM_DAYS.indexOf(t.day_of_week) >= 0 ? t.day_of_week : 'Monday',
      period: t.period ? String(t.period) : '',
      subject_id: t.subject_id || '',
      teacher_id: t.teacher_id || '',
      room: t.room || '',
      start_time: t.start_time ? String(t.start_time).slice(0, 5) : '',
      end_time: t.end_time ? String(t.end_time).slice(0, 5) : '',
    })
    setFormError('')
    setShowForm(true)
  }

  const closeForm = () => {
    if (saving) return
    setShowForm(false)
    setEditingId(null)
    setFormError('')
  }

  const handleSave = async () => {
    // ---- Validation (required fields + DB CHECKs: day Mon–Sat, period 1–10) ----
    if (!form.class_id) {
      setFormError('Please select a class.')
      return
    }
    if (FORM_DAYS.indexOf(form.day_of_week) < 0) {
      setFormError('Please select a day (Monday–Saturday).')
      return
    }
    const periodNum = Number(form.period)
    if (!form.period || !Number.isInteger(periodNum) || periodNum < 1 || periodNum > 10) {
      setFormError('Please select a period between 1 and 10.')
      return
    }
    if (!form.subject_id) {
      setFormError('Please select a subject.')
      return
    }
    if (!isValidTime(form.start_time) || !isValidTime(form.end_time)) {
      setFormError('Enter valid 24-hour times as HH:MM, e.g. 09:00 and 09:45.')
      return
    }
    if (toMinutes(form.end_time) <= toMinutes(form.start_time)) {
      setFormError('End time must be after start time.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const payload = {
        class_id: form.class_id,
        day_of_week: form.day_of_week,
        period: periodNum,
        subject_id: form.subject_id,
        teacher_id: form.teacher_id || null, // teachers.id (detail row), never profiles.id
        room: form.room.trim() || null,
        start_time: form.start_time.trim(),
        end_time: form.end_time.trim(),
      }

      if (editingId) {
        // .select('id') catches silent 0-row updates (e.g. missing RLS policy).
        const { data, error } = await supabase
          .from('timetable')
          .update(payload)
          .eq('id', editingId)
          .select('id')
        if (error) throw error
        if (!data || data.length === 0) {
          throw new Error(
            'Update affected 0 rows — the row was not found or you do not have permission (admin timetable policy required).'
          )
        }
        setShowForm(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        // Jump the viewer to the updated row's day BEFORE reloading,
        // otherwise the strict day filter (dayRows) can hide it.
        setSelectedDay(payload.day_of_week)
        Alert.alert('Success', 'Period updated successfully.')
      } else {
        // .select('id') confirms the row was actually inserted and returns its id.
        const { data, error } = await supabase.from('timetable').insert(payload).select('id')
        if (error) throw error
        if (!data || data.length === 0 || !data[0].id) {
          throw new Error('Insert did not return a row — nothing was saved. Please try again.')
        }
        setShowForm(false)
        setEditingId(null)
        setForm(EMPTY_FORM)
        // Jump the viewer to the day that was just added BEFORE reloading,
        // otherwise the strict day filter (dayRows) can hide it.
        setSelectedDay(form.day_of_week)
        Alert.alert('Success', 'Period added successfully.')
      }
      await load()
    } catch (err: any) {
      // Never show success on failure — keep the form open with the real error.
      setFormError(err.message || 'Unable to save the period.')
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = (t: any) => {
    const label = subjectNames[t.subject_id] || 'this period'
    Alert.alert(
      'Remove period?',
      `Delete ${label} on ${t.day_of_week}, period ${t.period}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removePeriod(t.id) },
      ]
    )
  }

  const removePeriod = async (id: string) => {
    try {
      const { data, error } = await supabase.from('timetable').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error(
          'Nothing was deleted — the row was not found or you do not have permission (admin delete policy required).'
        )
      }
      Alert.alert('Success', 'Period removed successfully.')
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to remove the period.')
    }
  }

  const dayRows = timetable
    .filter((t) => t.day_of_week === selectedDay)
    .sort((a, b) => (a.period || 0) - (b.period || 0))

  const classOptions = Object.entries(classNames)
    .map(([id, name]) => ({ id, name: String(name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const subjectOptions = Object.entries(subjectNames)
    .map(([id, name]) => ({ id, name: String(name) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Timetable</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading timetable…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
        <View style={styles.addBar}>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={openAdd}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add timetable period"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.addBtnText}>+ Add Period</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayScroll}
            contentContainerStyle={styles.dayRow}
          >
            {DAY_NAMES.map((d) => {
              const active = d === selectedDay
              const count = timetable.filter((t) => t.day_of_week === d).length
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => setSelectedDay(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                    {d.slice(0, 3)}
                  </Text>
                  <Text style={[styles.dayCount, active && styles.dayCountActive]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {dayRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No timetable available for {selectedDay}
              </Text>
            </View>
          ) : (
            dayRows.map((t) => (
              <View key={t.id} style={styles.card}>
                <View style={styles.periodBadge}>
                  <Text style={styles.periodText}>{t.period}</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={1}>
                    {subjectNames[t.subject_id] || 'Subject'}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {classNames[t.class_id] || 'Class —'}
                    {t.room ? ` • Room ${t.room}` : ''}
                  </Text>
                </View>
                <View style={styles.rightCol}>
                  <Text style={styles.time}>
                    {fmtTime(t.start_time)}–{fmtTime(t.end_time)}
                  </Text>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEdit(t)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Edit period"
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => confirmRemove(t)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Remove period"
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    >
                      <Text style={styles.removeBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
        </>
      )}

      {/* ---- Add / Edit period form (admin, bottom-sheet modal) ---- */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Period' : 'Add Period'}</Text>
              <TouchableOpacity
                onPress={closeForm}
                accessibilityRole="button"
                accessibilityLabel="Close form"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalBody}
            >
              {/* Class */}
              <Text style={styles.fieldLabel}>Class *</Text>
              {classOptions.length === 0 ? (
                <Text style={styles.hintText}>No classes found — add a class first.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRowContent}
                >
                  {classOptions.map((c) => {
                    const active = form.class_id === c.id
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => {
                          setForm({ ...form, class_id: c.id })
                          setFormError('')
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[styles.dayChipText, active && styles.dayChipTextActive]}
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}

              {/* Day — Monday–Saturday only (DB CHECK; Sunday is view-only) */}
              <Text style={styles.fieldLabel}>Day *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRowContent}
              >
                {FORM_DAYS.map((d) => {
                  const active = form.day_of_week === d
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayChip, active && styles.dayChipActive]}
                      onPress={() => {
                        setForm({ ...form, day_of_week: d })
                        setFormError('')
                      }}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                        {d.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {/* Period */}
              <Text style={styles.fieldLabel}>Period *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRowContent}
              >
                {PERIOD_OPTIONS.map((p) => {
                  const active = form.period === String(p)
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.dayChip, active && styles.dayChipActive]}
                      onPress={() => {
                        setForm({ ...form, period: String(p) })
                        setFormError('')
                      }}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {/* Subject */}
              <Text style={styles.fieldLabel}>Subject *</Text>
              {subjectOptions.length === 0 ? (
                <Text style={styles.hintText}>No subjects found — add a subject first.</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRowContent}
                >
                  {subjectOptions.map((s) => {
                    const active = form.subject_id === s.id
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => {
                          setForm({ ...form, subject_id: s.id })
                          setFormError('')
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[styles.dayChipText, active && styles.dayChipTextActive]}
                          numberOfLines={1}
                        >
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}

              {/* Teacher — value stored is teachers.id (detail row), never profiles.id */}
              <Text style={styles.fieldLabel}>Teacher (optional)</Text>
              {teachersList.length === 0 ? (
                <Text style={styles.hintText}>
                  {teacherNotice ||
                    'No teachers available yet — you can still add a period (teacher is optional).'}
                </Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRowContent}
                >
                  {teachersList.map((tc) => {
                    const active = form.teacher_id === tc.id
                    return (
                      <TouchableOpacity
                        key={tc.id}
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => {
                          setForm({ ...form, teacher_id: tc.id })
                          setFormError('')
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[styles.dayChipText, active && styles.dayChipTextActive]}
                          numberOfLines={1}
                        >
                          {tc.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}

              {/* Room */}
              <Text style={styles.fieldLabel}>Room (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.room}
                onChangeText={(v) => {
                  setForm({ ...form, room: v })
                  setFormError('')
                }}
                placeholder="e.g. 101"
                placeholderTextColor="#9E9E9E"
                autoCapitalize="none"
              />

              {/* Times */}
              <Text style={styles.fieldLabel}>Start Time &amp; End Time *</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={[styles.input, styles.timeInput]}
                  value={form.start_time}
                  onChangeText={(v) => {
                    setForm({ ...form, start_time: v })
                    setFormError('')
                  }}
                  placeholder="09:00"
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numbers-and-punctuation"
                />
                <TextInput
                  style={[styles.input, styles.timeInputLast]}
                  value={form.end_time}
                  onChangeText={(v) => {
                    setForm({ ...form, end_time: v })
                    setFormError('')
                  }}
                  placeholder="09:45"
                  placeholderTextColor="#9E9E9E"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={closeForm}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Period'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  dayScroll: {
    marginBottom: 14,
  },
  dayRow: {
    paddingVertical: 2,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dayChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  dayCount: {
    fontSize: 10,
    color: '#9E9E9E',
    marginTop: 2,
  },
  dayCountActive: {
    color: '#BBDEFB',
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
    textAlign: 'center',
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
  periodBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  periodText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
  time: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },

  // ---- Add / Edit / Remove (admin CRUD) ----
  addBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  addBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 7,
  },
  editBtn: {
    backgroundColor: '#E8EEFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#1B5FBF',
    fontSize: 12,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: '#FDECEC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#F5C2C2',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '700',
  },

  // ---- Add / Edit form (bottom-sheet modal) ----
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
    paddingBottom: 10,
    maxHeight: '88%',
    elevation: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1FA',
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1A237E',
  },
  modalClose: {
    fontSize: 24,
    lineHeight: 26,
    color: '#6B7280',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  modalBody: {
    padding: 16,
    paddingBottom: 24,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A237E',
    marginTop: 16,
    marginBottom: 8,
  },
  chipRowContent: {
    paddingVertical: 2,
    paddingRight: 8,
  },
  hintText: {
    fontSize: 11,
    color: '#9E9E9E',
    fontStyle: 'italic',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1A237E',
    minHeight: 44,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeInput: {
    flex: 1,
    marginRight: 10,
  },
  timeInputLast: {
    flex: 1,
  },
  formError: {
    fontSize: 12.5,
    color: '#C62828',
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F5C2C2',
    borderRadius: 8,
    padding: 10,
    marginTop: 16,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cancelBtnText: {
    color: '#424242',
    fontSize: 14.5,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
})
