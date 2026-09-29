/**
 * Cached API helpers
 *
 * These wrap the raw api.ts calls with cache keys and TTLs.
 * Import these instead of calling api.* directly in pages.
 *
 * Pattern:
 *   const { data, loading } = useCache(CACHE_KEYS.dashboard(userId), cachedApi.dashboard, TTL.DASHBOARD);
 */

import { api } from './api';
import { cache, TTL } from './cache';

// ── Cache Keys ───────────────────────────────────────────────────────────────
// Namespaced keys prevent collisions and enable prefix-based invalidation.

export const CACHE_KEYS = {
  profile: (userId: string) => `profile:${userId}`,
  dashboard: (userId: string) => `dashboard:${userId}`,
  courses: (query = '') => `courses:${query}`,
  courseDetail: (courseId: string) => `course:${courseId}`,
  progress: (userId: string) => `progress:${userId}`,
  progressCourse: (userId: string, courseId: string) => `progress:${userId}:${courseId}`,
  attendance: (userId: string) => `attendance:${userId}`,
  attendanceSummary: (userId: string) => `attendance:summary:${userId}`,
  assignments: (userId: string) => `assignments:${userId}`,
  discussions: (userId: string) => `discussions:${userId}`,
  enrollments: (userId: string) => `enrollments:${userId}`,
  teacherDashboard: (userId: string) => `teacher:dashboard:${userId}`,
  teacherCourses: (userId: string, query = '') => `teacher:courses:${userId}:${query}`,
  teacherStudents: (userId: string) => `teacher:students:${userId}`,
};

// ── Cached fetchers (return unwrapped data) ──────────────────────────────────

export const cachedApi = {
  // Profile — used by almost every page, cache aggressively
  profile: () => api.me().then(r => {
    const d = (r as any).data;
    return d?.user ?? d?.data?.user ?? d;
  }),

  // Student dashboard stats
  dashboard: () => api.getStudentDashboard().then(r => {
    const d = (r as any).data;
    return d?.data ?? d;
  }),

  // Course catalog
  courses: (query = '') => api.getCourses(query).then(r => {
    const d = (r as any).data;
    if (Array.isArray(d)) return d;
    return d?.courses ?? d?.data ?? d?.data?.courses ?? [];
  }),

  // Single course detail
  courseDetail: (id: string) => api.getCourseById(id).then(r => {
    const d = (r as any).data;
    return d?.course ?? d?.data?.course ?? d;
  }),

  // Progress summary (all courses)
  progress: () => api.getAllCoursesSummary().then(r => {
    const d = (r as any).data;
    const summaries = d?.data?.summaries ?? d?.summaries ?? d?.data ?? d;
    return Array.isArray(summaries) ? summaries : [];
  }),

  // Attendance records
  attendance: () => api.getAttendance().then(r => (r as any).data),

  // Attendance summary
  attendanceSummary: () => api.getAttendanceSummary().then(r => (r as any).data),

  // Assignments
  assignments: () => api.getAssignments().then(r => {
    const d = (r as any).data;
    return d?.data ?? d;
  }),

  // Discussions
  discussions: () => api.getDiscussions('').then(r => {
    const d = (r as any).data;
    return d?.data ?? d;
  }),

  // Teacher dashboard
  teacherDashboard: () => api.teacher.getDashboard().then(r => {
    const d = (r as any).data;
    return d?.data ?? d;
  }),

  // Teacher courses
  teacherCourses: (query = '') => api.teacher.getCourses(query).then(r => {
    const d = (r as any).data;
    if (Array.isArray(d)) return { courses: d, pagination: null };
    return { courses: d?.courses ?? d?.data ?? [], pagination: d?.pagination ?? null };
  }),

  // Teacher students
  teacherStudents: () => api.teacher.getAllStudents().then(r => {
    const d = (r as any).data;
    if (Array.isArray(d)) return d;
    return d?.students ?? d?.data ?? [];
  }),
};

// ── Prefetch helpers ──────────────────────────────────────────────────────────
// Call these on sidebar hover to preload data before navigation.

export function prefetchDashboard(userId: string) {
  const key = CACHE_KEYS.dashboard(userId);
  if (!cache.get(key)) {
    cache.fetch(key, cachedApi.dashboard, TTL.DASHBOARD).catch(() => {});
  }
}

export function prefetchCourses(userId: string) {
  const key = CACHE_KEYS.courses();
  if (!cache.get(key)) {
    cache.fetch(key, () => cachedApi.courses(), TTL.COURSES).catch(() => {});
  }
}

export function prefetchProgress(userId: string) {
  const key = CACHE_KEYS.progress(userId);
  if (!cache.get(key)) {
    cache.fetch(key, cachedApi.progress, TTL.PROGRESS).catch(() => {});
  }
}

// ── Invalidation helpers ──────────────────────────────────────────────────────

/** Call after enrollment/unenrollment */
export function invalidateCourseData(userId: string) {
  cache.invalidatePrefix('courses:');
  cache.invalidate(CACHE_KEYS.profile(userId));
  cache.invalidate(CACHE_KEYS.dashboard(userId));
  cache.invalidate(CACHE_KEYS.enrollments(userId));
}

/** Call after marking a lesson complete */
export function invalidateProgress(userId: string, courseId?: string) {
  cache.invalidate(CACHE_KEYS.progress(userId));
  cache.invalidate(CACHE_KEYS.dashboard(userId));
  if (courseId) {
    cache.invalidate(CACHE_KEYS.progressCourse(userId, courseId));
  }
}

/** Call after login/logout */
export function clearUserCache(userId?: string) {
  if (userId) {
    cache.invalidatePrefix(`profile:${userId}`);
    cache.invalidatePrefix(`dashboard:${userId}`);
    cache.invalidatePrefix(`progress:${userId}`);
    cache.invalidatePrefix(`attendance:${userId}`);
    cache.invalidatePrefix(`assignments:${userId}`);
    cache.invalidatePrefix(`discussions:${userId}`);
    cache.invalidatePrefix(`teacher:`);
  }
  cache.invalidatePrefix('courses:');
}