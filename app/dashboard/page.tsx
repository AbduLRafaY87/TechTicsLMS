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

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Poppins } from 'next/font/google';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { useCache } from '../../lib/useCache';
import { cachedApi, CACHE_KEYS } from '../../lib/cachedApi';
import { TTL } from '../../lib/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  title: string;
  description?: string;
  teacher: { id: string; name: string; email: string };
  _count: { enrollments: number };
  createdAt: string;
}

interface Enrollment {
  course: { id: string; title: string };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  enrollments?: Enrollment[];
  taughtCourses?: { id: string; title: string }[];
}

interface StudentDashboardData {
  stats: {
    enrollments: number;
    submissions: number;
    quizAttempts: number;
    unreadNotifications: number;
  };
  recentSubmissions: {
    id: string;
    status: string;
    score: number | null;
    submittedAt: string;
    assignment: { id: string; title: string; maxScore: number };
  }[];
  upcomingAssignments: {
    id: string;
    title: string;
    dueDate: string;
    course: { id: string; title: string };
  }[];
  recentCourses: {
    id: string;
    title: string;
    thumbnail?: string;
    teacher: { id: string; name: string };
    _count: { modules: number };
  }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = ['#1E3A5F', '#2563EB', '#0F766E', '#6D28D9', '#B45309', '#DC2626', '#0369A1', '#4338CA'];
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'] });

// ── Sub-components ────────────────────────────────────────────────────────────

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

function MiniBar({ mins, max, day, isToday }: { mins: number; max: number; day: string; isToday: boolean }) {
  const h = max > 0 ? (mins / max) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
        <div
          className="w-full rounded-t transition-all duration-500"
          style={{
            height: `${Math.max(h, mins === 0 ? 6 : 8)}%`,
            background: isToday ? 'linear-gradient(180deg,#2563EB,#1E3A5F)' : mins === 0 ? '#EFF6FF' : '#BFDBFE',
            minHeight: 6,
          }}
        />
      </div>
      <span className={`text-[10px] font-bold tracking-wide ${isToday ? 'text-blue-700' : 'text-slate-400'}`}>{day}</span>
    </div>
  );
}

