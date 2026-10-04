-- 005_notice_policies.sql
-- Fix the overly-permissive notices RLS policies from 001.
--
-- This is a NEW migration file. It does NOT modify 001-004.
-- Run it in the Supabase SQL Editor (or `supabase db push`) after 001-004.
--
-- PROBLEM: 001's policies were `has_role('student') AND TRUE` (and same for
-- teachers/parents), which let every authenticated user read ALL notices,
-- including DRAFTS and notices targeted at other audiences.
--
-- FIX: replace them with policies that only allow reading PUBLISHED notices
-- targeted at the user's own audience (or 'all'), and that have not expired.
--
-- Admin access is already provided by 002 ("Admins can manage notices").
--
-- Safe & idempotent: DROP POLICY IF EXISTS + CREATE POLICY only.
-- No DROP TABLE, no DELETE, no TRUNCATE.

-- 1. Students: published notices for 'all' or 'students', not expired --
DROP POLICY IF EXISTS "Notices can be viewed by students" ON notices;
CREATE POLICY "Students can view published student notices" ON notices
  FOR SELECT USING (
    has_role('student')
    AND is_published = true
    AND target_audience IN ('all', 'students')
    AND (expiry_date IS NULL OR expiry_date > now())
  );

-- 2. Teachers: published notices for 'all' or 'teachers', not expired --
DROP POLICY IF EXISTS "Notices can be viewed by teachers" ON notices;
CREATE POLICY "Teachers can view published teacher notices" ON notices
  FOR SELECT USING (
    has_role('teacher')
    AND is_published = true
    AND target_audience IN ('all', 'teachers')
    AND (expiry_date IS NULL OR expiry_date > now())
  );

-- 3. Parents: published notices for 'all' or 'parents', not expired --
DROP POLICY IF EXISTS "Notices can be viewed by parents" ON notices;
CREATE POLICY "Parents can view published parent notices" ON notices
  FOR SELECT USING (
    has_role('parent')
    AND is_published = true
    AND target_audience IN ('all', 'parents')
    AND (expiry_date IS NULL OR expiry_date > now())
  );
