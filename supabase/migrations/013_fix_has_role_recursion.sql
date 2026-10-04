-- 013_fix_has_role_recursion.sql
-- NEW migration. Does NOT modify 001-012. RLS is never disabled.
--
-- ERROR FIXED: 42P17  infinite recursion detected in policy for relation profiles
--
-- Cycle 1:  profiles policy -> has_role() -> SELECT public.profiles
--           -> profiles policy -> has_role() -> ...
-- Cycle 2:  profiles policy (006) -> subquery on students
--           -> students policy (001:274) -> subquery on profiles -> ...

-- ============================================================
-- 1. Re-create has_role as an unambiguously non-reentrant function
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER                 -- body runs as the FUNCTION OWNER, not the caller
SET search_path = ''             -- no object shadowing; body is fully qualified below
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = role_name
  );
END;
$$;

-- ============================================================
-- 2. Make the function owner identical to the profiles table owner
--    (this is what actually guarantees RLS is skipped inside the body)
-- ============================================================
DO $$
DECLARE
  tbl_owner name;
  fn_owner  name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO tbl_owner
  FROM pg_class WHERE oid = 'public.profiles'::regclass;

  SELECT pg_get_userbyid(proowner) INTO fn_owner
  FROM pg_proc  WHERE oid = to_regprocedure('public.has_role(text)');

  IF fn_owner IS DISTINCT FROM tbl_owner THEN
    EXECUTE format('ALTER FUNCTION public.has_role(text) OWNER TO %I', tbl_owner);
  END IF;
END $$;

-- ============================================================
-- 3. Keep RLS ENABLED on profiles, but never apply it to the owner
--    ENABLE  = RLS stays on for every normal role (constraint 1)
--    NO FORCE= owner exemption restored          (constraint 2: not a disable)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles NO FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Remove the only two policy subqueries that re-enter profiles
--    (001:274 and 001:300). Equivalent expressions - see note below.
--    No profiles policy is dropped; roles checks are unchanged.
-- ============================================================
DROP POLICY IF EXISTS "Students can view own record" ON public.students;
CREATE POLICY "Students can view own record" ON public.students
  FOR SELECT USING (has_role('student') AND profile_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can view own record" ON public.teachers;
CREATE POLICY "Teachers can view own record" ON public.teachers
  FOR SELECT USING (has_role('teacher') AND profile_id = auth.uid());