function StatCard({ label, value, icon, accent, light, trend, loading }: {
  label: string; value: string; icon: string; accent: string; light: string; trend: string; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div
        className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: light, color: accent, fontSize: '1rem' }}
      >
        <i className={`fa-solid ${icon}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-7 bg-slate-100 rounded w-12" />
            <div className="h-2.5 bg-slate-100 rounded w-3/4 mt-1.5" />
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="text-3xl font-black text-slate-900 leading-none tracking-tight">{value}</div>
            <div className="text-slate-500 text-[11px] font-semibold mt-1.5 uppercase tracking-widest">{label}</div>
            <div className="text-xs font-medium mt-1" style={{ color: accent }}>{trend}</div>
          </>
        )}
      </div>
    </div>
  );
}

function CourseCardSkeleton() {
  return (
    <div className="px-6 py-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-10 text-center text-slate-400 text-sm">{text}</div>;
}

// Subtle "revalidating" indicator — doesn't block UI
function RevalidatingDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      title="Refreshing in background…"
      className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse ml-1.5 align-middle"
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const userId = user?.id ?? null;
  const isStudent = user && user.role !== 'TEACHER' && user.role !== 'ADMIN';

  // ── Redirect non-students ─────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      router.replace('/teacher/dashboard');
    }
  }, [user, authLoading, router]);

  // ── Cached data fetches ────────────────────────────────────────────────────
  // All three fire in parallel. On cache-hit they resolve instantly (no flash).
  // On cache-miss the skeleton shows only for that specific section.

  const {
    data: profile,
    loading: profileLoading,
    revalidating: profileRevalidating,
  } = useCache<UserProfile>(
    isStudent ? CACHE_KEYS.profile(userId!) : null,
    cachedApi.profile,
    TTL.PROFILE,
  );

  const {
    data: catalogCourses,
    loading: coursesLoading,
    revalidating: coursesRevalidating,
  } = useCache<Course[]>(
    isStudent ? CACHE_KEYS.courses('?limit=3') : null,
    () => cachedApi.courses('?limit=3'),
    TTL.COURSES,
  );

  const {
    data: dashboardData,
    loading: dashLoading,
    revalidating: dashRevalidating,
    error: dashError,
  } = useCache<StudentDashboardData>(
    isStudent ? CACHE_KEYS.dashboard(userId!) : null,
    cachedApi.dashboard,
    TTL.DASHBOARD,
  );

  // ── Auth / role guards ────────────────────────────────────────────────────
  if (!mounted) return null;
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }

  if (!user || user.role === 'TEACHER' || user.role === 'ADMIN') return null;

  // ── Derived values ────────────────────────────────────────────────────────

  const courses = catalogCourses ?? [];
  const studentData = dashboardData ?? null;

  const enrolledCount  = studentData?.stats?.enrollments ?? profile?.enrollments?.length ?? 0;
  const submissions    = studentData?.stats?.submissions ?? 0;
  const quizAttempts   = studentData?.stats?.quizAttempts ?? 0;
  const notifications  = studentData?.stats?.unreadNotifications ?? 0;

  const upcomingAssignments = studentData?.upcomingAssignments ?? [];
  const myCourses = studentData?.recentCourses?.map(c => ({ id: c.id, title: c.title }))
    ?? profile?.enrollments?.map(e => e.course)
    ?? [];

  const ACTIVITY = [
    { day: 'M', mins: 0 },
    { day: 'T', mins: 0 },
    { day: 'W', mins: 0 },
    { day: 'T', mins: 0 },
    { day: 'F', mins: 0 },
    { day: 'S', mins: 0 },
    { day: 'S', mins: (submissions + quizAttempts) * 15 },
  ];
  const maxMins = Math.max(...ACTIVITY.map(d => d.mins), 1);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  // Name available immediately from useAuth, no loading required
  const displayName = (user?.name || profile?.name || '').split(' ')[0] || 'there';

  const STATS = [
    {
      label: 'Enrolled Courses',  value: String(enrolledCount),  icon: 'fa-book-open',
      accent: '#1E3A5F', light: '#EFF6FF', trend: 'Active enrollments',
      loading: dashLoading && !studentData,
    },
    {
      label: 'Available Courses', value: String(courses.length), icon: 'fa-layer-group',
      accent: '#0369A1', light: '#E0F2FE', trend: 'In catalog',
      loading: coursesLoading && !courses.length,
    },
    {
      label: 'Submissions',       value: String(submissions),    icon: 'fa-award',
      accent: '#6D28D9', light: '#F5F3FF', trend: 'Total submitted',
      loading: dashLoading && !studentData,
    },
    {
      label: 'Quiz Attempts',     value: String(quizAttempts),   icon: 'fa-fire',
      accent: '#B45309', light: '#FEF3C7', trend: 'Quizzes taken',
      loading: dashLoading && !studentData,
    },
  ];

  const bannerStats = [
    { v: String(enrolledCount),         l: 'Enrolled\nCourses'  },
    { v: String(courses.length),        l: 'Available\nCourses' },
    { v: profile?.role ?? user?.role ?? '—', l: 'Your\nRole'   },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <FontAwesomeLoader />

      <div className={`flex h-screen overflow-hidden bg-slate-50 ${poppins.className}`}>
        <Sidebar activeItem="Dashboard" />

        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-14 md:top-0 z-10 shrink-0 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">
                {greeting}, {displayName}
                <RevalidatingDot show={profileRevalidating || dashRevalidating || coursesRevalidating} />
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search courses, topics…"
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-56"
                />
              </div>
              <button className="relative w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-blue-700 hover:border-blue-300 transition-all">
                <i className="fa-solid fa-bell text-sm" aria-hidden="true" />
                {notifications > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-700 rounded-full border-2 border-white" />
                )}
              </button>
            </div>
          </header>

          {dashError && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              {dashError}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-7 space-y-6">

            {/* Welcome Banner — renders immediately from useAuth, no wait */}
            <div
              className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}
            >
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="absolute right-32 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Overview</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    Keep up the momentum, {displayName}
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {enrolledCount} active enrollment{enrolledCount !== 1 ? 's' : ''} and {upcomingAssignments.length} upcoming task{upcomingAssignments.length !== 1 ? 's' : ''} to check.
                  </p>
                  <a
                    href="/assignments"
                    className="mt-4 inline-block px-5 py-2 bg-white text-blue-900 rounded-lg text-[13px] font-bold shadow hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    View Assignments &rarr;
                  </a>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {bannerStats.map(s => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      {/* Skeleton for banner numbers while loading */}
                      {dashLoading && !studentData && s.l.includes('Course') ? (
                        <div className="h-9 w-8 bg-white/20 rounded animate-pulse mx-auto" />
                      ) : (
                        <div className="text-white text-3xl font-black">{s.v}</div>
                      )}
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat Cards — each card shows its own skeleton independently */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {STATS.map(s => <StatCard key={s.label} {...s} />)}
            </div>

            {/* Middle Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Latest Courses */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                  <div>
                    <div className="text-slate-900 font-bold text-[14px] tracking-tight">
                      Latest Courses
                      <RevalidatingDot show={coursesRevalidating} />
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">Recently added to the catalog</div>
                  </div>
                  <a href="/courses" className="text-blue-700 text-xs font-semibold hover:text-blue-900 transition-colors">All Courses &rarr;</a>
                </div>
                <div className="divide-y divide-slate-100">
                  {coursesLoading && !courses.length
                    ? [0, 1, 2].map(i => <CourseCardSkeleton key={i} />)
                    : courses.length === 0
                      ? <EmptyState text="No courses available yet." />
                      : courses.map((c, idx) => {
                          const color = ACCENT_COLORS[idx % ACCENT_COLORS.length];
                          return (
                            <a key={c.id} href={`/courses/${c.id}`} className="flex px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="flex items-start gap-4 w-full">
                                <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-white font-black text-sm" style={{ background: color }}>
                                  {c.title.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-slate-800 text-[13.5px] font-semibold truncate group-hover:text-blue-700 transition-colors">{c.title}</div>
                                  <div className="text-slate-400 text-xs mt-0.5">{c.teacher?.name}</div>
                                  <div className="mt-2.5 flex justify-between">
                                    <span className="text-slate-400 text-[11px] flex items-center gap-1">
                                      <i className="fa-solid fa-users text-[10px]" aria-hidden="true" />
                                      {c._count?.enrollments ?? 0} enrolled
                                    </span>
                                    <span className="text-[11px] font-semibold" style={{ color }}>View &rarr;</span>
                                  </div>
                                </div>
                              </div>
                            </a>
                          );
                        })}
                </div>
              </div>

              {/* Weekly Activity */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-slate-900 font-bold text-[14px] tracking-tight">Weekly Activity</div>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full tracking-wide">
                    {enrolledCount} courses
                  </span>
                </div>
                <div className="text-slate-400 text-xs mb-5">Enrollment progress</div>
                <div className="flex items-end gap-1.5 flex-1">
                  {ACTIVITY.map((d, i) => (
                    <MiniBar key={i} mins={d.mins} max={maxMins} day={d.day} isToday={i === 6} />
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg py-3">
                    {dashLoading && !studentData ? (
                      <div className="h-6 w-8 bg-blue-100 rounded animate-pulse mx-auto" />
                    ) : (
                      <div className="text-blue-800 font-black text-lg">{enrolledCount}</div>
                    )}
                    <div className="text-blue-500 text-[10px] font-semibold uppercase tracking-widest mt-0.5">Enrolled</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg py-3">
                    {dashLoading && !studentData ? (
                      <div className="h-6 w-8 bg-slate-100 rounded animate-pulse mx-auto" />
                    ) : (
                      <div className="text-slate-800 font-black text-lg">{submissions}</div>
                    )}
                    <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest mt-0.5">Submitted</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Upcoming Assignments */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                  <div>
                    <div className="text-slate-900 font-bold text-[14px] tracking-tight">
                      Upcoming Assignments
                      <RevalidatingDot show={dashRevalidating} />
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">Deadlines &amp; scheduled tasks</div>
                  </div>
                  <span className="bg-red-50 text-red-600 text-[11px] font-bold px-2.5 py-1 rounded-full">
                    {upcomingAssignments.length} upcoming
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {dashLoading && !studentData ? (
                    [0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                        <div className="w-1 h-8 rounded-full bg-slate-100 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-slate-100 rounded w-2/3" />
                          <div className="h-3 bg-slate-100 rounded w-1/3" />
                        </div>
                      </div>
                    ))
                  ) : upcomingAssignments.length ? (
                    upcomingAssignments.slice(0, 4).map((a, i) => {
                      const color = ACCENT_COLORS[i % ACCENT_COLORS.length];
                      const due = new Date(a.dueDate);
                      const diff = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
                      const dueLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
                      return (
                        <div key={a.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                          <div className="w-1 h-8 rounded-full shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-800 text-[13px] font-semibold truncate">{a.title}</div>
                            <div className="text-slate-400 text-[11px] mt-0.5">{a.course.title}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color, background: `${color}14` }}>Assignment</div>
                            <div className="text-slate-400 text-[11px] mt-1">{dueLabel}</div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyState text="No upcoming assignments." />
                  )}
                </div>
              </div>

              {/* My Enrollments */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                  <div>
                    <div className="text-slate-900 font-bold text-[14px] tracking-tight">
                      My Enrollments
                      <RevalidatingDot show={dashRevalidating || profileRevalidating} />
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">Courses you're enrolled in</div>
                  </div>
                  <a href="/courses" className="text-blue-700 text-xs font-semibold hover:text-blue-900 transition-colors">Browse &rarr;</a>
                </div>

                {(dashLoading || profileLoading) && !myCourses.length ? (
                  <div className="divide-y divide-slate-100">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-slate-100 rounded w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100">
                      {myCourses.length
                        ? myCourses.slice(0, 4).map((c, i) => (
                            <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-black shrink-0"
                                style={{ background: ACCENT_COLORS[i % ACCENT_COLORS.length] }}
                              >
                                {c.title.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-slate-800 text-[13px] font-medium truncate">{c.title}</div>
                              </div>
                              <div className="w-2 h-2 rounded-full bg-blue-700 shrink-0" />
                            </div>
                          ))
                        : <EmptyState text="Not enrolled in any courses yet." />
                      }
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                      <div className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-3">Quick Links</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Gradebook',  href: '/gradebook'  },
                          { label: 'Schedule',   href: '/schedule'   },
                          { label: 'Progress',   href: '/progress'   },
                          { label: 'Attendance', href: '/attendance' },
                        ].map(l => (
                          <a
                            key={l.label}
                            href={l.href}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded text-[11.5px] font-semibold text-slate-700 hover:bg-blue-700 hover:text-white hover:border-blue-700 transition-all"
                          >
                            {l.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}