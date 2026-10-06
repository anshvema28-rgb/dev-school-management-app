-- 020_teacher_any_class_homework.sql
-- NEW migration. Does NOT modify migrations 001-019.
--
-- REQUIREMENT: Every authenticated teacher must be able to ADD homework for
-- ANY class in the school (e.g. the Class 5-A teacher creates homework for
-- Class 8-A), not only for their own homeroom / Class Teacher class.
--
-- WHY THIS IS NEEDED (current state, confirmed):
--   * classes: 003_teacher_access_policies.sql:22-24 lets a teacher SELECT
--     only classes where homeroom_teacher_id = auth.uid(). A teacher therefore
--     sees an EMPTY (or single-class) list in the HomeworkScreen class picker.
--   * homework: 004_homework_submissions.sql:98-103 is
--         FOR ALL USING (has_role('teacher') AND class_id IN (own homeroom)).
--     For INSERT, Postgres applies that USING as the WITH CHECK, so an INSERT
--     targeting any other class fails RLS.
--
-- WHAT THIS DOES (exactly two new permissive policies):
--   1. classes   : teacher SELECT on all class rows (needed for the homework
--                  class dropdown). Contains no student/parent data.
--   2. homework  : teacher INSERT for ANY class, WITH CHECK requiring
--                  (a) the caller really has role 'teacher' (server-side via
--                      public.has_role — never client-side), and
--                  (b) the referenced class actually EXISTS in public.classes
--                      (blocks forged / NULL class_id; the FK would also
--                      reject it, but the policy validates it explicitly).
--
-- WHAT THIS DOES NOT DO:
--   - does NOT broaden teacher homework UPDATE / DELETE: 004's
--     "Teachers can manage homework for own classes" stays homeroom-only
--     (a teacher can add homework anywhere but only edit/delete their own
--     class's homework).
--   - does NOT change teacher homework SELECT: 003/004 remain homeroom-scoped.
--   - does NOT change Admin policies (002 etc. untouched).
--   - does NOT change Student policies (001 homework SELECT, 018/019
--     class-scoped student homework read) or Parent policies (006) — student
--     and parent data isolation is unchanged.
--   - does NOT change students / homework_submissions / attendance policies.
--   - does NOT disable RLS (both tables stay ENABLE ROW LEVEL SECURITY).
--   - does NOT change schema, functions, or add service_role usage.
--
-- SECURITY NOTES:
--   - Policies are permissive and OR-ed: existing stricter policies remain.
--     has_role('teacher') is false for admin/student/parent, so these two
--     policies grant those roles nothing new.
--   - public.has_role is SECURITY DEFINER (001, re-created 013) and reads only
--     public.profiles, so it cannot recurse. The EXISTS subquery targets
--     public.classes, whose policies never reference homework -> no 42P17
--     policy cycle.
--
-- APPLY ORDER: after 001 (needs public.has_role) and after 003/004.
-- Re-runnable: DROP POLICY IF EXISTS + CREATE POLICY only. No destructive SQL.
-- Run manually in the Supabase SQL Editor.

-- 1. classes: authenticated teachers may read all classes (dropdown data)
DROP POLICY IF EXISTS "Teachers can view all classes" ON public.classes;

CREATE POLICY "Teachers can view all classes" ON public.classes
  FOR SELECT
  TO authenticated
  USING (public.has_role('teacher'));

-- 2. homework: authenticated teachers may INSERT homework for any EXISTING class
DROP POLICY IF EXISTS "Teachers can create homework for any class" ON public.homework;

CREATE POLICY "Teachers can create homework for any class" ON public.homework
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role('teacher')
    AND EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.id = public.homework.class_id
    )
  );

-- ============================================================
-- Read-only verification (run manually; nothing below executes here)
--
-- 1. New policies present, RLS still enabled:
--      SELECT polname, cmd, roles FROM pg_policies
--        WHERE schemaname = 'public'
--          AND ((tablename = 'classes'   AND polname = 'Teachers can view all classes')
--            OR (tablename = 'homework'  AND polname = 'Teachers can create homework for any class'))
--        ORDER BY tablename, polname;
--      SELECT relrowsecurity FROM pg_class
--        WHERE oid IN ('public.classes'::regclass, 'public.homework'::regclass);
--
-- 2. Expected homework policies AFTER applying 020 (none dropped):
--      Admins can manage homework                     (002)
--      Teachers can view homework in own classes      (003, SELECT, homeroom)
--      Teachers can manage homework for own classes   (004, UPDATE/DELETE homeroom)
--      Teachers can create homework for any class     (020, INSERT, any class) <- NEW
--      Parents can view linked student homework       (006)
--      Students can view own class homework           (019, replaces 018/001)
--
-- 3. As a signed-in teacher, expect the class dropdown query to return ALL
--    classes, and an INSERT for a non-homeroom class to succeed; a hand-crafted
--    INSERT with a nonexistent class_id must fail the policy.
-- ============================================================
