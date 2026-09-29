'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';
import { cache, TTL } from '../../lib/cache';
import { CACHE_KEYS, invalidateCourseData } from '../../lib/cachedApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrollStatus = 'enrolled' | 'pending' | 'rejected' | 'none';

interface Course {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  trailerUrl?: string;
  isPublished: boolean;
  teacherId: string;
  createdAt: string;
  teacher: { id: string; name: string; email: string; avatar?: string };
  _count: { enrollments: number; modules: number };
  enrollStatus: EnrollStatus;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CoursesPayload {
  courses: Course[];
  pagination: Pagination | null;
  enrolledIds: string[];
  pendingIds: string[];
  rejectedIds: string[];
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function coursesPageKey(userId: string, page: number, search: string) {
  return CACHE_KEYS.courses(`${userId}:p${page}:${search}`);
}

// ─── Response unpackers ───────────────────────────────────────────────────────

function unpackCourses(res: any): [Course[], Pagination | null] {
  const body = res?.data;
  if (Array.isArray(body?.data))       return [body.data,      body.pagination ?? null];
  if (Array.isArray(body?.data?.data)) return [body.data.data, body.data.pagination ?? null];
  if (Array.isArray(body))             return [body,           null];
  if (Array.isArray(body?.courses))    return [body.courses,   body.pagination ?? null];
  return [[], null];
}

function unpackEnrollments(meRes: any): string[] {
  const body = meRes?.data;
  const enrollments =
    body?.data?.user?.enrollments ??
    body?.user?.enrollments ??
    body?.enrollments ?? [];
  return enrollments.map((e: any) => e.course?.id ?? e.courseId).filter(Boolean);
}

// Replace unpackEnrollmentRequests in page.tsx with this:

function unpackEnrollmentRequests(reqRes: any): { pendingIds: string[]; rejectedIds: string[] } {
  if (!reqRes) return { pendingIds: [], rejectedIds: [] };

  const body = reqRes?.data;
  if (!body) return { pendingIds: [], rejectedIds: [] };

  // Backend returns: { success: true, data: { requests: [...] } }
  // So reqRes = { data: { success, data: { requests: [...] } } }
  // So body = { success, data: { requests: [...] } }
  // So body.data.requests = [...]
  // OR body.requests = [...]
  // OR body.data = [...]

  let list: any[] = [];
  
  // Try the most specific path first
  if      (Array.isArray(body?.data?.requests))        list = body.data.requests;
  else if (Array.isArray(body?.requests))              list = body.requests;
  else if (Array.isArray(body?.data?.data))            list = body.data.data;
  else if (Array.isArray(body?.data))                  list = body.data;
  else if (Array.isArray(body))                        list = body;

  const pendingIds: string[]  = [];
  const rejectedIds: string[] = [];

  for (const r of list) {
    if (!r) continue;
    const courseId = r.courseId ?? r.course_id ?? r.course?.id;
    if (!courseId) continue;
    
    if (r.status === 'PENDING')  pendingIds.push(courseId);
    if (r.status === 'REJECTED') rejectedIds.push(courseId);
  }

  console.log('[unpackEnrollmentRequests] Found', pendingIds.length, 'pending,', rejectedIds.length, 'rejected');
  return { pendingIds, rejectedIds };
}

function mergeEnrollStatus(
  courses: Course[],
  enrolledIds: string[],
  pendingIds: string[],
  rejectedIds: string[],
): Course[] {
  const enrolled = new Set(enrolledIds);
  const pending  = new Set(pendingIds);
  const rejected = new Set(rejectedIds);
  return courses.map(c => ({
    ...c,
    enrollStatus:
      enrolled.has(c.id) ? 'enrolled' :
      pending.has(c.id)  ? 'pending'  :
      rejected.has(c.id) ? 'rejected' : 'none',
  }));
}

// ─── Font Awesome ─────────────────────────────────────────────────────────────

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

const ACCENT_COLORS = ['#1E3A5F','#2563EB','#0F766E','#6D28D9','#B45309','#DC2626','#0369A1','#4338CA'];
const getAccent = (idx: number) => ACCENT_COLORS[idx % ACCENT_COLORS.length];

// ─── Trailer Modal ────────────────────────────────────────────────────────────

function TrailerModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const embedUrl = url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/');
  const isYoutube = embedUrl.includes('youtube.com/embed');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl bg-black rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900">
          <p className="text-white text-sm font-semibold truncate">{title} — Trailer</p>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>
        <div className="aspect-video w-full bg-black">
          {isYoutube ? (
            <iframe src={`${embedUrl}?autoplay=1`} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
          ) : (
            <video src={url} autoPlay controls className="w-full h-full" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Enroll Status Badge ──────────────────────────────────────────────────────

function EnrollBadge({ status }: { status: EnrollStatus }) {
  if (status === 'enrolled') return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500 text-white shadow-sm flex items-center gap-1 w-fit">
      <i className="fa-solid fa-circle-check text-[9px]" /> Enrolled
    </span>
  );
  if (status === 'pending') return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-400 text-white shadow-sm flex items-center gap-1 w-fit">
      <i className="fa-solid fa-clock text-[9px]" /> Pending Approval
    </span>
  );
  if (status === 'rejected') return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-500 text-white shadow-sm flex items-center gap-1 w-fit">
      <i className="fa-solid fa-circle-xmark text-[9px]" /> Not Approved
    </span>
  );
  return null;
}

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({
  course, index, onEnroll, onCancel, enrolling, onWatchTrailer,
}: {
  course: Course;
  index: number;
  onEnroll: (id: string) => void;
  onCancel: (id: string) => void;
  enrolling: string | null;
  onWatchTrailer: (course: Course) => void;
}) {
  const color = getAccent(index);
  const abbr  = course.title.slice(0, 2).toUpperCase();
  const isLoading = enrolling === course.id;

  const hasValidThumbnail = !!course.thumbnail?.trim();
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [course.thumbnail]);

