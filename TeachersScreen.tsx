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

const initialsOf = (name: string) => {
  const parts = (name || '').trim().split(/\s+/)
  const first = parts[0] ? parts[0][0] : 'T'
  const second = parts[1] ? parts[1][0] : ''
  return String(first).toUpperCase() + String(second).toUpperCase()
}

// teachers.status CHECK in 001 is ('active', 'leave', 'terminated').
// 'inactive' is NOT a valid value, so we use the existing set.
const STATUS_OPTIONS = ['active', 'leave', 'terminated']

// Edge Function that creates the Supabase Auth account (server-side only).
// The service_role key lives exclusively in the Edge Function — never here.
const CREATE_TEACHER_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') +
  '/functions/v1/create-teacher'

const EMPTY_FORM = {
  full_name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  specialization: '',
  qualifications: '',
  hire_date: '',
  status: 'active',
  class_id: null as string | null,
}

export default function TeachersScreen({ route, navigation }: any) {
  const [teachers, setTeachers] = useState<any[]>([])
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Detail view
  const [detailTeacher, setDetailTeacher] = useState<any>(null)

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---- Load teachers (profiles role='teacher' + teachers details) + classes ----
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('role', 'teacher')
        .order('full_name', { ascending: true })
      if (pErr) throw pErr

      const { data: details, error: dErr } = await supabase
        .from('teachers')
        .select('id, profile_id, specialization, qualifications, status, hire_date')
      if (dErr) {
        setTeachers((profs || []) as any[])
        return
      }

      const detMap: Record<string, any> = {}
      ;(details || []).forEach((d: any) => {
        if (d && d.profile_id) detMap[d.profile_id] = d
      })

      // Only profiles that still have a teachers detail row are listed.
      // A removed teacher keeps their profiles row (identity and auth account
      // preserved) but has no teachers row, so they disappear from this list.
      setTeachers(
        (profs || [])
          .map((p: any) => {
            const det = detMap[p.id]
            if (!det) return null
            return {
              profile_id: p.id,
              full_name: p.full_name,
              email: p.email,
              phone: p.phone,
              role: p.role,
              teacher_id: det.id,
              specialization: det.specialization || '',
              qualifications: det.qualifications || '',
              status: det.status || 'active',
              hire_date: det.hire_date || null,
            }
          })
          .filter(Boolean)
      )

      const { data: cls, error: cErr } = await supabase
        .from('classes')
        .select('id, name, grade_level, section, homeroom_teacher_id')
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true })
      if (cErr) throw cErr
      setClasses((cls || []) as any[])
    } catch (err: any) {
      setError(err.message || 'Unable to load teachers')
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

  // Which class (if any) each teacher is homeroom of
  const homeroomByTeacher: Record<string, string> = {}
  classes.forEach((c) => {
    if (c && c.homeroom_teacher_id) homeroomByTeacher[c.homeroom_teacher_id] = c.id
  })

  // ---- Homeroom assignment ----
  const assignHomeroom = async (profileId: string, classId: string | null) => {
    // Clear this teacher from any class they currently homeroom
    const { error: clearErr } = await supabase
      .from('classes')
      .update({ homeroom_teacher_id: null })
      .eq('homeroom_teacher_id', profileId)
    if (clearErr) throw clearErr
    // Assign to the newly selected class
    if (classId) {
      const { error: assignErr } = await supabase
        .from('classes')
        .update({ homeroom_teacher_id: profileId })
        .eq('id', classId)
      if (assignErr) throw assignErr
    }
  }

  // ---- Save (add / edit) teacher ----
  const saveTeacher = async () => {
    if (!form.full_name.trim()) {
      Alert.alert('Validation', 'Please enter the teacher\'s full name.')
      return
    }
    if (!form.email.trim()) {
      Alert.alert('Validation', 'Please enter an email address.')
      return
    }

    setSaving(true)
    try {
      if (editingTeacher && editingTeacher.profile_id) {
        // ---- EDIT existing teacher ----
        const pid = editingTeacher.profile_id

        const { error: pErr } = await supabase
          .from('profiles')
          .update({
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
          })
          .eq('id', pid)
        if (pErr) throw pErr

        await upsertTeacherRecord(pid)
        await assignHomeroom(pid, form.class_id)

        Alert.alert('Success', 'Teacher updated')
      } else {
        // ---- ADD teacher (secure Edge Function) ----
        // Never call supabase.auth.admin.createUser from the app.
        // The Edge Function verifies admin status server-side and creates the
        // auth user + profile + teachers row using the service_role key.
        if (!form.password || form.password.length < 8) {
          Alert.alert('Validation', 'Password must be at least 8 characters.')
          setSaving(false)
          return
        }
        if (form.password !== form.confirmPassword) {
          Alert.alert('Validation', 'Passwords do not match.')
          setSaving(false)
          return
        }

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
          specialization: form.specialization.trim() || null,
          qualifications: form.qualifications.trim() || null,
          hire_date: form.hire_date || null,
          status: form.status,
          assigned_class_id: form.class_id || null,
        }

        const resp = await fetch(CREATE_TEACHER_URL, {
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
          // Surface the real server message (error / message / msg) instead of
          // a generic string. Never includes password, tokens or keys.
          const serverMsg =
            result && (result.error || result.message || result.msg)
              ? String(result.error || result.message || result.msg)
              : ''
          const detail = serverMsg
            ? serverMsg
            : `create-teacher Edge Function returned HTTP ${resp.status} with no error body. ` +
              'The function is probably not deployed yet (supabase functions deploy create-teacher).'
          Alert.alert('Error', detail)
          setSaving(false)
          return
        }

        Alert.alert('Success', 'Teacher account created successfully')
      }

      setShowForm(false)
      setEditingTeacher(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save teacher')
    } finally {
      setSaving(false)
    }
  }

  // Insert or update the `teachers` detail row for a profile
  const upsertTeacherRecord = async (profileId: string) => {
    const { data: existingTeacher, error: readErr } = await supabase
      .from('teachers')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle()
    // Never fall through to INSERT when the read failed — that could create
    // a duplicate teachers detail row for the same profile.
    if (readErr) throw readErr

    const payload = {
      specialization: form.specialization.trim(),
      qualifications: form.qualifications.trim(),
      hire_date: form.hire_date || null,
      status: form.status,
    }

    if (existingTeacher && existingTeacher.id) {
      const { error } = await supabase
        .from('teachers')
        .update(payload)
        .eq('id', existingTeacher.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('teachers')
        .insert({ profile_id: profileId, ...payload })
      if (error) throw error
    }
  }

  // ---- Delete teacher ----
  // Safe remove: unassign homeroom -> NULL the teacher refs on homework and
  // timetable (rows preserved) -> delete the teachers detail row only.
  // The profiles row and the Supabase Auth account are never touched.
  const deleteTeacher = (teacher: any) => {
    Alert.alert(
      'Remove Teacher',
      `Remove ${teacher.full_name || 'this teacher'}? This unassigns their homeroom class and removes the teacher record so they no longer appear in this list. Existing homework and timetable entries are kept (only the teacher reference is cleared). The profile and the Supabase Auth account are NOT deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1) Unassign homeroom class
              const { error: classErr } = await supabase
                .from('classes')
                .update({ homeroom_teacher_id: null })
                .eq('homeroom_teacher_id', teacher.profile_id)
              if (classErr) throw classErr

              const detailId: string | null = teacher.teacher_id || null

              if (detailId) {
                // 2) Preserve homework history: clear the reference only
                const { error: hwErr } = await supabase
                  .from('homework')
                  .update({ teacher_id: null })
                  .eq('teacher_id', detailId)
                if (hwErr) throw hwErr

                // 3) Preserve timetable history: clear the reference only
                const { error: ttErr } = await supabase
                  .from('timetable')
                  .update({ teacher_id: null })
                  .eq('teacher_id', detailId)
                if (ttErr) throw ttErr

                // 4) Remove the teacher detail record (profile is kept)
                const { error: delErr } = await supabase
                  .from('teachers')
                  .delete()
                  .eq('id', detailId)
                if (delErr) throw delErr
              } else {
                // No known detail row: still handle it safely instead of
                // silently doing nothing (no-op if no row matches)
                const { error: delErr } = await supabase
                  .from('teachers')
                  .delete()
                  .eq('profile_id', teacher.profile_id)
                if (delErr) throw delErr
              }

              // 5) Refresh only after every required operation succeeded
              await load()
              Alert.alert('Success', 'Teacher removed. The profile and sign-in account were kept.')
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unable to remove teacher')
            }
          },
        },
      ]
    )
  }

  // ---- Enable / disable teacher ----
  const toggleStatus = async (teacher: any) => {
    const isActive = teacher.status === 'active'
    const newStatus = isActive ? 'terminated' : 'active'
    Alert.alert(
      isActive ? 'Disable Teacher' : 'Enable Teacher',
      `Set ${teacher.full_name || 'this teacher'}'s status to '${newStatus}'?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              if (teacher.teacher_id) {
                const { error } = await supabase
                  .from('teachers')
                  .update({ status: newStatus })
                  .eq('id', teacher.teacher_id)
                if (error) throw error
              }
              load()
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Unable to update status')
            }
          },
        },
      ]
    )
  }

  // ---- Form helpers ----
  const openAddForm = () => {
    setEditingTeacher(null)
    setForm({ ...EMPTY_FORM, hire_date: localISODate() })
    setShowForm(true)
  }

  const openEditForm = (teacher: any) => {
    setEditingTeacher(teacher)
    setForm({
      full_name: teacher.full_name || '',
      email: teacher.email || '',
      password: '',
      confirmPassword: '',
      phone: teacher.phone || '',
      specialization: teacher.specialization || '',
      qualifications: teacher.qualifications || '',
      hire_date: teacher.hire_date
        ? String(teacher.hire_date).slice(0, 10)
        : localISODate(),
      status: teacher.status || 'active',
      class_id: homeroomByTeacher[teacher.profile_id] || null,
    })
    setShowForm(true)
  }

  // ---- Derived ----
  const filteredTeachers = teachers.filter((t) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (t.full_name && t.full_name.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q))
    )
  })

  const statusTone = (s: string) =>
    s === 'active' ? 'ok' : s === 'leave' ? 'info' : 'warn'

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Teacher Management</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addHeaderBtn} onPress={openAddForm} activeOpacity={0.8}>
            <Text style={styles.addHeaderBtnText}>＋ Add</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          placeholderTextColor="#9E9E9E"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading teachers…</Text>
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
          {filteredTeachers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {search ? 'No teachers match your search' : 'No teachers found'}
              </Text>
            </View>
          ) : (
            filteredTeachers.map((t) => {
              const assignedClassId = homeroomByTeacher[t.profile_id]
              const assignedClass = assignedClassId ? classNames[assignedClassId] : null
              return (
                <View key={t.profile_id} style={styles.card3d}>
                  <View style={styles.card}>
                    <TouchableOpacity
                      style={styles.cardMain}
                      onPress={() => setDetailTeacher(t)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {initialsOf(t.full_name || 'T')}
                        </Text>
                      </View>
                      <View style={styles.body}>
                        <Text style={styles.name} numberOfLines={1}>
                          {t.full_name || 'Teacher'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {t.email || '—'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {t.specialization || t.qualifications || 'Teacher'}
                        </Text>
                        {assignedClass ? (
                          <Text style={styles.meta} numberOfLines={1}>
                            Homeroom: {assignedClass}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.badge,
                          t.status === 'active'
                            ? styles.badgeOk
                            : t.status === 'leave'
                            ? styles.badgeInfo
                            : styles.badgeWarn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            t.status === 'active'
                              ? styles.badgeTextOk
                              : t.status === 'leave'
                              ? styles.badgeTextInfo
                              : styles.badgeTextWarn,
                          ]}
                        >
                          {t.status || 'active'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setDetailTeacher(t)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>View</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEditForm(t)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => toggleStatus(t)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>
                          {t.status === 'active' ? 'Disable' : 'Enable'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnDanger]}
                        onPress={() => deleteTeacher(t)}
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
      {detailTeacher ? (
        <View style={styles.overlay}>
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>Teacher Details</Text>
            <TouchableOpacity onPress={() => setDetailTeacher(null)} activeOpacity={0.7}>
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
                {initialsOf(detailTeacher.full_name || 'T')}
              </Text>
            </View>
            <Text style={styles.detailName}>
              {detailTeacher.full_name || 'Teacher'}
            </Text>
            <View
              style={[
                styles.badge,
                detailTeacher.status === 'active'
                  ? styles.badgeOk
                  : detailTeacher.status === 'leave'
                  ? styles.badgeInfo
                  : styles.badgeWarn,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  detailTeacher.status === 'active'
                    ? styles.badgeTextOk
                    : detailTeacher.status === 'leave'
                    ? styles.badgeTextInfo
                    : styles.badgeTextWarn,
                ]}
              >
                {detailTeacher.status || 'active'}
              </Text>
            </View>

            <View style={styles.detailGrid}>
              <DetailRow label="Email" value={detailTeacher.email} />
              <DetailRow label="Phone" value={detailTeacher.phone} />
              <DetailRow label="Specialization" value={detailTeacher.specialization} />
              <DetailRow label="Qualifications" value={detailTeacher.qualifications} />
              <DetailRow
                label="Hire Date"
                value={detailTeacher.hire_date ? fmtDate(detailTeacher.hire_date) : '—'}
              />
              <DetailRow
                label="Homeroom Class"
                value={
                  homeroomByTeacher[detailTeacher.profile_id]
                    ? classNames[homeroomByTeacher[detailTeacher.profile_id]] || '—'
                    : 'Not assigned'
                }
              />
            </View>

            <View style={styles.overlayActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setDetailTeacher(null)
                  openEditForm(detailTeacher)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.editBtnText}>Edit Teacher</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* ---- Add / Edit form overlay ---- */}
      {showForm ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formOverlay}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {editingTeacher ? 'Edit Teacher' : 'Add Teacher'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false)
                setEditingTeacher(null)
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
              {editingTeacher
                ? 'Update this teacher\'s profile and assignment.'
                : 'Creates the Supabase Auth account via a secure Edge Function. The password is never stored in the database.'}
            </Text>

            <Text style={styles.formLabel}>Full Name</Text>
            <TextInput
              style={styles.formInput}
              value={form.full_name}
              onChangeText={(t) => setForm({ ...form, full_name: t })}
              placeholder="e.g. Priya Sharma"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Email</Text>
            <TextInput
              style={styles.formInput}
              value={form.email}
              onChangeText={(t) => setForm({ ...form, email: t })}
              placeholder="teacher@school.com"
              placeholderTextColor="#9E9E9E"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!editingTeacher}
            />

            {!editingTeacher ? (
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

            <Text style={styles.formLabel}>Specialization</Text>
            <TextInput
              style={styles.formInput}
              value={form.specialization}
              onChangeText={(t) => setForm({ ...form, specialization: t })}
              placeholder="e.g. Mathematics"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Qualifications</Text>
            <TextInput
              style={styles.formInput}
              value={form.qualifications}
              onChangeText={(t) => setForm({ ...form, qualifications: t })}
              placeholder="e.g. M.Sc. B.Ed."
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Hire Date</Text>
            <TextInput
              style={styles.formInput}
              value={form.hire_date}
              onChangeText={(t) => setForm({ ...form, hire_date: t })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.formLabel}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((s) => {
                const active = form.status === s
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setForm({ ...form, status: s })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.formLabel}>Assign Homeroom Class</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !form.class_id && styles.chipActive]}
                onPress={() => setForm({ ...form, class_id: null })}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    !form.class_id && styles.chipTextActive,
                  ]}
                >
                  None
                </Text>
              </TouchableOpacity>
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

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={saveTeacher}
                activeOpacity={0.85}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving
                    ? 'Saving…'
                    : editingTeacher
                    ? 'Update Teacher'
                    : 'Create Teacher Account'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false)
                  setEditingTeacher(null)
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
  addHeaderBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: 8,
  },
  addHeaderBtnText: {
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

  // ----- 3D teacher cards -----
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
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeOk: {
    backgroundColor: '#E8F5E9',
  },
  badgeInfo: {
    backgroundColor: '#E3F2FD',
  },
  badgeWarn: {
    backgroundColor: '#FFF3E0',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextOk: {
    color: '#2E7D32',
  },
  badgeTextInfo: {
    color: '#1565C0',
  },
  badgeTextWarn: {
    color: '#E65100',
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
    marginBottom: 8,
  },
  detailGrid: {
    width: '100%',
    marginTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F5FB',
  },
  detailLabel: {
    width: 130,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },
  overlayActions: {
    width: '100%',
    marginTop: 20,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
