import React, { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native'
import LoginScreen from './LoginScreen'
import DashboardScreen from './DashboardScreen'
import StudentDashboardScreen from './StudentDashboardScreen'
import TeacherDashboardScreen from './TeacherDashboardScreen'
import AttendanceScreen from './AttendanceScreen'
import StudentListScreen from './StudentListScreen'
import StudentFormScreen from './StudentFormScreen'
import StudentProfileScreen from './StudentProfileScreen'
import FeesScreen from './FeesScreen'
import TeachersScreen from './TeachersScreen'
import ClassesScreen from './ClassesScreen'
import ExamManagementScreen from './ExamManagementScreen'
import HomeworkScreen from './HomeworkScreen'
import StudentHomeworkScreen from './StudentHomeworkScreen'
import HomeworkDetailScreen from './HomeworkDetailScreen'
import TimetableScreen from './TimetableScreen'
import NoticesScreen from './NoticesScreen'
import ParentsScreen from './ParentsScreen'
import ParentDashboardScreen from './ParentDashboardScreen'
import StaffScreen from './StaffScreen'
import SubjectsScreen from './SubjectsScreen'
import SyllabusScreen from './SyllabusScreen'
import TransportScreen from './TransportScreen'
import ComplaintsScreen from './ComplaintsScreen'
import CalendarScreen from './CalendarScreen'
import ReportsScreen from './ReportsScreen'
import SettingsScreen from './SettingsScreen'

import { supabase } from './supabaseClient'

export default function App() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  // 'loading' = session/role being resolved · 'ok' = known role ·
  // 'unknown' = role missing or lookup failed. Unknown NEVER opens Admin.
  const [roleStatus, setRoleStatus] = useState('loading')
  const [view, setView] = useState('resolving')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [attendanceReturnTo, setAttendanceReturnTo] = useState('admin')
  const [homeworkDetailRoute, setHomeworkDetailRoute] = useState({ params: {} })
  // Once the user taps a dashboard action, late profile/role responses
  // must not snap the view back to the admin dashboard.
  const navigatedByUser = useRef(false)

  // Auth session
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null)
    })

    // Listen for session changes
    const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      try {
        authData?.subscription?.unsubscribe?.()
      } catch (e) {
        // ignore cleanup errors
      }
    }
  }, [])

  // Resolve the signed-in user's role so we can pick the right dashboard.
  // Strict routing: Admin is opened ONLY for role === 'admin'. Unknown or
  // failed role resolution shows a safe sign-out state instead of Admin.
  useEffect(() => {
    if (!user) {
      setRole(null)
      setRoleStatus('loading')
      setView('resolving')
      navigatedByUser.current = false // fresh session starts on its own dashboard
      return
    }

    let active = true
    setRoleStatus('loading')

    const resolveRole = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (!active) return
        const raw = error ? null : data && data.role ? data.role : null
        const r = typeof raw === 'string' ? raw.trim().toLowerCase() : null

        if (r === 'admin' || r === 'teacher' || r === 'student' || r === 'parent') {
          setRole(r)
          setRoleStatus('ok')
          if (navigatedByUser.current) return // keep the screen the user opened
          if (r === 'student') {
            setView('student')
          } else if (r === 'teacher') {
            setView('teacher')
          } else if (r === 'parent') {
            setView('parent')
          } else {
            setView('admin')
          }
        } else {
          // null / unknown role — do NOT fall through to the Admin dashboard.
          setRole(null)
          setRoleStatus('unknown')
        }
      } catch (e) {
        if (!active) return
        setRole(null)
        setRoleStatus('unknown')
      }
    }

    resolveRole()

    return () => {
      active = false
    }
  }, [user])

  if (!user) {
    return <LoginScreen />
  }

  // Role still resolving — small loading state; prevents any Admin flash.
  if (roleStatus === 'loading') {
    return (
      <View style={styles.bootFill}>
        <ActivityIndicator size="large" color="#1A237E" />
        <Text style={styles.bootText}>Verifying your account…</Text>
      </View>
    )
  }

  // Role missing or lookup failed — never open Admin; return to login safely.
  if (roleStatus === 'unknown') {
    return (
      <View style={styles.bootFill}>
        <Text style={styles.bootTitle}>We could not verify your account access.</Text>
        <Text style={styles.bootText}>
          Please sign in again. If this keeps happening, contact the school administrator.
        </Text>
        <TouchableOpacity style={styles.bootBtn} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.bootBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ---- Navigation shims (no navigation library — state based) ----

  // Portal a screen returns to (students/teachers/parents must never be
  // dumped back onto the Admin dashboard when they press Back).
  const portalHome =
    role === 'student'
      ? 'student'
      : role === 'teacher'
        ? 'teacher'
        : role === 'parent'
          ? 'parent'
          : 'admin'

  // Used by StudentListScreen: its rows/buttons call navigate('StudentProfile'/'StudentForm').
  const adminNav = {
    goBack: () => setView(portalHome),
    navigate: (screen, params) => {
      const st = params && params.student ? params.student : null
      // StudentListScreen may send only { studentId } — keep it selectable
      // so StudentProfileScreen receives a real id instead of spinning forever.
      if (!st && params && params.studentId) {
        setSelectedStudent({ id: params.studentId })
      } else {
        setSelectedStudent(st)
      }
      if (screen === 'StudentProfile') setView('studentProfile')
      else if (screen === 'StudentForm') setView('studentForm')
    },
  }

  // Simple back shim for the reused admin/shared screens (portal aware).
  const backToAdmin = { goBack: () => setView(portalHome) }

  // Student navigation shim: StudentHomeworkScreen -> HomeworkDetail
  const studentNav = {
    goBack: () => setView('studentHomework'),
    navigate: (screen, params) => {
      if (screen === 'HomeworkDetail') {
        setHomeworkDetailRoute({ params: params || {} })
        setView('homeworkDetail')
      }
    },
  }

  // Admin quick-action handler. Attendance remembers where to return.
  const openAdmin = (screen) => {
    navigatedByUser.current = true
    if (screen === 'attendance') {
      setAttendanceReturnTo('admin')
      setView('attendance')
      return
    }
    setView(screen)
  }

  // ---- Teacher dashboard ----
  if (view === 'teacher') {
    return (
      <>
        <StatusBar style="auto" />
        <TeacherDashboardScreen
          onOpenAttendance={
            role === 'teacher'
              ? () => {
                  setAttendanceReturnTo('teacher')
                  setView('attendance')
                }
              : undefined
          }
          onNavigate={role === 'teacher' ? (s) => setView(s) : undefined}
        />
      </>
    )
  }

  // ---- Attendance tool (opened from Teacher or Admin dashboard) ----
  if (view === 'attendance') {
    return (
      <>
        <StatusBar style="auto" />
        <AttendanceScreen
          route={{ params: {} }}
          navigation={{ goBack: () => setView(attendanceReturnTo) }}
        />
      </>
    )
  }

  // ---- Parent dashboard ----
  if (view === 'parent') {
    return (
      <>
        <StatusBar style="auto" />
        <ParentDashboardScreen
          onNavigate={role === 'parent' ? (s) => setView(s) : undefined}
        />
      </>
    )
  }

  // ---- Student dashboard ----
  if (view === 'student') {
    return (
      <>
        <StatusBar style="auto" />
        <StudentDashboardScreen
          onSwitchToAdmin={role === 'student' ? undefined : () => setView('admin')}
          onNavigate={role === 'student' ? (s) => setView(s) : undefined}
        />
      </>
    )
  }

  // ---- Student homework (dedicated screen) ----
  if (view === 'studentHomework') {
    return (
      <>
        <StatusBar style="auto" />
        <StudentHomeworkScreen route={{ params: {} }} navigation={studentNav} />
      </>
    )
  }

  // ---- Homework detail (student submission / grading view) ----
  if (view === 'homeworkDetail') {
    return (
      <>
        <StatusBar style="auto" />
        <HomeworkDetailScreen route={homeworkDetailRoute} navigation={studentNav} />
      </>
    )
  }

  // ---- Admin sub-views (Management Hub) ----
  if (view === 'students') {
    return (
      <>
        <StatusBar style="auto" />
        <StudentListScreen route={{ params: {} }} navigation={adminNav} />
      </>
    )
  }
  if (view === 'studentProfile') {
    return (
      <>
        <StatusBar style="auto" />
        <StudentProfileScreen
          route={{ params: { studentId: selectedStudent ? selectedStudent.id : null } }}
          navigation={backToAdmin}
        />
      </>
    )
  }
  if (view === 'studentForm') {
    return (
      <>
        <StatusBar style="auto" />
        <StudentFormScreen
          route={{ params: { student: selectedStudent } }}
          navigation={backToAdmin}
        />
      </>
    )
  }
  if (view === 'fees') {
    return (
      <>
        <StatusBar style="auto" />
        <FeesScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'teachers') {
    return (
      <>
        <StatusBar style="auto" />
        <TeachersScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'parents') {
    return (
      <>
        <StatusBar style="auto" />
        <ParentsScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'classes') {
    return (
      <>
        <StatusBar style="auto" />
        <ClassesScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'exams') {
    return (
      <>
        <StatusBar style="auto" />
        <ExamManagementScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'homework') {
    return (
      <>
        <StatusBar style="auto" />
        <HomeworkScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'timetable') {
    return (
      <>
        <StatusBar style="auto" />
        <TimetableScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'notices') {
    return (
      <>
        <StatusBar style="auto" />
        <NoticesScreen route={{ params: {} }} navigation={backToAdmin} />
      </>
    )
  }

  // ---- New portal modules (Staff, Subjects, Syllabus, Transport,
  //      Complaints, Academic Calendar, Reports, Settings) ----
  if (view === 'staff') {
    return (
      <>
        <StatusBar style="auto" />
        <StaffScreen
          navigation={backToAdmin}
          role={role}
          onManageStaff={
            role === 'admin' ? () => setView('teachers') : undefined
          }
        />
      </>
    )
  }
  if (view === 'subjects') {
    return (
      <>
        <StatusBar style="auto" />
        <SubjectsScreen navigation={backToAdmin} role={role} />
      </>
    )
  }
  if (view === 'syllabus') {
    return (
      <>
        <StatusBar style="auto" />
        <SyllabusScreen navigation={backToAdmin} role={role} />
      </>
    )
  }
  if (view === 'transport') {
    return (
      <>
        <StatusBar style="auto" />
        <TransportScreen navigation={backToAdmin} role={role} />
      </>
    )
  }
  if (view === 'complaints') {
    return (
      <>
        <StatusBar style="auto" />
        <ComplaintsScreen navigation={backToAdmin} role={role} />
      </>
    )
  }
  if (view === 'calendar') {
    return (
      <>
        <StatusBar style="auto" />
        <CalendarScreen navigation={backToAdmin} role={role} />
      </>
    )
  }
  if (view === 'reports') {
    return (
      <>
        <StatusBar style="auto" />
        <ReportsScreen navigation={backToAdmin} />
      </>
    )
  }
  if (view === 'settings') {
    return (
      <>
        <StatusBar style="auto" />
        <SettingsScreen navigation={backToAdmin} role={role} />
      </>
    )
  }

  // ---- Admin dashboard (Management Hub — default) ----
  return (
    <>
      <StatusBar style="auto" />
      <DashboardScreen
        onOpenStudentView={role === 'student' ? undefined : () => setView('student')}
        onNavigate={role === 'admin' ? openAdmin : undefined}
      />
    </>
  )
}

// Boot / role-verification states (Fix: fail-open admin routing)
const styles = StyleSheet.create({
  bootFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  bootTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A237E',
    textAlign: 'center',
    marginBottom: 6,
  },
  bootText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  bootBtn: {
    marginTop: 18,
    backgroundColor: '#1A237E',
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
})
