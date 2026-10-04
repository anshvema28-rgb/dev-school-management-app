-- 007_syllabus.sql
-- NEW migration. Does NOT modify 001-006.
-- Adds the Syllabus module (there was no table that could hold syllabus data).
--
-- Security: RLS enabled + policies for every role.
--   admin   -> full manage
--   teacher -> read syllabus for their own homeroom classes
--   student -> read PUBLISHED syllabus for their own class only
--   parent  -> read PUBLISHED syllabus for a linked child's class

CREATE TABLE IF NOT EXISTS syllabus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syllabus_class ON syllabus(class_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_subject ON syllabus(subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_year ON syllabus(academic_year);
CREATE INDEX IF NOT EXISTS idx_syllabus_published ON syllabus(is_published);

ALTER TABLE syllabus ENABLE ROW LEVEL SECURITY;

-- Admin: full management
DROP POLICY IF EXISTS "Admins can manage syllabus" ON syllabus;
CREATE POLICY "Admins can manage syllabus" ON syllabus
  FOR ALL USING (has_role('admin'));

-- Teacher: read syllabus for own homeroom classes
DROP POLICY IF EXISTS "Teachers can view own class syllabus" ON syllabus;
CREATE POLICY "Teachers can view own class syllabus" ON syllabus
  FOR SELECT USING (
    has_role('teacher')
    AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
  );

-- Student: read published syllabus for own class only
DROP POLICY IF EXISTS "Students can view own class syllabus" ON syllabus;
CREATE POLICY "Students can view own class syllabus" ON syllabus
  FOR SELECT USING (
    has_role('student')
    AND is_published
    AND class_id = (SELECT class_id FROM students WHERE profile_id = auth.uid())
  );

-- Parent: read published syllabus for a linked child's class
DROP POLICY IF EXISTS "Parents can view linked child syllabus" ON syllabus;
CREATE POLICY "Parents can view linked child syllabus" ON syllabus
  FOR SELECT USING (
    has_role('parent')
    AND is_published
    AND class_id IN (
      SELECT s.class_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );
