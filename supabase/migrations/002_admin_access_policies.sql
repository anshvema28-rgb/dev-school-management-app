-- 002_admin_access_policies.sql
-- Admin Management Hub: grants the admin role read/write access to the tables
-- that 001_initial_schema.sql left without an admin policy.
--
-- This is a NEW migration file. It does NOT modify 001_initial_schema.sql.
-- Run it in the Supabase SQL Editor (or `supabase db push`) after 001.
--
-- The Admin Dashboard queries these tables as the authenticated admin user.
-- Without these policies, RLS returns zero rows for admin on:
--   students, teachers, homework, timetable, notices
-- which would leave those hub sections empty.

-- 1. students --
DROP POLICY IF EXISTS "Admins can manage students" ON students;
CREATE POLICY "Admins can manage students" ON students
  FOR ALL USING (has_role('admin'));

-- 2. teachers --
DROP POLICY IF EXISTS "Admins can manage teachers" ON teachers;
CREATE POLICY "Admins can manage teachers" ON teachers
  FOR ALL USING (has_role('admin'));

-- 3. homework --
DROP POLICY IF EXISTS "Admins can manage homework" ON homework;
CREATE POLICY "Admins can manage homework" ON homework
  FOR ALL USING (has_role('admin'));

-- 4. timetable --
DROP POLICY IF EXISTS "Admins can manage timetable" ON timetable;
CREATE POLICY "Admins can manage timetable" ON timetable
  FOR ALL USING (has_role('admin'));

-- 5. notices --
DROP POLICY IF EXISTS "Admins can manage notices" ON notices;
CREATE POLICY "Admins can manage notices" ON notices
  FOR ALL USING (has_role('admin'));
