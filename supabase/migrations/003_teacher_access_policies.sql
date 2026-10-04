-- 003_teacher_access_policies.sql
-- Teacher Dashboard: grants teachers access to data for their OWN classes only.
--
-- This is a NEW migration file. It does NOT modify 001_initial_schema.sql.
-- Run it in the Supabase SQL Editor (or `supabase db push`) after 001 and 002.
--
-- Why this file exists:
--   * 001's "Teachers can read own classes" policy on `classes` is broken:
--     it reads `id = homeroom_teacher_id` (compares a class UUID to a teacher
--     profile UUID, which is never true). It is dropped and recreated correctly
--     below as `homeroom_teacher_id = auth.uid()`.
--   * 001 has NO teacher policies on `students`, `homework`, or `timetable`,
--     so the Teacher Dashboard cannot load those sections.
--
-- Already correct in 001 (do NOT duplicate):
--   attendance, exams, results, notices  -> teacher policies exist and are correct.
--
-- Teachers are never granted admin access: every policy below is scoped by
-- has_role('teacher') AND the teacher's own homeroom classes.

-- 1. FIX the broken classes policy from 001 --
DROP POLICY IF EXISTS "Teachers can read own classes" ON classes;
CREATE POLICY "Teachers can read own classes" ON classes
  FOR SELECT USING (has_role('teacher') AND homeroom_teacher_id = auth.uid());

-- 2. students: teachers can read students belonging to their own classes --
DROP POLICY IF EXISTS "Teachers can view students in own classes" ON students;
CREATE POLICY "Teachers can view students in own classes" ON students
  FOR SELECT USING (
    has_role('teacher')
    AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
  );

-- 3. homework: teachers can read homework for their own classes --
DROP POLICY IF EXISTS "Teachers can view homework in own classes" ON homework;
CREATE POLICY "Teachers can view homework in own classes" ON homework
  FOR SELECT USING (
    has_role('teacher')
    AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
  );

-- 4. timetable: teachers can read timetable for their own classes --
DROP POLICY IF EXISTS "Teachers can view timetable in own classes" ON timetable;
CREATE POLICY "Teachers can view timetable in own classes" ON timetable
  FOR SELECT USING (
    has_role('teacher')
    AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
  );
