-- 004_homework_submissions.sql
-- Complete homework workflow: individual student submissions + teacher grading.
--
-- This is a NEW migration file. It does NOT modify 001/002/003.
-- Run it in the Supabase SQL Editor (or `supabase db push`) after 001-003.
--
-- Why: the `homework` table only has a single `submitted_by UUID` column,
-- which cannot represent individual submissions from many students. This
-- migration adds a proper one-to-many `homework_submissions` table.
--
-- Safe & idempotent: uses IF NOT EXISTS / DROP POLICY IF EXISTS only.
-- No DROP TABLE, no TRUNCATE, no DELETE FROM.

-- 1. homework_submissions table --
CREATE TABLE IF NOT EXISTS homework_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homework_id UUID REFERENCES homework(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  submission_text TEXT,
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded')),
  marks_obtained DECIMAL(5, 2),
  teacher_feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes --
CREATE INDEX IF NOT EXISTS idx_hw_sub_homework ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_hw_sub_student ON homework_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_hw_sub_status ON homework_submissions(status);

-- 3. One submission per student per homework --
CREATE UNIQUE INDEX IF NOT EXISTS idx_hw_sub_unique
  ON homework_submissions(homework_id, student_id);

-- 4. Enable RLS --
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies --

-- Students can view their OWN submissions
DROP POLICY IF EXISTS "Students can view own submissions" ON homework_submissions;
CREATE POLICY "Students can view own submissions" ON homework_submissions
  FOR SELECT USING (
    has_role('student')
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
  );

-- Students can insert their OWN submissions
DROP POLICY IF EXISTS "Students can insert own submissions" ON homework_submissions;
CREATE POLICY "Students can insert own submissions" ON homework_submissions
  FOR INSERT WITH CHECK (
    has_role('student')
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
  );

-- Students can update their OWN submission (e.g. resubmit before grading)
DROP POLICY IF EXISTS "Students can update own submission" ON homework_submissions;
CREATE POLICY "Students can update own submission" ON homework_submissions
  FOR UPDATE USING (
    has_role('student')
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
  );

-- Teachers can view submissions for homework in their OWN classes
DROP POLICY IF EXISTS "Teachers can view class submissions" ON homework_submissions;
CREATE POLICY "Teachers can view class submissions" ON homework_submissions
  FOR SELECT USING (
    has_role('teacher')
    AND homework_id IN (
      SELECT id FROM homework WHERE class_id IN (
        SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid()
      )
    )
  );

-- Teachers can grade submissions for homework in their OWN classes
DROP POLICY IF EXISTS "Teachers can grade class submissions" ON homework_submissions;
CREATE POLICY "Teachers can grade class submissions" ON homework_submissions
  FOR UPDATE USING (
    has_role('teacher')
    AND homework_id IN (
      SELECT id FROM homework WHERE class_id IN (
        SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid()
      )
    )
  );

-- Admins can manage all submissions
DROP POLICY IF EXISTS "Admins can manage submissions" ON homework_submissions;
CREATE POLICY "Admins can manage submissions" ON homework_submissions
  FOR ALL USING (has_role('admin'));

-- 6. Teacher write access to homework (needed for teacher homework management) --
DROP POLICY IF EXISTS "Teachers can manage homework for own classes" ON homework;
CREATE POLICY "Teachers can manage homework for own classes" ON homework
  FOR ALL USING (
    has_role('teacher')
    AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
  );
