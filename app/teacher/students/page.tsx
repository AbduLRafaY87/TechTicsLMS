'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import { useCache } from '../../../lib/useCache';
import { cache, TTL } from '../../../lib/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
  enrollments?: {
    course: { id: string; title: string };
    enrolledAt: string;
  }[];
  _count?: {
    enrollments: number;
    submissions: number;
    quizAttempts: number;
  };
}

interface Course {
  id: string;
  title: string;
}

interface CachedStudentsData {
  students: Student[];
  courses: Course[];
}

// ─── Cache Keys ───────────────────────────────────────────────────────────────

const STUDENTS_CACHE_KEY = 'teacher:students:all';

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

// ─── Stat Card Skeleton ───────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm animate-pulse">
      <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-6 bg-slate-100 rounded w-1/3" />
        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
        <div className="h-2 bg-slate-100 rounded w-2/5" />
      </div>
    </div>
  );
}

// ─── Student Row Skeleton ─────────────────────────────────────────────────────

function StudentRowSkeleton() {
  return (
    <tr className="border-b border-slate-100 animate-pulse">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 bg-slate-100 rounded w-32" />
            <div className="h-2.5 bg-slate-100 rounded w-24" />
          </div>
        </div>
      </td>
      <td className="px-6 py-4 hidden md:table-cell">
        <div className="h-3 bg-slate-100 rounded w-20" />
      </td>
      <td className="px-6 py-4 hidden lg:table-cell">
        <div className="h-3 bg-slate-100 rounded w-28" />
      </td>
      <td className="px-6 py-4">
        <div className="h-3 bg-slate-100 rounded w-12" />
      </td>
    </tr>
  );
}

// ─── Student Detail Modal ─────────────────────────────────────────────────────

function StudentModal({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const initials = (name = '') =>
    name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const ACCENT_COLORS = ['#1E3A5F', '#2563EB', '#0F766E', '#6D28D9', '#B45309'];
  const color = ACCENT_COLORS[student.name.charCodeAt(0) % ACCENT_COLORS.length];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-8 flex flex-col items-center text-white relative"
          style={{ background: `linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)` }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl mb-3 shadow-lg"
            style={{ background: color }}
          >
            {initials(student.name)}
          </div>
          <h2 className="text-lg font-bold text-center">{student.name}</h2>
          <p className="text-blue-200 text-sm mt-0.5">{student.email}</p>
          <span className="mt-2 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-blue-100">
            Student
          </span>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Courses', value: student._count?.enrollments ?? student.enrollments?.length ?? 0, icon: 'fa-book-open', color: '#2563EB' },
              { label: 'Submissions', value: student._count?.submissions ?? 0, icon: 'fa-file-lines', color: '#0F766E' },
              { label: 'Quizzes', value: student._count?.quizAttempts ?? 0, icon: 'fa-circle-check', color: '#6D28D9' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <i className={`fa-solid ${s.icon} text-sm mb-1 block`} style={{ color: s.color }} />
                <div className="text-slate-900 font-black text-lg leading-none">{s.value}</div>
                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Enrolled Courses */}
          {student.enrollments && student.enrollments.length > 0 && (
            <div>
              <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest mb-2">Enrolled Courses</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {student.enrollments.map((e, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-black shrink-0">
                      {e.course.title.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-slate-700 text-sm font-medium truncate flex-1">{e.course.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Joined */}
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <i className="fa-solid fa-calendar text-slate-300" />
            Joined {new Date(student.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeStudents(raw: any[]): Student[] {
  return raw.map((s: any) => ({
    id: s.id,
    name: s.name ?? s.user?.name ?? 'Unknown',
    email: s.email ?? s.user?.email ?? '',
    avatar: s.avatar ?? s.user?.avatar,
    createdAt: s.createdAt ?? '',
    enrollments: Array.isArray(s.enrollments)
      ? s.enrollments.map((e: any) => ({
          course: {
            id: e.course?.id ?? e.courseId ?? '',
            title: e.course?.title ?? 'Untitled',
          },
          enrolledAt: e.enrolledAt ?? e.createdAt ?? '',
        }))
      : [],
    _count: {
      enrollments: s._count?.enrollments ?? s.enrollments?.length ?? 0,
      submissions: s._count?.submissions ?? 0,
      quizAttempts: s._count?.quizAttempts ?? 0,
    },
  }));
}

function extractArray(res: any): any[] {
  const d = res?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.students)) return d.students;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeacherStudentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Local state for filters
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'courses'>('name');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // ── Fetch function with cache ─────────────────────────────────────────────────
  const fetchStudentsData = useCallback(async (): Promise<CachedStudentsData> => {
    try {
      // ── Primary: use teacher-scoped endpoints ──────────────────────────
      const [studentsRes, coursesRes] = await Promise.all([
        api.teacher.getAllStudents(),
        api.teacher.getCourses(),
      ]);

      const rawStudents = extractArray(studentsRes);
      const rawCourses = extractArray(coursesRes);

      return {
        students: normalizeStudents(rawStudents),
        courses: rawCourses.map((c: any) => ({ id: c.id, title: c.title })),
      };
    } catch (primaryErr: any) {
      // ── Fallback: aggregate per-course if teacher endpoint not ready ───
      const coursesRes: any = await api.teacher.getCourses();
      const rawCourses = extractArray(coursesRes);
      const courses = rawCourses.map((c: any) => ({ id: c.id, title: c.title }));

      const studentMap = new Map<string, Student>();

      await Promise.all(
        rawCourses.map(async (course: any) => {
          try {
            const res: any = await api.teacher.getCourseStudents(course.id);
            const raw = extractArray(res);

            raw.forEach((s: any) => {
              const enrollment = {
                course: { id: course.id, title: course.title },
                enrolledAt: s.enrolledAt ?? s.createdAt ?? '',
              };
              const existing = studentMap.get(s.id);
              if (existing) {
                existing.enrollments = [...(existing.enrollments ?? []), enrollment];
                if (existing._count) existing._count.enrollments += 1;
              } else {
                studentMap.set(s.id, {
                  id: s.id,
                  name: s.name ?? s.user?.name ?? 'Unknown',
                  email: s.email ?? s.user?.email ?? '',
                  avatar: s.avatar ?? s.user?.avatar,
                  createdAt: s.createdAt ?? '',
                  enrollments: [enrollment],
                  _count: {
                    enrollments: 1,
                    submissions: s._count?.submissions ?? 0,
                    quizAttempts: s._count?.quizAttempts ?? 0,
                  },
                });
              }
            });
          } catch {
            // skip individual course failures silently
          }
        })
      );

      return {
        students: Array.from(studentMap.values()),
        courses,
      };
    }
  }, []);

  // ── Use cache hook with SWR pattern ────────────────────────────────────────────
  const { data: cachedData, loading, error, refresh } = useCache<CachedStudentsData>(
    authLoading || !user ? null : STUDENTS_CACHE_KEY,
    fetchStudentsData,
    { ttl: TTL.COURSES, enabled: !authLoading && !!user }
  );

  const students = cachedData?.students ?? [];
  const courses = cachedData?.courses ?? [];

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!mounted) return null;
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'TEACHER' && user.role !== 'ADMIN')) {
    router.replace('/dashboard');
    return null;
  }

  // ── Derive unique courses from student enrollments as supplemental list ────
  const courseSet = new Map<string, Course>();
  courses.forEach((c) => courseSet.set(c.id, c));
  students.forEach((s) =>
    s.enrollments?.forEach((e) => {
      if (!courseSet.has(e.course.id)) courseSet.set(e.course.id, e.course);
    })
  );
  const allCourses = Array.from(courseSet.values());

  // ── Filter & sort ──────────────────────────────────────────────────────────
  const filtered = students
    .filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase());
      const matchCourse =
        courseFilter === 'all' ||
        s.enrollments?.some((e) => e.course.id === courseFilter);
      return matchSearch && matchCourse;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'courses')
        return (b._count?.enrollments ?? 0) - (a._count?.enrollments ?? 0);
      if (sortBy === 'date')
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const ACCENT_COLORS = ['#1E3A5F', '#2563EB', '#0F766E', '#6D28D9', '#B45309', '#DC2626', '#0369A1', '#4338CA'];
  const initials = (name = '') =>
    name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const displayName = user?.name?.split(' ')[0] || 'Teacher';

  return (
    <>
      <FontAwesomeLoader />

      {selectedStudent && (
        <StudentModal student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      )}

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Students" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">Student Management</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <div className="relative hidden md:block">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
              <input
                type="search"
                placeholder="Search students…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-56"
              />
            </div>
          </header>

          {/* Error Banner */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={refresh} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">
                Retry
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Welcome Banner */}
            <div
              className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}
            >
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Overview</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    Your Students, {displayName}
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {loading
                      ? 'Loading student data…'
                      : `${students.length} student${students.length !== 1 ? 's' : ''} across ${allCourses.length} course${allCourses.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: students.length, l: 'Total\nStudents' },
                    { v: allCourses.length, l: 'Your\nCourses' },
                  ].map((s) => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      <div className="text-white text-3xl font-black">{loading ? '—' : s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat Cards */}
            {loading ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  label="Total Students"
                  value={students.length}
                  icon="fa-users"
                  accent="#1E3A5F"
                  light="#EFF6FF"
                  sub="Across all courses"
                />
                <StatCard
                  label="My Courses"
                  value={allCourses.length}
                  icon="fa-book-open"
                  accent="#0369A1"
                  light="#E0F2FE"
                  sub="Active courses"
                />
                <StatCard
                  label="Filtered Results"
                  value={filtered.length}
                  icon="fa-filter"
                  accent="#6D28D9"
                  light="#F5F3FF"
                  sub="Matching criteria"
                />
                <StatCard
                  label="Avg. Enrollments"
                  value={
                    students.length === 0
                      ? 0
                      : (
                          students.reduce((a, s) => a + (s._count?.enrollments ?? 0), 0) /
                          students.length
                        ).toFixed(1)
                  }
                  icon="fa-chart-bar"
                  accent="#B45309"
                  light="#FEF3C7"
                  sub="Per student"
                />
              </div>
            )}

            {/* Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-b border-slate-100">
                <div>
                  <div className="text-slate-900 font-bold text-[14px] tracking-tight">All Students</div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {loading ? 'Loading…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  {/* Mobile Search */}
                  <div className="relative sm:hidden w-full">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                    <input
                      type="search"
                      placeholder="Search students…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 transition-all w-full"
                    />
                  </div>

                  {/* Course filter */}
                  <select
                    value={courseFilter}
                    onChange={(e) => { setCourseFilter(e.target.value); setPage(1); }}
                    className="text-xs font-medium rounded-lg px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 outline-none focus:border-blue-400 transition cursor-pointer"
                  >
                    <option value="all">All Courses</option>
                    {allCourses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="text-xs font-medium rounded-lg px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 outline-none focus:border-blue-400 transition cursor-pointer"
                  >
                    <option value="name">Sort: Name</option>
                    <option value="date">Sort: Newest</option>
                    <option value="courses">Sort: Most Courses</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Joined</th>
                      <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Courses Enrolled</th>
                      <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => <StudentRowSkeleton key={i} />)
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                              <i className="fa-solid fa-users text-2xl text-slate-300" />
                            </div>
                            <p className="text-slate-600 font-semibold text-sm">No students found</p>
                            <p className="text-slate-400 text-xs">
                              {students.length === 0
                                ? 'No students have enrolled in your courses yet.'
                                : 'Try adjusting your search or filter.'}
                            </p>
                            {(search || courseFilter !== 'all') && (
                              <button
                                onClick={() => { setSearch(''); setCourseFilter('all'); }}
                                className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition"
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginated.map((student, idx) => {
                        const color = ACCENT_COLORS[(student.name.charCodeAt(0) ?? idx) % ACCENT_COLORS.length];
                        const enrollCount = student._count?.enrollments ?? student.enrollments?.length ?? 0;
                        return (
                          <tr
                            key={student.id}
                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => setSelectedStudent(student)}
                          >
                            {/* Student */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-black shrink-0 shadow-sm"
                                  style={{ background: color }}
                                >
                                  {initials(student.name)}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-slate-800 text-[13.5px] font-semibold truncate">{student.name}</div>
                                  <div className="text-slate-400 text-xs truncate">{student.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Joined */}
                            <td className="px-6 py-4 hidden md:table-cell">
                              <span className="text-slate-500 text-[13px]">
                                {student.createdAt
                                  ? new Date(student.createdAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : '—'}
                              </span>
                            </td>

                            {/* Courses */}
                            <td className="px-6 py-4 hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {student.enrollments?.slice(0, 2).map((e, i) => (
                                  <span
                                    key={i}
                                    className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[11px] font-medium truncate max-w-[120px]"
                                    title={e.course.title}
                                  >
                                    {e.course.title}
                                  </span>
                                ))}
                                {enrollCount > 2 && (
                                  <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[11px] font-medium">
                                    +{enrollCount - 2} more
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4">
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); }}
                                className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1"
                              >
                                View <i className="fa-solid fa-arrow-right text-[10px]" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
                  <span className="text-xs text-slate-400">
                    Showing {Math.min((page - 1) * PER_PAGE + 1, filtered.length)}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                    >
                      <i className="fa-solid fa-chevron-left text-[10px]" /> Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | '...')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-xs">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={`w-8 h-8 text-xs font-semibold rounded-lg transition ${
                              p === page
                                ? 'bg-blue-800 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
                    >
                      Next <i className="fa-solid fa-chevron-right text-[10px]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
