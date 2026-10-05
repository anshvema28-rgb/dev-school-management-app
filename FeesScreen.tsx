import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { Alert } from './safeAlert'
import { supabase } from './supabaseClient'

interface FeeRecord {
  id: string
  student_id: string
  amount: number
  fee_type: 'tuition' | 'registration' | 'materials' | 'extracurricular' | 'other'
  due_date: string
  paid_date: string | null
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived'
  payment_method: string | null
  transaction_id: string | null
  created_at: string
  updated_at: string
  // fees.student_id references profiles(id) — the student's name comes from
  // this embedded profiles row (there is no students embed on fees).
  profiles?: { full_name: string | null } | null
}

interface Student {
  id: string
  profile_id: string | null
  roll_no: string | null
  admission_no: string | null
  profiles?: { full_name: string | null } | null
}

interface FeeFormState {
  student_id: string | null
  fee_type: 'tuition' | 'registration' | 'materials' | 'extracurricular' | 'other'
  amount: string
  due_date: string
  payment_status: 'unpaid' | 'partial' | 'paid' | 'waived'
  payment_method: string
  transaction_id: string
  isEditing: boolean
  existingId: string | null
}

const EMPTY_FORM: FeeFormState = {
  student_id: null,
  fee_type: 'tuition',
  amount: '',
  due_date: '',
  payment_status: 'unpaid',
  payment_method: '',
  transaction_id: '',
  isEditing: false,
  existingId: null,
}

