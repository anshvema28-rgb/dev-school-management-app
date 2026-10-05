import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,

  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

const CREATE_STUDENT_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') +
  '/functions/v1/create-student'

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
  const first = parts[0] ? parts[0][0] : 'S'
  const second = parts[1] ? parts[1][0] : ''
  return String(first).toUpperCase() + String(second).toUpperCase()
}

const EMPTY_FORM = {
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  class_id: null as string | null,
  roll_no: '',
  admission_no: '',
  date_of_birth: '',
  gender: '',
  address: '',
  parent_name: '',
  parent_phone: '',
}

export default function StudentListScreen({ route, navigation }: any) {
  const [students, setStudents] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Account creation form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const fetchStudents = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('students')
        .select(
          '*, classes!students_class_id_fkey (name, grade_level), profiles!students_profile_id_fkey (full_name, email)'
        )
        .order('roll_no', { ascending: true })
        .limit(500)
      if (error) throw error
      setStudents((data || []) as any[])
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level, section')
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true })
      if (error) throw error
      setClasses((data || []) as any[])
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  useEffect(() => {
    fetchStudents()
    fetchClasses()
  }, [])

  const handleDelete = async (studentId: string) => {
    const message =
      'Remove this student record? The Supabase Auth account is NOT deleted (that requires a secure server-side process).'

    // Confirm before deleting.
    // WEB: react-native-web's Alert.alert() is a no-op (it renders nothing),
    // so the browser's window.confirm() is used instead.
    // NATIVE: the original Alert.alert() flow, unchanged.
    if (Platform.OS === 'web') {
      if (!window.confirm(message)) return // Cancel → stop immediately, no delete
    } else {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert('Remove Student', message, [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ])
      })
      if (!confirmed) return // Cancel → stop immediately, no delete
    }

    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId)
      if (error) throw error
      fetchStudents()
      if (Platform.OS === 'web') {
        window.alert('Student record removed')
      } else {
        Alert.alert('Success', 'Student record removed')
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message)
      } else {
        Alert.alert('Error', err.message)
      }
    }
  }

  // ---- Create Student Account (secure Edge Function) ----
  const createStudentAccount = async () => {
    if (!form.full_name.trim()) {
      Alert.alert('Validation', 'Please enter the student\'s full name.')
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
    if (!form.class_id) {
      Alert.alert('Validation', 'Please select a class.')
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
        class_id: form.class_id,
        roll_no: form.roll_no.trim() || null,
        admission_no: form.admission_no.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender.trim() || null,
        address: form.address.trim() || null,
        parent_name: form.parent_name.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
      }

      const resp = await fetch(CREATE_STUDENT_URL, {
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
        Alert.alert('Error', result.error || 'Unable to create student account')
        setSaving(false)
        return
      }

      Alert.alert('Success', 'Student account created successfully')
      setShowForm(false)
      setForm(EMPTY_FORM)
      setShowPassword(false)
      fetchStudents()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to create student account')
    } finally {
      setSaving(false)
    }
  }

  const openCreateForm = () => {
    setForm(EMPTY_FORM)
    setShowPassword(false)
    setShowForm(true)
  }

  // ---- Derived: search + class filter ----
  const filteredStudents = students.filter((s) => {
    if (classFilter && s.class_id !== classFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    const name = (s.profiles && s.profiles.full_name) || ''
    const email = (s.profiles && s.profiles.email) || ''
    return (
      name.toLowerCase().includes(q) ||
      email.toLowerCase().includes(q) ||
      (s.roll_no && s.roll_no.toLowerCase().includes(q)) ||
      (s.admission_no && s.admission_no.toLowerCase().includes(q)) ||
      (s.parent_name && s.parent_name.toLowerCase().includes(q))
    )
  })

  const openProfile = (student: any) => {
    if (navigation && navigation.navigate) {
      navigation.navigate('StudentProfile', { studentId: student.id })
    }
  }

  const openEdit = (student: any) => {
    if (navigation && navigation.navigate) {
      navigation.navigate('StudentForm', { student })
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Student Management</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.createBtn} onPress={openCreateForm} activeOpacity={0.8}>
            <Text style={styles.createBtnText}>＋ Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation && navigation.goBack && navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, roll no, or admission no"
          placeholderTextColor="#9E9E9E"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {/* Class filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, !classFilter && styles.filterChipActive]}
          onPress={() => setClassFilter(null)}
          activeOpacity={0.8}
        >
          <Text style={[styles.filterChipText, !classFilter && styles.filterChipTextActive]}>
            All Classes
          </Text>
        </TouchableOpacity>
        {classes.map((c) => {
          const active = classFilter === c.id
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setClassFilter(c.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading students…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {filteredStudents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {search || classFilter ? 'No students match your filters' : 'No students found'}
              </Text>
            </View>
          ) : (
            filteredStudents.map((s) => {
              const name = (s.profiles && s.profiles.full_name) || s.parent_name || 'Student'
              const email = (s.profiles && s.profiles.email) || '—'
              return (
                <View key={s.id} style={styles.card3d}>
                  <View style={styles.card}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => openProfile(s)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initialsOf(name)}</Text>
                      </View>
                      <View style={styles.body}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {email}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {s.roll_no ? `Roll ${s.roll_no}` : 'Roll —'}
                          {s.admission_no ? ` • Adm ${s.admission_no}` : ''}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {s.classes ? s.classes.name : 'Class —'}
                          {s.date_of_birth ? ` • DOB ${fmtDate(s.date_of_birth)}` : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openProfile(s)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEdit(s)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnDanger]}
                        onPress={() => handleDelete(s.id)}
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

      {/* ---- Create Student Account form overlay ---- */}
      {showForm ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Create Student Account</Text>
            <TouchableOpacity onPress={() => setShowForm(false)} activeOpacity={0.7}>
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
              Creates a real Supabase Auth account via a secure Edge Function. The password is never stored in the database.
            </Text>

            <Text style={styles.formLabel}>Full Name</Text>
            <TextInput
              style={styles.formInput}
              value={form.full_name}
              onChangeText={(t) => setForm({ ...form, full_name: t })}
              placeholder="e.g. Aarav Patel"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Email</Text>
            <TextInput
              style={styles.formInput}
              value={form.email}
              onChangeText={(t) => setForm({ ...form, email: t })}
              placeholder="student@school.com"
              placeholderTextColor="#9E9E9E"
              keyboardType="email-address"
              autoCapitalize="none"
            />

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

            <Text style={styles.formLabel}>Phone</Text>
            <TextInput
              style={styles.formInput}
              value={form.phone}
              onChangeText={(t) => setForm({ ...form, phone: t })}
              placeholder="Optional"
              placeholderTextColor="#9E9E9E"
              keyboardType="phone-pad"
            />

            <Text style={styles.formLabel}>Class</Text>
            {classes.length === 0 ? (
              <View style={styles.emptyClasses}>
                <Text style={styles.emptyClassesText}>
                  No classes available yet. Add a class in Classes & Subjects first.
                </Text>
              </View>
            ) : null}
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

            <Text style={styles.formLabel}>Roll Number</Text>
            <TextInput
              style={styles.formInput}
              value={form.roll_no}
              onChangeText={(t) => setForm({ ...form, roll_no: t })}
              placeholder="e.g. 101"
              placeholderTextColor="#9E9E9E"
              autoCapitalize="none"
            />

            <Text style={styles.formLabel}>Admission Number</Text>
            <TextInput
              style={styles.formInput}
              value={form.admission_no}
              onChangeText={(t) => setForm({ ...form, admission_no: t })}
              placeholder="e.g. ADM-2024-001"
              placeholderTextColor="#9E9E9E"
              autoCapitalize="none"
            />

            <Text style={styles.formLabel}>Date of Birth</Text>
            <TextInput
              style={styles.formInput}
              value={form.date_of_birth}
              onChangeText={(t) => setForm({ ...form, date_of_birth: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Gender</Text>
            <TextInput
              style={styles.formInput}
              value={form.gender}
              onChangeText={(t) => setForm({ ...form, gender: t })}
              placeholder="e.g. Male / Female"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Address</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={form.address}
              onChangeText={(t) => setForm({ ...form, address: t })}
              placeholder="Student address"
              placeholderTextColor="#9E9E9E"
              multiline
              numberOfLines={2}
            />

            <Text style={styles.formLabel}>Parent Name</Text>
            <TextInput
              style={styles.formInput}
              value={form.parent_name}
              onChangeText={(t) => setForm({ ...form, parent_name: t })}
              placeholder="Parent / guardian name"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Parent Phone</Text>
            <TextInput
              style={styles.formInput}
              value={form.parent_phone}
              onChangeText={(t) => setForm({ ...form, parent_phone: t })}
              placeholder="Parent phone"
              placeholderTextColor="#9E9E9E"
              keyboardType="phone-pad"
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={createStudentAccount}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Creating…' : 'Create Student Account'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
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

  // ----- Class filter -----
  filterScroll: {
    backgroundColor: '#F5F8FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E3ECFA',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#424242',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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

  // ----- 3D student cards -----
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
  formTextArea: {
    height: 70,
    textAlignVertical: 'top',
    paddingTop: 10,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyClasses: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  emptyClassesText: {
    color: '#8D6E00',
    fontSize: 12,
    fontWeight: '600',
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
