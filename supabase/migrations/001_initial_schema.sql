-- Part 1: profiles, classes, subjects

-- 1. profiles table --
-- Linked to Supabase auth.users. Role supports: admin, teacher, student, parent
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'parent')),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for role-based queries
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for profiles
CREATE POLICY "Admins can manage all profiles" ON profiles
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Teachers can read own profile" ON profiles
  FOR SELECT USING (has_role('teacher') AND id = auth.uid());

CREATE POLICY "Students can read own profile" ON profiles
  FOR SELECT USING (has_role('student') AND id = auth.uid());

CREATE POLICY "Parents can read own profile" ON profiles
  FOR SELECT USING (has_role('parent') AND id = auth.uid());

-- 2. classes table --
-- Represents grade levels/sections (e.g., Grade 1, Section A, High School)
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  grade_level INTEGER,
  section TEXT,
  homeroom_teacher_id UUID REFERENCES profiles(id),
  academic_year TEXT NOT NULL DEFAULT '2024-2025',
  semester TEXT NOT NULL DEFAULT 'Fall',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for class lookups
CREATE INDEX idx_classes_name ON classes(name);
CREATE INDEX idx_classes_grade ON classes(grade_level);
CREATE INDEX idx_classes_homeroom ON classes(homeroom_teacher_id);

-- Enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for classes
CREATE POLICY "Admins can manage classes" ON classes
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Teachers can read own classes" ON classes
  FOR SELECT USING (has_role('teacher') AND id = homeroom_teacher_id);

CREATE POLICy "Students can read assigned classes" ON classes
  FOR SELECT USING (has_role('student') AND section IS NOT NULL);

-- 3. subjects table --
-- Academic subjects taught in classes (e.g., Math, Science, History)
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  description TEXT,
  credits INTEGER DEFAULT 1,
  is_core BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for subject lookups
CREATE INDEX idx_subjects_name ON subjects(name);
CREATE INDEX idx_subjects_code ON subjects(code);
CREATE INDEX idx_subjects_core ON subjects(is_core);

-- Enable RLS
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for subjects
CREATE POLICY "Admins can manage subjects" ON subjects
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Everyone can read subjects" ON subjects
  FOR SELECT USING (true);

-- Helper function for role checking (if not already exists)
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Part 2: attendance, fees, exams, results

-- 4. attendance table --
-- Attendance records for students in classes
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for attendance lookups
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_class ON attendance(class_id);
CREATE INDEX idx_attendance_date ON attendance(date);

-- Enable RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for attendance
CREATE POLICY "Admins can manage attendance" ON attendance
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Teachers can manage attendance for own classes" ON attendance
  FOR ALL USING (has_role('teacher') AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid()));

CREATE POLICY "Students can view own attendance" ON attendance
  FOR SELECT USING (has_role('student') AND student_id = auth.uid());

-- 5. fees table --
-- Fee payment records for students
CREATE TABLE fees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('tuition', 'registration', 'materials', 'extracurricular', 'other')),
  due_date DATE NOT NULL,
  paid_date DATE,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'waived')),
  payment_method TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fees lookups
CREATE INDEX idx_fees_student ON fees(student_id);
CREATE INDEX idx_fees_status ON fees(payment_status);
CREATE INDEX idx_fees_due_date ON fees(due_date);

-- Enable RLS
ALTER TABLE fees ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for fees
CREATE POLICY "Admins can manage fees" ON fees
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Students can view own fees" ON fees
  FOR SELECT USING (has_role('student') AND student_id = auth.uid());

-- 6. exams table --
-- Exam records/schedule
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  title TEXT NOT NULL,
  description TEXT,
  exam_date TIMESTAMPTZ NOT NULL,
  total_marks DECIMAL(5, 2) DEFAULT 100.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for exams lookups
CREATE INDEX idx_exams_class ON exams(class_id);
CREATE INDEX idx_exams_date ON exams(exam_date);
CREATE INDEX idx_exams_subject ON exams(subject_id);

-- Enable RLS
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for exams
CREATE POLICY "Admins can manage exams" ON exams
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Teachers can manage exams for own classes" ON exams
  FOR ALL USING (has_role('teacher') AND class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid()));

CREATE POLICY "Students can view exam schedule" ON exams
  FOR SELECT USING (has_role('student') AND TRUE);

