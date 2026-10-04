import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { supabase } from './supabaseClient'

// Admin Settings — read-only system information.
// No destructive actions, no secret values, nothing security-sensitive shown.
// Account/password changes stay in Supabase Auth (not stored in app tables).

type Row = { key: string; label: string; value: string }

export default function SettingsScreen({
  navigation,
  role = 'admin',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const [account, setAccount] = useState<Row[]>([])
  const [school, setSchool] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const authRes = await supabase.auth.getUser()
      const user = authRes && authRes.data ? authRes.data.user : null
      if (!user) throw new Error('No signed-in session found')

      const prof = await supabase
        .from('profiles')
        .select('full_name, email, phone, role')
        .eq('id', user.id)
        .maybeSingle()
      if (prof.error) throw prof.error
      const p: any = prof.data || {}

      const meta: any = user.user_metadata || {}

      setAccount([
        { key: 'name', label: 'Name', value: p.full_name || meta.full_name || '—' },
        { key: 'email', label: 'Email', value: p.email || user.email || '—' },
        { key: 'role', label: 'Role', value: p.role || role || '—' },
        { key: 'phone', label: 'Phone', value: p.phone || '—' },
        {
          key: 'created',
          label: 'Account created',
          value: user.created_at ? new Date(user.created_at).toLocaleDateString() : '—',
        },
      ])

      // lightweight, real counts for context (RLS-scoped)
      const cnt = async (table: string) => {
        const r = await supabase.from(table).select('id', { count: 'exact', head: true })
        return r.error ? '—' : String(r.count || 0)
      }
      const [students, teachers, classes] = await Promise.all([
        cnt('students'),
        cnt('teachers'),
        cnt('classes'),
      ])

      setSchool([
        { key: 'name', label: 'School', value: 'D A V Academy School' },
        { key: 'students', label: 'Student records', value: students },
        { key: 'teachers', label: 'Teacher records', value: teachers },
        { key: 'classes', label: 'Classes', value: classes },
        { key: 'conn', label: 'Database', value: 'Supabase (secure)' },
      ])
    } catch (err: any) {
      setError(err.message || 'Unable to load settings')
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    load()
  }, [load])

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  const renderRows = (rows: Row[]) =>
    rows.map((r) => (
      <View key={r.key} style={styles.row}>
        <Text style={styles.rowLabel}>{r.label}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>
          {r.value}
        </Text>
      </View>
    ))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Settings</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading settings…</Text>
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
          <Text style={styles.sectionLabel}>Signed-in account</Text>
          <View style={styles.card}>{renderRows(account)}</View>

          <Text style={styles.sectionLabel}>School overview</Text>
          <View style={styles.card}>{renderRows(school)}</View>

          <Text style={styles.sectionLabel}>Where things are managed</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Accounts</Text>
              <Text style={styles.rowValue}>Teachers / Students / Parents screens</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Academic data</Text>
              <Text style={styles.rowValue}>Classes, Subjects, Syllabus, Exams</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Security</Text>
              <Text style={styles.rowValue}>
                Row Level Security enforced by the database for every portal
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Password</Text>
              <Text style={styles.rowValue}>
                Change it from the login/account flow (never stored in app tables)
              </Text>
            </View>
          </View>

          <Text style={styles.footNote}>
            No passwords, keys or security secrets are ever displayed here.
          </Text>
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FAFBFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE4F7',
    padding: 4,
    marginBottom: 6,
    elevation: 3,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1FA',
  },
  rowLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', flex: 1 },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
    flex: 2,
    textAlign: 'right',
  },
  footNote: { fontSize: 10, color: '#9E9E9E', marginTop: 10, textAlign: 'center' },
})