  const { enrollStatus } = course;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col group">

      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-slate-100 overflow-hidden">
        {hasValidThumbnail && !imgError ? (
          <img
            src={course.thumbnail}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${color}22 0%, ${color}44 100%)` }}
          >
            <span className="text-5xl font-black" style={{ color }}>{abbr}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />

        {enrollStatus !== 'none' && (
          <div className="absolute top-3 left-3">
            <EnrollBadge status={enrollStatus} />
          </div>
        )}

        {course.trailerUrl && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onWatchTrailer(course); }}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white text-[11px] font-semibold transition-all shadow-md backdrop-blur-sm"
          >
            <i className="fa-solid fa-play text-[9px]" /> Trailer
          </button>
        )}

        <div className="absolute top-3 right-3">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
            {course._count?.modules ?? 0} modules
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-center gap-2 mb-3">
          {course.teacher?.avatar ? (
            <img src={course.teacher.avatar} alt={course.teacher.name} className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black shrink-0" style={{ background: color }}>
              {course.teacher?.name?.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="text-slate-400 text-[11px] truncate">{course.teacher?.name}</span>
        </div>

        <a href={`/courses/${course.id}`}>
          <h3 className="text-slate-800 text-[14px] font-bold leading-snug line-clamp-2 group-hover:text-blue-700 transition-colors cursor-pointer mb-2">
            {course.title}
          </h3>
        </a>

        {course.description && (
          <p className="text-slate-500 text-xs line-clamp-2 mb-4 flex-1">{course.description}</p>
        )}
        {!course.description && <div className="flex-1" />}

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
          <span className="text-slate-400 text-[11px] flex items-center gap-1">
            <i className="fa-solid fa-users text-[10px]" />
            {course._count?.enrollments ?? 0} enrolled
          </span>

          <div className="flex items-center gap-2">
            <a href={`/courses/${course.id}`} className="text-[11px] font-semibold transition-colors" style={{ color }}>
              View →
            </a>

            {enrollStatus === 'enrolled' && (
              <button onClick={e => { e.preventDefault(); onCancel(course.id); }} disabled={isLoading}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                {isLoading ? 'Leaving…' : 'Unenroll'}
              </button>
            )}
            {enrollStatus === 'pending' && (
              <button onClick={e => { e.preventDefault(); onCancel(course.id); }} disabled={isLoading}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50">
                {isLoading ? '…' : 'Cancel'}
              </button>
            )}
            {enrollStatus === 'rejected' && (
              <button onClick={e => { e.preventDefault(); onEnroll(course.id); }} disabled={isLoading}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-white transition-all disabled:opacity-50"
                style={{ background: color }}>
                {isLoading ? '…' : 'Request Again'}
              </button>
            )}
            {enrollStatus === 'none' && (
              <button onClick={e => { e.preventDefault(); onEnroll(course.id); }} disabled={isLoading}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg text-white transition-all disabled:opacity-50"
                style={{ background: color }}>
                {isLoading ? 'Sending…' : 'Enroll'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-video w-full bg-slate-100" />
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-100" />
          <div className="h-3 bg-slate-100 rounded w-24" />
        </div>
        <div className="h-4 bg-slate-100 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="pt-3 border-t border-slate-100 flex justify-between">
          <div className="h-3 bg-slate-100 rounded w-16" />
          <div className="h-7 bg-slate-100 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ search, filter, onClear }: { search: string; filter: Filter; onClear: () => void }) {
  const hasFilters = search || filter !== 'All';
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <i className="fa-solid fa-inbox text-slate-300 text-3xl" />
      </div>
      <p className="text-slate-700 font-semibold text-sm">
        {hasFilters ? 'No courses match your filters' : 'No courses available yet'}
      </p>
      <p className="text-slate-400 text-xs mt-1">
        {hasFilters ? 'Try adjusting your search or filter.' : 'Check back soon!'}
      </p>
      {hasFilters && (
        <button onClick={onClear} className="mt-4 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
          Clear filters
        </button>
      )}
    </div>
  );
}

const FILTERS = ['All', 'Enrolled', 'Pending', 'Not Enrolled'] as const;
type Filter = typeof FILTERS[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoursesPage() {
  useFontAwesome();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Avoid hydration mismatch — render nothing on server
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [courses, setCourses]           = useState<Course[]>([]);
  const [pagination, setPagination]     = useState<Pagination | null>(null);
  const [loading, setLoading]           = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [enrolling, setEnrolling]       = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [trailerCourse, setTrailerCourse] = useState<Course | null>(null);

  const [filter, setFilter]                   = useState<Filter>('All');
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]                       = useState(1);

  const pageRef   = useRef(page);
  const searchRef = useRef(debouncedSearch);
  pageRef.current   = page;
  searchRef.current = debouncedSearch;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      router.replace('/teacher/dashboard'); return;
    }
  }, [authLoading, user, router]);

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchCourses = useCallback(async (
    userId: string, pg: number, srch: string, background = false
  ) => {
    const key = coursesPageKey(userId, pg, srch);
    const cached = cache.get<CoursesPayload>(key);

    if (cached) {
      setCourses(mergeEnrollStatus(cached.courses, cached.enrolledIds, cached.pendingIds, cached.rejectedIds));
      setPagination(cached.pagination);
      setLoading(false);
      if (!cache.isStale(key)) return;
      setRevalidating(true);
    } else {
      if (!background) setLoading(true);
    }

    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(pg));
      params.set('limit', '12');
      if (srch) params.set('search', srch);

      const [meRes, coursesRes, requestsRes] = await Promise.all([
        cache.fetch(CACHE_KEYS.profile(userId), () => api.me(), TTL.PROFILE),
        api.getCourses(`?${params.toString()}`),
        api.getMyEnrollmentRequests().catch((err) => {
          console.warn('[CoursesPage] getMyEnrollmentRequests failed:', err?.message);
          return null;
        }),
      ]);

      const enrolledIds = unpackEnrollments(meRes);
      const { pendingIds, rejectedIds } = unpackEnrollmentRequests(requestsRes);

      const [rawCourses, pag] = unpackCourses(coursesRes);
      const mergedCourses = mergeEnrollStatus(rawCourses, enrolledIds, pendingIds, rejectedIds);

      const payload: CoursesPayload = {
        courses: rawCourses, pagination: pag,
        enrolledIds, pendingIds, rejectedIds,
      };
      cache.set(key, payload, TTL.COURSES);

      setCourses(mergedCourses);
      setPagination(pag);
    } catch (err: any) {
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  }, []);

  const lastKey = useRef('');
  useEffect(() => {
    if (authLoading || !user || user.role !== 'STUDENT') return;
    const key = `${user.id}:${page}:${debouncedSearch}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    fetchCourses(user.id, page, debouncedSearch);
  }, [authLoading, user, page, debouncedSearch, fetchCourses]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      const key = coursesPageKey(user.id, pageRef.current, searchRef.current);
      if (cache.isStale(key)) fetchCourses(user.id, pageRef.current, searchRef.current, true);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user, fetchCourses]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Enroll ────────────────────────────────────────────────────────────────
  const handleEnroll = async (courseId: string) => {
    if (!user) return;
    setEnrolling(courseId);

    // Optimistic update
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, enrollStatus: 'pending' } : c));

    try {
      await api.enrollCourse(courseId);
      showToast('Enrollment request sent! Awaiting admin approval.', true);
    } catch (err: any) {
      const msg: string = err?.message ?? '';

      // 409 = duplicate or already enrolled. Keep optimistic pending state.
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('pending') || err?.status === 409) {
        showToast('Your enrollment request is pending approval.', true);
        setEnrolling(null);
        // Invalidate both profile + courses cache to force re-fetch on next interaction
        cache.invalidate(CACHE_KEYS.profile(user.id));
        const key = coursesPageKey(user.id, page, debouncedSearch);
        cache.invalidate(key);
        return; // Don't rollback — the pending state is correct
      }

      // Any other error: rollback optimistic update
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, enrollStatus: 'none' } : c));
      showToast(msg || 'Request failed', false);
    } finally {
      setEnrolling(null);
    }
  };

  // ── Cancel / Unenroll ─────────────────────────────────────────────────────
  const handleCancel = async (courseId: string) => {
    if (!user) return;
    setEnrolling(courseId);
    const prevStatus = courses.find(c => c.id === courseId)?.enrollStatus ?? 'none';

    // Optimistic update
    setCourses(prev => prev.map(c =>
      c.id === courseId ? {
        ...c,
        enrollStatus: 'none',
        _count: {
          ...c._count,
          enrollments: prevStatus === 'enrolled'
            ? Math.max(0, c._count.enrollments - 1)
            : c._count.enrollments,
        },
      } : c
    ));

    try {
      await api.unenrollCourse(courseId);
      showToast(prevStatus === 'enrolled' ? 'Unenrolled successfully.' : 'Request cancelled.', true);
      
      // Invalidate caches
      cache.invalidate(CACHE_KEYS.profile(user.id));
      const key = coursesPageKey(user.id, page, debouncedSearch);
      cache.invalidate(key);
    } catch (err: any) {
      // Rollback
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, enrollStatus: prevStatus } : c));
      showToast(err?.message || 'Failed', false);
    } finally {
      setEnrolling(null);
    }
  };

  const handleRefresh = useCallback(() => {
    if (!user) return;
    cache.invalidate(CACHE_KEYS.profile(user.id));
    const key = coursesPageKey(user.id, page, debouncedSearch);
    cache.invalidate(key);
    lastKey.current = '';
    fetchCourses(user.id, page, debouncedSearch);
  }, [user, page, debouncedSearch, fetchCourses]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!mounted) return null;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user || user.role !== 'STUDENT') return null;

  const filtered = courses.filter(c =>
    filter === 'Enrolled'     ? c.enrollStatus === 'enrolled' :
    filter === 'Pending'      ? c.enrollStatus === 'pending'  :
    filter === 'Not Enrolled' ? c.enrollStatus === 'none' || c.enrollStatus === 'rejected' :
    true
  );

  const enrolledCount = courses.filter(c => c.enrollStatus === 'enrolled').length;
  const pendingCount  = courses.filter(c => c.enrollStatus === 'pending').length;
  const availCount    = courses.filter(c => c.enrollStatus === 'none' || c.enrollStatus === 'rejected').length;
  const totalPages    = pagination?.totalPages ?? 1;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar activeItem="Courses" />

      {trailerCourse?.trailerUrl && (
        <TrailerModal url={trailerCourse.trailerUrl} title={trailerCourse.title} onClose={() => setTrailerCourse(null)} />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
          <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
          {toast.msg}
        </div>
      )}

      {revalidating && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-600 w-full" style={{ animation: 'progress 1.5s ease-in-out infinite' }} />
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-slate-900 font-bold text-[15px]">Browse Courses</p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {loading ? 'Loading…' : pagination
                  ? `${pagination.total} course${pagination.total !== 1 ? 's' : ''} available`
                  : `${courses.length} course${courses.length !== 1 ? 's' : ''} available`}
              </p>
            </div>
            {revalidating && (
              <span className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
                Updating…
              </span>
            )}
          </div>
          <div className="relative hidden md:block">
            <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
            <input
              type="search"
              placeholder="Search courses…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-56"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden px-8 py-7" style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 55%, #1D4ED8 100%)' }}>
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
            <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative z-10 flex items-center justify-between gap-6">
              <div>
                <p className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Student Portal</p>
                <h1 className="text-white text-2xl font-black tracking-tight">Explore Courses</h1>
                <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                  Browse courses and request enrollment — an admin will review your request.
                </p>
                <a href="/dashboard" className="mt-4 inline-block px-5 py-2 bg-white text-blue-900 rounded-lg text-[13px] font-bold shadow hover:shadow-md hover:-translate-y-0.5 transition-all">
                  ← Dashboard
                </a>
              </div>
              <div className="hidden lg:flex items-center gap-6 shrink-0">
                {[
                  { v: pagination?.total ?? courses.length, l: 'Total'    },
                  { v: enrolledCount,                       l: 'Enrolled' },
                  { v: pendingCount,                        l: 'Pending'  },
                ].map(s => (
                  <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-0">
                    <p className="text-white text-3xl font-black">{s.v}</p>
                    <p className="text-blue-300 text-[11px] font-semibold mt-1 uppercase tracking-wide">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { v: pagination?.total ?? courses.length, l: 'Total Courses',    bg: '#EFF6FF', fg: '#1E40AF', icon: 'fa-book-open'    },
              { v: enrolledCount,                       l: 'Enrolled',         bg: '#ECFDF5', fg: '#047857', icon: 'fa-circle-check' },
              { v: pendingCount,                        l: 'Pending Approval', bg: '#FFFBEB', fg: '#B45309', icon: 'fa-clock'        },
              { v: availCount,                          l: 'Available',        bg: '#F0F9FF', fg: '#0369A1', icon: 'fa-star'         },
            ].map(s => (
              <div key={s.l} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: s.bg, color: s.fg }}>
                  <i className={`fa-solid ${s.icon}`} />
                </div>
                <p className="text-3xl font-black text-slate-900 leading-none">{s.v}</p>
                <p className="text-slate-500 text-[11px] font-semibold mt-1.5 uppercase tracking-widest">{s.l}</p>
              </div>
            ))}
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
              <i className="fa-solid fa-clock text-amber-500 shrink-0" />
              <span>
                You have <strong>{pendingCount}</strong> pending enrollment request{pendingCount !== 1 ? 's' : ''}. An admin will review and notify you soon.
              </span>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation shrink-0" />
              {error}
              <button onClick={handleRefresh} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">Retry</button>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 shadow-sm w-fit">
              {FILTERS.map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {f}
                  {f === 'Pending' && pendingCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-black">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Course grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid grid-cols-1">
              <EmptyState search={search} filter={filter} onClear={() => { setFilter('All'); setSearch(''); }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((course, idx) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  index={idx}
                  onEnroll={handleEnroll}
                  onCancel={handleCancel}
                  enrolling={enrolling}
                  onWatchTrailer={setTrailerCourse}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                <i className="fa-solid fa-chevron-left text-[10px]" /> Prev
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : Math.max(1, page - 3) + i;
                if (p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs font-semibold rounded-lg transition-all ${p === page ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >{p}</button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                Next <i className="fa-solid fa-chevron-right text-[10px]" />
              </button>
            </div>
          )}

        </div>
      </main>

      <style>{`
        @keyframes progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}