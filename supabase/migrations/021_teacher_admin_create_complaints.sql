-- 021_teacher_admin_create_complaints.sql
-- NEW migration. Does NOT modify migrations 001-020 and does NOT modify or
-- drop any existing complaints policy.
--
-- REQUIREMENT: Every Teacher and every Admin can ADD a complaint.
--
-- CURRENT STATE (from inspection of 009_complaints.sql):
--   * Admin  : "Admins can manage complaints" (009:37-39) is FOR ALL, so admin
--              INSERT already works through RLS -> NO admin policy added here.
--   * Teacher: 009 grants teachers only SELECT (009:61-69) and UPDATE
--              (009:72-87) for own-homeroom students' complaints.
--              There is NO teacher INSERT policy -> INSERT was default-denied.
--   * Student : 009:42-58 SELECT/INSERT own complaints -> untouched below.
--   * Parent  : 009:90-99 SELECT linked child only -> untouched below.
--
-- WHAT THIS DOES (exactly two new permissive policies, as specified):
--   1. Teachers can INSERT a staff complaint, server-side enforced:
--        - caller really has role 'teacher' (public.has_role, never client-side)
--        - created_by = auth.uid()      (a teacher can only file as themself)
--        - student_id IS NULL           (staff complaint, not tied to a student)
--        - status = 'Pending'           (cannot self-approve)
--        - response IS NULL             (no response at creation)
--   2. Teachers can SELECT the complaints they created. Needed because the
--      existing teacher SELECT policy (009:61-69) only covers complaints whose
--      student_id belongs to their homeroom class — a student_id NULL staff
--      complaint would otherwise be invisible to its own creator.
--
-- WHAT THIS DOES NOT DO:
--   - does not modify/drop 009's admin, student, or parent policies
--   - does not change complaint viewing/responding/filtering for any role
--     (teacher UPDATE policy 009:72-87 stays homeroom-student scoped)
--   - does not add an admin INSERT policy (009 FOR ALL already covers it)
--   - does not disable RLS (complaints stays ENABLE ROW LEVEL SECURITY)
--   - does not touch schema, other tables, App.js, auth, or the client
--   - uses no service_role
--
-- SAFETY: permissive (OR-ed) additions; has_role('teacher') is false for
-- admin/student/parent, so these two policies grant them nothing new.
-- public.has_role is SECURITY DEFINER (001, re-created 013) -> no recursion.
--
-- Re-runnable: DROP POLICY IF EXISTS + CREATE POLICY only. No destructive SQL.
-- Run manually in the Supabase SQL Editor after 009.

-- 1. Teacher: create a staff complaint (enforced by RLS, not just UI)
DROP POLICY IF EXISTS "Teachers can create complaints" ON public.complaints;

CREATE POLICY "Teachers can create complaints" ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role('teacher')
    AND created_by = auth.uid()
    AND student_id IS NULL
    AND status = 'Pending'
    AND response IS NULL
  );

-- 2. Teacher: view the complaints they created (creator visibility)
DROP POLICY IF EXISTS "Teachers can view complaints they created" ON public.complaints;

CREATE POLICY "Teachers can view complaints they created" ON public.complaints
  FOR SELECT TO authenticated
  USING (
    public.has_role('teacher')
    AND created_by = auth.uid()
  );

-- ============================================================
-- Read-only verification (run manually; nothing below executes here)
--
-- 1. Exactly two NEW policies exist; all 009 policies still present:
--      SELECT polname, cmd, roles FROM pg_policies
--        WHERE schemaname = 'public' AND tablename = 'complaints'
--        ORDER BY polname;
--      Expected names include (unchanged): Admins can manage complaints,
--      Students can view own complaints, Students can create own complaints,
--      Teachers can view class complaints, Teachers can respond to class
--      complaints, Parents can view linked child complaints — plus the two NEW.
--
-- 2. RLS still enabled:
--      SELECT relrowsecurity FROM pg_class
--        WHERE oid = 'public.complaints'::regclass;   -- expect = t
--
-- 3. As a signed-in teacher: INSERT with created_by = self, student_id NULL,
--    status 'Pending', response NULL -> succeeds; any row with
--    created_by <> auth.uid() or student_id NOT NULL -> rejected.
-- ============================================================
