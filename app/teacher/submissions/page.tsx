'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api, Assignment, Course, Submission } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmissionStudent {
  id: string;
  name: string;
  email?: string;
}

interface SubmissionAssignment extends Assignment {
  course?: { id: string; title: string };
}

// The list endpoint returns submissions joined with student + assignment +
// course info (mirrors the shape already used by the teacher dashboard's
// "PendingGrading" rows), so we extend the base Submission type with that.
interface SubmissionRow extends Submission {
  user?: SubmissionStudent;
  assignment?: SubmissionAssignment;
}

type StatusFilter = 'all' | 'pending' | 'graded';

// ─── Font Awesome Loader ──────────────────────────────────────────────────────

function FontAwesomeLoader() {
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractArray(res: any): any[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.submissions)) return d.submissions;
  if (Array.isArray(d?.courses)) return d.courses;
  if (Array.isArray(d?.assignments)) return d.assignments;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

function initials(name?: string) {
  if (!name) return '–';
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isGraded(s: SubmissionRow) {
  return s.grade !== undefined && s.grade !== null;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  accent,
  light,
  sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent: string;
  light: string;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: light, color: accent, fontSize: '1rem' }}
      >
        <i className={`fa-solid ${icon}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-black text-slate-900 leading-none tracking-tight">{value}</div>
        <div className="text-slate-500 text-[11px] font-semibold mt-1.5 uppercase tracking-widest">{label}</div>
        <div className="text-xs font-medium mt-1" style={{ color: accent }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="px-5 py-4 flex items-center gap-3 animate-pulse border-b border-slate-50">
      <div className="w-9 h-9 bg-slate-100 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-3/5" />
        <div className="h-2.5 bg-slate-100 rounded w-2/5" />
      </div>
      <div className="h-5 w-16 bg-slate-100 rounded-full shrink-0" />
    </div>
  );
}

// ─── Grade Modal (single submission) ─────────────────────────────────────────

function GradeModal({
  submission,
  onClose,
  onSave,
  saving,
  error,
}: {
  submission: SubmissionRow;
  onClose: () => void;
  onSave: (grade: number, feedback: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const maxPoints = submission.assignment?.maxPoints ?? 100;
  const [grade, setGrade] = useState<string>(
    submission.grade !== undefined && submission.grade !== null ? String(submission.grade) : '',
  );
  const [feedback, setFeedback] = useState(submission.feedback ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const g = Number(grade);
    if (Number.isNaN(g)) return;
    onSave(g, feedback);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-slate-900 truncate">
              {submission.assignment?.title ?? 'Submission'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">
              {submission.user?.name ?? 'Student'} · {submission.assignment?.course?.title ?? '—'}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition shrink-0 ml-3">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <i className="fa-regular fa-clock" />
            Submitted {formatDate(submission.submittedAt)}
          </div>

          {submission.content && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Submitted content
              </div>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {submission.content}
              </div>
            </div>
          )}

          {submission.fileUrl && (
            <a
              href={submission.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 transition"
            >
              <i className="fa-solid fa-paperclip" />
              View attached file
            </a>
          )}

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Grade (out of {maxPoints})
              </label>
              <input
                type="number"
                min={0}
                max={maxPoints}
                step="any"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                placeholder={`0 – ${maxPoints}`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Feedback
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                placeholder="Leave feedback for the student…"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {saving && <i className="fa-solid fa-circle-notch animate-spin" />}
                Save grade
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Grade Modal ─────────────────────────────────────────────────────────

function BulkGradeModal({
  count,
  onClose,
  onSave,
  saving,
  error,
}: {
  count: number;
  onClose: () => void;
  onSave: (grade: number, feedback: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const g = Number(grade);
    if (Number.isNaN(g)) return;
    onSave(g, feedback);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="font-bold text-[15px] text-slate-900">Bulk grade {count} submissions</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-slate-400 mb-4">
            This grade and feedback will be applied to every selected submission.
          </p>

          {error && (
            <div className="px-3 py-2 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Grade
              </label>
              <input
                type="number"
                min={0}
                step="any"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                placeholder="e.g. 90"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Feedback
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none"
                placeholder="Optional feedback for all selected students…"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {saving && <i className="fa-solid fa-circle-notch animate-spin" />}
                Apply to {count}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Page wrapper (Suspense boundary for useSearchParams) ────────────────────

export default function TeacherSubmissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
        </div>
      }
    >
      <TeacherSubmissions />
    </Suspense>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TeacherSubmissions() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [courseFilter, setCourseFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState(() => searchParams.get('assignmentId') ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gradingSubmission, setGradingSubmission] = useState<SubmissionRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
    // Depend on primitives, not the user object itself — some auth providers
    // hand back a new object reference on every render, which would otherwise
    // re-run this effect (and any effect chained off it) on every render.
  }, [user?.id, user?.role, authLoading, router]);

  // ── Load filter option lists once ───────────────────────────────────────────
  useEffect(() => {
    if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) return;

    (async () => {
      try {
        const [coursesRes, assignmentsRes] = await Promise.all([
          api.teacher.getCourses(),
          api.teacher.getAssignments(),
        ]);
        setCourses(extractArray(coursesRes));
        setAssignments(extractArray(assignmentsRes));
      } catch {
        // Filter dropdowns are non-critical — fail silently and keep them empty.
      }
    })();
  }, [user?.id, user?.role]);

  // If we arrived with ?assignmentId= from the dashboard, line up the course
  // filter once we know which course that assignment belongs to.
  useEffect(() => {
    if (!assignmentFilter || courseFilter || assignments.length === 0) return;
    const match = assignments.find((a) => a.id === assignmentFilter);
    if (match) setCourseFilter(match.courseId);
  }, [assignmentFilter, assignments, courseFilter]);

  // Keep the filter in sync if the URL's assignmentId changes while this page
  // stays mounted (the App Router can reuse the page instance across
  // query-only navigations rather than remounting it).
  useEffect(() => {
    const fromUrl = searchParams.get('assignmentId');
    if (fromUrl) setAssignmentFilter(fromUrl);
  }, [searchParams]);

  // ── Fetch submissions ────────────────────────────────────────────────────────
  const fetchSubmissions = useCallback(async () => {
    if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (assignmentFilter) params.set('assignmentId', assignmentFilter);
      else if (courseFilter) params.set('courseId', courseFilter);
      const qs = params.toString();

      const res = await api.teacher.getSubmissions(qs ? `?${qs}` : '');
      setSubmissions(extractArray(res));
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role, assignmentFilter, courseFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  // ── Auth gate render ─────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) return null;

  // ── Derived data ──────────────────────────────────────────────────────────
  const assignmentOptions = assignments.filter((a) => !courseFilter || a.courseId === courseFilter);

  const visibleSubmissions = submissions.filter((s) => {
    if (statusFilter === 'pending' && isGraded(s)) return false;
    if (statusFilter === 'graded' && !isGraded(s)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const name = s.user?.name?.toLowerCase() ?? '';
      const title = s.assignment?.title?.toLowerCase() ?? '';
      if (!name.includes(q) && !title.includes(q)) return false;
    }
    return true;
  });

  const totalCount = submissions.length;
  const pendingCount = submissions.filter((s) => !isGraded(s)).length;
  const gradedCount = submissions.filter((s) => isGraded(s)).length;

  const gradedPercents = submissions
    .filter((s) => isGraded(s))
    .map((s) => ((s.grade as number) / (s.assignment?.maxPoints ?? 100)) * 100)
    .filter((n) => Number.isFinite(n));
  const avgPercent =
    gradedPercents.length > 0
      ? Math.round(gradedPercents.reduce((a, b) => a + b, 0) / gradedPercents.length)
      : null;

  const pendingVisibleIds = visibleSubmissions.filter((s) => !isGraded(s)).map((s) => s.id);
  const hasActiveFilters = !!courseFilter || !!assignmentFilter || statusFilter !== 'all' || !!search;
  const activeAssignmentTitle = assignmentFilter
    ? assignments.find((a) => a.id === assignmentFilter)?.title ?? submissions[0]?.assignment?.title
    : null;

  const statCards = [
    { icon: 'fa-inbox', value: loading ? '—' : totalCount, label: 'Total Submissions', accent: '#2563EB', light: '#EFF6FF', sub: 'All assignments' },
    { icon: 'fa-hourglass-half', value: loading ? '—' : pendingCount, label: 'Pending Review', accent: '#D97706', light: '#FFFBEB', sub: 'Awaiting your feedback' },
    { icon: 'fa-circle-check', value: loading ? '—' : gradedCount, label: 'Graded', accent: '#059669', light: '#F0FDF4', sub: 'Feedback delivered' },
    { icon: 'fa-chart-simple', value: loading ? '—' : avgPercent !== null ? `${avgPercent}%` : '—', label: 'Average Score', accent: '#7C3AED', light: '#F5F3FF', sub: 'Across graded work' },
  ];

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPendingVisible = () => {
    setSelectedIds(new Set(pendingVisibleIds));
  };

  const clearFilters = () => {
    setCourseFilter('');
    setAssignmentFilter('');
    setStatusFilter('all');
    setSearch('');
    router.replace('/teacher/submissions');
  };

  const handleSaveGrade = async (grade: number, feedback: string) => {
    if (!gradingSubmission) return;
    setSaving(true);
    setGradeError(null);
    try {
      await api.teacher.gradeSubmission(gradingSubmission.id, { grade, feedback });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === gradingSubmission.id ? { ...s, grade, feedback } : s)),
      );
      setGradingSubmission(null);
    } catch (err: any) {
      setGradeError(err.message || 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async (grade: number, feedback: string) => {
    setSaving(true);
    setBulkError(null);
    try {
      const ids = Array.from(selectedIds);
      await api.teacher.bulkGradeSubmissions({
        grades: ids.map((id) => ({ submissionId: id, grade, feedback })),
      });
      setSubmissions((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, grade, feedback } : s)),
      );
      setSelectedIds(new Set());
      setBulkOpen(false);
    } catch (err: any) {
      setBulkError(err.message || 'Failed to bulk grade submissions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FontAwesomeLoader />

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Submissions" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">Submissions</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {loading ? 'Loading…' : `${totalCount} submission${totalCount !== 1 ? 's' : ''} · ${pendingCount} pending review`}
              </div>
            </div>
            <button
              onClick={() => router.push('/teacher/assignments')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
            >
              <i className="fa-solid fa-clipboard-list text-xs" />
              View Assignments
            </button>
          </header>

          {/* Error Banner */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Active assignment filter chip */}
            {assignmentFilter && activeAssignmentTitle && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Filtered to assignment:</span>
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
                  {activeAssignmentTitle}
                  <button onClick={clearFilters} className="hover:text-blue-900">
                    <i className="fa-solid fa-xmark text-[10px]" />
                  </button>
                </span>
              </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.accent} light={s.light} sub={s.sub} />
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Search student or assignment
                  </label>
                  <div className="relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                    />
                  </div>
                </div>

                <div className="min-w-[170px]">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Course
                  </label>
                  <select
                    value={courseFilter}
                    onChange={(e) => {
                      setCourseFilter(e.target.value);
                      setAssignmentFilter('');
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                  >
                    <option value="">All courses</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[190px]">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Assignment
                  </label>
                  <select
                    value={assignmentFilter}
                    onChange={(e) => setAssignmentFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                  >
                    <option value="">All assignments</option>
                    {assignmentOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[150px]">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="graded">Graded</option>
                  </select>
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-rotate-left text-xs" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
                <div className="text-sm font-semibold text-blue-800">
                  {selectedIds.size} submission{selectedIds.size !== 1 ? 's' : ''} selected
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedIds(new Set())} className="text-sm text-blue-700 hover:text-blue-900 font-medium">
                    Clear selection
                  </button>
                  <button
                    onClick={() => setBulkOpen(true)}
                    className="px-3 py-1.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
                  >
                    Bulk grade
                  </button>
                </div>
              </div>
            )}

            {/* Submissions list */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-[14px] text-slate-800">All Submissions</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {loading ? 'Loading…' : `${visibleSubmissions.length} of ${totalCount} submission${totalCount !== 1 ? 's' : ''}`}
                  </div>
                </div>
                {!loading && pendingVisibleIds.length > 0 && (
                  <button
                    onClick={selectAllPendingVisible}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition"
                  >
                    Select all pending ({pendingVisibleIds.length})
                  </button>
                )}
              </div>

              <div>
                {loading ? (
                  [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)
                ) : visibleSubmissions.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-14 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                      <i className="fa-solid fa-inbox text-xl text-slate-300" />
                    </div>
                    <p className="text-slate-600 font-semibold text-sm">
                      {hasActiveFilters ? 'No submissions match your filters' : 'No submissions yet'}
                    </p>
                    <p className="text-slate-400 text-xs">
                      {hasActiveFilters ? 'Try adjusting your search or filters' : 'Submissions will appear here once students turn in work'}
                    </p>
                  </div>
                ) : (
                  visibleSubmissions.map((s) => {
                    const graded = isGraded(s);
                    const maxPoints = s.assignment?.maxPoints ?? 100;
                    return (
                      <div
                        key={s.id}
                        className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          disabled={graded}
                          onChange={() => toggleSelect(s.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 disabled:opacity-30 shrink-0"
                        />
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {initials(s.user?.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-800 truncate">
                            {s.assignment?.title ?? 'Assignment'}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {s.user?.name ?? 'Student'} · {s.assignment?.course?.title ?? '—'}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0 w-16 text-right">
                          {formatDate(s.submittedAt)}
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            graded ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {graded ? 'Graded' : 'Pending'}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 shrink-0 w-16 text-right">
                          {graded ? `${s.grade}/${maxPoints}` : '—'}
                        </span>
                        <button
                          onClick={() => {
                            setGradeError(null);
                            setGradingSubmission(s);
                          }}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1 shrink-0"
                        >
                          {graded ? 'Edit' : 'Grade'} <i className="fa-solid fa-arrow-right text-[10px]" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {gradingSubmission && (
        <GradeModal
          submission={gradingSubmission}
          onClose={() => {
            setGradingSubmission(null);
            setGradeError(null);
          }}
          onSave={handleSaveGrade}
          saving={saving}
          error={gradeError}
        />
      )}

      {bulkOpen && (
        <BulkGradeModal
          count={selectedIds.size}
          onClose={() => {
            setBulkOpen(false);
            setBulkError(null);
          }}
          onSave={handleBulkSave}
          saving={saving}
          error={bulkError}
        />
      )}
    </>
  );
}