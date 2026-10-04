-- 015_admin_students_read.sql
-- NEW migration. Does NOT modify 001-014.
--
-- SYMPTOM:
--   The admin CAN create students (rows exist in public.students), but the
--   Admin "Students Management" screen shows "No students found".
--
-- ROOT CAUSE (RLS, not code):
--   * The INSERT works because account creation goes through the
--     supabase/functions/create-student Edge Function, which writes with the
--     service role and therefore bypasses RLS entirely.
--   * The list screen then SELECTs as the signed-in admin user, where RLS is
--     the only gate. public.students currently has:
--         - "Students can view own record"      (001:273)
--         - "Parents can view linked students"  (006)
--       and NO policy granting the admin role a SELECT. With RLS enabled and
--       no matching policy, Postgres returns zero rows -> "No students found".
--   (001:270 already runs ALTER TABLE students ENABLE ROW LEVEL SECURITY.)
--
-- FIX:
--   One new, read-only SELECT policy for the admin role, gated by the existing
--   secure helper public.has_role('admin'), which resolves to
--   profiles.role = 'admin' for the current auth.uid().
--   public.has_role is SECURITY DEFINER and reads ONLY public.profiles, so it
--   cannot re-enter public.students -> no policy recursion (no 42P17 cycle),
--   and no profiles policy is created or changed by this file.
--
-- WHAT THIS DOES NOT DO:
--   - does not disable or weaken RLS (students stays ENABLE ROW LEVEL SECURITY)
--   - does not drop, edit, or replace any existing policy
--     ("Students can view own record" and "Parents can view linked students" stay)
--   - grants SELECT to authenticated only; anon is not granted anything
--   - grants no INSERT/UPDATE/DELETE to anyone
--   - uses no service_role, no credentials, no passwords, no functions
--   - does not modify migrations 001-014
--
-- NAME CHOICE (important):
--   002_admin_access_policies.sql:14-16 already declares a broader policy
--   "Admins can manage students" (FOR ALL), but it is not present in this
--   database. This file deliberately uses the distinct name
--   "Admins can view students" so that:
--     - it cannot collide with 002, and
--     - if 002 is applied later, this SELECT-only policy can never downgrade
--       admin's write rights (policies are OR-ed together).
--
-- APPLY ORDER: any time after 001 (needs public.has_role). Safe to run once;
-- also re-runnable (DROP POLICY IF EXISTS + CREATE POLICY, no destructive SQL).
-- Run manually in the Supabase SQL Editor.

-- Read-only SELECT for the admin role on public.students
DROP POLICY IF EXISTS "Admins can view students" ON public.students;

CREATE POLICY "Admins can view students" ON public.students
  FOR SELECT
  TO authenticated
  USING (public.has_role('admin'));

-- ============================================================
-- Read-only verification (run manually, nothing is executed by this file)
-- ============================================================
-- 1) Expect a row with polname = 'Admins can view students',
--    cmd = 'SELECT', roles = {authenticated}:
--      SELECT polname, cmd, roles, qual
--        FROM pg_policies
--       WHERE schemaname = 'public' AND tablename = 'students'
--       ORDER BY polname;
--
-- 2) Expect RLS still enabled (relrowsecurity = t):
--      SELECT relrowsecurity
--        FROM pg_class
--       WHERE oid = 'public.students'::regclass;
--
-- 3) As the signed-in admin, expect the real row count (> 0):
--      SELECT count(*) FROM public.students;