-- 7. results table --
-- Student exam results/grades
CREATE TABLE results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  marks_obtained DECIMAL(5, 2) DEFAULT 0.00,
  percentage DECIMAL(5, 2),
  grade TEXT CHECK (grade IN ('A', 'B', 'C', 'D', 'F', 'Incomplete')),
  remarks TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for results lookups
CREATE INDEX idx_results_student ON results(student_id);
CREATE INDEX idx_results_exam ON results(exam_id);
CREATE INDEX idx_results_grade ON results(grade);

-- Enable RLS
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for results
CREATE POLICY "Admins can manage results" ON results
  FOR ALL USING (has_role('admin'));

CREATE POLICY "Teachers can manage results for own classes" ON results
  FOR ALL USING (has_role('teacher') AND exam_id IN (SELECT id FROM exams WHERE class_id IN (SELECT id FROM classes WHERE homeroom_teacher_id = auth.uid())));

CREATE POLICY "Students can view own results" ON results
  FOR SELECT USING (has_role('student') AND student_id = auth.uid());

-- Part 3: students, teachers, homework, timetable, notices

-- 8. students table --
-- Student records linked to profiles
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id),
  roll_no TEXT UNIQUE,
  admission_no TEXT UNIQUE,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for student lookups
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_profile_id ON students(profile_id);
CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_students_roll_no ON students(roll_no);
CREATE INDEX idx_students_admission_no ON students(admission_no);

-- Enable RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for students using existing has_role() function
CREATE POLICY "Students can view own record" ON students
  FOR SELECT USING (has_role('student') AND profile_id = (SELECT id FROM profiles WHERE id = auth.uid()));

-- 9. teachers table --
-- Teacher records linked to profiles
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  hire_date DATE NOT NULL,
  specialization TEXT,
  qualifications TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'leave', 'terminated')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for teacher lookups
CREATE INDEX idx_teachers_user_id ON teachers(user_id);
CREATE INDEX idx_teachers_profile_id ON teachers(profile_id);
CREATE INDEX idx_teachers_specialization ON teachers(specialization);

-- Enable RLS
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for teachers using existing has_role() function
CREATE POLICY "Teachers can view own record" ON teachers
  FOR SELECT USING (has_role('teacher') AND profile_id = (SELECT id FROM profiles WHERE id = auth.uid()));

-- 10. homework table --
-- Homework assignments for classes
CREATE TABLE homework (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  teacher_id UUID REFERENCES teachers(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ NOT NULL,
  max_marks DECIMAL(5, 2) DEFAULT 100.00,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for homework lookups
CREATE INDEX idx_homework_class ON homework(class_id);
CREATE INDEX idx_homework_subject ON homework(subject_id);
CREATE INDEX idx_homework_due_date ON homework(due_date);
CREATE INDEX idx_homework_teacher ON homework(teacher_id);

-- Enable RLS
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for homework using existing has_role() function
CREATE POLICY "Homework can be viewed by students" ON homework
  FOR SELECT USING (has_role('student') AND TRUE);

-- 11. timetable table --
-- School timetable/schedule
CREATE TABLE timetable (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 10),
  subject_id UUID REFERENCES subjects(id),
  teacher_id UUID REFERENCES teachers(id),
  room TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for timetable lookups
CREATE INDEX idx_timetable_class ON timetable(class_id);
CREATE INDEX idx_timetable_day ON timetable(day_of_week);
CREATE INDEX idx_timetable_period ON timetable(period);

-- Enable RLS
ALTER TABLE timetable ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for timetable using existing has_role() function
CREATE POLICY "Timetable can be viewed by students" ON timetable
  FOR SELECT USING (has_role('student') AND TRUE);

-- 12. notices table --
-- School notices and announcements
CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'students', 'teachers', 'parents', 'class')),
  created_by UUID REFERENCES profiles(id),
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for notices lookups
CREATE INDEX idx_notices_target ON notices(target_audience);
CREATE INDEX idx_notices_published ON notices(is_published);
CREATE INDEX idx_notices_expiry ON notices(expiry_date);

-- Enable RLS
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for notices using existing has_role() function
CREATE POLICY "Notices can be viewed by students" ON notices
  FOR SELECT USING (has_role('student') AND TRUE);

CREATE POLICY "Notices can be viewed by parents" ON notices
  FOR SELECT USING (has_role('parent') AND TRUE);

CREATE POLICY "Notices can be viewed by teachers" ON notices
  FOR SELECT USING (has_role('teacher') AND TRUE);