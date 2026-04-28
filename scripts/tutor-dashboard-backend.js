// Baobab Tutor Dashboard Backend Adapter
// Aligns tutor dashboard data with the new Baobab_Parents Supabase backend.
// This file is intended to replace the old tutor-api bridge usage in tutor-dashboard.html.

const BAOBAB_PARENTS_SUPABASE_URL = 'https://vcxdkacxbjsgaoxbhsip.supabase.co';
const BAOBAB_PARENTS_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjeGRrYWN4YmpzZ2FveGJoc2lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDQ5ODMsImV4cCI6MjA2ODQ4MDk4M30.T9KhHWzHZWyaZvyeFXtBu8tPLY9JOn6_wCHcH8B46FU';

const baobabParentsSupabase = window.supabase.createClient(
  BAOBAB_PARENTS_SUPABASE_URL,
  BAOBAB_PARENTS_SUPABASE_ANON_KEY
);

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item && item[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function mapAssignedStudent(row) {
  return {
    id: row.child_id,
    name: row.child_name,
    grade_level: row.grade_level,
    class_type: row.class_type,
    status: row.child_status || 'active',
    school: row.school || null,
    enrollment_date: row.enrollment_date || null,
    assignment_id: row.assignment_id,
    subject_id: row.subject_id,
    subject_name: row.subject_name,
    parent_id: row.parent_id,
    parent_name: row.parent_name,
    parent_email: row.parent_email
  };
}

function mapAssignedSubject(row) {
  return {
    id: row.subject_id,
    name: row.subject_name,
    is_active: row.subject_is_active
  };
}

function mapReportCard(row) {
  return {
    id: row.assessment_id,
    child_id: row.child_id,
    subject_id: row.subject_id,
    tutor_id: row.tutor_id,
    title: row.title,
    description: row.description,
    type: row.assessment_type,
    grade: row.grade,
    max_grade: row.max_grade,
    percentage_score: row.percentage_score,
    feedback: row.feedback,
    conducted_at: row.conducted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    child: {
      id: row.child_id,
      name: row.child_name,
      grade_level: row.grade_level
    },
    subject: {
      id: row.subject_id,
      name: row.subject_name
    },
    tutor: {
      id: row.tutor_id,
      full_name: row.tutor_name
    }
  };
}

function mapProgressFeed(row) {
  return {
    id: row.progress_record_id,
    child_id: row.child_id,
    subject_id: row.subject_id,
    recorded_by: row.tutor_id,
    score: row.score,
    strengths: row.strengths,
    areas_of_improvement: row.areas_of_improvement,
    goals: row.goals,
    notes: row.notes,
    recorded_at: row.recorded_at,
    created_at: row.created_at,
    child: {
      id: row.child_id,
      name: row.child_name,
      grade_level: row.grade_level
    },
    subject: {
      id: row.subject_id,
      name: row.subject_name
    },
    tutor: {
      id: row.tutor_id,
      full_name: row.tutor_name
    }
  };
}

async function getCurrentSession() {
  const { data, error } = await baobabParentsSupabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Not authenticated');
  return data.session;
}

async function getTutorProfile() {
  const session = await getCurrentSession();
  const { data, error } = await baobabParentsSupabase
    .from('tutor_profiles')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadTutorDashboardBootstrap() {
  await getCurrentSession();

  const [profileResult, assignmentResult, assessmentResult, progressResult, lessonResult, classroomResult] = await Promise.all([
    getTutorProfile().then((profile) => ({ data: profile, error: null })).catch((error) => ({ data: null, error })),
    baobabParentsSupabase.from('tutor_assigned_students').select('*').order('child_name', { ascending: true }),
    baobabParentsSupabase.from('student_report_cards').select('*').order('conducted_at', { ascending: false }),
    baobabParentsSupabase.from('student_progress_feed').select('*').order('recorded_at', { ascending: false }),
    baobabParentsSupabase.from('lessons').select('*, children(id,name,grade_level), subjects(id,name)').order('scheduled_at', { ascending: true }),
    baobabParentsSupabase.from('google_classroom_links').select('*, children(id,name), subjects(id,name)').order('created_at', { ascending: false })
  ]);

  for (const result of [profileResult, assignmentResult, assessmentResult, progressResult, lessonResult, classroomResult]) {
    if (result.error) throw result.error;
  }

  const assignments = assignmentResult.data || [];
  const students = uniqueBy(assignments.map(mapAssignedStudent), 'id');
  const subjects = uniqueBy(assignments.filter((row) => row.subject_id).map(mapAssignedSubject), 'id');

  return {
    profile: profileResult.data,
    assignments,
    students,
    subjects,
    assessments: (assessmentResult.data || []).map(mapReportCard),
    progress: (progressResult.data || []).map(mapProgressFeed),
    lessons: (lessonResult.data || []).map((lesson) => ({
      ...lesson,
      child: lesson.children || null,
      subject: lesson.subjects || null
    })),
    classrooms: (classroomResult.data || []).map((classroom) => ({
      ...classroom,
      child: classroom.children || null,
      subject: classroom.subjects || null
    }))
  };
}

async function addAssessmentScore(body) {
  const { data, error } = await baobabParentsSupabase.rpc('add_assessment_score', {
    p_child_id: body.child_id,
    p_subject_id: body.subject_id,
    p_title: body.title,
    p_grade: body.grade === '' || body.grade === undefined ? null : Number(body.grade),
    p_max_grade: body.max_grade === '' || body.max_grade === undefined ? 100 : Number(body.max_grade),
    p_type: body.type || 'quiz',
    p_description: body.description || null,
    p_feedback: body.feedback || null,
    p_conducted_at: body.conducted_at || new Date().toISOString()
  });
  if (error) throw error;
  return { id: data };
}

async function addProgressRecord(body) {
  const { data, error } = await baobabParentsSupabase.rpc('add_progress_record', {
    p_child_id: body.child_id,
    p_subject_id: body.subject_id,
    p_score: body.score === '' || body.score === undefined ? null : Number(body.score),
    p_strengths: body.strengths || null,
    p_areas_of_improvement: body.areas_of_improvement || null,
    p_goals: body.goals || null,
    p_notes: body.notes || null,
    p_recorded_at: body.recorded_at || new Date().toISOString()
  });
  if (error) throw error;
  return { id: data };
}

async function loadAssignedStudents() {
  const { data, error } = await baobabParentsSupabase
    .from('tutor_assigned_students')
    .select('*')
    .order('child_name', { ascending: true });
  if (error) throw error;
  return { students: uniqueBy((data || []).map(mapAssignedStudent), 'id') };
}

async function loadAssignedSubjects() {
  const { data, error } = await baobabParentsSupabase
    .from('tutor_assigned_students')
    .select('*')
    .order('subject_name', { ascending: true });
  if (error) throw error;
  return { subjects: uniqueBy((data || []).filter((row) => row.subject_id).map(mapAssignedSubject), 'id') };
}

async function loadAssessments() {
  const { data, error } = await baobabParentsSupabase
    .from('student_report_cards')
    .select('*')
    .order('conducted_at', { ascending: false });
  if (error) throw error;
  return { assessments: (data || []).map(mapReportCard) };
}

async function loadProgressRecords() {
  const { data, error } = await baobabParentsSupabase
    .from('student_progress_feed')
    .select('*')
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return { progress: (data || []).map(mapProgressFeed) };
}

window.baobabTutorBackend = {
  client: baobabParentsSupabase,
  bootstrap: loadTutorDashboardBootstrap,
  profile: async () => ({ profile: await getTutorProfile() }),
  students: loadAssignedStudents,
  subjects: loadAssignedSubjects,
  assessments: loadAssessments,
  progress: loadProgressRecords,
  addAssessment: addAssessmentScore,
  addProgress: addProgressRecord
};
