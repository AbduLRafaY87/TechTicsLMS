'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import { cache, TTL } from '../../../lib/cache';
import { CACHE_KEYS } from '../../../lib/cachedApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherStats {
  courses: number;
  totalStudents: number;
  pendingSubmissions: number;
  unreadNotifications: number;
}

interface PendingGrading {
  id: string;
  user: { id: string; name: string };
  assignment: { id: string; title: string; course: { id: string; title: string } };
  submittedAt: string;
}

interface RecentEnrollment {
  user: { id: string; name: string; email: string; avatar?: string };
  course: { id: string; title: string };
  enrolledAt: string;
}

interface TeacherCourse {
  id: string;
  title: string;
  description?: string;
  isPublished: boolean;
  createdAt: string;
  _count: { enrollments: number; modules: number };
}

interface TeacherDashboardPayload {
  stats: TeacherStats | null;
  pendingGrading: PendingGrading[];
  recentEnrollments: RecentEnrollment[];
  courses: TeacherCourse[];
}

// ─── Cache keys ───────────────────────────────────────────────────────────────

const teacherDashboardKey = (userId: string) => CACHE_KEYS.teacherDashboard(userId);
const teacherCoursesKey   = (userId: string) => CACHE_KEYS.teacherCourses(userId);

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

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, light, sub }: {
  label: string; value: string | number; icon: string; accent: string; light: string; sub: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: light, color: accent, fontSize: '1rem' }}>
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

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({ course, onManage }: { course: TeacherCourse; onManage: (id: string) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center font-bold text-sm text-blue-700 shrink-0">
        {course.title.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-slate-800 truncate">{course.title}</div>
        <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
          <span>{course._count.enrollments} students</span>
          <span>{course._count.modules} modules</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${course.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {course.isPublished ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>
      <button onClick={() => onManage(course.id)}
        className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1 shrink-0">
        Manage <i className="fa-solid fa-arrow-right text-[10px]" />
      </button>
    </div>
  );
}

function SkeletonRow({ avatar = 'square' }: { avatar?: 'square' | 'circle' }) {
  return (
    <div className="px-5 py-4 flex gap-3 animate-pulse border-b border-slate-50">
      <div className={`w-9 h-9 bg-slate-100 shrink-0 ${avatar === 'circle' ? 'rounded-full' : 'rounded-lg'}`} />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-3/5" />
        <div className="h-2.5 bg-slate-100 rounded w-2/5" />
      </div>
    </div>
  );
}

// ─── Revalidating dot ─────────────────────────────────────────────────────────

function RevalidatingDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span title="Refreshing…"
      className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse ml-1.5 align-middle" />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDashboard(res: any) {
  return res?.data?.data ?? res?.data ?? {};
}

function extractArray(res: any): any[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.courses)) return d.courses;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [payload, setPayload]           = useState<TeacherDashboardPayload | null>(null);
  const [loading, setLoading]           = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // ── Mounted gate ─────────────────────────────────────────────────────────────
  // `new Date()` for the greeting and the header date string is evaluated
  // during render. On the server this runs at server time/locale; on the
  // client it runs again during hydration. If those don't land on the exact
  // same value (different timezone, or the clock ticking over a boundary),
  // React sees mismatched text and throws a hydration error. Gating these on
  // `mounted` makes the server render and the client's *first* render emit
  // identical placeholder output, so hydration always matches — the real
  // date/greeting fills in a tick later, safely after hydration completes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Smart fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (userId: string, background = false) => {
    const dashKey    = teacherDashboardKey(userId);
    const coursesKey = teacherCoursesKey(userId);
    const cached     = cache.get<TeacherDashboardPayload>(dashKey);

    if (cached) {
      setPayload(cached);
      setLoading(false);
      if (!cache.isStale(dashKey)) return;
      setRevalidating(true);
    } else {
      if (!background) setLoading(true);
    }

    setError(null);

    try {
      const [dashRes, coursesRes] = await Promise.all([
        api.teacher.getDashboard(),
        cache.fetch(coursesKey, () => api.teacher.getCourses(), TTL.COURSES),
      ]);

      const d        = extractDashboard(dashRes);
      const courses  = Array.isArray(coursesRes) ? coursesRes : extractArray(coursesRes);

      const fresh: TeacherDashboardPayload = {
        stats:             d?.stats             ?? null,
        pendingGrading:    d?.pendingGrading    ?? [],
        recentEnrollments: d?.recentEnrollments ?? [],
        courses,
      };

      cache.set(dashKey, fresh, TTL.DASHBOARD);
      setPayload(fresh);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────────────
  const initialized = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') { router.replace('/dashboard'); return; }
    if (initialized.current) return;
    initialized.current = true;
    fetchData(user.id);
  }, [authLoading, user, router, fetchData]);

  // ── Focus revalidation ───────────────────────────────────────────────────────
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    const onFocus = () => {
      if (!userRef.current) return;
      const key = teacherDashboardKey(userRef.current.id);
      if (cache.isStale(key)) fetchData(userRef.current.id, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  // ── Auth guard render ─────────────────────────────────────────────────────────
  if (!mounted) return null;
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) return null;

  // ── Derived ───────────────────────────────────────────────────────────────────
  const stats             = payload?.stats             ?? null;
  const pendingGrading    = payload?.pendingGrading    ?? [];
  const recentEnrollments = payload?.recentEnrollments ?? [];
  const courses           = payload?.courses           ?? [];

  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const hour        = mounted ? new Date().getHours() : -1;
  const greeting    = !mounted ? 'Welcome' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const statCards = [
    { icon: 'fa-book-open',  value: loading ? '—' : (stats?.courses ?? '—'),             label: 'My Courses',      accent: '#2563EB', light: '#EFF6FF', sub: 'Active courses'         },
    { icon: 'fa-users',      value: loading ? '—' : (stats?.totalStudents ?? '—'),       label: 'Total Students',  accent: '#059669', light: '#F0FDF4', sub: 'Across all courses'     },
    { icon: 'fa-file-lines', value: loading ? '—' : (stats?.pendingSubmissions ?? '—'),  label: 'Pending Reviews', accent: '#D97706', light: '#FFFBEB', sub: 'Awaiting your feedback' },
    { icon: 'fa-bell',       value: loading ? '—' : (stats?.unreadNotifications ?? '—'), label: 'Notifications',   accent: '#7C3AED', light: '#F5F3FF', sub: 'Unread alerts'          },
  ];

  const quickActions = [
    { label: 'Create Course',     icon: 'fa-plus',            href: '/teacher/courses'     },
    { label: 'Grade Submissions', icon: 'fa-check',           href: '/teacher/submissions' },
    { label: 'Manage Students',   icon: 'fa-users',           href: '/teacher/students'    },
    { label: 'New Assignment',    icon: 'fa-clipboard-list',  href: '/teacher/assignments' },
    { label: 'Create Quiz',       icon: 'fa-circle-question', href: '/teacher/quizzes'     },
    { label: 'Mark Attendance',   icon: 'fa-calendar-check',  href: '/teacher/attendance'  },
  ];

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
        <Sidebar activeItem="Dashboard" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">
                Teacher Dashboard
                <RevalidatingDot show={revalidating} />
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '\u00A0'}
              </div>
            </div>
            <button onClick={() => router.push('/teacher/courses')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
              <i className="fa-solid fa-plus text-xs" />New Course
            </button>
          </header>

          {/* Error */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />{error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Welcome Banner */}
            <div className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Teacher Portal</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    {greeting}, {displayName} 👋
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {loading
                      ? 'Loading your dashboard…'
                      : stats
                        ? `${stats.pendingSubmissions} submission${stats.pendingSubmissions !== 1 ? 's' : ''} to grade · ${stats.totalStudents} total students`
                        : 'Welcome back to your teaching portal'}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: loading ? '—' : (stats?.courses ?? '—'),             l: 'My\nCourses'   },
                    { v: loading ? '—' : (stats?.totalStudents ?? '—'),       l: 'Total\nStudents' },
                    { v: loading ? '—' : (stats?.pendingSubmissions ?? '—'),  l: 'Pending\nReviews' },
                  ].map(s => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      <div className="text-white text-3xl font-black">{s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {statCards.map(s => <StatCard key={s.label} {...s} />)}
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="text-slate-900 font-bold text-[14px] tracking-tight mb-3">Quick Actions</div>
              <div className="flex flex-wrap gap-2">
                {quickActions.map(a => (
                  <button key={a.label} onClick={() => router.push(a.href)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all font-medium">
                    <i className={`fa-solid ${a.icon} text-sm`} />{a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pending + Enrollments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Pending Grading */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[14px] text-slate-800">
                      Pending Grading<RevalidatingDot show={revalidating} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Submissions awaiting review</div>
                  </div>
                  {(stats?.pendingSubmissions ?? 0) > 0 && (
                    <span className="bg-amber-50 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-200">
                      {stats?.pendingSubmissions} pending
                    </span>
                  )}
                </div>
                <div>
                  {loading ? (
                    [0,1,2].map(i => <SkeletonRow key={i} avatar="square" />)
                  ) : pendingGrading.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                        <i className="fa-solid fa-circle-check text-xl text-green-400" />
                      </div>
                      <p className="text-slate-600 font-semibold text-sm">All caught up!</p>
                      <p className="text-slate-400 text-xs">No submissions pending review</p>
                    </div>
                  ) : (
                    pendingGrading.slice(0, 5).map(s => (
                      <div key={s.id}
                        onClick={() => router.push(`/teacher/submissions?assignmentId=${s.assignment.id}`)}
                        className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors">
                        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                          {s.user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-800 truncate">{s.assignment.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">{s.user.name} · {s.assignment.course.title}</div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))
                  )}
                  {pendingGrading.length > 0 && (
                    <button onClick={() => router.push('/teacher/submissions')}
                      className="w-full py-3 text-sm text-blue-700 font-semibold hover:bg-blue-50 transition-colors border-t border-slate-100 flex items-center justify-center gap-1">
                      View all submissions <i className="fa-solid fa-arrow-right text-[10px]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Recent Enrollments */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[14px] text-slate-800">
                      Recent Enrollments<RevalidatingDot show={revalidating} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">Students who joined recently</div>
                  </div>
                  {recentEnrollments.length > 0 && (
                    <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200">
                      {recentEnrollments.length} new
                    </span>
                  )}
                </div>
                <div>
                  {loading ? (
                    [0,1,2].map(i => <SkeletonRow key={i} avatar="circle" />)
                  ) : recentEnrollments.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                        <i className="fa-solid fa-users text-xl text-slate-300" />
                      </div>
                      <p className="text-slate-600 font-semibold text-sm">No enrollments yet</p>
                      <p className="text-slate-400 text-xs">Students will appear here when they enroll</p>
                    </div>
                  ) : (
                    recentEnrollments.slice(0, 5).map((e, i) => (
                      <div key={i} className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {e.user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-slate-800">{e.user.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">Enrolled in {e.course.title}</div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">
                          {new Date(e.enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))
                  )}
                  {recentEnrollments.length > 0 && (
                    <button onClick={() => router.push('/teacher/students')}
                      className="w-full py-3 text-sm text-blue-700 font-semibold hover:bg-blue-50 transition-colors border-t border-slate-100 flex items-center justify-center gap-1">
                      View all students <i className="fa-solid fa-arrow-right text-[10px]" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* My Courses */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-[14px] text-slate-800">
                    My Courses<RevalidatingDot show={revalidating} />
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {loading ? 'Loading…' : `${courses.length} course${courses.length !== 1 ? 's' : ''} you teach`}
                  </div>
                </div>
                <button onClick={() => router.push('/teacher/courses')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
                  <i className="fa-solid fa-plus text-xs" />New Course
                </button>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">
                  {[0,1,2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : courses.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                    <i className="fa-solid fa-book-open text-2xl text-slate-300" />
                  </div>
                  <p className="text-slate-600 font-semibold text-sm">No courses yet</p>
                  <button onClick={() => router.push('/teacher/courses')}
                    className="mt-1 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors">
                    Create Course
                  </button>
                </div>
              ) : (
                <div className="p-5 space-y-3">
                  {courses.map(c => (
                    <CourseCard key={c.id} course={c} onManage={id => router.push(`/teacher/courses/${id}`)} />
                  ))}
                  {courses.length >= 5 && (
                    <button onClick={() => router.push('/teacher/courses')}
                      className="w-full py-2.5 text-sm text-blue-700 font-semibold border border-blue-100 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
                      View all courses <i className="fa-solid fa-arrow-right text-[10px]" />
                    </button>
                  )}
                </div>
              )}
            </div>
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