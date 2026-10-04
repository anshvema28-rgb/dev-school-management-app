-- 014_parent_classes_exams_read.sql
-- NEW migration. Does NOT modify 001-013.
--
-- WHY THIS IS NEEDED (functional, not cosmetic):
--   Migration 006 gave parents read access to their linked children's rows
--   (students, attendance, results, fees, homework, timetable, homework_submissions),
--   but two lookup tables those rows point at still have NO parent policy:
--
--   * classes — policies in 001 are only: admins (001:59), teachers of the
--     class (001:62) and assigned students (001:65). A parent gets 0 rows.
--     Result: every class name rendered for a parent is blank
--     (parent dashboard child cards, SubjectsScreen and SyllabusScreen class labels).
--
--   * exams — policies in 001 are only: admins (001:200), own-class teachers
--     (001:203) and all students (001:206). A parent gets 0 rows.
--     Result: every exam title on the parent Results section is blank.
--
-- WHAT THIS DOES (smallest possible change):
--   Adds exactly two read-only SELECT policies, both following the same
--   `has_role('parent') AND <subquery>` pattern already used throughout 006-011:
--
--   1. classes: only classes the parent's linked children are enrolled in.
--   2. exams:   only exams belonging to those classes.
--
-- WHAT IT DOES NOT DO:
--   - does not disable or weaken RLS (both tables stay ENABLE ROW LEVEL SECURITY)
--   - does not touch the profiles table or any existing policy (no policy is dropped)
--   - grants no INSERT/UPDATE/DELETE to parents (read-only)
--   - introduces no functions, no service_role, no credentials, no passwords
--   - does not modify migrations 001-013
--
-- RECURSION SAFETY (42P17):
--   The subqueries go students -> parent_students, which terminate without
--   returning to classes, and every predicate starts with has_role('parent')
--   (false for non-parents), the same guard pattern 006-011 already rely on.
--
-- APPLY ORDER: after 006 (needs parent_students) and after 013.
-- Re-runnable: DROP POLICY IF EXISTS + CREATE POLICY only. No destructive SQL.

-- 1. classes: parents may read the classes of their linked children
DROP POLICY IF EXISTS "Parents can read linked child classes" ON classes;
CREATE POLICY "Parents can read linked child classes" ON classes
  FOR SELECT USING (
    has_role('parent')
    AND id IN (
      SELECT s.class_id
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
        AND s.class_id IS NOT NULL
    )
  );

-- 2. exams: parents may read exams scheduled for those classes
DROP POLICY IF EXISTS "Parents can read linked child exams" ON exams;
CREATE POLICY "Parents can read linked child exams" ON exams
  FOR SELECT USING (
    has_role('parent')
    AND class_id IN (
      SELECT s.class_id
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
        AND s.class_id IS NOT NULL
    )
  );

-- Read-only verification (expect: classes = 1 row, exams = 1 row; both 'parent'):
--   SELECT polname, cmd, qual FROM pg_policies
--    WHERE tablename IN ('classes','exams') AND schemaname='public'
--    ORDER BY tablename, polname;
