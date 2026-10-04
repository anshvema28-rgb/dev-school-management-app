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

// Academic Calendar — NEW table `academic_calendar` (migration 010).
//   admin   -> add / edit / delete / publish events
//   others  -> read PUBLISHED events addressed to them (RLS filtered server-side)

const TYPES = ['General', 'Exam', 'Holiday', 'Function', 'Sports', 'Meeting']
const AUDIENCES = ['all', 'student', 'teacher', 'parent']

const EMPTY = {
  id: null as string | null,
  title: '',
  description: '',
  event_date: '',
  end_date: '',
  event_type: 'General',
  audience: 'all',
  academic_year: '',
  is_published: true,
}

const today = () => {
  const d = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const currentYear = () => {
  const d = new Date()
  const y = d.getFullYear()
  return d.getMonth() + 1 >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

const fmt = (iso: string) => {
  if (!iso) return ''
  const parts = String(iso).slice(0, 10).split('-')
  if (parts.length !== 3) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = Number(parts[1]) - 1
  return `${parts[2]} ${months[mi] !== undefined ? months[mi] : parts[1]} ${parts[0]}`
}

export default function CalendarScreen({
  navigation,
  role = 'admin',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const isAdmin = role === 'admin' || role === null

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = await supabase
        .from('academic_calendar')
        .select(
          'id, title, description, event_date, end_date, event_type, audience, academic_year, is_published'
        )
        .order('event_date', { ascending: true })
      if (q.error) throw q.error
      setItems((q.data || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load calendar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const openAdd = () => {
    setForm({ ...EMPTY, event_date: today(), academic_year: currentYear() })
    setShowForm(true)
  }

  const openEdit = (e: any) => {
    setForm({
      id: e.id,
      title: e.title || '',
      description: e.description || '',
      event_date: String(e.event_date || '').slice(0, 10),
      end_date: e.end_date ? String(e.end_date).slice(0, 10) : '',
      event_type: e.event_type || 'General',
      audience: e.audience || 'all',
      academic_year: e.academic_year || currentYear(),
      is_published: e.is_published !== false,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Please enter an event title.')
      return
    }
    if (!form.event_date.trim()) {
      Alert.alert('Validation', 'Please enter the event date (YYYY-MM-DD).')
      return
    }
    const isoRe = /^\d{4}-\d{2}-\d{2}$/
    if (!isoRe.test(form.event_date.trim())) {
      Alert.alert('Validation', 'Event date must be in YYYY-MM-DD format (e.g. 2026-12-25).')
      return
    }
    if (form.end_date.trim() && !isoRe.test(form.end_date.trim())) {
      Alert.alert('Validation', 'End date must be in YYYY-MM-DD format (e.g. 2026-12-26).')
      return
    }
    const payload: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_date: form.event_date.trim(),
      end_date: form.end_date.trim() || null,
      event_type: form.event_type,
      audience: form.audience,
      academic_year: form.academic_year.trim() || currentYear(),
      is_published: form.is_published,
    }
    setSaving(true)
    try {
      const { error: err } = form.id
        ? await supabase.from('academic_calendar').update(payload).eq('id', form.id)
        : await supabase.from('academic_calendar').insert(payload)
      if (err) throw err
      Alert.alert('Success', form.id ? 'Event updated' : 'Event added')
      setShowForm(false)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save')
    } finally {
      setSaving(false)
    }
  }

  const remove = (e: any) => {
    Alert.alert('Delete Event', `Delete "${e.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const { error: err } = await supabase
              .from('academic_calendar')
              .delete()
              .eq('id', e.id)
            if (err) throw err
            await load()
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Unable to delete')
          } finally {
            setSaving(false)
          }
        },
      },
    ])
  }

  const togglePublish = async (e: any) => {
    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('academic_calendar')
        .update({ is_published: e.is_published === false })
        .eq('id', e.id)
      if (err) throw err
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to update')
    } finally {
      setSaving(false)
    }
  }

  const renderChips = (
    arr: string[],
    selected: string,
    onSelect: (v: string) => void
  ) => (
    <View style={styles.chipRow}>
      {arr.map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.chip, selected === v && styles.chipActive]}
          onPress={() => onSelect(v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.chipText, selected === v && styles.chipTextActive]}>
            {v === 'all' ? 'Everyone' : v.charAt(0).toUpperCase() + v.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Academic Calendar</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading calendar…</Text>
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
            <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>＋ Add Event</Text>
            </TouchableOpacity>
          ) : null}

          {showForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{form.id ? 'Edit Event' : 'Add Event'}</Text>

              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
                placeholder="e.g. Annual Day"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Event date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                value={form.event_date}
                onChangeText={(t) => setForm({ ...form, event_date: t })}
                placeholder="2026-12-25"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.formLabel}>End date (optional)</Text>
              <TextInput
                style={styles.input}
                value={form.end_date}
                onChangeText={(t) => setForm({ ...form, end_date: t })}
                placeholder="2026-12-26"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.description}
                onChangeText={(t) => setForm({ ...form, description: t })}
                placeholder="Optional details"
                placeholderTextColor="#9AA5C4"
                multiline
              />

              <Text style={styles.formLabel}>Event type</Text>
              {renderChips(TYPES, form.event_type, (v) => setForm({ ...form, event_type: v }))}

              <Text style={styles.formLabel}>Audience</Text>
              {renderChips(AUDIENCES, form.audience, (v) => setForm({ ...form, audience: v }))}

              <Text style={styles.formLabel}>Academic year</Text>
              <TextInput
                style={styles.input}
                value={form.academic_year}
                onChangeText={(t) => setForm({ ...form, academic_year: t })}
                placeholder="2026-2027"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="none"
              />

              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, form.is_published && styles.chipActive]}
                  onPress={() => setForm({ ...form, is_published: true })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, form.is_published && styles.chipTextActive]}>
                    Published
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, !form.is_published && styles.chipActive]}
                  onPress={() => setForm({ ...form, is_published: false })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, !form.is_published && styles.chipTextActive]}>
                    Hidden
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowForm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={save}
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

          <Text style={styles.sectionLabel}>Events ({items.length})</Text>

          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {isAdmin ? 'No calendar events yet' : 'No calendar events published yet'}
              </Text>
            </View>
          ) : (
            items.map((e) => (
              <View key={e.id} style={styles.card}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateDay}>{String(e.event_date || '').slice(8, 10)}</Text>
                  <Text style={styles.dateMonth}>
                    {fmt(e.event_date).split(' ')[1] || ''}
                  </Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {fmt(e.event_date)}
                    {e.end_date ? ` → ${fmt(e.end_date)}` : ''}
                  </Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{e.event_type || 'General'}</Text>
                    </View>
                    <View style={styles.badgeSoft}>
                      <Text style={styles.badgeText}>
                        {e.audience === 'all'
                          ? 'Everyone'
                          : String(e.audience).charAt(0).toUpperCase() +
                            String(e.audience).slice(1)}
                      </Text>
                    </View>
                    {isAdmin ? (
                      <View
                        style={[
                          styles.badge,
                          e.is_published === false ? styles.badgeDraft : styles.badgeOk,
                        ]}
                      >
                        <Text style={styles.badgeText}>
                          {e.is_published === false ? 'HIDDEN' : 'PUBLISHED'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {e.description ? (
                    <Text style={styles.desc} numberOfLines={3}>
                      {e.description}
                    </Text>
                  ) : null}
                </View>
                {isAdmin ? (
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => openEdit(e)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => togglePublish(e)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={styles.smallBtnText}>
                        {e.is_published === false ? 'Publish' : 'Hide'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => remove(e)}
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
  addBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
    elevation: 5,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
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
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
  },
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
    alignItems: 'flex-start',
  },
  dateBox: {
    width: 46,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginRight: 12,
  },
  dateDay: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  dateMonth: { fontSize: 10, fontWeight: '700', color: '#3949AB' },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: '#1A237E' },
  meta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  desc: { fontSize: 12, color: '#424242', marginTop: 6, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginBottom: 4,
    backgroundColor: '#1A237E',
  },
  badgeSoft: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginBottom: 4,
    backgroundColor: '#E3F2FD',
  },
  badgeOk: { backgroundColor: '#2E7D32' },
  badgeDraft: { backgroundColor: '#EF6C00' },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#1A237E', letterSpacing: 0.4 },
  rowActions: { flexDirection: 'column', alignItems: 'flex-end' },
  smallBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: '#1A237E',
    marginLeft: 6,
    marginTop: 4,
    elevation: 2,
  },
  smallBtnText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  smallBtnDanger: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E57373',
    elevation: 0,
  },
  smallBtnTextDanger: { color: '#C62828' },
})
