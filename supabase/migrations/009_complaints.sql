-- 009_complaints.sql
-- NEW migration. Does NOT modify 001-006.
-- Adds the Complaint / ticket system (no complaints table existed).
--
-- Security: RLS on every policy.
--   student -> CREATE complaints for themselves, READ only their own
--              (no UPDATE: a student can never change status/response,
--               and can never read another student's complaint)
--   teacher -> READ/UPDATE only complaints from students in their own
--              homeroom classes (respond + set status)
--   admin   -> full manage + filter + respond
--   parent  -> read-only view of a linked child's complaints

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'In Review', 'Resolved', 'Rejected')),
  response TEXT,
  responded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_by ON complaints(created_by);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- Admin: full management
DROP POLICY IF EXISTS "Admins can manage complaints" ON complaints;
CREATE POLICY "Admins can manage complaints" ON complaints
  FOR ALL USING (has_role('admin'));

-- Student: read own complaints only
DROP POLICY IF EXISTS "Students can view own complaints" ON complaints;
CREATE POLICY "Students can view own complaints" ON complaints
  FOR SELECT USING (
    has_role('student')
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
  );

-- Student: create a complaint for themselves only
DROP POLICY IF EXISTS "Students can create own complaints" ON complaints;
CREATE POLICY "Students can create own complaints" ON complaints
  FOR INSERT WITH CHECK (
    has_role('student')
    AND created_by = auth.uid()
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
    AND status = 'Pending'
    AND response IS NULL
  );

-- Teacher: read complaints from students in own homeroom classes
DROP POLICY IF EXISTS "Teachers can view class complaints" ON complaints;
CREATE POLICY "Teachers can view class complaints" ON complaints
  FOR SELECT USING (
    has_role('teacher')
    AND student_id IN (
      SELECT id FROM students
      WHERE class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
    )
  );

-- Teacher: respond / update status for those same complaints
DROP POLICY IF EXISTS "Teachers can respond to class complaints" ON complaints;
CREATE POLICY "Teachers can respond to class complaints" ON complaints
  FOR UPDATE USING (
    has_role('teacher')
    AND student_id IN (
      SELECT id FROM students
      WHERE class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
    )
  )
  WITH CHECK (
    has_role('teacher')
    AND student_id IN (
      SELECT id FROM students
      WHERE class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())
    )
  );

-- Parent: read-only view of linked child's complaints
DROP POLICY IF EXISTS "Parents can view linked child complaints" ON complaints;
CREATE POLICY "Parents can view linked child complaints" ON complaints
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );
