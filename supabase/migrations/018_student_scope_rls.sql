-- 018_student_scope_rls.sql
-- NEW migration. Does NOT modify 001-017.
--
-- WHY THIS IS NEEDED (QA audit, confirmed):
--   001 created three student SELECT policies as `has_role('student') AND TRUE`,
--   which allowed EVERY authenticated student to read the ENTIRE school's:
--     1) homework   ("Homework can be viewed by students"  — 001)
--     2) timetable  ("Timetable can be viewed by students" — 001)
--     3) exams      ("Students can view exam schedule"    — 001)
--
-- FIX:
--   Replace only those three STUDENT policies with class-scoped access:
--   a student may read a row only when its class_id matches the class of the
--   student's own `students` row (students.profile_id = auth.uid()).
--
-- SAFETY:
--   - Re-runnable: DROP POLICY IF EXISTS + CREATE POLICY only. No DROP TABLE,
--     no DELETE, no TRUNCATE, no schema change.
--   - Admin access (002), teacher access (003/004), parent access (006/014),
--     notices (005), submissions (004) and every other policy are untouched.
--   - RLS stays enabled everywhere.

-- ============================================================
-- 1) HOMEWORK: students read only their own class's homework
-- ============================================================
DROP POLICY IF EXISTS "Homework can be viewed by students" ON public.homework;
DROP POLICY IF EXISTS "Students can view own class homework" ON public.homework;
CREATE POLICY "Students can view own class homework" ON public.homework
  FOR SELECT USING (
    has_role('student')
    AND class_id IN (
      SELECT id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- ============================================================
-- 2) TIMETABLE: students read only their own class's timetable
-- ============================================================
DROP POLICY IF EXISTS "Timetable can be viewed by students" ON public.timetable;
DROP POLICY IF EXISTS "Students can view own class timetable" ON public.timetable;
CREATE POLICY "Students can view own class timetable" ON public.timetable
  FOR SELECT USING (
    has_role('student')
    AND class_id IN (
      SELECT id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- ============================================================
-- 3) EXAMS: students read only their own class's exams
-- ============================================================
DROP POLICY IF EXISTS "Students can view exam schedule" ON public.exams;
DROP POLICY IF EXISTS "Students can view own class exams" ON public.exams;
CREATE POLICY "Students can view own class exams" ON public.exams
  FOR SELECT USING (
    has_role('student')
    AND class_id IN (
      SELECT id FROM public.students WHERE profile_id = auth.uid()
    )
  );

-- ============================================================
-- Policy preservation check (expected AFTER applying 018):
--   homework  : Admins can manage homework (002)
--               Teachers can manage homework for own classes (004)
--               Teachers can view homework in own classes (003)
--               Parents can view linked student homework (006)
--               Students can view own class homework (018)  <- NEW
--   timetable : Admins can manage timetable (002)
--               Teachers can view timetable in own classes (003)
--               Parents can view linked child timetable (006)
--               Students can view own class timetable (018)  <- NEW
--   exams     : Admins can manage exams (001)
--               Teachers can manage exams for own classes (001)
--               Parents can read linked child exams (014)
--               Students can view own class exams (018)      <- NEW
-- ============================================================
