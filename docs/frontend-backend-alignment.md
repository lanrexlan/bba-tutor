# Frontend alignment with new Baobab backend model

This note documents the required frontend changes after the backend security, assignment, score-entry, and progress-record updates.

## Backend source of truth

The main learning platform backend is now the `Baobab_Parents` Supabase project, not the old Tutors-only Supabase project.

The tutor dashboard should eventually point to the main project:

```js
const SUPABASE_URL = 'https://vcxdkacxbjsgaoxbhsip.supabase.co';
const SUPABASE_ANON_KEY = '<Baobab_Parents anon key>';
```

Do not expose service-role keys in browser code.

## New backend objects

### Assignment source of truth

Use:

```js
supabase.from('tutor_assigned_students').select('*')
```

This view is backed by `teacher_student_assignments` and RLS.

It returns active assignment rows with these useful fields:

- `assignment_id`
- `child_id`
- `child_name`
- `grade_level`
- `class_type`
- `child_status`
- `subject_id`
- `subject_name`
- `parent_id`
- `parent_name`
- `parent_email`
- `tutor_id`
- `tutor_name`

The tutor dashboard should use this to build:

- student select options
- subject select options
- My Students table
- tutor dashboard counts

## Score entry

Do not insert directly into `assessments` from the frontend.

Use:

```js
await supabase.rpc('add_assessment_score', {
  p_child_id: form.child_id,
  p_subject_id: form.subject_id,
  p_title: form.title,
  p_grade: Number(form.grade),
  p_max_grade: Number(form.max_grade || 100),
  p_type: form.type || 'quiz',
  p_description: form.description || null,
  p_feedback: form.feedback || null
});
```

This function validates that the signed-in tutor is assigned to that child and subject.

## Progress entry

Do not insert directly into `progress_records` from the frontend.

Use:

```js
await supabase.rpc('add_progress_record', {
  p_child_id: form.child_id,
  p_subject_id: form.subject_id,
  p_score: form.score ? Number(form.score) : null,
  p_strengths: form.strengths || null,
  p_areas_of_improvement: form.areas_of_improvement || null,
  p_goals: form.goals || null,
  p_notes: form.notes || null
});
```

This function validates that the signed-in tutor is assigned to that child and subject.

## Reporting views

Use these read models instead of manually joining raw tables in the browser:

```js
supabase.from('student_report_cards').select('*').order('conducted_at', { ascending: false })
supabase.from('student_progress_feed').select('*').order('recorded_at', { ascending: false })
supabase.from('lesson_completion_dashboard').select('*')
```

They are `security_invoker` views, so the signed-in user only receives rows allowed by RLS.

## Suggested tutor dashboard adapter

The existing `tutor-dashboard.html` currently uses an `api` bridge object. The bridge should return the same frontend-friendly shapes but source them from the new backend objects.

Recommended data mapping:

```js
function mapAssignedStudent(row) {
  return {
    id: row.child_id,
    name: row.child_name,
    grade_level: row.grade_level,
    class_type: row.class_type,
    status: row.child_status || 'active',
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

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
```

Suggested bootstrap implementation:

```js
async function loadBackendData() {
  const { data: assignments, error: assignmentError } = await supabase
    .from('tutor_assigned_students')
    .select('*')
    .order('child_name');
  if (assignmentError) throw assignmentError;

  const { data: assessments, error: assessmentError } = await supabase
    .from('student_report_cards')
    .select('*')
    .order('conducted_at', { ascending: false });
  if (assessmentError) throw assessmentError;

  const { data: progress, error: progressError } = await supabase
    .from('student_progress_feed')
    .select('*')
    .order('recorded_at', { ascending: false });
  if (progressError) throw progressError;

  return {
    assignments: assignments || [],
    students: uniqueBy((assignments || []).map(mapAssignedStudent), 'id'),
    subjects: uniqueBy((assignments || []).filter((row) => row.subject_id).map(mapAssignedSubject), 'id'),
    assessments: assessments || [],
    progress: progress || []
  };
}
```

## Admin UI requirement

The admin app must add a Tutor Assignments section that writes to:

```js
supabase.from('teacher_student_assignments')
```

Required fields:

- `tutor_id`
- `child_id`
- `subject_id`
- `status`
- `start_date`
- `end_date`
- `notes`

Without rows in this table, tutors will not see assigned students or be able to add scores.

## Known deployment note

A protected server route or Supabase Edge Function is still recommended for any privileged admin workflow. The tutor dashboard can use direct client-side calls for assignment and score flows because RLS and invoker RPCs now enforce tutor permissions.
