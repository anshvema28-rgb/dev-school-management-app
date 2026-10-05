-- 019_fix_student_class_scope_rls.sql
-- Correct student class-scoped RLS policies.
-- Does NOT modify migrations 001-018.

DROP POLICY IF EXISTS "Students can view own class homework" ON public.homework;

CREATE POLICY "Students can view own class homework"
ON public.homework
FOR SELECT
TO authenticated
USING (
  public.has_role('student')
  AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.profile_id = auth.uid()
      AND s.class_id = public.homework.class_id
  )
);

DROP POLICY IF EXISTS "Students can view own class timetable" ON public.timetable;

CREATE POLICY "Students can view own class timetable"
ON public.timetable
FOR SELECT
TO authenticated
USING (
  public.has_role('student')
  AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.profile_id = auth.uid()
      AND s.class_id = public.timetable.class_id
  )
);

DROP POLICY IF EXISTS "Students can view own class exams" ON public.exams;

CREATE POLICY "Students can view own class exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  public.has_role('student')
  AND EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.profile_id = auth.uid()
      AND s.class_id = public.exams.class_id
  )
);