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

} from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

// Syllabus module — NEW table `syllabus` (migration 007).
//   admin   -> create / edit / delete / publish
//   teacher -> read syllabus for own homeroom classes (read-only)
//   student -> read PUBLISHED syllabus for own class only
//   parent  -> read PUBLISHED syllabus for linked child's class
// RLS on the server is the real boundary; this screen just renders what returns.

const EMPTY = {
  id: null as string | null,
  title: '',
  description: '',
  content: '',
  academic_year: '',
  class_id: null as string | null,
  subject_id: null as string | null,
  is_published: true,
}

export default function SyllabusScreen({
  navigation,
  role = 'admin',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const isAdmin = role === 'admin' || role === null

  const [items, setItems] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const currentYear = () => {
    const d = new Date()
    const y = d.getFullYear()
    return d.getMonth() + 1 >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
  }

  const classMap: Record<string, string> = {}
  classes.forEach((c) => (classMap[c.id] = c.name))
  const subjectMap: Record<string, string> = {}
  subjects.forEach((s) => (subjectMap[s.id] = s.name))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = await supabase
        .from('syllabus')
        .select(
          'id, class_id, subject_id, title, description, content, academic_year, is_published, created_at'
        )
        .order('created_at', { ascending: false })
      if (q.error) throw q.error
      setItems((q.data || []) as any[])

      const cls = await supabase.from('classes').select('id, name').order('name')
      setClasses((cls.data || []) as any[])

      const subs = await supabase.from('subjects').select('id, name').order('name')
      setSubjects((subs.data || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load syllabus')
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
    setForm({ ...EMPTY, academic_year: currentYear() })
    setShowForm(true)
  }

  const openEdit = (s: any) => {
    setForm({
      id: s.id,
      title: s.title || '',
      description: s.description || '',
      content: s.content || '',
      academic_year: s.academic_year || currentYear(),
      class_id: s.class_id || null,
      subject_id: s.subject_id || null,
      is_published: s.is_published !== false,
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Please enter a title.')
      return
    }
    if (!form.class_id) {
      Alert.alert('Validation', 'Please select a class.')
      return
    }
    const payload: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      content: form.content.trim() || null,
      academic_year: form.academic_year.trim() || currentYear(),
      class_id: form.class_id,
      subject_id: form.subject_id,
      is_published: form.is_published,
    }
    setSaving(true)
    try {
      const { error: err } = form.id
        ? await supabase.from('syllabus').update(payload).eq('id', form.id)
        : await supabase.from('syllabus').insert(payload)
      if (err) throw err
      Alert.alert('Success', form.id ? 'Syllabus updated' : 'Syllabus created')
      setShowForm(false)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save')
    } finally {
      setSaving(false)
    }
  }

  const remove = (s: any) => {
    Alert.alert('Delete Syllabus', `Delete "${s.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const { error: err } = await supabase.from('syllabus').delete().eq('id', s.id)
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

  const togglePublish = async (s: any) => {
    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('syllabus')
        .update({ is_published: s.is_published === false })
        .eq('id', s.id)
      if (err) throw err
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to update')
    } finally {
      setSaving(false)
    }
  }

  const renderChips = (
    itemsArr: { key: string; label: string }[],
    selected: string | null,
    onSelect: (k: string) => void
  ) => (
    <View style={styles.chipRow}>
      {itemsArr.map((it) => (
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
        <Text style={styles.headerText}>Syllabus</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading syllabus…</Text>
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
              <Text style={styles.addBtnText}>＋ Add Syllabus</Text>
            </TouchableOpacity>
          ) : null}

          {showForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{form.id ? 'Edit Syllabus' : 'Add Syllabus'}</Text>

              <Text style={styles.formLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
                placeholder="e.g. Term 1 Mathematics Syllabus"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Class *</Text>
              {renderChips(
                classes.map((c) => ({ key: c.id, label: c.name })),
                form.class_id,
                (k) => setForm({ ...form, class_id: k })
              )}

              <Text style={styles.formLabel}>Subject</Text>
              {renderChips(
                subjects.map((s) => ({ key: s.id, label: s.name })),
                form.subject_id,
                (k) => setForm({ ...form, subject_id: form.subject_id === k ? null : k })
              )}

              <Text style={styles.formLabel}>Short description</Text>
              <TextInput
                style={styles.input}
                value={form.description}
                onChangeText={(t) => setForm({ ...form, description: t })}
                placeholder="Optional"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Content / topics</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.content}
                onChangeText={(t) => setForm({ ...form, content: t })}
                placeholder="Chapter list, units, references…"
                placeholderTextColor="#9AA5C4"
                multiline
              />

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
                    Draft
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

          <Text style={styles.sectionLabel}>Syllabus ({items.length})</Text>

          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {isAdmin ? 'No syllabus added yet' : 'No syllabus published yet'}
              </Text>
            </View>
          ) : (
            items.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Text style={styles.cardIconText}>📖</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.name} numberOfLines={2}>
                    {s.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {s.class_id && classMap[s.class_id] ? classMap[s.class_id] : 'Class'}
                    {s.subject_id && subjectMap[s.subject_id]
                      ? ` • ${subjectMap[s.subject_id]}`
                      : ''}
                    {s.academic_year ? ` • ${s.academic_year}` : ''}
                  </Text>
                  {s.description ? (
                    <Text style={styles.meta} numberOfLines={2}>
                      {s.description}
                    </Text>
                  ) : null}
                  {s.content ? (
                    <Text style={styles.bodyText} numberOfLines={4}>
                      {s.content}
                    </Text>
                  ) : null}
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.badge,
                        s.is_published === false ? styles.badgeDraft : styles.badgeOk,
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {s.is_published === false ? 'DRAFT' : 'PUBLISHED'}
                      </Text>
                    </View>
                  </View>
                </View>
                {isAdmin ? (
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => openEdit(s)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.smallBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => togglePublish(s)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={styles.smallBtnText}>
                        {s.is_published === false ? 'Publish' : 'Unpublish'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => remove(s)}
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
  textArea: { height: 90, paddingTop: 10, textAlignVertical: 'top' },
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
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  bodyText: { fontSize: 12, color: '#424242', marginTop: 6, lineHeight: 17 },
  badgeRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOk: { backgroundColor: '#E8F5E9' },
  badgeDraft: { backgroundColor: '#FFF3E0' },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#1A237E', letterSpacing: 0.6 },
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
