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

// Reports / Analytics (admin) — real Supabase counts only, no invented numbers.
// Uses count(head:true) where possible so only aggregate data is transferred.

type Stat = { key: string; label: string; value: string | number; emoji: string }

const todayStr = () => {
  const d = new Date()
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`

export default function ReportsScreen({
  navigation,
}: {
  navigation?: { goBack: () => void }
}) {
  const [groups, setGroups] = useState<{ title: string; stats: Stat[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const countOf = async (table: string) => {
    const res = await supabase.from(table).select('id', { count: 'exact', head: true })
    if (res.error) throw res.error
    return res.count || 0
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [
        students,
        teachers,
        classes,
        subjects,
        homework,
        submissions,
        exams,
        results,
        notices,
        syllabus,
      ] = await Promise.all([
        countOf('students'),
        countOf('teachers'),
        countOf('classes'),
        countOf('subjects'),
        countOf('homework'),
        countOf('homework_submissions'),
        countOf('exams'),
        countOf('results'),
        countOf('notices'),
        countOf('syllabus'),
      ])

      // attendance summary for today (small date-scoped query)
      const att = await supabase.from('attendance').select('status').eq('date', todayStr())
      if (att.error) throw att.error
      const attRows = (att.data || []) as any[]
      const present = attRows.filter((a) => a.status === 'present').length
      const absent = attRows.filter((a) => a.status === 'absent').length
      const late = attRows.filter((a) => a.status === 'late').length
      const attPct =
        present + absent + late > 0
          ? `${Math.round((present / (present + absent + late)) * 100)}%`
          : '—'

      // fee summary (real amounts)
      const fees = await supabase.from('fees').select('amount, payment_status')
      if (fees.error) throw fees.error
      const feeRows = (fees.data || []) as any[]
      const paid = feeRows
        .filter((f) => f.payment_status === 'paid')
        .reduce((s, f) => s + Number(f.amount || 0), 0)
      const pending = feeRows
        .filter((f) => f.payment_status === 'unpaid' || f.payment_status === 'partial')
        .reduce((s, f) => s + Number(f.amount || 0), 0)

      // complaints by status
      const comp = await supabase.from('complaints').select('status')
      if (comp.error) throw comp.error
      const compRows = (comp.data || []) as any[]
      const pendingComp = compRows.filter((c) => c.status === 'Pending').length
      const resolvedComp = compRows.filter((c) => c.status === 'Resolved').length

      setGroups([
        {
          title: 'People',
          stats: [
            { key: 'students', emoji: '🎓', label: 'Students', value: students },
            { key: 'teachers', emoji: '👩‍🏫', label: 'Teachers / Staff', value: teachers },
            { key: 'classes', emoji: '🏫', label: 'Classes', value: classes },
            { key: 'subjects', emoji: '📚', label: 'Subjects', value: subjects },
          ],
        },
        {
          title: 'Attendance (today)',
          stats: [
            { key: 'attPct', emoji: '✅', label: 'Attendance rate', value: attPct },
            { key: 'present', emoji: '👍', label: 'Present', value: present },
            { key: 'absent', emoji: '🚫', label: 'Absent', value: absent },
            { key: 'late', emoji: '⏱️', label: 'Late', value: late },
          ],
        },
        {
          title: 'Fees',
          stats: [
            { key: 'paid', emoji: '💰', label: 'Collected', value: money(paid) },
            { key: 'pending', emoji: '⏳', label: 'Pending', value: money(pending) },
            { key: 'feeRows', emoji: '🧾', label: 'Fee records', value: feeRows.length },
          ],
        },
        {
          title: 'Academics',
          stats: [
            { key: 'homework', emoji: '📝', label: 'Homework', value: homework },
            { key: 'submissions', emoji: '📤', label: 'Submissions', value: submissions },
            { key: 'exams', emoji: '🗓️', label: 'Exams', value: exams },
            { key: 'results', emoji: '🏆', label: 'Results', value: results },
            { key: 'syllabus', emoji: '📖', label: 'Syllabus', value: syllabus },
            { key: 'notices', emoji: '📢', label: 'Notices', value: notices },
          ],
        },
        {
          title: 'Complaints',
          stats: [
            { key: 'compTotal', emoji: '🎫', label: 'Total', value: compRows.length },
            { key: 'compPending', emoji: '⏳', label: 'Pending', value: pendingComp },
            { key: 'compResolved', emoji: '✅', label: 'Resolved', value: resolvedComp },
          ],
        },
      ])
    } catch (err: any) {
      setError(err.message || 'Unable to load reports')
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
        <Text style={styles.headerText}>Reports & Analytics</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading reports…</Text>
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
          <Text style={styles.updated}>Live data • updated {new Date().toLocaleString()}</Text>

          {groups.map((g) => (
            <View key={g.title}>
              <Text style={styles.sectionLabel}>{g.title}</Text>
              <View style={styles.grid}>
                {g.stats.map((s) => (
                  <View key={s.key} style={styles.statCard}>
                    <Text style={styles.statEmoji}>{s.emoji}</Text>
                    <Text style={styles.statValue} numberOfLines={1}>
                      {String(s.value)}
                    </Text>
                    <Text style={styles.statLabel} numberOfLines={2}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footNote}>
            All figures come directly from the school database. Empty tables show 0.
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
  updated: { fontSize: 10, color: '#9E9E9E', marginBottom: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A237E',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statCard: {
    width: '48%',
    backgroundColor: '#FAFBFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE4F7',
    padding: 12,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  statEmoji: { fontSize: 18 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#1A237E', marginTop: 6 },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  footNote: { fontSize: 10, color: '#9E9E9E', marginTop: 10, textAlign: 'center' },
})
