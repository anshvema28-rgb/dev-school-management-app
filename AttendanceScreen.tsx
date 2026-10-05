import React, { useEffect, useState } from 'react'
import { View, Text, Button, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

interface AttendanceRecord {
  id: string
  student_id: string
  class_id: string
  date: string
  status: 'present' | 'absent' | 'late'
  marked_by?: string
  created_at: string
}

interface Class {
  id: string
  name: string
  grade_level: number | null
  section: string | null
}

// One class-roster row merged with the attendance record for the selected date.
// NOTE: attendance.student_id references profiles(id) (001_initial_schema.sql),
// so profile_id is the key used when creating/updating a record.
interface RosterStudent {
  profile_id: string | null
  roll_no: string | null
  admission_no: string | null
  full_name: string | null
  status: 'present' | 'absent' | 'late' | null
  record_id: string | null
}

const fmtLocal = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export default function AttendanceScreen({ route, navigation }: any) {
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<Class | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(fmtLocal(new Date()))
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [presentCount, setPresentCount] = useState(0)
  const [absentCount, setAbsentCount] = useState(0)
  const [lateCount, setLateCount] = useState(0)

  // Load classes on mount
  useEffect(() => {
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade_level, section')
        .order('grade_level', { ascending: true })
        .order('section', { ascending: true })
      if (error) throw error
      const list = (data as Class[]) ?? []
      setClasses(list)
      // Start on the first class so attendance can be marked straight away
      setSelectedClass((cur) => cur ?? (list.length > 0 ? list[0] : null))
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Load roster + attendance for the selected class and date
  useEffect(() => {
    fetchAttendance(selectedClass ? selectedClass.id : null, selectedDate)
  }, [selectedClass, selectedDate])

  const countStatuses = (records: AttendanceRecord[]) => {
    let present = 0
    let absent = 0
    let late = 0
    records.forEach((record) => {
      if (record.status === 'present') present++
      else if (record.status === 'absent') absent++
      else if (record.status === 'late') late++
    })
    setPresentCount(present)
    setAbsentCount(absent)
    setLateCount(late)
  }

  const fetchAttendance = async (
    classId: string | null,
    date: string,
    silent: boolean = false
  ) => {
    // No class selected — never issue an invalid `class_id = null` query
    if (!classId) {
      setAttendanceRecords([])
      setRoster([])
      countStatuses([])
      setLoadError(null)
      setIsLoading(false)
      return
    }

    if (!silent) setIsLoading(true)
    setLoadError(null)
    try {
      // 1. Class roster (typed loosely: the fallback below drops the embed)
      let rosterRes: any = await supabase
        .from('students')
        .select(
          'id, profile_id, roll_no, admission_no, class_id, profiles!students_profile_id_fkey (full_name)'
        )
        .eq('class_id', classId)
        .order('roll_no', { ascending: true })

      if (rosterRes.error) {
        // Fallback: retry without the profiles embed
        rosterRes = await supabase
          .from('students')
          .select('id, profile_id, roll_no, admission_no, class_id')
          .eq('class_id', classId)
          .order('roll_no', { ascending: true })
      }
      if (rosterRes.error) throw rosterRes.error

      // 2. Records already marked for this class + date
      const attRes = await supabase
        .from('attendance')
        .select('*')
        .eq('class_id', classId)
        .eq('date', date)
        .order('student_id')

      if (attRes.error) throw attRes.error

      const records = (attRes.data as AttendanceRecord[]) ?? []
      setAttendanceRecords(records)
      countStatuses(records)

      const byProfile: Record<string, AttendanceRecord> = {}
      records.forEach((r) => {
        if (r.student_id) byProfile[r.student_id] = r
      })

      const rows: RosterStudent[] = []
      const claimed: Record<string, boolean> = {}
      ;((rosterRes.data as any[]) ?? []).forEach((s: any) => {
        const rec = s.profile_id && byProfile[s.profile_id] ? byProfile[s.profile_id] : null
        if (s.profile_id && rec) claimed[s.profile_id] = true
        rows.push({
          profile_id: s.profile_id ?? null,
          roll_no: s.roll_no ?? null,
          admission_no: s.admission_no ?? null,
          full_name: s.profiles && s.profiles.full_name ? s.profiles.full_name : null,
          status: rec ? rec.status : null,
          record_id: rec ? rec.id : null,
        })
      })

      // Keep records for students no longer on the roster (e.g. transferred)
      records.forEach((rec) => {
        if (rec.student_id && !claimed[rec.student_id]) {
          rows.push({
            profile_id: rec.student_id,
            roll_no: null,
            admission_no: null,
            full_name: null,
            status: rec.status,
            record_id: rec.id,
          })
        }
      })

      setRoster(rows)
    } catch (err: any) {
      const msg = err && err.message ? err.message : 'Could not load attendance.'
      setLoadError(msg)
      Alert.alert('Error', msg)
    } finally {
      if (!silent) setIsLoading(false)
    }
  }

  // Create or update one record; returns an error message (or null on success)
  const upsertMark = async (
    profileId: string,
    status: 'present' | 'absent' | 'late'
  ): Promise<string | null> => {
    const { data: existing, error: findErr } = await supabase
      .from('attendance')
      .select('id')
      .eq('student_id', profileId)
      .eq('class_id', selectedClass ? selectedClass.id : null)
      .eq('date', selectedDate)
      .maybeSingle()

    if (findErr) return findErr.message

    if (existing) {
      const { error } = await supabase
        .from('attendance')
        .update({ status })
        .eq('id', existing.id)
      return error ? error.message : null
    }

    const { error } = await supabase.from('attendance').insert({
      student_id: profileId,
      class_id: selectedClass ? selectedClass.id : null,
      date: selectedDate,
      status,
    })
    return error ? error.message : null
  }

  const handleMarkAttendance = async (
    profileId: string,
    status: 'present' | 'absent' | 'late'
  ) => {
    if (!profileId || !selectedClass) return
    setIsSaving(true)
    try {
      const errMsg = await upsertMark(profileId, status)
      if (errMsg) {
        Alert.alert('Error', errMsg)
        return
      }
      // Silent refresh: the row already shows the new status in place
      await fetchAttendance(selectedClass.id, selectedDate, true)
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Mark every roster student in one pass (single refresh, single alert)
  const handleMarkAll = async (status: 'present' | 'absent' | 'late') => {
    if (!selectedClass) return
    const targets = roster.filter((r) => r.profile_id && r.status !== status)
    setIsSaving(true)
    try {
      const failures: string[] = []
      for (const row of targets) {
        if (!row.profile_id) continue
        const errMsg = await upsertMark(row.profile_id, status)
        if (errMsg) failures.push(errMsg)
      }
      await fetchAttendance(selectedClass.id, selectedDate, true)
      if (failures.length > 0) {
        Alert.alert(
          'Attention',
          `Could not mark ${failures.length} student(s). First error: ${failures[0]}`
        )
      }
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAttendance = (recordId: string) => {
    // Alert.alert (React Native API) instead of the browser-only confirm()
    Alert.alert('Remove record', 'Remove this attendance record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('attendance').delete().eq('id', recordId)
            if (error) throw error
            if (selectedClass) await fetchAttendance(selectedClass.id, selectedDate, true)
            Alert.alert('Success', 'Attendance record removed')
          } catch (err: any) {
            Alert.alert('Error', err.message)
          }
        },
      },
    ])
  }

  const shiftDate = (delta: number) => {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate)
    const base = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : new Date()
    base.setDate(base.getDate() + delta)
    setSelectedDate(fmtLocal(base))
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!selectedClass) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Attendance Management</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation && navigation.goBack && navigation.goBack()}
          >
            <Text style={styles.backText}>← Dashboard</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>
            {classes.length === 0
              ? 'No classes found — create a class first.'
              : 'Select a class to view attendance'}
          </Text>
          <Button
            title="Choose Class"
            onPress={() => setSelectedClass(classes.length > 0 ? classes[0] : null)}
            disabled={classes.length === 0}
          />
        </View>
      </View>
    )
  }

  const rows = roster
  const totalMarked = rows.filter((r) => r.status !== null).length

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>Attendance Management</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation && navigation.goBack && navigation.goBack()}
        >
          <Text style={styles.backText}>← Dashboard</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.selectionBox}>
        <View style={styles.classBox}>
          <Text style={styles.label}>Class</Text>
          <View style={styles.classSelect}>
            {classes.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {classes.map((c) => {
                  const active = !!selectedClass && selectedClass.id === c.id
                  return (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setSelectedClass(c)}
                      style={[styles.classChip, active && styles.classChipActive]}
                    >
                      <Text style={[styles.classChipText, active && styles.classChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            ) : (
              <Text style={styles.classText}>No classes found</Text>
            )}
          </View>
        </View>

        <View style={styles.dateBox}>
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(-1)}>
              <Text style={styles.dateBtnText}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.dateText}>{selectedDate}</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(1)}>
              <Text style={styles.dateBtnText}>▶</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setSelectedDate(fmtLocal(new Date()))}>
            <Text style={styles.todayLink}>Back to today</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.label}>Mark everyone</Text>
        <View style={styles.statusGrid}>
          <TouchableOpacity
            style={[styles.statusItem, styles.present]}
            onPress={() => handleMarkAll('present')}
            disabled={isSaving}
          >
            <Text style={[styles.statusText, styles.presentText]}>All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusItem, styles.absent]}
            onPress={() => handleMarkAll('absent')}
            disabled={isSaving}
          >
            <Text style={[styles.statusText, styles.absentText]}>All Absent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusItem, styles.late]}
            onPress={() => handleMarkAll('late')}
            disabled={isSaving}
          >
            <Text style={[styles.statusText, styles.lateText]}>All Late</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.attendanceBox}>
        <Text style={styles.title}>Attendance Records</Text>
        {isLoading ? (
          <ActivityIndicator size="small" />
        ) : loadError ? (
          <Text style={styles.errorText}>{loadError}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.emptyText}>No students in this class yet.</Text>
        ) : totalMarked === 0 ? (
          <Text style={styles.emptyText}>
            Nothing marked yet for this date — choose a status for each student.
          </Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item: RosterStudent, index: number) =>
              item.record_id || item.profile_id || `row-${index}`
            }
            renderItem={({ item }: { item: RosterStudent }) => (
              <View style={styles.recordItem}>
                <View style={styles.recordTop}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>
                      {item.full_name || item.roll_no || item.admission_no || 'Student'}
                    </Text>
                    <Text style={styles.studentStatus}>
                      {item.status ? item.status : 'Not marked'}
                      {item.roll_no ? ` • Roll ${item.roll_no}` : ''}
                      {!item.profile_id ? ' • No linked profile' : ''}
                    </Text>
                  </View>
                  {item.record_id ? (
                    <TouchableOpacity
                      style={styles.btnDelete}
                      onPress={() => handleDeleteAttendance(item.record_id as string)}
                    >
                      <Text style={styles.btnText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.btnEdit,
                      item.status === 'present' && styles.btnActive,
                    ]}
                    onPress={() =>
                      item.profile_id && handleMarkAttendance(item.profile_id, 'present')
                    }
                    disabled={isSaving || !item.profile_id}
                  >
                    <Text style={styles.btnText}>
                      {item.status === 'present' ? '✓ Present' : 'Present'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.btnEdit,
                      item.status === 'absent' && styles.btnActive,
                    ]}
                    onPress={() =>
                      item.profile_id && handleMarkAttendance(item.profile_id, 'absent')
                    }
                    disabled={isSaving || !item.profile_id}
                  >
                    <Text style={styles.btnText}>
                      {item.status === 'absent' ? '✓ Absent' : 'Absent'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.btnEdit,
                      item.status === 'late' && styles.btnActive,
                    ]}
                    onPress={() =>
                      item.profile_id && handleMarkAttendance(item.profile_id, 'late')
                    }
                    disabled={isSaving || !item.profile_id}
                  >
                    <Text style={styles.btnText}>
                      {item.status === 'late' ? '✓ Late' : 'Late'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      <View style={styles.percentageBox}>
        <Text style={styles.percentageTitle}>Attendance Summary</Text>
        <Text style={styles.percentageValue}>
          Present: {presentCount} | Absent: {absentCount} | Late: {lateCount}
        </Text>
      </View>

      <View style={styles.actionBar}>
        <Button
          title="Mark All Present"
          onPress={() => handleMarkAll('present')}
          color="#1A237E"
          disabled={isSaving}
        />
        <Button
          title="Refresh"
          onPress={() => fetchAttendance(selectedClass.id, selectedDate)}
          color="#1A237E"
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 20,
    backgroundColor: '#1A237E',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 10,
    top: 20,
    color: '#FFFFFF',
  },
  backText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  selectionBox: {
    padding: 20,
    backgroundColor: '#F5F5F5',
    margin: 16,
    borderRadius: 12,
  },
  label: {
    color: '#424242',
    fontSize: 14,
    marginBottom: 6,
  },
  classBox: {
    marginBottom: 12,
  },
  classText: {
    color: '#1A237E',
    fontSize: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
  },
  classChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    marginRight: 8,
  },
  classChipActive: {
    backgroundColor: '#1A237E',
    borderColor: '#1A237E',
  },
  classChipText: {
    color: '#1A237E',
    fontSize: 14,
    fontWeight: '600',
  },
  classChipTextActive: {
    color: '#FFFFFF',
  },
  dateBox: {
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFD8DC',
  },
  dateBtnText: {
    color: '#1A237E',
    fontSize: 16,
    fontWeight: '600',
  },
  todayLink: {
    color: '#1A237E',
    fontSize: 13,
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  statusBox: {
    marginBottom: 20,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  statusItem: {
    backgroundColor: '#E8EAF6',
    borderRadius: 8,
    padding: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  statusText: {
    color: '#1A237E',
    fontSize: 12,
    fontWeight: '600',
  },
  attendanceBox: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  title: {
    color: '#1A237E',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    color: '#757575',
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: '#C62828',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
  actionBar: {
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderTopWidth: 1,
    borderTopColor: '#CFD8DC',
  },
  // Empty state (no class selected)
  stateBox: {
    margin: 20,
    padding: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    alignItems: 'center',
  },
  stateText: {
    color: '#424242',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  classSelect: {
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 4,
  },
  dateText: {
    color: '#1A237E',
    fontSize: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    marginHorizontal: 8,
    flex: 1,
    textAlign: 'center',
  },
  // Status colours
  present: {
    backgroundColor: '#E8F5E9',
  },
  presentText: {
    color: '#2E7D32',
  },
  absent: {
    backgroundColor: '#FFEBEE',
  },
  absentText: {
    color: '#C62828',
  },
  late: {
    backgroundColor: '#FFF3E0',
  },
  lateText: {
    color: '#E65100',
  },
  // Attendance record rows
  recordItem: {
    flexDirection: 'column',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentInfo: {
    flex: 1,
    paddingRight: 8,
  },
  studentName: {
    color: '#1A237E',
    fontSize: 14,
    fontWeight: '600',
  },
  studentStatus: {
    color: '#757575',
    fontSize: 12,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 10,
  },
  btnEdit: {
    backgroundColor: '#1A237E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  btnActive: {
    backgroundColor: '#0D1B63',
    borderWidth: 1,
    borderColor: '#8C9EFF',
  },
  btnDelete: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Percentage summary
  percentageBox: {
    padding: 16,
    backgroundColor: '#E3F2FD',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  percentageTitle: {
    color: '#1A237E',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  percentageValue: {
    color: '#424242',
    fontSize: 13,
  },
})
