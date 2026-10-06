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

// Complaint / ticket module — NEW table `complaints` (migration 009).
//   student -> CREATE own complaint, READ only own (never another student's)
//   teacher -> READ / RESPOND to complaints from own homeroom students
//   admin   -> view ALL, filter, respond, update status
//   parent  -> read-only view of linked child's complaints
// RLS is the security boundary; status/response are never writable by students.

const CATEGORIES = ['Academic', 'Fees', 'Transport', 'Discipline', 'Facilities', 'Hostel', 'Other']
const STATUSES = ['Pending', 'In Review', 'Resolved', 'Rejected']
const FILTERS = ['All', ...STATUSES]

const statusColor = (s: string) => {
  if (s === 'Resolved') return { bg: '#E8F5E9', fg: '#2E7D32' }
  if (s === 'Rejected') return { bg: '#FFEBEE', fg: '#C62828' }
  if (s === 'In Review') return { bg: '#FFF3E0', fg: '#EF6C00' }
  return { bg: '#E3F2FD', fg: '#1A237E' }
}

const fmtDate = (v: string) => {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}

export default function ComplaintsScreen({
  navigation,
  role = 'student',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const isAdmin = role === 'admin' || role === null
  const canRespond = isAdmin || role === 'teacher'

  const [items, setItems] = useState<any[]>([])
  const [nameMap, setNameMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')

  // student create form
  const [showCreate, setShowCreate] = useState(false)
  const [category, setCategory] = useState('Academic')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // teacher/admin respond form
  const [respondTarget, setRespondTarget] = useState<any | null>(null)
  const [respStatus, setRespStatus] = useState('In Review')
  const [respText, setRespText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = await supabase
        .from('complaints')
        .select(
          'id, student_id, created_by, category, title, description, status, response, created_at, updated_at'
        )
        .order('created_at', { ascending: false })
      if (q.error) throw q.error
      const rows = (q.data || []) as any[]
      setItems(rows)

      if (canRespond && rows.length > 0) {
        // names of students referenced (RLS limits teachers to own class)
        const ids = Array.from(
          new Set(rows.map((r) => r.student_id).filter((v: any) => !!v))
        )
        if (ids.length > 0) {
          const st = await supabase
            .from('students')
            .select('id, profile_id, profiles!students_profile_id_fkey ( full_name )')
            .in('id', ids)
          const map: Record<string, string> = {}
          ;((st.data || []) as any[]).forEach((s: any) => {
            const pf: any = s.profiles
            map[s.id] = (pf && pf.full_name) || 'Student'
          })
          setNameMap(map)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load complaints')
    } finally {
      setLoading(false)
    }
  }, [canRespond])

  useEffect(() => {
    load()
  }, [load])

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const createComplaint = async () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Please enter a subject / title.')
      return
    }
    if (!description.trim()) {
      Alert.alert('Validation', 'Please describe your complaint.')
      return
    }
    setSaving(true)
    try {
      const authRes = await supabase.auth.getUser()
      const uid = authRes && authRes.data && authRes.data.user ? authRes.data.user.id : null
      if (!uid) {
        Alert.alert('Error', 'You are not signed in.')
        setSaving(false)
        return
      }
      // Students must link to their own students row; teacher/admin file
      // staff complaints with student_id = null (enforced by RLS, migration 021).
      let studentId: string | null = null
      if (role === 'student') {
        const own = await supabase.from('students').select('id').eq('profile_id', uid)
        if (own.error) throw own.error
        const rows = (own.data || []) as any[]
        studentId = rows.length > 0 ? rows[0].id : null
        if (!studentId) {
          Alert.alert('Error', 'Your student record was not found. Please contact the office.')
          setSaving(false)
          return
        }
      }
      const { error: err } = await supabase.from('complaints').insert({
        student_id: studentId,
        created_by: uid,
        category,
        title: title.trim(),
        description: description.trim(),
        status: 'Pending',
      })
      if (err) throw err
      Alert.alert('Submitted', 'Your complaint has been submitted.')
      setShowCreate(false)
      setTitle('')
      setDescription('')
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to submit complaint')
    } finally {
      setSaving(false)
    }
  }

  const openRespond = (c: any) => {
    setRespondTarget(c)
    setRespStatus(c.status && c.status !== 'Pending' ? c.status : 'In Review')
    setRespText(c.response || '')
  }

  const submitResponse = async () => {
    if (!respondTarget) return
    setSaving(true)
    try {
      const { error: err } = await supabase
        .from('complaints')
        .update({ status: respStatus, response: respText.trim() || null })
        .eq('id', respondTarget.id)
      if (err) throw err
      Alert.alert('Saved', 'Complaint updated.')
      setRespondTarget(null)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to update complaint')
    } finally {
      setSaving(false)
    }
  }

  const visible =
    filter === 'All' ? items : items.filter((c) => c.status === filter)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Complaints</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading complaints…</Text>
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
          {role === 'student' || role === 'teacher' || role === 'admin' ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowCreate(!showCreate)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>
                {showCreate ? '× Close Form' : '＋ New Complaint'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showCreate ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>New Complaint</Text>

              <Text style={styles.formLabel}>Category</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, category === c && styles.chipActive]}
                    onPress={() => setCategory(c)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Subject / title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Short summary"
                placeholderTextColor="#9AA5C4"
                maxLength={120}
              />

              <Text style={styles.formLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue…"
                placeholderTextColor="#9AA5C4"
                multiline
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowCreate(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={createComplaint}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {canRespond ? (
            <View style={styles.chipRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, filter === f && styles.chipActive]}
                  onPress={() => setFilter(f)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {respondTarget ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Respond</Text>
              <Text style={styles.respondSubject} numberOfLines={2}>
                {respondTarget.title}
              </Text>

              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.chipRow}>
                {STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, respStatus === s && styles.chipActive]}
                    onPress={() => setRespStatus(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, respStatus === s && styles.chipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Response / feedback</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={respText}
                onChangeText={setRespText}
                placeholder="Write a response…"
                placeholderTextColor="#9AA5C4"
                multiline
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setRespondTarget(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={submitResponse}
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

          <Text style={styles.sectionLabel}>Complaints ({visible.length})</Text>

          {visible.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No complaints found</Text>
            </View>
          ) : (
            visible.map((c) => {
              const sc = statusColor(c.status || 'Pending')
              return (
                <View key={c.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.fg }]}>
                        {c.status || 'Pending'}
                      </Text>
                    </View>
                    <Text style={styles.date}>{fmtDate(c.created_at)}</Text>
                  </View>

                  <Text style={styles.name} numberOfLines={2}>
                    {c.title}
                  </Text>

                  <Text style={styles.meta} numberOfLines={1}>
                    {c.category || 'Other'}
                    {canRespond && nameMap[c.student_id] ? ` • ${nameMap[c.student_id]}` : ''}
                  </Text>

                  {c.description ? (
                    <Text style={styles.desc} numberOfLines={4}>
                      {c.description}
                    </Text>
                  ) : null}

                  {c.response ? (
                    <View style={styles.responseBox}>
                      <Text style={styles.responseLabel}>Response</Text>
                      <Text style={styles.responseText} numberOfLines={6}>
                        {c.response}
                      </Text>
                    </View>
                  ) : null}

                  {canRespond ? (
                    <TouchableOpacity
                      style={styles.respondBtn}
                      onPress={() => openRespond(c)}
                      activeOpacity={0.8}
                      disabled={saving}
                    >
                      <Text style={styles.respondBtnText}>
                        {c.response ? 'Update Response' : 'Respond'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })
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
  respondSubject: { fontSize: 13, fontWeight: '700', color: '#424242', marginBottom: 4 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
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
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  date: { fontSize: 10, color: '#9E9E9E' },
  name: { fontSize: 14, fontWeight: '800', color: '#1A237E', marginTop: 8 },
  meta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  desc: { fontSize: 12, color: '#424242', marginTop: 6, lineHeight: 17 },
  responseBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  responseLabel: { fontSize: 9, fontWeight: '800', color: '#1A237E', letterSpacing: 0.6 },
  responseText: { fontSize: 12, color: '#212121', marginTop: 3, lineHeight: 17 },
  respondBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1A237E',
    elevation: 3,
  },
  respondBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
})
