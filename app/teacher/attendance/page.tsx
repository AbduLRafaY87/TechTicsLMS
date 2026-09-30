'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import { useCache } from '../../../lib/useCache';
import { cache, TTL } from '../../../lib/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

// Must match API: 'present' | 'absent' | 'late' | 'excused'  (all lowercase)
type ApiStatus = 'present' | 'absent' | 'late' | 'excused';

// UI display label (capitalised)
type DisplayStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

interface Course {
  id: string;
  title: string;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status?: ApiStatus | null;      // lowercase — matches API
  attendanceId?: string | null;
}

interface SummaryRow {
  studentId: string;
  name: string;
  email: string;
  avatar?: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  percentage: number;
}

interface CachedAttendanceData {
  students: StudentRow[];
  courses: Course[];
}

// ─── Cache Keys ───────────────────────────────────────────────────────────────

const getAttendanceCacheKey = (courseId: string, date: string) => `teacher:attendance:${courseId}:${date}`;
const COURSES_CACHE_KEY = 'teacher:attendance:courses';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function extractArray(raw: any, ...keys: string[]): any[] {
  if (Array.isArray(raw)) return raw;
  for (const key of keys) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  if (raw?.data) return extractArray(raw.data, ...keys);
  return [];
}

// Normalise any casing from the backend → lowercase ApiStatus
function normaliseStatus(raw: string | null | undefined): ApiStatus | null {
  if (!raw) return null;
  const lower = raw.toLowerCase() as ApiStatus;
  return ['present', 'absent', 'late', 'excused'].includes(lower) ? lower : null;
}

