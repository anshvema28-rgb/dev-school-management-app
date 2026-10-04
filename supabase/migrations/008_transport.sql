-- 008_transport.sql
-- NEW migration. Does NOT modify 001-006.
-- Adds the Transport module (no transport schema existed).
--
-- Tables:
--   transport_routes   -> a bus route (bus number + driver contact)
--   transport_stops    -> ordered stops on a route
--   transport_students -> which student uses which route/stop
--
-- Security: RLS on every table.
--   admin   -> full manage
--   student -> read their OWN assigned route + its stops
--   parent  -> read the route of a linked child
--   teacher -> read routes only (names/timetables; no personal data required)
-- Driver phone is only fetched by the admin client query on purpose.

CREATE TABLE IF NOT EXISTS transport_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  bus_number TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stop_order INTEGER NOT NULL DEFAULT 0,
  arrival_time TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES transport_stops(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (route_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_stops_route ON transport_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_transport_students_route ON transport_students(route_id);
CREATE INDEX IF NOT EXISTS idx_transport_students_student ON transport_students(student_id);

ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_students ENABLE ROW LEVEL SECURITY;

-- ===== routes =====
DROP POLICY IF EXISTS "Admins can manage transport routes" ON transport_routes;
CREATE POLICY "Admins can manage transport routes" ON transport_routes
  FOR ALL USING (has_role('admin'));

DROP POLICY IF EXISTS "Students can view own route" ON transport_routes;
CREATE POLICY "Students can view own route" ON transport_routes
  FOR SELECT USING (
    has_role('student')
    AND id IN (
      SELECT ts.route_id FROM transport_students ts
      JOIN students s ON s.id = ts.student_id
      WHERE s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Parents can view linked child route" ON transport_routes;
CREATE POLICY "Parents can view linked child route" ON transport_routes
  FOR SELECT USING (
    has_role('parent')
    AND id IN (
      SELECT ts.route_id FROM transport_students ts
      JOIN parent_students ps ON ps.student_id = ts.student_id
      WHERE ps.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can view routes" ON transport_routes;
CREATE POLICY "Teachers can view routes" ON transport_routes
  FOR SELECT USING (has_role('teacher'));

-- ===== stops =====
DROP POLICY IF EXISTS "Admins can manage transport stops" ON transport_stops;
CREATE POLICY "Admins can manage transport stops" ON transport_stops
  FOR ALL USING (has_role('admin'));

DROP POLICY IF EXISTS "Students can view own route stops" ON transport_stops;
CREATE POLICY "Students can view own route stops" ON transport_stops
  FOR SELECT USING (
    has_role('student')
    AND route_id IN (
      SELECT ts.route_id FROM transport_students ts
      JOIN students s ON s.id = ts.student_id
      WHERE s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Parents can view linked child route stops" ON transport_stops;
CREATE POLICY "Parents can view linked child route stops" ON transport_stops
  FOR SELECT USING (
    has_role('parent')
    AND route_id IN (
      SELECT ts.route_id FROM transport_students ts
      JOIN parent_students ps ON ps.student_id = ts.student_id
      WHERE ps.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers can view route stops" ON transport_stops;
CREATE POLICY "Teachers can view route stops" ON transport_stops
  FOR SELECT USING (has_role('teacher'));

-- ===== student assignments =====
DROP POLICY IF EXISTS "Admins can manage transport assignments" ON transport_students;
CREATE POLICY "Admins can manage transport assignments" ON transport_students
  FOR ALL USING (has_role('admin'));

DROP POLICY IF EXISTS "Students can view own transport assignment" ON transport_students;
CREATE POLICY "Students can view own transport assignment" ON transport_students
  FOR SELECT USING (
    has_role('student')
    AND student_id = (SELECT id FROM students WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "Parents can view linked child transport" ON transport_students;
CREATE POLICY "Parents can view linked child transport" ON transport_students
  FOR SELECT USING (
    has_role('parent')
    AND student_id IN (
      SELECT s.id FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      WHERE ps.parent_id = auth.uid()
    )
  );
