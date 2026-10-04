import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native'
import { supabase } from './supabaseClient'

interface StudentDetails {
  id: string
  roll_no: string | null
  admission_no: string | null
  date_of_birth: string | null
  gender: string | null
  address: string | null
  parent_name: string | null
  parent_phone: string | null
  class_id: string | null
  classes?: { name: string | null; grade_level: number | null } | null
  profiles?: { full_name: string | null } | null
}

export default function StudentProfileScreen({ route, navigation }: any) {
  const [student, setStudent] = useState<StudentDetails | null>(null)
  const [classes, setClasses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const studentId = route.params ? route.params.studentId : null

  useEffect(() => {
    const loadStudent = async () => {
      setLoading(true)
      setLoadError(null)

      if (!studentId) {
        // No student selected — show an empty state instead of an endless spinner
        setStudent(null)
        setLoadError('No student selected.')
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('students')
          .select(`
            *,
            classes!students_class_id_fkey (name, grade_level),
            profiles!students_profile_id_fkey (full_name)
          `)
          .eq('id', studentId)
          .single()

        if (error) throw error
        setStudent(data as StudentDetails)

        // Also load classes
        const { data: clsData, error: clsError } = await supabase.from('classes').select('name, id').order('name')
        if (clsError) throw clsError
        setClasses(clsData.map((c: any) => c.name))
      } catch (err: any) {
        setStudent(null)
        setLoadError(err && err.message ? err.message : 'Could not load this student.')
      } finally {
        setLoading(false)
      }
    }

    loadStudent()
  }, [studentId])

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!student) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Student Profile</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation && navigation.goBack && navigation.goBack()}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{loadError || 'Student not found.'}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Student Profile</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation && navigation.goBack && navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <Text style={styles.profileName}>
            {student?.profiles?.full_name || student?.parent_name || 'Student Profile'}
          </Text>
          <Text style={styles.profileRoll}>Roll: {student?.roll_no || 'N/A'}</Text>
        </View>

        <View style={styles.profileDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Admission No:</Text>
            <Text style={styles.detailValue}>{student?.admission_no || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date of Birth:</Text>
            <Text style={styles.detailValue}>{student?.date_of_birth || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Gender:</Text>
            <Text style={styles.detailValue}>{student?.gender || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address:</Text>
            <Text style={styles.detailValue} numberOfLines={3}>{student?.address || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Parent Phone:</Text>
            <Text style={styles.detailValue}>{student?.parent_phone || 'N/A'}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Class:</Text>
            <Text style={styles.detailValue}>
              {student?.class_id ? student.classes?.name || '—' : '—'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.classSelector}>
        <Text style={styles.classLabel}>Class:</Text>
        <Text style={styles.classValue}>
          {student?.classes?.name || 'Not assigned'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  profileCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    color: '#1A237E',
    fontSize: 18,
    fontWeight: 'bold',
  },
  profileRoll: {
    color: '#757575',
    fontSize: 12,
    marginLeft: 8,
  },
  profileDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    color: '#424242',
    fontSize: 13,
    width: 120,
  },
  detailValue: {
    color: '#212121',
    fontSize: 13,
    flex: 1,
  },
  classSelector: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  classLabel: {
    color: '#757575',
    fontSize: 14,
    marginBottom: 4,
  },
  classValue: {
    color: '#1A237E',
    fontSize: 14,
  },
  // Top header bar
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
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  // Empty / error state
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#757575',
    fontSize: 15,
    textAlign: 'center',
  },
})