// For display only
function toDisplayStatus(s: ApiStatus): DisplayStatus {
  const map: Record<ApiStatus, DisplayStatus> = {
    present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused',
  };
  return map[s];
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApiStatus, { label: DisplayStatus; icon: string; active: string }> = {
  present: { label: 'Present', icon: 'fa-check',             active: 'bg-emerald-600 text-white border-emerald-600' },
  late:    { label: 'Late',    icon: 'fa-clock',             active: 'bg-amber-500 text-white border-amber-500'   },
  absent:  { label: 'Absent',  icon: 'fa-xmark',             active: 'bg-red-500 text-white border-red-500'       },
  excused: { label: 'Excused', icon: 'fa-file-circle-check', active: 'bg-slate-500 text-white border-slate-500'   },
};

const STATUS_ORDER: ApiStatus[] = ['present', 'late', 'absent', 'excused'];

// ─── Font Awesome Loader (identical to Teacher Dashboard) ─────────────────────

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

// ─── Stat Card (identical to Teacher Dashboard) ────────────────────────────────

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

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatar, size = 'md' }: { name: string; avatar?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-10 h-10 text-xs';
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const palette = ['bg-blue-100 text-blue-800','bg-indigo-100 text-indigo-800','bg-teal-100 text-teal-800','bg-violet-100 text-violet-800','bg-cyan-100 text-cyan-800','bg-emerald-100 text-emerald-800','bg-amber-100 text-amber-800','bg-rose-100 text-rose-800'];
  const color = palette[name.charCodeAt(0) % palette.length];
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0 overflow-hidden ${!avatar ? color : ''}`}>
      {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

function ProgressBar({ value, color = 'bg-blue-600' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function RowSkeleton() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 bg-slate-100 rounded w-28" />
            <div className="h-2.5 bg-slate-100 rounded w-40" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><div className="h-7 bg-slate-100 rounded w-full max-w-[260px]" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-slate-100 rounded w-16" /></td>
    </tr>
  );
}

// ─── Status picker ────────────────────────────────────────────────────────────

function StatusPicker({ value, onChange, saving }: {
  value: ApiStatus | null | undefined;
  onChange: (s: ApiStatus) => void;
  saving: boolean;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 p-1 bg-slate-50 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
      {STATUS_ORDER.map(s => {
        const cfg = STATUS_CONFIG[s];
        const isActive = value === s;
        return (
          <button key={s} type="button" onClick={() => onChange(s)} title={cfg.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${isActive ? cfg.active : 'bg-white border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
            <i className={`fa-solid ${cfg.icon} text-[10px]`} />
            <span className="hidden lg:inline">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Summary drawer (unchanged) ────────────────────────────────────────────────

function SummaryDrawer({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const [rows, setRows]       = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.teacher.getAttendanceSummary(`?courseId=${courseId}`);
        setRows(extractArray((res as any).data, 'students', 'summary', 'data'));
      } catch (e: any) {
        setError(e.message || 'Failed to load summary');
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId]);

  const pctColor = (p: number) => p >= 90 ? 'bg-emerald-500' : p >= 75 ? 'bg-blue-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end"
      style={{ background: 'rgba(15,32,64,0.5)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div className="bg-white h-full sm:h-auto sm:max-h-screen w-full sm:w-[460px] flex flex-col shadow-2xl sm:rounded-l-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0"
          style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">Attendance Summary</h2>
            <p className="text-xs text-blue-300 mt-0.5">Per-student totals for this course</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-white/10 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="space-y-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-2 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="text-center py-8">
              <i className="fa-solid fa-circle-exclamation text-red-400 text-2xl mb-2" />
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-clipboard-check text-xl text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No attendance recorded</p>
              <p className="text-xs text-slate-400 mt-1">Mark attendance for a session to see summary here.</p>
            </div>
          )}
          {!loading && rows.map((r, i) => (
            <div key={r.studentId} className={`py-4 ${i !== 0 ? 'border-t border-slate-100' : ''}`}>
              <div className="flex items-center gap-3 mb-2">
                <Avatar name={r.name} avatar={r.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{r.email}</p>
                </div>
                <span className={`text-xs font-black shrink-0 ${r.percentage >= 75 ? 'text-emerald-600' : r.percentage >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                  {r.percentage}%
                </span>
              </div>
              <ProgressBar value={r.percentage} color={pctColor(r.percentage)} />
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                <span><i className="fa-solid fa-check text-emerald-500 mr-1" />{r.present} present</span>
                <span><i className="fa-solid fa-clock text-amber-500 mr-1" />{r.late} late</span>
                <span><i className="fa-solid fa-xmark text-red-400 mr-1" />{r.absent} absent</span>
                <span><i className="fa-solid fa-file-circle-check text-slate-400 mr-1" />{r.excused} excused</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherAttendancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [courseId, setCourseId]   = useState<string>('');
  const [date, setDate]           = useState<string>(todayISO());

  // Local state for UI
  const [search, setSearch]             = useState('');
  const [showSummary, setShowSummary]   = useState(false);
  const [savingId, setSavingId]         = useState<string | null>(null);
  const [bulkSaving, setBulkSaving]     = useState(false);
  const [toast, setToast]               = useState<string | null>(null);

  // ── Fetch courses function ─────────────────────────────────────────────────
  const fetchCourses = useCallback(async (): Promise<Course[]> => {
    try {
      const res = await api.teacher.getCourses('?limit=100');
      return extractArray((res as any).data, 'courses', 'data');
    } catch (e: any) {
      console.error('Failed to load courses:', e);
      throw e;
    }
  }, []);

  // ── Fetch attendance data (students + attendance records) ──────────────────
  const fetchAttendanceData = useCallback(async (): Promise<CachedAttendanceData> => {
    if (!courseId || !date) throw new Error('Course and date required');

    try {
      // 1️⃣ Enrolled students in the course
      const studentsRes = await api.teacher.getCourseStudents(courseId);
      const rawStudents = extractArray((studentsRes as any).data, 'students', 'users', 'data', 'enrollments');

      // 2️⃣ Attendance records for this date
      const attRes = await api.teacher.getAttendance(`?courseId=${courseId}&date=${date}`);
      const rawAtt = extractArray((attRes as any).data, 'attendance', 'records', 'data');

      // ── DEBUG in development ──
      if (process.env.NODE_ENV === 'development') {
        console.log('[Attendance] rawStudents:', rawStudents);
        console.log('[Attendance] rawAtt:', rawAtt);
      }

      // 3️⃣ Build lookup: studentId → attendance record
      const byStudent: Record<string, { id: string; status: string }> = {};
      for (const rec of rawAtt) {
        const sid =
          rec.student?.id   ??   // nested object
          rec.studentId     ??   // flat field
          rec.userId        ??   // alternate
          rec.user?.id;          // nested alternate
        if (sid) {
          byStudent[sid] = { id: rec.id, status: rec.status };
        }
      }

      // 4️⃣ Merge students with attendance
      const merged: StudentRow[] = rawStudents.map((s: any) => {
        const sid = s.id ?? s.userId;
        const att = byStudent[sid];
        return {
          id: sid,
          name: s.name ?? s.fullName ?? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() ?? 'Unknown',
          email: s.email ?? '',
          avatar: s.avatar ?? s.profilePicture ?? undefined,
          status: att ? normaliseStatus(att.status) : null,
          attendanceId: att?.id ?? null,
        };
      });

      // Get courses for the data cache
      const courses = await fetchCourses();

      return { students: merged, courses };
    } catch (error: any) {
      console.error('Fetch attendance error:', error);
      throw error;
    }
  }, [courseId, date, fetchCourses]);

  // ── Cache hooks ────────────────────────────────────────────────────────────
  
  // Cache courses separately (rarely changes)
  const { data: coursesData, loading: coursesLoading, error: coursesError, refresh: refreshCourses } = useCache<Course[]>(
    authLoading || !user ? null : COURSES_CACHE_KEY,
    fetchCourses,
    { ttl: TTL.COURSES, enabled: !authLoading && !!user }
  );

  // Cache attendance data (changes per course/date)
  const attendanceCacheKey = courseId && date ? getAttendanceCacheKey(courseId, date) : null;
  const { data: attendanceData, loading: attendanceLoading, error: attendanceError, refresh: refreshAttendance } = useCache<CachedAttendanceData>(
    authLoading || !user || !courseId ? null : attendanceCacheKey,
    fetchAttendanceData,
    { ttl: TTL.ATTENDANCE, enabled: !authLoading && !!user && !!courseId && !!date }
  );

  const courses = coursesData ?? [];
  const students = attendanceData?.students ?? [];

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user)                                               { router.replace('/login');     return; }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') { router.replace('/dashboard'); return; }
  }, [authLoading, user, router]);

  // ── Set default course on load ────────────────────────────────────────────
  useEffect(() => {
    if (courses.length > 0 && !courseId) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Mark single student ───────────────────────────────────────────────────
  const markStatus = async (row: StudentRow, status: ApiStatus) => {
    setSavingId(row.id);

    const currentAttId = row.attendanceId ??
      students.find(s => s.id === row.id)?.attendanceId ??
      null;

    // Optimistic update
    const prevStudents = students;
    const newStudents = students.map(s => s.id === row.id ? { ...s, status } : s);
    if (attendanceData) {
      cache.set(attendanceCacheKey!, { ...attendanceData, students: newStudents }, TTL.ATTENDANCE);
    }

    try {
      if (currentAttId) {
        // ── Update existing ──────────────────────────────────────────────
        await api.updateAttendance(currentAttId, { status });
      } else {
        // ── Create new ───────────────────────────────────────────────────
        try {
          const res: any = await api.teacher.markAttendance({
            courseId,
            userId: row.id,
            date,
            status,
          });

          // Extract new attendance ID
          const newId =
            res?.data?.id ??
            res?.data?.attendance?.id ??
            res?.data?.data?.id ??
            null;

          if (newId) {
            const updatedStudents = newStudents.map(s =>
              s.id === row.id ? { ...s, attendanceId: newId } : s
            );
            if (attendanceData) {
              cache.set(attendanceCacheKey!, { ...attendanceData, students: updatedStudents }, TTL.ATTENDANCE);
            }
          } else {
            // Refresh to get IDs
            await refreshAttendance();
          }
        } catch (postErr: any) {
          // Handle 422 - record already exists
          if (postErr.message?.includes('422') || postErr.message?.includes('already') || postErr.message?.includes('duplicate')) {
            const freshRes = await api.teacher.getAttendance(`?courseId=${courseId}&date=${date}`);
            const freshAtt = extractArray((freshRes as any).data, 'attendance', 'records', 'data');
            const existing = freshAtt.find((r: any) => {
              const sid = r.student?.id ?? r.studentId ?? r.userId ?? r.user?.id;
              return sid === row.id;
            });
            if (existing?.id) {
              await api.updateAttendance(existing.id, { status });
              const updatedStudents = newStudents.map(s =>
                s.id === row.id ? { ...s, attendanceId: existing.id } : s
              );
              if (attendanceData) {
                cache.set(attendanceCacheKey!, { ...attendanceData, students: updatedStudents }, TTL.ATTENDANCE);
              }
              return;
            }
          }
          throw postErr;
        }
      }
    } catch (e: any) {
      console.error('Mark status error:', e);
      // Revert optimistic update
      if (attendanceData) {
        cache.set(attendanceCacheKey!, { ...attendanceData, students: prevStudents }, TTL.ATTENDANCE);
      }
      setToast(`Error: ${e.message || 'Failed to save attendance'}`);
    } finally {
      setSavingId(null);
    }
  };

  // ── Mark all present (bulk) ───────────────────────────────────────────────
  const markAllPresent = async () => {
    if (students.length === 0) return;
    setBulkSaving(true);

    try {
      await api.teacher.markBulkAttendance({
        courseId,
        date,
        records: students.map(s => ({
          userId: s.id,
          status: 'present' as const,
        })),
      });

      await refreshAttendance();
      setToast('All students marked present');
    } catch (e: any) {
      console.error('Bulk mark error:', e);
      setToast(`Error: ${e.message || 'Failed to mark all present'}`);
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  const filtered = students.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const presentCount = students.filter(s => s.status === 'present').length;
  const lateCount    = students.filter(s => s.status === 'late').length;
  const absentCount  = students.filter(s => s.status === 'absent').length;
  const excusedCount = students.filter(s => s.status === 'excused').length;
  const unmarkedCount = students.filter(s => !s.status).length;
  const selectedCourse = courses.find(c => c.id === courseId);

  const error = coursesError || attendanceError;
  const loading = coursesLoading || attendanceLoading;

  return (
    <>
      <FontAwesomeLoader />

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Attendance" />

        {showSummary && courseId && (
          <SummaryDrawer courseId={courseId} onClose={() => setShowSummary(false)} />
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed top-6 right-6 z-[60] px-4 py-3 rounded-lg bg-slate-900 text-white text-sm font-semibold shadow-xl flex items-center gap-2">
            <i className="fa-solid fa-circle-check text-emerald-400" />
            {toast}
          </div>
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar — identical structure to Teacher Dashboard's header */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">Attendance</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {/* Course select */}
              <div className="relative">
                <select value={courseId} onChange={e => { setCourseId(e.target.value); setSearch(''); }}
                  className="pl-9 pr-8 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all appearance-none cursor-pointer min-w-[170px]">
                  {coursesLoading && <option>Loading courses…</option>}
                  {courses.length === 0 && !coursesLoading && <option>No courses</option>}
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <i className="fa-solid fa-book-open absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
                <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
              </div>

              {/* Date picker */}
              <div className="relative">
                <i className="fa-solid fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none z-10" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="pl-9 pr-3 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>

              {/* Summary */}
              <button onClick={() => setShowSummary(true)} disabled={!courseId}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <i className="fa-solid fa-chart-pie text-xs" />
                Summary
              </button>
            </div>
          </header>

          {/* Error Banner — identical to Teacher Dashboard */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={() => { refreshCourses(); refreshAttendance(); }} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">
                Retry
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Welcome-style Banner — identical gradient/structure to Teacher Dashboard */}
            <div
              className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}
            >
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Class Management</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    {selectedCourse ? selectedCourse.title : 'Attendance'}
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {loading
                      ? 'Loading attendance…'
                      : `${presentCount} present · ${lateCount} late · ${absentCount} absent`}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: students.length, l: 'Total\nStudents' },
                    { v: presentCount, l: 'Present\nToday' },
                    { v: absentCount, l: 'Absent' },
                  ].map((s) => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      <div className="text-white text-3xl font-black">{loading ? '—' : s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat Cards — identical component to Teacher Dashboard */}
            {loading ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label="Total Students" value={students.length} icon="fa-users" accent="#2563EB" light="#EFF6FF" sub="Enrolled in course" />
                <StatCard label="Present Today" value={presentCount} icon="fa-check" accent="#059669" light="#F0FDF4" sub="Marked present" />
                <StatCard label="Late" value={lateCount} icon="fa-clock" accent="#D97706" light="#FFFBEB" sub="Arrived late" />
                <StatCard label="Absent" value={absentCount} icon="fa-xmark" accent="#DC2626" light="#FEF2F2" sub="Marked absent" />
              </div>
            )}

            {/* Roster table — same chrome as Dashboard's panels */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

              {/* Toolbar */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-slate-700">Class Roster</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs" />
                    <input type="text" placeholder="Search students…" value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all w-48" />
                  </div>
                  <button onClick={markAllPresent} disabled={bulkSaving || students.length === 0}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
                    {bulkSaving
                      ? <i className="fa-solid fa-spinner fa-spin text-[10px]" />
                      : <i className="fa-solid fa-check-double text-[10px]" />}
                    Mark all present
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
                    ) : !courseId ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                              <i className="fa-solid fa-book-open text-xl text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600">No course selected</p>
                            <p className="text-xs text-slate-400 mt-1">Select a course from the dropdown to start taking attendance.</p>
                          </div>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                              <i className="fa-solid fa-users text-xl text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600">No students found</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {search ? 'Try a different search term.' : 'No students enrolled in this course yet.'}
                            </p>
                            {search && (
                              <button onClick={() => setSearch('')}
                                className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900">
                                Clear search
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={s.name} avatar={s.avatar} size="sm" />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                <p className="text-xs text-slate-400">{s.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPicker
                              value={s.status}
                              saving={savingId === s.id}
                              onChange={status => markStatus(s, status)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            {savingId === s.id
                              ? <i className="fa-solid fa-spinner fa-spin text-slate-400 text-xs" />
                              : s.status
                                ? <i className="fa-solid fa-check text-emerald-500 text-xs" />
                                : <span className="text-xs text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              {!loading && students.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-400 flex-wrap">
                  <span>{filtered.length} of {students.length} students shown</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{presentCount} present</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{lateCount} late</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />{absentCount} absent</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" />{excusedCount} excused</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-200" />{unmarkedCount} unmarked</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
