-- 012_staff_directory.sql
-- NEW migration. Does NOT modify 001-011.
--
-- WHY THIS IS NEEDED:
--   001 only lets each role read its OWN profiles row (plus admins reading
--   everything, and parents reading linked children). So a Staff Directory
--   requested for students/teachers would return an EMPTY list, because no
--   policy lets a student read a teacher's profile row.
--
-- SOLUTION: a narrow read-only VIEW that exposes ONLY non-sensitive columns
--   (id, full_name, role) for staff members. No email, no phone, no password,
--   no tokens. The view is granted to `authenticated` only.
--
--   Views run with the view owner's rights, so this deliberately bypasses the
--   profiles RLS *only* for these three harmless columns. Adding a plain
--   profiles SELECT policy instead would expose every staff email/phone to
--   every signed-in student, which is unnecessary PII exposure.

CREATE OR REPLACE VIEW public.staff_directory AS
SELECT
  p.id,
  p.full_name,
  p.role
FROM public.profiles p
WHERE p.role IN ('teacher', 'admin');

-- Explicit grants: signed-in users only.
GRANT SELECT ON public.staff_directory TO authenticated;
REVOKE ALL ON public.staff_directory FROM anon;

-- Helpful index behind the view's role filter already exists in 001
-- (idx_profiles_role). Nothing else to change.
