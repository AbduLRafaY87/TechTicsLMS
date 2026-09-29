'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';
import { cache, TTL } from '../../lib/cache';
import { CACHE_KEYS } from '../../lib/cachedApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'Present' | 'Absent' | 'Late' | 'Excused';

interface AttendanceRecord {
  id: string;
  date: string;
  day: string;
  topic: string;
  course: string;
  courseId: string;
  status: Status;
}

interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTERS: (Status | 'All')[] = ['All', 'Present', 'Late', 'Absent', 'Excused'];

const STATUS_CONFIG: Record<Status, { icon: string; color: string; bg: string; border: string }> = {
  Present: { icon: 'fa-circle-check', color: '#047857', bg: '#ECFDF5', border: '#D1FAE5' },
  Late:    { icon: 'fa-clock',        color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  Absent:  { icon: 'fa-circle-xmark', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  Excused: { icon: 'fa-check-double', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
};

// ─── FA Loader ────────────────────────────────────────────────────────────────

function useFontAwesome() {
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDisplayStatus(raw: string | null | undefined): Status {
  const map: Record<string, Status> = {
    present: 'Present', PRESENT: 'Present',
    absent:  'Absent',  ABSENT:  'Absent',
    late:    'Late',    LATE:    'Late',
    excused: 'Excused', EXCUSED: 'Excused',
  };
  return map[raw ?? ''] ?? 'Absent';
}

function parseRecords(data: any): AttendanceRecord[] {
  const raw: any[] =
    Array.isArray(data)                   ? data :
    Array.isArray(data?.attendance)       ? data.attendance :
    Array.isArray(data?.data?.attendance) ? data.data.attendance :
    Array.isArray(data?.data)             ? data.data :
    [];

  return raw.map((r: any) => {
    const d = new Date(r.date ?? r.createdAt);
    return {
      id:       r.id ?? '',
      date:     isNaN(d.getTime()) ? (r.date ?? '') : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      day:      isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      topic:    r.lesson?.title ?? r.lessonTitle ?? r.topic ?? 'Lesson',
      course:   r.course?.title ?? r.courseTitle ?? r.courseName ?? 'Course',
      courseId: r.course?.id ?? r.courseId ?? '',
      status:   toDisplayStatus(r.status),
    };
  });
}

function parseSummary(data: any, records: AttendanceRecord[]): AttendanceSummary {
  // FIX: unwrap the nested shape returned by the updated backend
  // Backend now returns: { success, data: { summary: { total, present, late, absent, excused }, total, attendancePercentage } }
  const s =
    data?.summary ??          // { summary: { total, present, … } }
    data?.data?.summary ??    // already unwrapped one level upstream → still try
    data?.data ??
    data;

  if (s && (typeof s.total === 'number' || typeof s.present === 'number')) {
    return {
      total:   s.total   ?? 0,
      present: s.present ?? 0,
      late:    s.late    ?? 0,
      absent:  s.absent  ?? 0,
      excused: s.excused ?? 0,
    };
  }

  // Derive from records as fallback (e.g. summary endpoint failed)
  return {
    total:   records.length,
    present: records.filter(r => r.status === 'Present').length,
    late:    records.filter(r => r.status === 'Late').length,
    absent:  records.filter(r => r.status === 'Absent').length,
    excused: records.filter(r => r.status === 'Excused').length,
  };
}

interface AttendancePayload {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <tr className="border-t border-slate-100 animate-pulse">
      <td className="px-6 py-4"><div className="h-3.5 bg-slate-100 rounded w-20" /></td>
      <td className="px-6 py-4"><div className="h-3.5 bg-slate-100 rounded w-48" /></td>
      <td className="px-6 py-4 hidden md:table-cell"><div className="h-3.5 bg-slate-100 rounded w-36" /></td>
      <td className="px-6 py-4"><div className="h-6 bg-slate-100 rounded-full w-20 mx-auto" /></td>
    </tr>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-slate-100 mb-3" />
      <div className="h-8 bg-slate-100 rounded w-12 mb-1.5" />
      <div className="h-3 bg-slate-100 rounded w-20" />
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, bg, fg, dimmed }: {
  icon: string; value: number | string; label: string; bg: string; fg: string; dimmed?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-opacity duration-300"
      style={{ opacity: dimmed ? 0.6 : 1 }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
        style={{ background: bg, color: fg }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <p className="text-3xl font-black text-slate-900 leading-none">{value}</p>
      <p className="text-slate-500 text-[11px] font-semibold mt-1.5 uppercase tracking-widest">{label}</p>
    </div>
  );
}

// ─── Attendance Rate Ring ─────────────────────────────────────────────────────

function AttendanceRing({ percent }: { percent: number }) {
  const size = 140, sw = 8;
  const r = (size - sw * 2) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const color = percent >= 75 ? '#059669' : percent >= 50 ? '#D97706' : '#DC2626';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="attendRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#E2E8F0" strokeWidth={sw} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="url(#attendRingGrad)" strokeWidth={sw}
          strokeDasharray={`${(percent / 100) * c} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-black" style={{ color }}>
          {percent}<span className="text-lg">%</span>
        </span>
        <span className="text-xs font-medium mt-1 text-slate-500">Rate</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  useFontAwesome();
  const { user, loading: authLoading } = useAuth();

  const [records, setRecords]           = useState<AttendanceRecord[]>([]);
  const [summary, setSummary]           = useState<AttendanceSummary | null>(null);
  const [loading, setLoading]           = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const [filter, setFilter]             = useState<Status | 'All'>('All');
  const [courseFilter, setCourseFilter] = useState('All');
  const [search, setSearch]             = useState('');

  // ── Smart fetch (SWR) ─────────────────────────────────────────────────────
  const fetchAttendance = useCallback(async (userId: string, background = false) => {
    const key    = CACHE_KEYS.attendance(userId);
    const sumKey = CACHE_KEYS.attendanceSummary(userId);
    const cached = cache.get<AttendancePayload>(key);

    if (cached) {
      // FIX: guard cached fields against undefined before setting state
      setRecords(cached.records ?? []);
      setSummary(cached.summary ?? null);
      setLoading(false);
      if (!cache.isStale(key)) return;
      setRevalidating(true);
    } else {
      if (!background) setLoading(true);
    }

    setError(null);

    try {
      const [recRes, sumRes] = await Promise.all([
        cache.fetch(key,    () => api.getAttendance(),        TTL.ATTENDANCE),
        cache.fetch(sumKey, () => api.getAttendanceSummary(), TTL.ATTENDANCE),
      ]);

      // FIX: check success flag before parsing — a 422/500 response is not valid data
      const recOk = (recRes as any)?.success !== false;
      const sumOk = (sumRes as any)?.success !== false;

      const parsedRecords = recOk
        ? parseRecords((recRes as any)?.data ?? recRes)
        : [];

      const parsedSummary = parseSummary(
        sumOk ? ((sumRes as any)?.data ?? sumRes) : null,
        parsedRecords
      );

      // Store combined payload
      const payload: AttendancePayload = { records: parsedRecords, summary: parsedSummary };
      cache.set(key, payload, TTL.ATTENDANCE);

      setRecords(parsedRecords);
      setSummary(parsedSummary);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  }, []);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) return;
    fetchAttendance(user.id);
  }, [authLoading, user, fetchAttendance]);

  // ── Window focus revalidation ─────────────────────────────────────────────
  const userRef = useRef(user);
  userRef.current = user;
  useEffect(() => {
    const onFocus = () => {
      if (!userRef.current) return;
      const key = CACHE_KEYS.attendance(userRef.current.id);
      if (cache.isStale(key)) fetchAttendance(userRef.current.id, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchAttendance]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const total   = summary?.total   ?? 0;
  const present = summary?.present ?? 0;
  const late    = summary?.late    ?? 0;
  const absent  = summary?.absent  ?? 0;
  const excused = summary?.excused ?? 0;
  const pct     = total === 0 ? 0 : Math.round(((present + late) / total) * 100);

  // FIX: guard records with ?? [] so derived values never throw on undefined
  const courses = Array.from(
    new Map((records ?? []).map(r => [r.courseId || r.course, r.course])).values()
  ).filter(Boolean);

  const filtered = (records ?? []).filter(r => {
    const matchStatus = filter === 'All' || r.status === filter;
    const matchCourse = courseFilter === 'All' || r.course === courseFilter;
    const matchSearch = !search ||
      r.topic.toLowerCase().includes(search.toLowerCase()) ||
      r.course.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchCourse && matchSearch;
  });

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Silent revalidation bar */}
      {revalidating && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ animation: 'swrProgress 1.4s ease-in-out infinite' }} />
        </div>
      )}

      <Sidebar activeItem="Attendance" />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-slate-900 font-bold text-[15px]">Attendance</p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {loading ? 'Loading…' : `${total} class${total !== 1 ? 'es' : ''} recorded`}
              </p>
            </div>
            {revalidating && (
              <span className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                Updating…
              </span>
            )}
          </div>
          {!loading && total > 0 && (
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${
              pct >= 75
                ? 'bg-green-50 text-green-700 border-green-200'
                : pct >= 50
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              <i className="fa-solid fa-chart-simple mr-1.5" />
              {pct}% attendance rate
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

          {/* ── Hero Banner ── */}
          <div
            className="relative rounded-xl overflow-hidden px-8 py-7"
            style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 55%, #1D4ED8 100%)' }}
          >
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
            <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative z-10 flex items-center justify-between gap-6">
              <div>
                <p className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Student Portal</p>
                <h1 className="text-white text-2xl font-black tracking-tight">Your Attendance</h1>
                <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                  {loading
                    ? 'Fetching your attendance records…'
                    : `${present + late} of ${total} class${total !== 1 ? 'es' : ''} attended · ${pct}% rate`}
                </p>
                <a href="/dashboard"
                  className="mt-4 inline-block px-5 py-2 bg-white text-blue-900 rounded-lg text-[13px] font-bold shadow hover:shadow-md hover:-translate-y-0.5 transition-all">
                  ← Dashboard
                </a>
              </div>
              <div className="hidden lg:flex items-center gap-6 shrink-0">
                {[
                  { v: total,   l: 'Total' },
                  { v: present, l: 'Present' },
                  { v: absent,  l: 'Absent' },
                ].map(s => (
                  <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-0">
                    <p className="text-white text-3xl font-black">{loading ? '—' : s.v}</p>
                    <p className="text-blue-300 text-[11px] font-semibold mt-1 uppercase tracking-wide">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Ring + Stats ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col items-center h-full justify-center">
                {loading ? (
                  <div className="w-32 h-32 rounded-full border-4 border-slate-100 animate-pulse" />
                ) : (
                  <AttendanceRing percent={pct} />
                )}
                {!loading && (
                  <p className="text-xs text-slate-500 mt-3 text-center">
                    {pct >= 75 ? '✓ Good standing' : pct >= 50 ? '⚠ Needs improvement' : '✗ Below minimum'}
                  </p>
                )}
              </div>
            </div>

            <div className="lg:col-span-3 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
              ) : (
                <>
                  <StatCard icon="fa-calendar-days" value={total}   label="Total Classes" bg="#EFF6FF" fg="#1E40AF" dimmed={revalidating} />
                  <StatCard icon="fa-circle-check"  value={present} label="Present"       bg="#ECFDF5" fg="#047857" dimmed={revalidating} />
                  <StatCard icon="fa-clock"         value={late}    label="Late"          bg="#FFFBEB" fg="#B45309" dimmed={revalidating} />
                  <StatCard icon="fa-circle-xmark"  value={absent}  label="Absent"        bg="#FEF2F2" fg="#DC2626" dimmed={revalidating} />
                </>
              )}
            </div>
          </div>

          {/* ── Progress Bar ── */}
          {!loading && total > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-700 text-[13px] font-semibold">Attendance Breakdown</p>
                <p className="text-slate-400 text-xs">{present + late} attended · {absent} missed</p>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                {present > 0 && (
                  <div className="h-full transition-all duration-700"
                    style={{ width: `${(present / total) * 100}%`, background: '#059669' }} />
                )}
                {late > 0 && (
                  <div className="h-full transition-all duration-700"
                    style={{ width: `${(late / total) * 100}%`, background: '#D97706' }} />
                )}
                {excused > 0 && (
                  <div className="h-full transition-all duration-700"
                    style={{ width: `${(excused / total) * 100}%`, background: '#2563EB' }} />
                )}
                {absent > 0 && (
                  <div className="h-full transition-all duration-700"
                    style={{ width: `${(absent / total) * 100}%`, background: '#DC2626' }} />
                )}
              </div>
              <div className="flex items-center gap-5 mt-3 flex-wrap">
                {[
                  { label: 'Present', val: present, color: '#059669' },
                  { label: 'Late',    val: late,    color: '#D97706' },
                  { label: 'Excused', val: excused, color: '#2563EB' },
                  { label: 'Absent',  val: absent,  color: '#DC2626' },
                ].map(s => (
                  <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    {s.val} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation shrink-0" />
              {error}
              <button onClick={() => user && fetchAttendance(user.id)}
                className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">
                Retry
              </button>
            </div>
          )}

          {/* ── Table Card ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Toolbar */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-list-check text-blue-700 text-sm" />
                <h2 className="text-slate-800 font-bold text-[14px]">Attendance Log</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]" />
                  <input
                    type="search"
                    placeholder="Search topic or course…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-48"
                  />
                </div>
                {courses.length > 1 && (
                  <select
                    value={courseFilter}
                    onChange={e => setCourseFilter(e.target.value)}
                    className="text-[12px] font-medium rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                  >
                    <option value="All">All Courses</option>
                    {courses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  {STATUS_FILTERS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                        filter === f
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Date', 'Topic', 'Course', 'Status'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 ${
                          i === 2 ? 'hidden md:table-cell' : i === 3 ? 'text-center' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="flex flex-col items-center justify-center py-14 text-center">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                            <i className="fa-solid fa-calendar-xmark text-slate-300 text-xl" />
                          </div>
                          <p className="text-slate-600 font-semibold text-sm">
                            {records.length === 0 ? 'No attendance records yet' : 'No records match your filters'}
                          </p>
                          <p className="text-slate-400 text-xs mt-1">
                            {records.length === 0
                              ? 'Your teacher will mark attendance after each class.'
                              : 'Try adjusting your search or filter.'}
                          </p>
                          {records.length > 0 && (
                            <button
                              onClick={() => { setFilter('All'); setCourseFilter('All'); setSearch(''); }}
                              className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900"
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map(r => (
                      <tr
                        key={r.id}
                        className="border-t border-slate-100 hover:bg-slate-50 transition-colors duration-150"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-slate-800 font-semibold text-[13px]">{r.date}</p>
                          {r.day && <p className="text-slate-400 text-[11px] mt-0.5">{r.day}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-700 text-[13px] font-medium truncate max-w-[240px]">{r.topic}</p>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <p className="text-slate-500 text-[12px] truncate max-w-[180px]">{r.course}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border"
                            style={{
                              backgroundColor: STATUS_CONFIG[r.status].bg,
                              borderColor:     STATUS_CONFIG[r.status].border,
                              color:           STATUS_CONFIG[r.status].color,
                            }}
                          >
                            <i className={`fa-solid ${STATUS_CONFIG[r.status].icon} text-[10px]`} />
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {!loading && records.length > 0 && (
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-400">
                <span>Showing {filtered.length} of {total} records</span>
                <div className="flex items-center gap-4 flex-wrap">
                  {[
                    { label: 'present', val: present, color: '#059669' },
                    { label: 'late',    val: late,    color: '#D97706' },
                    { label: 'excused', val: excused, color: '#2563EB' },
                    { label: 'absent',  val: absent,  color: '#DC2626' },
                  ].map(s => (
                    <span key={s.label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      {s.val} {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      <style>{`
        @keyframes swrProgress {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(150%);  width: 40%; }
          100% { transform: translateX(150%);  width: 40%; }
        }
      `}</style>
    </div>
  );
}