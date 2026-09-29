'use client';

/**
 * FONT AWESOME SETUP REQUIRED
 * Icons won't render until FA is loaded. Add ONE of the following:
 *
 * Option A — layout.tsx (recommended for Next.js App Router):
 *   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
 *
 * Option B — npm package (no CDN):
 *   npm install @fortawesome/fontawesome-free
 *   import '@fortawesome/fontawesome-free/css/all.min.css';
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';
import { cache, TTL } from '../../lib/cache';
import { CACHE_KEYS, invalidateProgress } from '../../lib/cachedApi';
import type { Assignment, Quiz, Submission } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LessonProgress {
  lessonId: string;
  title: string;
  completed: boolean;
}

interface ModuleProgress {
  moduleId: string;
  title: string;
  lessons: LessonProgress[];
}

interface AssignmentProgress {
  assignmentId: string;
  title: string;
  dueDate?: string | null;
  maxPoints?: number | null;
  status: 'not_submitted' | 'submitted' | 'graded';
  grade?: number | null;
}

interface QuizProgress {
  quizId: string;
  title: string;
  dueDate?: string | null;
  maxAttempts: number;
  passingScore: number;
  attemptsUsed: number;
  bestScore?: number | null;
  passed: boolean;
}

interface CourseProgress {
  courseId: string;
  title: string;
  totalLessons: number;
  completedLessons: number;
  modules?: ModuleProgress[];
  assignments?: AssignmentProgress[];
  quizzes?: QuizProgress[];
  loadingDetail?: boolean;
  detailError?: string | null;
}

// ─── Professional Color Palette ───────────────────────────────────────────────

const COLORS = {
  primary: '#2563EB',
  primaryDark: '#1E3A5F',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
};

// ─── FA Loader ────────────────────────────────────────────────────────────────

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

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ percent }: { percent: number }) {
  const size = 140, sw = 8;
  const r = (size - sw * 2) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A5F" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={COLORS.border} strokeWidth={sw} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="url(#ringGradient)" strokeWidth={sw}
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-black" style={{ color: COLORS.primaryDark }}>
          {percent}<span className="text-lg">%</span>
        </span>
        <span className="text-xs font-medium mt-1" style={{ color: COLORS.textSecondary }}>Complete</span>
      </div>
    </div>
  );
}

// ─── Mini Ring ────────────────────────────────────────────────────────────────

function MiniRing({ percent, color = COLORS.primary, size = 48 }: { percent: number; color?: string; size?: number }) {
  const sw = 3.5;
  const r = (size - sw * 2) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  if (percent === 0) {
    return (
      <div className="flex items-center justify-center rounded-full"
        style={{ width: size, height: size, backgroundColor: '#F1F5F9' }}>
        <span className="text-xs font-bold" style={{ color: COLORS.textSecondary }}>0%</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={COLORS.border} strokeWidth={sw} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span className="absolute font-bold text-xs" style={{ color }}>{percent}%</span>
    </div>
  );
}

// ─── Lesson Item ──────────────────────────────────────────────────────────────

function LessonItem({ lesson, onToggle, toggling }: {
  lesson: LessonProgress;
  onToggle: (lessonId: string, currentlyDone: boolean) => void;
  toggling: boolean;
}) {
  return (
    <button
      disabled={toggling}
      onClick={() => onToggle(lesson.lessonId, lesson.completed)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 text-left"
      style={{
        backgroundColor: lesson.completed ? '#ECFDF5' : '#F8FAFC',
        borderColor: lesson.completed ? '#D1FAE5' : COLORS.border,
        color: lesson.completed ? COLORS.success : COLORS.textSecondary,
        opacity: toggling ? 0.6 : 1,
        cursor: toggling ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 font-medium"
        style={{ backgroundColor: lesson.completed ? COLORS.success : '#D1D5DB' }}>
        {lesson.completed && <i className="fa-solid fa-check text-white text-[7px]" />}
      </span>
      <span className="truncate flex-1 text-[12px]">{lesson.title}</span>
    </button>
  );
}

// ─── Assignment Item ──────────────────────────────────────────────────────────

function AssignmentItem({ assignment }: { assignment: AssignmentProgress }) {
  const statusConfig = {
    not_submitted: { bg: '#FFFBEB', border: '#FDE68A', color: COLORS.warning, icon: 'fa-circle-exclamation', label: 'Not submitted' },
    submitted: { bg: '#EFF6FF', border: '#BFDBFE', color: COLORS.primary, icon: 'fa-paper-plane', label: 'Submitted' },
    graded: { bg: '#ECFDF5', border: '#D1FAE5', color: COLORS.success, icon: 'fa-check', label: assignment.grade != null ? `Graded: ${assignment.grade}` : 'Graded' },
  }[assignment.status];

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border"
      style={{ backgroundColor: statusConfig.bg, borderColor: statusConfig.border, color: statusConfig.color }}>
      <i className={`fa-solid ${statusConfig.icon} text-[10px] shrink-0`} />
      <span className="truncate flex-1 text-[12px]" style={{ color: COLORS.textPrimary }}>{assignment.title}</span>
      <span className="text-[10px] font-semibold shrink-0">{statusConfig.label}</span>
    </div>
  );
}

// ─── Quiz Item ────────────────────────────────────────────────────────────────

function QuizItem({ quiz }: { quiz: QuizProgress }) {
  const attempted = quiz.attemptsUsed > 0;
  const bg = quiz.passed ? '#ECFDF5' : attempted ? '#FEF2F2' : '#F8FAFC';
  const border = quiz.passed ? '#D1FAE5' : attempted ? '#FECACA' : COLORS.border;
  const color = quiz.passed ? COLORS.success : attempted ? COLORS.error : COLORS.textSecondary;
  const icon = quiz.passed ? 'fa-trophy' : attempted ? 'fa-rotate-right' : 'fa-circle-question';
  const label = quiz.passed
    ? `Passed${quiz.bestScore != null ? ` (${quiz.bestScore}%)` : ''}`
    : attempted
      ? `${quiz.attemptsUsed}/${quiz.maxAttempts} attempts`
      : 'Not attempted';

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border"
      style={{ backgroundColor: bg, borderColor: border, color }}>
      <i className={`fa-solid ${icon} text-[10px] shrink-0`} />
      <span className="truncate flex-1 text-[12px]" style={{ color: COLORS.textPrimary }}>{quiz.title}</span>
      <span className="text-[10px] font-semibold shrink-0">{label}</span>
    </div>
  );
}

// ─── Course Row ───────────────────────────────────────────────────────────────

function CourseRow({ course, index, onExpand, onToggleLesson, togglingLesson }: {
  course: CourseProgress;
  index: number;
  onExpand: (courseId: string) => void;
  onToggleLesson: (courseId: string, lessonId: string, currentlyDone: boolean) => void;
  togglingLesson: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isDone = course.completedLessons === course.totalLessons && course.totalLessons > 0;
  const pct = course.totalLessons === 0 ? 0 : Math.round((course.completedLessons / course.totalLessons) * 100);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !course.modules && !course.loadingDetail) {
      onExpand(course.courseId);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border transition-all duration-200"
      style={{
        backgroundColor: COLORS.surface,
        borderColor: open ? '#BFDBFE' : COLORS.border,
        boxShadow: open ? '0 4px 6px -1px rgba(0,0,0,0.1)' : '0 1px 2px 0 rgba(0,0,0,0.05)',
      }}>
      <button className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors duration-200"
        onClick={handleToggle}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
          style={{
            backgroundColor: isDone ? '#ECFDF5' : '#EFF6FF',
            color: isDone ? COLORS.success : COLORS.primary,
            border: `2px solid ${isDone ? '#D1FAE5' : '#BFDBFE'}`,
          }}>
          {isDone ? <i className="fa-solid fa-check" /> : <span>{String(index + 1).padStart(2, '0')}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[14px] truncate" style={{ color: COLORS.textPrimary }}>{course.title}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[11px]" style={{ color: COLORS.textSecondary }}>
              <i className="fa-solid fa-book-open" style={{ fontSize: '10px', marginRight: '4px' }} />
              {course.completedLessons}/{course.totalLessons} lessons
            </span>
            {isDone && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: '#ECFDF5', color: COLORS.success }}>
                <i className="fa-solid fa-circle-check" style={{ fontSize: '9px' }} />
                Completed
              </span>
            )}
          </div>
        </div>

        <MiniRing percent={pct} color={isDone ? COLORS.success : COLORS.primary} />
        <i className="fa-solid fa-chevron-down text-xs shrink-0 transition-transform duration-300"
          style={{ color: COLORS.textSecondary, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div className="border-t px-5 pb-4 pt-4 space-y-5" style={{ borderColor: COLORS.border }}>
          {course.loadingDetail ? (
            <div className="flex justify-center py-8">
              <i className="fa-solid fa-spinner animate-spin text-xl" style={{ color: COLORS.primary }} />
            </div>
          ) : course.detailError ? (
            <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
              style={{ backgroundColor: '#FEF2F2', color: COLORS.error }}>
              <i className="fa-solid fa-circle-exclamation text-xs" />
              <span className="text-xs">{course.detailError}</span>
            </div>
          ) : (
            <>
              {/* Lessons */}
              {course.totalLessons === 0 ? (
                <div className="text-center py-4" style={{ color: COLORS.textSecondary }}>
                  <i className="fa-solid fa-inbox text-lg mb-2 block" style={{ opacity: 0.5 }} />
                  <p className="text-xs">No lessons in this course yet.</p>
                </div>
              ) : course.modules && course.modules.length > 0 ? (
                <div className="space-y-4">
                  {course.modules.map(mod => (
                    <div key={mod.moduleId}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <i className="fa-solid fa-layer-group text-xs" style={{ color: COLORS.primary }} />
                        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textSecondary }}>
                          {mod.title}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {mod.lessons.map(lesson => (
                          <LessonItem
                            key={lesson.lessonId}
                            lesson={lesson}
                            onToggle={(id, done) => onToggleLesson(course.courseId, id, done)}
                            toggling={togglingLesson === lesson.lessonId}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Assignments */}
              {course.assignments && course.assignments.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <i className="fa-solid fa-file-pen text-xs" style={{ color: COLORS.primary }} />
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textSecondary }}>
                      Assignments
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {course.assignments.map(a => (
                      <AssignmentItem key={a.assignmentId} assignment={a} />
                    ))}
                  </div>
                </div>
              )}

              {/* Quizzes */}
              {course.quizzes && course.quizzes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <i className="fa-solid fa-clipboard-question text-xs" style={{ color: COLORS.primary }} />
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: COLORS.textSecondary }}>
                      Quizzes
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {course.quizzes.map(q => (
                      <QuizItem key={q.quizId} quiz={q} />
                    ))}
                  </div>
                </div>
              )}

              {course.totalLessons === 0 &&
                (!course.assignments || course.assignments.length === 0) &&
                (!course.quizzes || course.quizzes.length === 0) && (
                <div className="text-center py-6" style={{ color: COLORS.textSecondary }}>
                  <p className="text-xs">No content available for this course yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CourseSkeleton() {
  return (
    <div className="rounded-xl px-5 py-4 flex items-center gap-4 animate-pulse"
      style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
      <div className="w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: '#E5E7EB' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 rounded" style={{ backgroundColor: '#E5E7EB', width: '60%' }} />
        <div className="h-3 rounded" style={{ backgroundColor: '#E5E7EB', width: '40%' }} />
      </div>
      <div className="w-12 h-12 rounded-full shrink-0" style={{ backgroundColor: '#E5E7EB' }} />
    </div>
  );
}

function StatCard({ icon, value, label, accentColor, dimmed }: {
  icon: string; value: string; label: string; accentColor: string; dimmed?: boolean;
}) {
  const lightBg = accentColor === COLORS.success ? '#ECFDF5' : accentColor === COLORS.warning ? '#FFFBEB' : '#EFF6FF';
  return (
    <div className="rounded-xl px-5 py-4 border shadow-sm transition-opacity duration-300"
      style={{ backgroundColor: COLORS.surface, borderColor: COLORS.border, opacity: dimmed ? 0.6 : 1 }}>
      <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-3" style={{ background: lightBg, color: accentColor }}>
        <i className={`fa-solid ${icon} text-lg`} />
      </div>
      <p className="text-3xl font-black" style={{ color: COLORS.textPrimary }}>{value}</p>
      <p className="text-[11px] font-semibold mt-1" style={{ color: COLORS.textSecondary }}>{label}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSummary(data: any): CourseProgress[] {
  const raw =
    Array.isArray(data?.data?.summaries) ? data.data.summaries :
    Array.isArray(data?.summaries) ? data.summaries :
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : [];

  return raw.map((c: any) => ({
    courseId: c.courseId ?? c.id,
    title: c.title ?? c.courseTitle ?? 'Untitled Course',
    totalLessons: c.totalLessons ?? c.total ?? 0,
    completedLessons: c.completedLessons ?? c.completed ?? 0,
  }));
}

function parseDetail(data: any): ModuleProgress[] {
  const modules: any[] = data?.data?.modules ?? data?.modules ?? [];
  return modules.map((m: any) => ({
    moduleId: m.moduleId ?? m.id,
    title: m.title ?? 'Untitled Module',
    lessons: (m.lessons ?? []).map((l: any) => ({
      lessonId: l.lessonId ?? l.id,
      title: l.title ?? 'Untitled Lesson',
      completed: l.completed ?? false,
    })),
  }));
}

function extractArray(data: any, key: string): any[] {
  return (
    Array.isArray(data?.data?.[key]) ? data.data[key] :
    Array.isArray(data?.[key]) ? data[key] :
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : []
  );
}

function buildAssignmentProgress(assignments: Assignment[], submissions: Submission[]): AssignmentProgress[] {
  const byAssignment = new Map<string, Submission>();
  for (const s of submissions) {
    // keep the latest submission per assignment if multiple
    byAssignment.set(s.assignmentId, s);
  }

  return assignments.map(a => {
    const sub = byAssignment.get(a.id);
    let status: AssignmentProgress['status'] = 'not_submitted';
    if (sub) status = sub.grade != null ? 'graded' : 'submitted';
    return {
      assignmentId: a.id,
      title: a.title,
      dueDate: a.dueDate,
      maxPoints: a.maxPoints,
      status,
      grade: sub?.grade ?? null,
    };
  });
}

function buildQuizProgress(quizzes: Quiz[], attemptsByQuiz: Map<string, { attempts: number; bestScore: number | null }>): QuizProgress[] {
  return quizzes.map(q => {
    const info = attemptsByQuiz.get(q.id) ?? { attempts: 0, bestScore: null };
    const passed = info.bestScore != null && info.bestScore >= q.passingScore;
    return {
      quizId: q.id,
      title: q.title,
      dueDate: q.dueDate,
      maxAttempts: q.maxAttempts,
      passingScore: q.passingScore,
      attemptsUsed: info.attempts,
      bestScore: info.bestScore,
      passed,
    };
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { user, loading: authLoading } = useAuth();

  // Guards against hydration mismatches: useAuth() can resolve synchronously
  // from localStorage/context on the client before React has hydrated, so the
  // very first client render must match the server's render (which never has
  // a user). We force one extra render pass after mount before trusting
  // `user`/`authLoading` for branching the returned JSX tree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [courses, setCourses]           = useState<CourseProgress[]>([]);
  // true only when there's nothing cached to show
  const [loading, setLoading]           = useState(true);
  // true during a silent background refresh
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [togglingLesson, setTogglingLesson] = useState<string | null>(null);

  // ── Smart fetch: SWR pattern ──────────────────────────────────────────────
  const fetchSummary = useCallback(async (userId: string, background = false) => {
    const key = CACHE_KEYS.progress(userId);
    const cached = cache.get<CourseProgress[]>(key);

    if (cached) {
      // Paint immediately from cache
      setCourses(cached);
      setLoading(false);
      // Fresh enough? Skip network
      if (!cache.isStale(key)) return;
      // Stale — revalidate silently
      setRevalidating(true);
    } else {
      if (!background) setLoading(true);
    }

    setError(null);

    try {
      const res = await cache.fetch(
        key,
        () => api.getAllCoursesSummary().then(r => parseSummary(r.data)),
        TTL.PROGRESS,
      );
      // cache.fetch stores the parsed array, but also returns it
      const parsed = Array.isArray(res) ? res as CourseProgress[] : parseSummary(res);
      setCourses(parsed);
    } catch (err: any) {
      setError(err.message || 'Failed to load progress');
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    fetchSummary(user.id);
  }, [authLoading, user, fetchSummary]);

  // ── Window focus revalidation ─────────────────────────────────────────────
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    const onFocus = () => {
      if (!userRef.current) return;
      const key = CACHE_KEYS.progress(userRef.current.id);
      if (cache.isStale(key)) fetchSummary(userRef.current.id, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchSummary]);

  // ── Expand course — cached module/assignment/quiz detail ───────────────────
  const handleExpand = useCallback(async (courseId: string) => {
    if (!user) return;

    const detailKey = CACHE_KEYS.progressCourse(user.id, courseId);
    const cached = cache.get<{ modules: ModuleProgress[]; assignments: AssignmentProgress[]; quizzes: QuizProgress[] }>(detailKey);

    if (cached && !cache.isStale(detailKey)) {
      // Serve from cache immediately — no spinner
      setCourses(prev =>
        prev.map(c => c.courseId === courseId
          ? { ...c, modules: cached.modules, assignments: cached.assignments, quizzes: cached.quizzes, loadingDetail: false }
          : c)
      );
      return;
    }

    // Show spinner inside the expanded card
    setCourses(prev =>
      prev.map(c => c.courseId === courseId ? { ...c, loadingDetail: true, detailError: null } : c)
    );

    try {
      const result = await cache.fetch(
        detailKey,
        async () => {
          const [lessonRes, assignmentsRes, quizzesRes, submissionsRes] = await Promise.all([
            api.getCourseSummary(courseId).then(r => parseDetail(r.data)),
            api.getAssignments(`?courseId=${courseId}`).then(r => extractArray(r.data, 'assignments') as Assignment[]).catch(() => []),
            api.getQuizzes(`?courseId=${courseId}`).then((r: any) => extractArray(r.data, 'quizzes') as Quiz[]).catch(() => []),
            api.getSubmissions(`?courseId=${courseId}`).then(r => extractArray(r.data, 'submissions') as Submission[]).catch(() => []),
          ]);

          const assignments = buildAssignmentProgress(assignmentsRes, submissionsRes);

          // Best-effort quiz attempt info: try the student-facing attempt fields
          // returned inline on each quiz object (myAttempts / myBestScore), since
          // there is no dedicated "my quiz attempts" endpoint in the client yet.
          const attemptsByQuiz = new Map<string, { attempts: number; bestScore: number | null }>();
          for (const q of quizzesRes as any[]) {
            attemptsByQuiz.set(q.id, {
              attempts: q.myAttempts ?? q.attemptsUsed ?? 0,
              bestScore: q.myBestScore ?? q.bestScore ?? null,
            });
          }
          const quizzes = buildQuizProgress(quizzesRes, attemptsByQuiz);

          return { modules: lessonRes, assignments, quizzes };
        },
        TTL.PROGRESS,
      ) as { modules: ModuleProgress[]; assignments: AssignmentProgress[]; quizzes: QuizProgress[] };

      setCourses(prev =>
        prev.map(c => c.courseId === courseId
          ? { ...c, modules: result.modules, assignments: result.assignments, quizzes: result.quizzes, loadingDetail: false }
          : c)
      );
    } catch (err: any) {
      setCourses(prev =>
        prev.map(c =>
          c.courseId === courseId
            ? { ...c, loadingDetail: false, detailError: err.message || 'Failed to load course details' }
            : c
        )
      );
    }
  }, [user]);

  // ── Toggle lesson — optimistic update ─────────────────────────────────────
  const handleToggleLesson = useCallback(async (
    courseId: string,
    lessonId: string,
    currentlyDone: boolean,
  ) => {
    if (!user) return;
    setTogglingLesson(lessonId);

    const applyUpdate = (done: boolean) =>
      setCourses(prev =>
        prev.map(c => {
          if (c.courseId !== courseId) return c;
          const updatedModules = c.modules?.map(m => ({
            ...m,
            lessons: m.lessons.map(l =>
              l.lessonId === lessonId ? { ...l, completed: done } : l
            ),
          }));
          const delta = done ? 1 : -1;
          return {
            ...c,
            modules: updatedModules,
            completedLessons: Math.max(0, Math.min(c.totalLessons, c.completedLessons + delta)),
          };
        })
      );

    // Optimistic
    applyUpdate(!currentlyDone);

    try {
      if (currentlyDone) {
        await api.unmarkLessonComplete(lessonId);
      } else {
        await api.markLessonComplete(lessonId);
      }
      // Bust the summary + detail caches so other pages see fresh counts
      invalidateProgress(user.id, courseId);
      // Update the in-memory progress cache to match optimistic state
      const summaryKey = CACHE_KEYS.progress(user.id);
      const summaryCache = cache.get<CourseProgress[]>(summaryKey);
      if (summaryCache) {
        const updated = summaryCache.map(c => {
          if (c.courseId !== courseId) return c;
          const delta = currentlyDone ? -1 : 1;
          return { ...c, completedLessons: Math.max(0, Math.min(c.totalLessons, c.completedLessons + delta)) };
        });
        cache.set(summaryKey, updated, TTL.PROGRESS);
      }
    } catch {
      // Revert on failure
      applyUpdate(currentlyDone);
    } finally {
      setTogglingLesson(null);
    }
  }, [user]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalLessons    = courses.reduce((s, c) => s + c.totalLessons, 0);
  const totalCompleted  = courses.reduce((s, c) => s + c.completedLessons, 0);
  const totalRemaining  = totalLessons - totalCompleted;
  const overallPct      = totalLessons === 0 ? 0 : Math.round((totalCompleted / totalLessons) * 100);

  // ── Auth guard ────────────────────────────────────────────────────────────
  // `!mounted` covers both the server render and the first client render
  // (effects haven't run yet at that point), so they always agree.
  if (!mounted || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <>
      <FontAwesomeLoader />

      {/* Silent revalidation bar */}
      {revalidating && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ animation: 'swrProgress 1.4s ease-in-out infinite' }} />
        </div>
      )}

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Progress" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-slate-900 font-bold text-[15px]">Your Progress</div>
                <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                  {loading ? 'Loading…' : `${courses.length} course${courses.length !== 1 ? 's' : ''} enrolled`}
                </div>
              </div>
              {revalidating && (
                <span className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                  Updating…
                </span>
              )}
            </div>
            <button className="relative w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-blue-700 hover:border-blue-300 transition-all">
              <i className="fa-solid fa-bell text-sm" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-700 rounded-full border-2 border-white" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

            {/* Welcome Banner */}
            <div className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="absolute right-32 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Overview</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    Keep learning, {(user?.name || '').split(' ')[0] || 'there'}
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {totalCompleted} of {totalLessons} lesson{totalLessons !== 1 ? 's' : ''} completed. You're doing great!
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: `${overallPct}%`, l: 'Overall\nProgress' },
                    { v: totalCompleted,   l: 'Lessons\nCompleted' },
                    { v: totalRemaining,   l: 'Still\nRemaining' },
                  ].map(s => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10">
                      <div className="text-white text-3xl font-black">{s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Progress Ring + Stat Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1 flex justify-center lg:justify-start">
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center">
                  {loading ? (
                    <div className="w-32 h-32 rounded-full border-4 border-blue-100 animate-pulse" />
                  ) : (
                    <ProgressRing percent={overallPct} />
                  )}
                </div>
              </div>
              <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard icon="fa-book"         value={loading ? '—' : String(totalLessons)}   label="Total Lessons" accentColor={COLORS.primary}  dimmed={revalidating} />
                <StatCard icon="fa-check-circle"  value={loading ? '—' : String(totalCompleted)} label="Completed"     accentColor={COLORS.success}  dimmed={revalidating} />
                <StatCard icon="fa-clock"         value={loading ? '—' : String(totalRemaining)} label="Remaining"     accentColor={COLORS.warning}  dimmed={revalidating} />
              </div>
            </div>

            {/* Section Header */}
            <div className="mt-4">
              <h2 className="text-slate-900 font-bold text-[15px]">Enrolled Courses</h2>
              <p className="text-slate-400 text-[11px] mt-0.5 tracking-wide">Track lessons, assignments, and quizzes per course</p>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation" />
                {error}
                <button
                  onClick={() => user && fetchSummary(user.id)}
                  className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Course List */}
            {loading ? (
              // Skeletons only on first-ever load (no cache)
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <CourseSkeleton key={i} />)}
              </div>
            ) : courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                  <i className="fa-solid fa-book-open text-slate-400 text-lg" />
                </div>
                <p className="text-slate-700 font-semibold text-sm">No Courses Yet</p>
                <p className="text-slate-400 text-xs mt-1">Enroll in courses to start tracking progress</p>
                <a href="/courses"
                  className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all"
                  style={{ backgroundColor: COLORS.primary }}>
                  Browse Courses →
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {courses.map((course, idx) => (
                  <CourseRow
                    key={course.courseId}
                    course={course}
                    index={idx}
                    onExpand={handleExpand}
                    onToggleLesson={handleToggleLesson}
                    togglingLesson={togglingLesson}
                  />
                ))}
              </div>
            )}

          </div>
        </main>
      </div>

      <style>{`
        @keyframes swrProgress {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(150%);  width: 40%; }
          100% { transform: translateX(150%);  width: 40%; }
        }
      `}</style>
    </>
  );
}