export default function FeesScreen({ route, navigation }: any) {
  const [fees, setFees] = useState<FeeRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editFee, setEditFee] = useState<FeeRecord | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FeeFormState>(EMPTY_FORM)

  // Load fees on mount
  useEffect(() => {
    fetchFees()
  }, [])

  // Load students for selection
  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchFees = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('fees')
        .select(`
          *,
          profiles!fees_student_id_fkey (full_name)
        `)
        .order('due_date')

      if (error) throw error
      setFees(data as FeeRecord[])
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(
          'id, profile_id, roll_no, admission_no, profiles!students_profile_id_fkey (full_name)'
        )
        .order('roll_no')
      if (error) throw error
      setStudents((data || []) as unknown as Student[])
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  const handleSave = async () => {
    if (!form.student_id) {
      Alert.alert('Validation', 'Please select a student first.')
      return
    }

    setIsSaving(true)
    try {
      const feeData = {
        student_id: form.student_id,
        fee_type: form.fee_type,
        amount: Number(form.amount) || 0,
        due_date: form.due_date || new Date().toISOString().split('T')[0],
        payment_status: form.payment_status,
        payment_method: form.payment_method,
        transaction_id: form.transaction_id,
        // Record when the fee was actually paid (keep the original date on edits)
        paid_date:
          form.payment_status === 'paid'
            ? editFee && editFee.paid_date
              ? editFee.paid_date
              : new Date().toISOString().split('T')[0]
            : null,
      }

      let result
      if (editFee?.id) {
        result = await supabase.from('fees').update(feeData).eq('id', editFee.id)
      } else {
        result = await supabase.from('fees').insert(feeData)
      }

      if (result.error) throw result.error
      Alert.alert('Success', editFee ? 'Fee record updated' : 'Fee record added')
      fetchFees()
      setEditFee(null)
      setForm(EMPTY_FORM)
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    // Alert.alert (React Native) instead of the browser-only confirm()
    Alert.alert('Delete fee', 'Are you sure you want to delete this fee record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('fees').delete().eq('id', id)
            if (error) throw error
            Alert.alert('Success', 'Fee record deleted')
            fetchFees()
          } catch (err: any) {
            Alert.alert('Error', err.message)
          }
        },
      },
    ])
  }

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`
  }

  // roll_no lookup keyed by profiles(id) (fees.student_id space)
  const rollByProfile: Record<string, string> = {}
  students.forEach((s: any) => {
    if (s && s.profile_id && s.roll_no) rollByProfile[s.profile_id] = s.roll_no
  })

  const feeName = (f: FeeRecord) =>
    (f.profiles && f.profiles.full_name) || 'Student'

  // Live search across student name, roll no, fee type and status
  const q = (search || '').trim().toLowerCase()
  const visibleFees = q
    ? fees.filter((f) => {
        const name = feeName(f).toLowerCase()
        const roll = (rollByProfile[f.student_id] || '').toLowerCase()
        return (
          name.includes(q) ||
          roll.includes(q) ||
          (f.fee_type || '').toLowerCase().includes(q) ||
          (f.payment_status || '').toLowerCase().includes(q)
        )
      })
    : fees

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>Fees Management</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation && navigation.goBack && navigation.goBack()}
        >
          <Text style={styles.backText}>← Dashboard</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          placeholder="Search by student name, roll no, or admission no"
          value={search || ''}
          onChangeText={s => setSearch(s)}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        <Button title="Refresh" onPress={() => fetchFees()} disabled={isLoading} />
      </View>

      <View style={styles.feesContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" />
        ) : visibleFees.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {fees.length === 0 ? 'No fee records found.' : 'No fees match your search.'}
            </Text>
            <Text style={styles.emptyHint}>
              {fees.length === 0
                ? 'Add a new fee record using the form below.'
                : 'Try a different name or roll number.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleFees}
            keyExtractor={(item: FeeRecord) => item.id}
            renderItem={({ item }: any) => (
              <>
              <View style={styles.feeItem}>
                <View style={styles.feeInfo}>
                  <Text style={styles.feeStudent}>{feeName(item)}</Text>
                  <Text style={styles.feeRoll}>Roll: {rollByProfile[item.student_id] || 'N/A'}</Text>
                  <Text style={styles.feeType}>Type: {fee_type_enum[item.fee_type] || item.fee_type}</Text>
                </View>
                <View style={styles.feeDetails}>
                  <Text style={styles.feeAmount}>${item.amount.toFixed(2)}</Text>
                  <Text style={styles.feeDue}>Due: {new Date(item.due_date).toLocaleDateString()}</Text>
                  <Text style={styles.feeStatus}>
                    {payment_status_enum[item.payment_status] || item.payment_status}
                  </Text>
                </View>
              </View>
              <View style={styles.feeActions}>
                <Button
                  title="Edit"
                  color="#673AB7"
                  onPress={() => {
                    setEditFee(item)
                    setForm({
                      student_id: item.student_id,
                      fee_type: item.fee_type,
                      amount: String(item.amount),
                      due_date: item.due_date,
                      payment_status: item.payment_status,
                      payment_method: item.payment_method || '',
                      transaction_id: item.transaction_id || '',
                      isEditing: true,
                      existingId: item.id,
                    })
                  }}
                />
                <Button
                  title="Delete"
                  color="#F44336"
                  onPress={() => handleDelete(item.id)}
                />
              </View>
              </>
            )}
          />
        )}
      </View>

      <View style={styles.formsSection}>
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Fee Details</Text>
          <View style={styles.formSectionContent}>
            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Student</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !form.student_id && styles.chipActive]}
                  onPress={() => setForm({ ...form, student_id: null })}
                >
                  <Text style={[styles.chipText, !form.student_id && styles.chipTextActive]}>
                    Select Student
                  </Text>
                </TouchableOpacity>
                {students
                  .filter((student: any) => !!student.profile_id)
                  .map((student: any) => (
                  <TouchableOpacity
                    key={student.id}
                    style={[styles.chip, form.student_id === student.profile_id && styles.chipActive]}
                    onPress={() => setForm({ ...form, student_id: student.profile_id })}
                  >
                    <Text
                      style={[styles.chipText, form.student_id === student.profile_id && styles.chipTextActive]}
                    >
                      {student.roll_no
                        ? `${student.roll_no} - ${(student.profiles && student.profiles.full_name) || 'Student'}`
                        : (student.profiles && student.profiles.full_name) || 'Student'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Fee Type</Text>
              <View style={styles.chipRow}>
                {FEE_TYPES.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, form.fee_type === option.value && styles.chipActive]}
                    onPress={() => setForm({ ...form, fee_type: option.value })}
                  >
                    <Text
                      style={[styles.chipText, form.fee_type === option.value && styles.chipTextActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Amount</Text>
              <View style={styles.formSectionInput}>
                <TextInput
                  value={form.amount}
                  onChangeText={(text) => setForm({ ...form, amount: text })}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor="#9E9E9E"
                  style={styles.fieldText}
                />
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Due Date</Text>
              <View style={styles.formSectionInput}>
                <TextInput
                  value={form.due_date}
                  onChangeText={(text) => setForm({ ...form, due_date: text })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9E9E9E"
                  style={styles.fieldText}
                />
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Payment Status</Text>
              <View style={styles.chipRow}>
                {PAYMENT_STATUSES.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.chip, form.payment_status === option.value && styles.chipActive]}
                    onPress={() => setForm({ ...form, payment_status: option.value })}
                  >
                    <Text
                      style={[styles.chipText, form.payment_status === option.value && styles.chipTextActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Payment Method</Text>
              <View style={styles.formSectionInput}>
                <TextInput
                  value={form.payment_method}
                  onChangeText={(text) => setForm({ ...form, payment_method: text })}
                  placeholder="Cash / Card / UPI"
                  placeholderTextColor="#9E9E9E"
                  style={styles.fieldText}
                />
              </View>
            </View>

            <View style={styles.formSectionGroup}>
              <Text style={styles.formSectionLabel}>Transaction ID</Text>
              <View style={styles.formSectionInput}>
                <TextInput
                  value={form.transaction_id}
                  onChangeText={(text) => setForm({ ...form, transaction_id: text })}
                  placeholder="Optional"
                  placeholderTextColor="#9E9E9E"
                  style={styles.fieldText}
                />
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              title={editFee ? 'Update Fee' : 'Add Fee'}
              onPress={handleSave}
              color="#1A237E"
            />
            <Button
              title="Cancel"
              onPress={() => {
                setEditFee(null)
                setForm(EMPTY_FORM)
              }}
              color="#757575"
            />
          </View>
        </View>
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Financial Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Paid</Text>
          <Text style={styles.summaryValue}>
            {fees.filter((f: FeeRecord) => f.payment_status === 'paid').reduce((sum, f) => sum + f.amount, 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Pending</Text>
          <Text style={styles.summaryValue}>
            {fees.filter((f: FeeRecord) => f.payment_status === 'unpaid').reduce((sum, f) => sum + f.amount, 0).toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Waived</Text>
          <Text style={styles.summaryValue}>
            {fees.filter((f: FeeRecord) => f.payment_status === 'waived').length}
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const payment_status_enum: any = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  waived: 'Waived',
}

const FEE_TYPES: { value: FeeFormState['fee_type']; label: string }[] = [
  { value: 'tuition', label: 'Tuition' },
  { value: 'registration', label: 'Registration' },
  { value: 'materials', label: 'Materials' },
  { value: 'extracurricular', label: 'Extracurricular' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_STATUSES: { value: FeeFormState['payment_status']; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'waived', label: 'Waived' },
]
const fee_type_enum: any = {
  tuition: 'Tuition',
  registration: 'Registration',
  materials: 'Materials',
  extracurricular: 'Extracurricular',
  other: 'Other',
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
  },
  searchBox: {
    padding: 16,
    backgroundColor: '#F5F5F5',
    margin: 16,
    borderRadius: 12,
  },
  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 12,
    flex: 1,
  },
  feesContainer: {
    padding: 20,
  },
  feeItem: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    flexDirection: 'row',
  },
  feeInfo: {
    flex: 1,
  },
  feeStudent: {
    color: '#1A237E',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  feeRoll: {
    color: '#757575',
    fontSize: 12,
    marginLeft: 8,
  },
  feeType: {
    color: '#1A237E',
    fontSize: 12,
    marginLeft: 8,
  },
  feeDetails: {
    flex: 1,
    marginLeft: 16,
  },
  feeAmount: {
    color: '#1A237E',
    fontSize: 16,
    fontWeight: '600',
  },
  feeDue: {
    color: '#757575',
    fontSize: 12,
  },
  feeStatus: {
    color: '#1A237E',
    fontSize: 12,
  },
  formsSection: {
    marginBottom: 20,
  },
  formSectionTitle: {
    color: '#1A237E',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  formSectionContent: {
    marginBottom: 16,
  },
  formSectionLabel: {
    color: '#424242',
    fontSize: 13,
    marginBottom: 6,
  },
  formSectionGroup: {
    marginBottom: 12,
    display: 'flex',
    flexDirection: 'row',
  },
  formSectionInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginRight: 8,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  formSectionSelect: {
    height: 40,
    width: 150,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginRight: 8,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  actions: {
    marginTop: 20,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  summarySection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  summaryTitle: {
    color: '#1A237E',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    color: '#757575',
    fontSize: 13,
  },
  summaryValue: {
    color: '#1A237E',
    fontSize: 13,
    fontWeight: '500',
  },
  // Empty state
  emptyState: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
  },
  emptyText: {
    color: '#424242',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyHint: {
    color: '#757575',
    fontSize: 13,
    textAlign: 'center',
  },
  // Per-row action buttons
  feeActions: {
    justifyContent: 'center',
    marginLeft: 8,
  },
  // Form section wrapper
  formSection: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  // Text input inside the bordered field box
  fieldText: {
    flex: 1,
    height: 38,
    color: '#212121',
    fontSize: 14,
    padding: 0,
  },
  // Chip-style selectors (replaces the web-only dropdown element)
  chipRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    padding: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#EEEEEE',
    marginRight: 6,
    marginBottom: 4,
  },
  chipActive: {
    backgroundColor: '#1A237E',
  },
  chipText: {
    color: '#424242',
    fontSize: 12,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
})