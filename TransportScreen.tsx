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

// Transport module — NEW tables (migration 008):
//   transport_routes / transport_stops / transport_students
//   admin   -> manage buses (routes), stops, student assignments
//   student -> own assigned route + stops      (RLS)
//   parent  -> linked child's route + stops    (RLS)
//   teacher -> routes/stops overview           (RLS)
// Driver phone is only queried in admin mode (personal data).

const EMPTY_ROUTE = {
  id: null as string | null,
  name: '',
  bus_number: '',
  driver_name: '',
  driver_phone: '',
  description: '',
}

export default function TransportScreen({
  navigation,
  role = 'student',
}: {
  navigation?: { goBack: () => void }
  role?: string | null
}) {
  const isAdmin = role === 'admin' || role === null

  const [routes, setRoutes] = useState<any[]>([])
  const [stops, setStops] = useState<any[]>([])
  const [assigns, setAssigns] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showRouteForm, setShowRouteForm] = useState(false)
  const [routeForm, setRouteForm] = useState(EMPTY_ROUTE)
  const [saving, setSaving] = useState(false)

  const [openRoute, setOpenRoute] = useState<string | null>(null)
  const [stopName, setStopName] = useState('')
  const [stopOrder, setStopOrder] = useState('')
  const [stopTime, setStopTime] = useState('')
  const [pickStudent, setPickStudent] = useState<string | null>(null)

  const stopsOf = (routeId: string) =>
    stops.filter((s) => s.route_id === routeId).sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))
  const assignsOf = (routeId: string) => assigns.filter((a) => a.route_id === routeId)

  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id)
    return s ? s.full_name || 'Student' : 'Student'
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const cols = isAdmin
        ? 'id, name, bus_number, driver_name, driver_phone, description'
        : 'id, name, bus_number, description'
      const r = await supabase.from('transport_routes').select(cols).order('name')
      if (r.error) throw r.error
      setRoutes((r.data || []) as any[])

      const st = await supabase
        .from('transport_stops')
        .select('id, route_id, name, stop_order, arrival_time')
        .order('stop_order', { ascending: true })
      if (st.error) throw st.error
      setStops((st.data || []) as any[])

      const a = await supabase
        .from('transport_students')
        .select('id, route_id, stop_id, student_id')
      if (a.error) throw a.error
      setAssigns((a.data || []) as any[])

      if (isAdmin) {
        const s = await supabase
          .from('students')
          .select('id, profile_id, profiles!students_profile_id_fkey ( full_name )')
        const map: any[] = ((s.data || []) as any[]).map((row: any) => {
          const pf: any = row.profiles
          return { id: row.id, full_name: (pf && pf.full_name) || 'Student' }
        })
        setStudents(map)
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load transport data')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    load()
  }, [load])

  const handleBack = () => {
    if (navigation && navigation.goBack) navigation.goBack()
  }

  // ---------- routes ----------
  const openAddRoute = () => {
    setRouteForm(EMPTY_ROUTE)
    setShowRouteForm(true)
  }

  const openEditRoute = (r: any) => {
    setRouteForm({
      id: r.id,
      name: r.name || '',
      bus_number: r.bus_number || '',
      driver_name: r.driver_name || '',
      driver_phone: r.driver_phone || '',
      description: r.description || '',
    })
    setShowRouteForm(true)
  }

  const saveRoute = async () => {
    if (!routeForm.name.trim()) {
      Alert.alert('Validation', 'Please enter a route name.')
      return
    }
    const payload: any = {
      name: routeForm.name.trim(),
      bus_number: routeForm.bus_number.trim() || null,
      driver_name: routeForm.driver_name.trim() || null,
      driver_phone: routeForm.driver_phone.trim() || null,
      description: routeForm.description.trim() || null,
    }
    setSaving(true)
    try {
      const { error: err } = routeForm.id
        ? await supabase.from('transport_routes').update(payload).eq('id', routeForm.id)
        : await supabase.from('transport_routes').insert(payload)
      if (err) throw err
      Alert.alert('Success', routeForm.id ? 'Route updated' : 'Route added')
      setShowRouteForm(false)
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to save route')
    } finally {
      setSaving(false)
    }
  }

  const deleteRoute = (r: any) => {
    Alert.alert('Delete Route', `Delete "${r.name}"? Its stops and assignments are removed too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            const { error: err } = await supabase
              .from('transport_routes')
              .delete()
              .eq('id', r.id)
            if (err) throw err
            if (openRoute === r.id) setOpenRoute(null)
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

  // ---------- stops ----------
  const addStop = async (routeId: string) => {
    if (!stopName.trim()) {
      Alert.alert('Validation', 'Please enter a stop name.')
      return
    }
    setSaving(true)
    try {
      const { error: err } = await supabase.from('transport_stops').insert({
        route_id: routeId,
        name: stopName.trim(),
        stop_order: Number(stopOrder) || stopsOf(routeId).length + 1,
        arrival_time: stopTime.trim() || null,
      })
      if (err) throw err
      setStopName('')
      setStopOrder('')
      setStopTime('')
      await load()
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to add stop')
    } finally {
      setSaving(false)
    }
  }

  const deleteStop = (id: string) => {
    Alert.alert('Remove Stop', 'Remove this stop from the route?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('transport_stops').delete().eq('id', id)
          if (err) Alert.alert('Error', err.message)
          else load()
        },
      },
    ])
  }

  // ---------- student assignment ----------
  const assignStudent = async (routeId: string) => {
    if (!pickStudent) {
      Alert.alert('Validation', 'Please select a student.')
      return
    }
    setSaving(true)
    try {
      const { error: err } = await supabase.from('transport_students').insert({
        route_id: routeId,
        student_id: pickStudent,
      })
      if (err) {
        if (String(err.message).indexOf('duplicate key') >= 0) {
          Alert.alert('Duplicate', 'This student is already assigned to that route.')
        } else {
          Alert.alert('Error', err.message)
        }
      } else {
        setPickStudent(null)
        await load()
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Unable to assign student')
    } finally {
      setSaving(false)
    }
  }

  const unassign = (id: string) => {
    Alert.alert('Remove Student', 'Remove this student from the route?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase
            .from('transport_students')
            .delete()
            .eq('id', id)
          if (err) Alert.alert('Error', err.message)
          else load()
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Transport</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1A237E" />
          <Text style={styles.hint}>Loading transport…</Text>
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
            <TouchableOpacity style={styles.addBtn} onPress={openAddRoute} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>＋ Add Route</Text>
            </TouchableOpacity>
          ) : null}

          {showRouteForm ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{routeForm.id ? 'Edit Route' : 'Add Route'}</Text>

              <Text style={styles.formLabel}>Route name *</Text>
              <TextInput
                style={styles.input}
                value={routeForm.name}
                onChangeText={(t) => setRouteForm({ ...routeForm, name: t })}
                placeholder="e.g. City North Route"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Bus number</Text>
              <TextInput
                style={styles.input}
                value={routeForm.bus_number}
                onChangeText={(t) => setRouteForm({ ...routeForm, bus_number: t })}
                placeholder="e.g. HR-55-1234"
                placeholderTextColor="#9AA5C4"
                autoCapitalize="characters"
              />

              <Text style={styles.formLabel}>Driver name</Text>
              <TextInput
                style={styles.input}
                value={routeForm.driver_name}
                onChangeText={(t) => setRouteForm({ ...routeForm, driver_name: t })}
                placeholder="Optional"
                placeholderTextColor="#9AA5C4"
              />

              <Text style={styles.formLabel}>Driver phone</Text>
              <TextInput
                style={styles.input}
                value={routeForm.driver_phone}
                onChangeText={(t) => setRouteForm({ ...routeForm, driver_phone: t })}
                placeholder="Optional"
                placeholderTextColor="#9AA5C4"
                keyboardType="phone-pad"
              />

              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={routeForm.description}
                onChangeText={(t) => setRouteForm({ ...routeForm, description: t })}
                placeholder="Areas covered…"
                placeholderTextColor="#9AA5C4"
                multiline
              />

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowRouteForm(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabled]}
                  onPress={saveRoute}
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

          <Text style={styles.sectionLabel}>Routes ({routes.length})</Text>

          {routes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {isAdmin ? 'No routes added yet' : 'No transport assigned yet'}
              </Text>
            </View>
          ) : (
            routes.map((r) => {
              const rs = stopsOf(r.id)
              const ra = assignsOf(r.id)
              const open = openRoute === r.id
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardIcon}>
                      <Text style={styles.cardIconText}>🚌</Text>
                    </View>
                    <View style={styles.body}>
                      <Text style={styles.name} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {r.bus_number ? `Bus ${r.bus_number}` : 'Bus —'}
                        {!isAdmin && r.description ? ` • ${r.description}` : ''}
                      </Text>
                      {isAdmin && r.driver_name ? (
                        <Text style={styles.meta} numberOfLines={1}>
                          Driver: {r.driver_name}
                          {r.driver_phone ? ` • ${r.driver_phone}` : ''}
                        </Text>
                      ) : null}
                      <Text style={styles.meta}>
                        {rs.length} stop{rs.length === 1 ? '' : 's'}
                        {isAdmin && ra.length > 0 ? ` • ${ra.length} student(s)` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stopList}>
                    {rs.length === 0 ? (
                      <Text style={styles.stopEmpty}>No stops listed</Text>
                    ) : (
                      rs.map((s) => (
                        <View key={s.id} style={styles.stopRow}>
                          <Text style={styles.stopOrder}>{s.stop_order || '-'}</Text>
                          <Text style={styles.stopName} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <Text style={styles.stopTime}>{s.arrival_time || ''}</Text>
                          {isAdmin ? (
                            <TouchableOpacity
                              onPress={() => deleteStop(s.id)}
                              activeOpacity={0.7}
                              disabled={saving}
                            >
                              <Text style={styles.stopRemove}>×</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>

                  {isAdmin ? (
                    <TouchableOpacity
                      style={styles.manageBtn}
                      onPress={() => setOpenRoute(open ? null : r.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.manageBtnText}>
                        {open ? '× Close' : 'Manage Stops & Students'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {open ? (
                    <View style={styles.panel}>
                      <Text style={styles.panelLabel}>Add a stop</Text>
                      <View style={styles.rowInputs}>
                        <TextInput
                          style={[styles.input, styles.flex2]}
                          value={stopName}
                          onChangeText={setStopName}
                          placeholder="Stop name"
                          placeholderTextColor="#9AA5C4"
                        />
                        <TextInput
                          style={[styles.input, styles.flex1]}
                          value={stopOrder}
                          onChangeText={setStopOrder}
                          placeholder="Order"
                          placeholderTextColor="#9AA5C4"
                          keyboardType="number-pad"
                        />
                        <TextInput
                          style={[styles.input, styles.flex1]}
                          value={stopTime}
                          onChangeText={setStopTime}
                          placeholder="07:30"
                          placeholderTextColor="#9AA5C4"
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.saveBtn, saving && styles.disabled]}
                        onPress={() => addStop(r.id)}
                        disabled={saving}
                        activeOpacity={0.8}
                      >
                        {saving ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.saveBtnText}>Add Stop</Text>
                        )}
                      </TouchableOpacity>

                      {isAdmin ? (
                        <View>
                          <Text style={[styles.panelLabel, { marginTop: 14 }]}>
                            Assigned students ({ra.length})
                          </Text>
                          {ra.length === 0 ? (
                            <Text style={styles.stopEmpty}>No students assigned</Text>
                          ) : (
                            ra.map((a) => (
                              <View key={a.id} style={styles.assignedRow}>
                                <Text style={styles.assignedName} numberOfLines={1}>
                                  {studentName(a.student_id)}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => unassign(a.id)}
                                  activeOpacity={0.7}
                                  disabled={saving}
                                >
                                  <Text style={styles.removeText}>Remove</Text>
                                </TouchableOpacity>
                              </View>
                            ))
                          )}

                          <Text style={styles.panelLabel}>Assign student</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.studentStrip}
                          >
                            {students.map((s) => (
                              <TouchableOpacity
                                key={s.id}
                                style={[
                                  styles.studentChip,
                                  pickStudent === s.id && styles.studentChipActive,
                                ]}
                                onPress={() => setPickStudent(s.id)}
                                activeOpacity={0.8}
                              >
                                <Text
                                  style={[
                                    styles.studentChipText,
                                    pickStudent === s.id && styles.studentChipTextActive,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {s.full_name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                          <TouchableOpacity
                            style={[styles.saveBtn, saving && styles.disabled]}
                            onPress={() => assignStudent(r.id)}
                            disabled={saving}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.saveBtnText}>Assign to Route</Text>
                          </TouchableOpacity>

                          <View style={styles.formActions}>
                            <TouchableOpacity
                              style={styles.outlineBtn}
                              onPress={() => openEditRoute(r)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.outlineBtnText}>Edit Route</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.dangerBtn}
                              onPress={() => deleteRoute(r)}
                              activeOpacity={0.8}
                              disabled={saving}
                            >
                              <Text style={styles.dangerBtnText}>Delete Route</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })
          )}

          <Text style={styles.footNote}>
            Driver contact details are shown only to school administration.
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
  rowInputs: { flexDirection: 'row', marginBottom: 10 },
  flex1: { flex: 1, marginRight: 8 },
  flex2: { flex: 2, marginRight: 8 },
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
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
  stopList: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    padding: 8,
  },
  stopEmpty: { fontSize: 11, color: '#9E9E9E', textAlign: 'center', padding: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  stopOrder: {
    width: 22,
    fontSize: 10,
    fontWeight: '800',
    color: '#1A237E',
    textAlign: 'center',
  },
  stopName: { flex: 1, fontSize: 12, color: '#424242', marginLeft: 6 },
  stopTime: { fontSize: 10, color: '#9E9E9E', marginRight: 8 },
  stopRemove: { fontSize: 18, color: '#C62828', paddingHorizontal: 6, fontWeight: '700' },
  manageBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  manageBtnText: { fontSize: 12, fontWeight: '800', color: '#1A237E' },
  panel: {
    marginTop: 10,
    backgroundColor: '#FAFBFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE4F7',
    padding: 10,
  },
  panelLabel: { fontSize: 12, fontWeight: '800', color: '#1A237E', marginBottom: 6 },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEF1FA',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  assignedName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#424242' },
  removeText: { fontSize: 11, fontWeight: '800', color: '#C62828' },
  studentStrip: { marginBottom: 10, flexGrow: 0 },
  studentChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DEEE',
    marginRight: 8,
    maxWidth: 160,
  },
  studentChipActive: { backgroundColor: '#1A237E', borderColor: '#1A237E', elevation: 3 },
  studentChipText: { fontSize: 12, fontWeight: '700', color: '#424242' },
  studentChipTextActive: { color: '#FFFFFF' },
  outlineBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1A237E',
    marginRight: 10,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '700', color: '#1A237E' },
  dangerBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  dangerBtnText: { fontSize: 13, fontWeight: '700', color: '#C62828' },
  footNote: { fontSize: 10, color: '#9E9E9E', marginTop: 8, textAlign: 'center' },
})
