import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native'
import { supabase } from './supabaseClient'

interface StudentFormData {
  roll_no: string
  admission_no: string
  date_of_birth: string
  gender: string
  address: string
  parent_name: string
  parent_phone: string
  class_id: string | null
}

interface StudentFormProps {
  route: { params: { student?: any } }
  navigation: { goBack: () => void }
}

export default function StudentFormScreen({ route, navigation }: StudentFormProps) {
  const [form, setForm] = useState<StudentFormData>({
    roll_no: '',
    admission_no: '',
    date_of_birth: '',
    gender: '',
    address: '',
    parent_name: '',
    parent_phone: '',
    class_id: null,
  })
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [classes, setClasses] = useState<any[]>([])

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
      setClasses((data || []) as any[])
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  // Load existing student data when editing
  useEffect(() => {
    if (route.params?.student) {
      setIsEditing(true)
      setForm({
        roll_no: route.params.student.roll_no || '',
        admission_no: route.params.student.admission_no || '',
        date_of_birth: route.params.student.date_of_birth || '',
        gender: route.params.student.gender || '',
        address: route.params.student.address || '',
        parent_name: route.params.student.parent_name || '',
        parent_phone: route.params.student.parent_phone || '',
        class_id: route.params.student.class_id ? String(route.params.student.class_id) : null,
      })
    }
  }, [route.params])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const payload = {
        ...form,
        // DATE column: send null (not '') when the field is left blank
        date_of_birth: form.date_of_birth ? form.date_of_birth : null,
      }
      const { data, error } = isEditing
        ? await supabase.from('students').update(payload).eq('id', route.params.student?.id)
        : await supabase.from('students').insert(payload)

      if (error) throw error

      Alert.alert('Success', isEditing ? 'Student updated' : 'Student added')
      navigation.goBack()
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Student' : 'Add Student'}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleCancel}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formLabel}>Roll Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter roll number"
            value={form.roll_no}
            onChangeText={v => setForm({ ...form, roll_no: v })}
            autoCapitalize="none"
          />

          <Text style={styles.formLabel}>Class</Text>
          {classes.length === 0 ? (
            <View style={styles.emptyClasses}>
              <Text style={styles.emptyClassesText}>
                No classes available yet. Ask the admin to add classes first.
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

          <TextInput
            style={styles.input}
            placeholder="Date of Birth (YYYY-MM-DD)"
            value={form.date_of_birth}
            onChangeText={v => setForm({ ...form, date_of_birth: v })}
            keyboardType="default"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Gender"
            value={form.gender}
            onChangeText={v => setForm({ ...form, gender: v })}
          />

          <TextInput
            style={styles.input}
            multiline={true}
            numberOfLines={3}
            placeholder="Address"
            value={form.address}
            onChangeText={v => setForm({ ...form, address: v })}
          />

          <View style={styles.formGroup}>
            <TextInput
              style={styles.input}
              placeholder="Parent Name"
              value={form.parent_name}
              onChangeText={v => setForm({ ...form, parent_name: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Parent Phone"
              value={form.parent_phone}
              onChangeText={v => setForm({ ...form, parent_phone: v })}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.actions}>
            <Button title={isEditing ? 'Update' : 'Save'} onPress={handleSave} color="#1A237E" />
            <Button title="Cancel" onPress={handleCancel} color="#757575" />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    backgroundColor: '#1A237E',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 20,
    color: '#FFFFFF',
  },
  closeText: {
    fontSize: 24,
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    color: '#212121',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#FAFAFA',
  },
  formGroup: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  emptyClasses: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
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
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
})