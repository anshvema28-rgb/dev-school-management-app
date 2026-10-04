import React, { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
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
import ExamsScreen from './ExamsScreen'
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
  const [view, setView] = useState('admin') // 'admin' | 'student' | 'teacher' | admin sub-views
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
  // The default stays the Admin Dashboard, so nothing existing breaks.
  useEffect(() => {
    if (!user) {
      setRole(null)
      setView('admin')
      navigatedByUser.current = false // fresh session starts on its own dashboard
      return
    }

    let active = true

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
        console.log('[App] profile role resolved:', r || '(none)')
        setRole(r)
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
      } catch (e) {
        if (!active) return
        setRole(null)
        if (!navigatedByUser.current) setView('admin')
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
    console.log('[App] openAdmin ->', screen)
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
            role === 'admin' || role === null ? () => setView('teachers') : undefined
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
        onNavigate={role === 'admin' || role === null ? openAdmin : undefined}
      />
    </>
  )
}
