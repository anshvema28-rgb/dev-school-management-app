import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native'
import { supabase } from './supabaseClient'

// Staff directory — read-only for every portal.
// Admin staff CREATION / editing / enable-disable stays in TeachersScreen
// (existing module, no duplication here).

const initialsOf = (name: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

export default function StaffScreen({
  navigation,
  role = 'student',
  onManageStaff,
}: {
  navigation?: { goBack: () => void }
  role?: string | null
  onManageStaff?: () => void
}) {
  const [staff, setStaff] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const isAdmin = role === 'admin' || role === null

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // staff_directory: safe view (name + role only) — migration 012
      const { data: profs, error: pErr } = await supabase
        .from('staff_directory')
        .select('id, full_name, role')
        .order('full_name', { ascending: true })
      if (pErr) throw pErr

      // extra staff details (designation / status) when permitted by RLS
      const { data: details, error: detErr } = await supabase
        .from('teachers')
        .select('profile_id, specialization, qualifications, status')
      const detMap: Record<string, any> = {}
      ;(details || []).forEach((d: any) => {
        if (d && d.profile_id) detMap[d.profile_id] = d
      })

      // Removed teachers intentionally keep their profiles row (identity and
      // auth account preserved), so hide teacher profiles that have no
      // teachers detail row. Admin profiles are ALWAYS shown.
      // If the details query itself failed, do NOT hide anyone (detailsOk).
      const detailsOk = !detErr && !!details

      setStaff(
        ((profs || []) as any[])
          .map((p) => ({
            ...p,
            detail: detMap[p.id] || null,
          }))
          .filter((s) => !detailsOk || s.role === 'admin' || !!s.detail)
      )
    } catch (err: any) {
      setError(err.message || 'Unable to load staff directory')
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Staff Directory</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading staff…</Text>
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
          {isAdmin && onManageStaff ? (
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={onManageStaff}
              activeOpacity={0.8}
            >
              <Text style={styles.manageBtnText}>＋ Add / Edit Staff Accounts</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.sectionLabel}>Staff ({staff.length})</Text>

          {staff.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No staff members found</Text>
            </View>
          ) : (
            staff.map((s) => {
              const d = s.detail
              const status = d && d.status ? d.status : null
              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initialsOf(s.full_name || '?')}
                    </Text>
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.name} numberOfLines={1}>
                      {s.full_name || 'Staff member'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {s.role === 'admin' ? 'Administration' : 'Teaching staff'}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.badge,
                          s.role === 'admin' ? styles.badgeAdmin : styles.badgeTeacher,
                        ]}
                      >
                        <Text style={styles.badgeText}>
                          {String(s.role || 'staff').toUpperCase()}
                        </Text>
                      </View>
                      {d && d.specialization ? (
                        <Text style={styles.spec} numberOfLines={1}>
                          {d.specialization}
                        </Text>
                      ) : null}
                      {status ? (
                        <View
                          style={[
                            styles.badge,
                            status === 'active' ? styles.badgeOk : styles.badgeOff,
                          ]}
                        >
                          <Text style={styles.badgeText}>{status}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              )
            })
          )}

          <Text style={styles.footNote}>
            Contact details are shown only where your access allows.
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
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  manageBtn: {
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
  manageBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#1A237E', fontSize: 15, fontWeight: '800' },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: '#1A237E' },
  meta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginTop: 2,
  },
  badgeAdmin: { backgroundColor: '#1A237E' },
  badgeTeacher: { backgroundColor: '#E3F2FD' },
  badgeOk: { backgroundColor: '#E8F5E9' },
  badgeOff: { backgroundColor: '#FFEBEE' },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#1A237E', letterSpacing: 0.6 },
  spec: { fontSize: 11, color: '#3949AB', marginTop: 2, flexShrink: 1 },
  footNote: { fontSize: 10, color: '#9E9E9E', marginTop: 8, textAlign: 'center' },
})
