-- 006_parent_access.sql
-- Parent-student relationship + parent read access to linked children's data.
--
-- This is a NEW migration file. It does NOT modify 001-005.
-- Run it in the Supabase SQL Editor (or `supabase db push`) after 001-005.
--
-- WHY: there was no parent-to-student relationship table. The students table
-- only has free-text parent_name / parent_phone columns, which cannot enforce
-- that a parent sees ONLY their own children.
--
-- This migration:
--   1. Creates the parent_students relationship table.
--   2. Adds RLS so parents can only see their OWN relationships.
--   3. Grants parents SELECT-only access to their linked children's data
--      (students, profiles, attendance, results, homework, submissions,
--      fees, timetable).
--
-- Parents get NO write access to any school data.
-- Safe & idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS only.
-- No DROP TABLE, no DELETE, no TRUNCATE.

-- ============================================================
-- 1. parent_students table
-- ============================================================
CREATE TABLE IF NOT EXISTS parent_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  relationship TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One relationship per (parent, student) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_students_unique
  ON parent_students(parent_id, student_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_parent ON parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students(student_id);

ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;

-- Admin: full access to relationships
DROP POLICY IF EXISTS "Admins can manage parent_students" ON parent_students;
CREATE POLICY "Admins can manage parent_students" ON parent_students
  FOR ALL USING (has_role('admin'));

-- Parent: view ONLY their own relationships
DROP POLICY IF EXISTS "Parents can view own relationships" ON parent_students;
CREATE POLICY "Parents can view own relationships" ON parent_students
  FOR SELECT USING (has_role('parent') AND parent_id = auth.uid());

-- ============================================================
-- 2. Parent read access to linked children's data
-- ============================================================

-- profiles: parent can read linked students' profiles (for names)
DROP POLICY IF EXISTS "Parents can view linked student profiles" ON profiles;
CREATE POLICY "Parents can view linked student profiles" ON profiles
  FOR SELECT USING (
    has_role('parent')
    AND id IN (
      SELECT s.profile_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );

-- students: parent can read linked students' records
DROP POLICY IF EXISTS "Parents can view linked students" ON students;
CREATE POLICY "Parents can view linked students" ON students
  FOR SELECT USING (
    has_role('parent')
    AND id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- attendance: parent can read linked students' attendance
--   (attendance.student_id references profiles.id)
DROP POLICY IF EXISTS "Parents can view linked student attendance" ON attendance;
CREATE POLICY "Parents can view linked student attendance" ON attendance
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (
      SELECT s.profile_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );

-- results: parent can read linked students' results
--   (results.student_id references profiles.id)
DROP POLICY IF EXISTS "Parents can view linked student results" ON results;
CREATE POLICY "Parents can view linked student results" ON results
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (
      SELECT s.profile_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );

-- homework: parent can read homework for linked students' classes
DROP POLICY IF EXISTS "Parents can view linked student homework" ON homework;
CREATE POLICY "Parents can view linked student homework" ON homework
  FOR SELECT USING (
    has_role('parent')
    AND class_id IN (
      SELECT s.class_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );

-- homework_submissions: parent can read linked students' submissions
--   (homework_submissions.student_id references students.id)
DROP POLICY IF EXISTS "Parents can view linked student submissions" ON homework_submissions;
CREATE POLICY "Parents can view linked student submissions" ON homework_submissions
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- fees: parent can read linked students' fees
--   (fees.student_id references profiles.id)
DROP POLICY IF EXISTS "Parents can view linked student fees" ON fees;
CREATE POLICY "Parents can view linked student fees" ON fees
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (
      SELECT s.profile_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );

-- timetable: parent can read timetable for linked students' classes
DROP POLICY IF EXISTS "Parents can view linked student timetable" ON timetable;
CREATE POLICY "Parents can view linked student timetable" ON timetable
  FOR SELECT USING (
    has_role('parent')
    AND class_id IN (
      SELECT s.class_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );
