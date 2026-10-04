-- 010_academic_calendar.sql
-- NEW migration. Does NOT modify 001-006.
-- Adds the Academic Calendar module (no calendar table existed).
--
-- Security: RLS on every policy.
--   admin   -> full manage (create/edit/delete/publish)
--   others  -> read PUBLISHED events addressed to them or to everyone
--              audience: 'all' | 'student' | 'teacher' | 'parent' | 'admin'

CREATE TABLE IF NOT EXISTS academic_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  end_date DATE,
  event_type TEXT NOT NULL DEFAULT 'General',
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'student', 'teacher', 'parent', 'admin')),
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON academic_calendar(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_year ON academic_calendar(academic_year);
CREATE INDEX IF NOT EXISTS idx_calendar_published ON academic_calendar(is_published);

ALTER TABLE academic_calendar ENABLE ROW LEVEL SECURITY;

-- Admin: full management
DROP POLICY IF EXISTS "Admins can manage academic calendar" ON academic_calendar;
CREATE POLICY "Admins can manage academic calendar" ON academic_calendar
  FOR ALL USING (has_role('admin'));

-- Students: published events for them or for everyone
DROP POLICY IF EXISTS "Students can view calendar" ON academic_calendar;
CREATE POLICY "Students can view calendar" ON academic_calendar
  FOR SELECT USING (
    has_role('student')
    AND is_published
    AND (audience = 'all' OR audience = 'student')
  );

-- Teachers: published events for them or for everyone
DROP POLICY IF EXISTS "Teachers can view calendar" ON academic_calendar;
CREATE POLICY "Teachers can view calendar" ON academic_calendar
  FOR SELECT USING (
    has_role('teacher')
    AND is_published
    AND (audience = 'all' OR audience = 'teacher')
  );

-- Parents: published events for them or for everyone
DROP POLICY IF EXISTS "Parents can view calendar" ON academic_calendar;
CREATE POLICY "Parents can view calendar" ON academic_calendar
  FOR SELECT USING (
    has_role('parent')
    AND is_published
    AND (audience = 'all' OR audience = 'parent')
  );
