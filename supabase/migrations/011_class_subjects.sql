-- 011_class_subjects.sql
-- NEW migration. Does NOT modify 001-006.
-- WHY THIS IS NEEDED:
--   The existing `subjects` table (001) has NO class or teacher link, and the
--   `timetable` table only stores a schedule (not "subject X is taught in
--   class Y by teacher Z"). So "assign subject to class / teacher",
--   "student: subjects for my class" and "teacher: my assigned subjects"
--   could not be supported by the existing schema.
--   This is a JOIN table — it does NOT duplicate the subjects table.
--
-- Security: RLS on every policy.
--   admin   -> full manage
--   student -> read assignments for their OWN class
--   teacher -> read their own assignments + assignments of their homeroom class
--   parent  -> read assignments of a linked child's class
--   teachers/students can never reassign subjects (read-only for them).

CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (class_id, subject_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);

ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

-- Admin: full management
DROP POLICY IF EXISTS "Admins can manage class_subjects" ON class_subjects;
CREATE POLICY "Admins can manage class_subjects" ON class_subjects
  FOR ALL USING (has_role('admin'));

-- Student: read subjects assigned to their own class
DROP POLICY IF EXISTS "Students can view own class subjects" ON class_subjects;
CREATE POLICY "Students can view own class subjects" ON class_subjects
  FOR SELECT USING (
    has_role('student')
    AND class_id = (SELECT class_id FROM students WHERE profile_id = auth.uid())
  );

-- Teacher: read own assignments and their homeroom class assignments
DROP POLICY IF EXISTS "Teachers can view own subjects" ON class_subjects;
CREATE POLICY "Teachers can view own subjects" ON class_subjects
  FOR SELECT USING (
    has_role('teacher')
    AND (
      teacher_id = auth.uid()
      OR class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
    )
  );

-- Parent: read assignments of a linked child's class
DROP POLICY IF EXISTS "Parents can view linked child subjects" ON class_subjects;
CREATE POLICY "Parents can view linked child subjects" ON class_subjects
  FOR SELECT USING (
    has_role('parent')
    AND class_id IN (
      SELECT s.class_id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );
