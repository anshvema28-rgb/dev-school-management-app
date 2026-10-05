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

const CREATE_PARENT_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') +
  '/functions/v1/create-parent'

// Edge Function that removes a parent account (server-side only).
// The service_role key lives exclusively in the Edge Function — never here.
const DELETE_PARENT_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') +
  '/functions/v1/delete-parent'

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

const initialsOf = (name: string) => {
  const parts = (name || '').trim().split(/\s+/)
  const first = parts[0] ? parts[0][0] : 'P'
  const second = parts[1] ? parts[1][0] : ''
  return String(first).toUpperCase() + String(second).toUpperCase()
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  relationship: '',
  student_ids: [] as string[],
}

export default function ParentsScreen({ route, navigation }: any) {
  const [parents, setParents] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingParent, setEditingParent] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Detail
  const [detailParent, setDetailParent] = useState<any>(null)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Load parents (profiles role='parent') + their linked students ----
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('role', 'parent')
        .order('full_name', { ascending: true })
      if (pErr) throw pErr

      const { data: rels, error: rErr } = await supabase
        .from('parent_students')
        .select('id, parent_id, student_id, relationship')
      if (rErr) throw rErr

      const relMap: Record<string, any[]> = {}
      ;(rels || []).forEach((r: any) => {
        if (!relMap[r.parent_id]) relMap[r.parent_id] = []
        relMap[r.parent_id].push(r)
      })

      setParents(
        (profs || []).map((p: any) => ({ ...p, _relationships: relMap[p.id] || [] }))
      )

      const { data: stu, error: sErr } = await supabase
        .from('students')
        .select('id, roll_no, admission_no, class_id, profiles!students_profile_id_fkey (full_name)')
        .order('roll_no', { ascending: true })
        .limit(500)
      if (sErr) throw sErr
      setStudents((stu || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load parents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const studentName = (s: any) =>
    (s.profiles && s.profiles.full_name) || s.roll_no || 'Student'

  // ---- Create Parent Account (secure Edge Function) ----
  const createParentAccount = async () => {
    if (!form.full_name.trim()) {
      Alert.alert('Validation', 'Please enter the parent\'s full name.')
      return
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      Alert.alert('Validation', 'Please enter a valid email address.')
      return
    }
    if (!form.password || form.password.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.')
      return
    }
    if (form.student_ids.length === 0) {
      Alert.alert('Validation', 'Please select at least one student.')
      return
    }

    setSaving(true)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess && sess.session ? sess.session.access_token : null
      if (!token) {
        Alert.alert('Error', 'Your session has expired. Please log in again.')
        setSaving(false)
        return
      }

      const payload = {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        relationship: form.relationship.trim() || null,
        student_ids: form.student_ids,
      }

      const resp = await fetch(CREATE_PARENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify(payload),
      })

      const result = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        Alert.alert('Error', result.error || 'Unable to create parent account')
        setSaving(false)
        return
      }

      Alert.alert('Success', 'Parent account created successfully')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setShowPassword(false)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to create parent account')
    } finally {
      setSaving(false)
    }
  }

  // ---- Edit parent profile (name / email / phone only — never password) ----
  const saveParentProfile = async () => {
    if (!editingParent || !editingParent.id) return
    if (!form.full_name.trim()) {
      Alert.alert('Validation', 'Please enter the parent\'s full name.')
      return
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      Alert.alert('Validation', 'Please enter a valid email address.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          email: form.email.trim(),
          phone: form.phone.trim(),
        })
        .eq('id', editingParent.id)
      if (error) throw error

      Alert.alert('Success', 'Parent profile updated')
      setShowForm(false)
      setEditingParent(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to update parent')
    } finally {
      setSaving(false)
    }
  }

  // ---- Link a child ----
  const linkChild = async (parentId: string, studentId: string) => {
    try {
      const { error } = await supabase.from('parent_students').insert({
        parent_id: parentId,
        student_id: studentId,
        relationship: form.relationship.trim() || null,
      })
      if (error) throw error
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to link student')
    }
  }

  // ---- Unlink a child ----
  const unlinkChild = async (relId: string) => {
    Alert.alert('Unlink Student', 'Remove this child from the parent?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('parent_students').delete().eq('id', relId)
            if (error) throw error
            load()
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Unable to unlink student')
          }
        },
      },
    ])
  }

  // ---- Remove parent account (server-side, via Edge Function) ----
  const removeParent = (parent: any) => {
    Alert.alert(
      'Remove this parent account?',
      `This will permanently remove ${parent.full_name || 'this parent'}'s login account and all linked parent relationships. Students will NOT be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: sess } = await supabase.auth.getSession()
              const token = sess && sess.session ? sess.session.access_token : null
              if (!token) {
                Alert.alert('Error', 'Your session has expired. Please log in again.')
                return
              }

              const resp = await fetch(DELETE_PARENT_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                  apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
                },
                body: JSON.stringify({ parent_id: parent.id }),
              })

              const result = await resp.json().catch(() => ({}))

              if (!resp.ok) {
                // Actual error returned by the Edge Function
                Alert.alert('Error', result.error || 'Unable to remove parent account')
                return
              }

              // Success only after the Edge Function confirmed deletion
              if (detailParent && detailParent.id === parent.id) setDetailParent(null)
              Alert.alert('Success', 'Parent account removed')
              load()
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unable to remove parent account')
            }
          },
        },
      ]
    )
  }

  // ---- Form helpers ----
  const openCreateForm = () => {
    setEditingParent(null)
    setForm(EMPTY_FORM)
    setShowPassword(false)
    setShowForm(true)
  }

  const openEditForm = (parent: any) => {
    setEditingParent(parent)
    setForm({
      full_name: parent.full_name || '',
      email: parent.email || '',
      password: '',
      confirmPassword: '',
      phone: parent.phone || '',
      relationship: '',
      student_ids: [],
    })
    setShowPassword(false)
    setShowForm(true)
  }

  const toggleStudent = (studentId: string) => {
    setForm((prev) => {
      const has = prev.student_ids.includes(studentId)
      return {
        ...prev,
        student_ids: has
          ? prev.student_ids.filter((id) => id !== studentId)
          : [...prev.student_ids, studentId],
      }
    })
  }

  // ---- Derived ----
  const filteredParents = parents.filter((p) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (p.full_name && p.full_name.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.phone && p.phone.toLowerCase().includes(q))
    )
  })

  const linkedStudentIds = (parent: any) =>
    (parent._relationships || []).map((r: any) => r.student_id)

  const studentById = (id: string) => students.find((s) => s.id === id)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Parent Management</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.createBtn} onPress={openCreateForm} activeOpacity={0.8}>
            <Text style={styles.createBtnText}>＋ Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, or phone"
          placeholderTextColor="#9E9E9E"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading parents…</Text>
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
          {filteredParents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {search ? 'No parents match your search' : 'No parents found'}
              </Text>
            </View>
          ) : (
            filteredParents.map((p) => {
              const linked = linkedStudentIds(p)
              return (
                <View key={p.id} style={styles.card3d}>
                  <View style={styles.card}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => setDetailParent(p)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initialsOf(p.full_name || 'P')}</Text>
                      </View>
                      <View style={styles.body}>
                        <Text style={styles.name} numberOfLines={1}>
                          {p.full_name || 'Parent'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {p.email || '—'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {p.phone || '—'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {linked.length} linked {linked.length === 1 ? 'child' : 'children'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setDetailParent(p)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEditForm(p)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnDanger]}
                        onPress={() => removeParent(p)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnDangerText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>
      )}

      {/* ---- Detail overlay ---- */}
      {detailParent ? (
        <View style={styles.overlay}>
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>Parent Details</Text>
            <TouchableOpacity onPress={() => setDetailParent(null)} activeOpacity={0.7}>
              <Text style={styles.overlayClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.overlayScroll}
            contentContainerStyle={styles.overlayContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailAvatar}>
              <Text style={styles.detailAvatarText}>
                {initialsOf(detailParent.full_name || 'P')}
              </Text>
            </View>
            <Text style={styles.detailName}>{detailParent.full_name || 'Parent'}</Text>

            <View style={styles.detailGrid}>
              <DetailRow label="Email" value={detailParent.email} />
              <DetailRow label="Phone" value={detailParent.phone} />
            </View>

            <Text style={styles.sectionLabel}>
              Linked Children ({(detailParent._relationships || []).length})
            </Text>
            {(detailParent._relationships || []).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No children linked</Text>
              </View>
            ) : (
              (detailParent._relationships || []).map((rel: any) => {
                const stu = studentById(rel.student_id)
                const name = stu ? studentName(stu) : 'Unknown'
                return (
                  <View key={rel.id} style={styles.childRow}>
                    <View style={styles.childAvatar}>
                      <Text style={styles.childAvatarText}>{initialsOf(name)}</Text>
                    </View>
                    <View style={styles.childBody}>
                      <Text style={styles.childName} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.childMeta} numberOfLines={1}>
                        {stu && stu.roll_no ? `Roll ${stu.roll_no}` : '—'}
                        {rel.relationship ? ` • ${rel.relationship}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.unlinkBtn}
                      onPress={() => unlinkChild(rel.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.unlinkBtnText}>Unlink</Text>
                    </TouchableOpacity>
                  </View>
                )
              })
            )}

            <View style={styles.overlayActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setDetailParent(null)
                  openEditForm(detailParent)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* ---- Create / Edit form overlay ---- */}
      {showForm ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingParent ? 'Edit Parent' : 'Create Parent Account'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false)
                setEditingParent(null)
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
            <Text style={styles.formNote}>
              {editingParent
                ? 'Update this parent\'s profile. Passwords can only be set during account creation.'
                : 'Creates a real Supabase Auth account via a secure Edge Function. The password is never stored in the database.'}
            </Text>

            <Text style={styles.formLabel}>Full Name</Text>
            <TextInput
              style={styles.formInput}
              value={form.full_name}
              onChangeText={(t) => setForm({ ...form, full_name: t })}
              placeholder="e.g. Rajesh Patel"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Email</Text>
            <TextInput
              style={styles.formInput}
              value={form.email}
              onChangeText={(t) => setForm({ ...form, email: t })}
              placeholder="parent@school.com"
              placeholderTextColor="#9E9E9E"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!editingParent}
            />

            {!editingParent ? (
              <>
                <Text style={styles.formLabel}>Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.formInput, styles.passwordInput]}
                    value={form.password}
                    onChangeText={(t) => setForm({ ...form, password: t })}
                    placeholder="Minimum 8 characters"
                    placeholderTextColor="#9E9E9E"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.passwordToggleText}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.formLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.confirmPassword}
                  onChangeText={(t) => setForm({ ...form, confirmPassword: t })}
                  placeholder="Re-enter password"
                  placeholderTextColor="#9E9E9E"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </>
            ) : null}

            <Text style={styles.formLabel}>Phone</Text>
            <TextInput
              style={styles.formInput}
              value={form.phone}
              onChangeText={(t) => setForm({ ...form, phone: t })}
              placeholder="Optional"
              placeholderTextColor="#9E9E9E"
              keyboardType="phone-pad"
            />

            {!editingParent ? (
              <>
                <Text style={styles.formLabel}>Relationship</Text>
                <TextInput
                  style={styles.formInput}
                  value={form.relationship}
                  onChangeText={(t) => setForm({ ...form, relationship: t })}
                  placeholder="e.g. Father / Mother / Guardian"
                  placeholderTextColor="#9E9E9E"
                />

                <Text style={styles.formLabel}>Select Student(s)</Text>
                <View style={styles.studentPicker}>
                  {students.length === 0 ? (
                    <Text style={styles.emptyText}>No students available</Text>
                  ) : (
                    students.map((s) => {
                      const selected = form.student_ids.includes(s.id)
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.studentOption, selected && styles.studentOptionActive]}
                          onPress={() => toggleStudent(s.id)}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.studentOptionText,
                              selected && styles.studentOptionTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {studentName(s)}
                          </Text>
                          <Text
                            style={[
                              styles.studentOptionMeta,
                              selected && styles.studentOptionMetaActive,
                            ]}
                            numberOfLines={1}
                          >
                            {s.roll_no ? `Roll ${s.roll_no}` : '—'}
                            {s.admission_no ? ` • ${s.admission_no}` : ''}
                          </Text>
                        </TouchableOpacity>
                      )
                    })
                  )}
                </View>
              </>
            ) : null}

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={editingParent ? saveParentProfile : createParentAccount}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving
                    ? 'Saving…'
                    : editingParent
                    ? 'Update Parent'
                    : 'Create Parent Account'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
                  setEditingParent(null)
                  setForm(EMPTY_FORM)
                  setShowPassword(false)
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

const DetailRow = ({ label, value }: { label: string; value: any }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={2}>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: 8,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ----- Search -----
  searchBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F8FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E3ECFA',
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#212121',
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
  emptyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#757575',
    fontSize: 14,
  },

  // ----- 3D parent cards -----
  card3d: {
    marginBottom: 14,
    backgroundColor: '#101652',
    borderRadius: 16,
    paddingRight: 4,
    paddingBottom: 4,
    elevation: 6,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 12,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
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
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F5FB',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    marginRight: 6,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1B5FBF',
  },
  actionBtnDanger: {
    backgroundColor: '#FFEBEE',
    marginRight: 0,
  },
  actionBtnDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C62828',
  },

  // ----- Detail overlay -----
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 50,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 36 : 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E',
  },
  overlayTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  overlayClose: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    padding: 4,
  },
  overlayScroll: {
    flex: 1,
  },
  overlayContent: {
    padding: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  detailAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  detailAvatarText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  detailName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A237E',
    marginBottom: 14,
  },
  detailGrid: {
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 4,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  detailLabel: {
    width: 80,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 10,
    marginBottom: 8,
  },
  childAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A237E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  childAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  childBody: {
    flex: 1,
    marginRight: 8,
  },
  childName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
  },
  childMeta: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  unlinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
  },
  unlinkBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C62828',
  },
  overlayActions: {
    width: '100%',
    marginTop: 16,
  },
  editBtn: {
    backgroundColor: '#1A237E',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editBtnText: {
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
    zIndex: 60,
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
  formNote: {
    fontSize: 11,
    color: '#6B7280',
    backgroundColor: '#EAF4FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    lineHeight: 16,
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
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 70,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 13,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  passwordToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5FBF',
  },
  studentPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  studentOption: {
    width: '48%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 10,
    marginRight: '4%',
    marginBottom: 8,
  },
  studentOptionActive: {
    backgroundColor: '#EAF4FF',
    borderColor: '#1A237E',
  },
  studentOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#424242',
  },
  studentOptionTextActive: {
    color: '#1A237E',
  },
  studentOptionMeta: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  studentOptionMetaActive: {
    color: '#1B5FBF',
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
