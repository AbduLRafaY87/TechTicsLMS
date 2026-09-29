"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar from "@/app/components/Sidebar";
import { api, Course } from "@/lib/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faTrash,
  faEye,
  faSpinner,
  faExclamationTriangle,
  faChevronLeft,
  faChevronRight,
  faTimes,
  faPencilAlt,
  faSave,
  faBook,
  faToggleOn,
  faToggleOff,
  faUserGraduate,
  faChalkboardTeacher,
  faCheckCircle,
  faTimesCircle,
  faCalendar,
  faGlobe,
  faLock,
  faLayerGroup,
  faFilter,
} from "@fortawesome/free-solid-svg-icons";

interface AdminCourse extends Omit<Course, "thumbnail"> {
  thumbnail?: string | null;
  teacher?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  _count?: {
    enrollments?: number;
    modules?: number;
    lessons?: number;
  };
  category?: string | null;
  level?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolveImageUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "";
  return `${base}${url}`;
}

function teacherInitials(name?: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Course Thumbnail ──────────────────────────────────────────────────────────

function CourseThumbnail({ course, size = 44 }: { course: AdminCourse; size?: number }) {
  const src = resolveImageUrl(course.thumbnail);
  const [err, setErr] = useState(false);

  if (src && !err) {
    return (
      <img
        src={src}
        alt={course.title}
        onError={() => setErr(true)}
        className="rounded-xl object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #10B981, #059669)",
      }}
    >
      <FontAwesomeIcon icon={faBook} className="text-white" style={{ fontSize: size * 0.38 }} />
    </div>
  );
}

// ── Teacher Avatar ────────────────────────────────────────────────────────────

function TeacherAvatar({ teacher }: { teacher?: AdminCourse["teacher"] }) {
  const src = resolveImageUrl(teacher?.avatar);
  const [err, setErr] = useState(false);
  const name = teacher?.name ?? "Unknown";

  if (src && !err) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setErr(true)}
        className="w-6 h-6 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ fontSize: 9, background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
    >
      {teacherInitials(name)}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <FontAwesomeIcon icon={faGlobe} className="w-3 h-3" />
      Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <FontAwesomeIcon icon={faLock} className="w-3 h-3" />
      Draft
    </span>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────

function DeleteModal({
  course,
  onConfirm,
  onCancel,
  loading,
}: {
  course: AdminCourse;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 w-5 h-5" />
          </div>
          <div>
            <h3 className="text-slate-900 font-bold text-base">Delete Course</h3>
            <p className="text-slate-500 text-sm">This action cannot be undone</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-5">
          <CourseThumbnail course={course} size={44} />
          <div>
            <div className="text-slate-900 font-semibold text-sm line-clamp-1">{course.title}</div>
            <div className="text-slate-500 text-xs mt-0.5">
              by {course.teacher?.name ?? "Unknown Teacher"}
            </div>
          </div>
        </div>
        <p className="text-slate-600 text-sm mb-5">
          Are you sure you want to permanently delete{" "}
          <strong>"{course.title}"</strong>? All modules, lessons, and enrollments will be removed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
            ) : (
              "Delete Course"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Course Detail Modal ───────────────────────────────────────────────────────

function CourseDetailModal({
  course,
  onClose,
  onTogglePublish,
  toggling,
}: {
  course: AdminCourse;
  onClose: () => void;
  onTogglePublish: (course: AdminCourse) => void;
  toggling: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center justify-between">
          <span className="text-white font-bold text-base">Course Details</span>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>

        {/* Thumbnail hero */}
        <div className="relative h-36 bg-slate-100 overflow-hidden">
          {course.thumbnail ? (
            <img
              src={resolveImageUrl(course.thumbnail)}
              alt={course.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
              <FontAwesomeIcon icon={faBook} className="w-12 h-12 text-emerald-200" />
            </div>
          )}
          <div className="absolute top-3 right-3">
            <StatusBadge published={course.isPublished} />
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <h2 className="text-slate-900 font-black text-lg leading-tight mb-1">{course.title}</h2>
          {course.description && (
            <p className="text-slate-500 text-sm leading-relaxed mb-4 line-clamp-3">
              {course.description}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <div className="text-emerald-700 font-black text-xl">
                {course._count?.enrollments ?? 0}
              </div>
              <div className="text-emerald-500 text-xs font-semibold mt-0.5">Students</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-blue-700 font-black text-xl">
                {course._count?.modules ?? 0}
              </div>
              <div className="text-blue-500 text-xs font-semibold mt-0.5">Modules</div>
            </div>
            <div className="bg-violet-50 rounded-xl p-3 text-center">
              <div className="text-violet-700 font-black text-xl">
                {course._count?.lessons ?? 0}
              </div>
              <div className="text-violet-500 text-xs font-semibold mt-0.5">Lessons</div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Teacher */}
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faChalkboardTeacher} className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Instructor</div>
                <div className="text-slate-800 font-medium">
                  {course.teacher?.name ?? "Unknown"}
                </div>
              </div>
            </div>

            {/* Created */}
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Created</div>
                <div className="text-slate-800 font-medium">{formatDate(course.createdAt)}</div>
              </div>
            </div>

            {/* Updated */}
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Last Updated</div>
                <div className="text-slate-800 font-medium">{formatDate(course.updatedAt)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
          >
            Close
          </button>
          <button
            onClick={() => onTogglePublish(course)}
            disabled={toggling}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${
              course.isPublished
                ? "bg-slate-600 hover:bg-slate-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {toggling ? (
              <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FontAwesomeIcon
                  icon={course.isPublished ? faToggleOff : faToggleOn}
                  className="w-4 h-4"
                />
                {course.isPublished ? "Unpublish" : "Publish"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Course Modal ─────────────────────────────────────────────────────────

interface EditCourseForm {
  title: string;
  description: string;
}

function EditCourseModal({
  course,
  onClose,
  onSaved,
}: {
  course: AdminCourse;
  onClose: () => void;
  onSaved: (updated: AdminCourse) => void;
}) {
  const [form, setForm] = useState<EditCourseForm>({
    title: course.title ?? "",
    description: course.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await api.updateCourse(course.id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
      });
      const updated: AdminCourse =
        (res.data as any)?.data?.course ??
        (res.data as any)?.data ??
        (res.data as any)?.course ??
        (res.data as any);
      onSaved({ ...course, ...updated });
    } catch (err: any) {
      setError(err.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faPencilAlt} className="w-4 h-4 text-white/80" />
            <span className="text-white font-bold text-base">Edit Course</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Course preview */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <CourseThumbnail course={course} size={48} />
            <div>
              <div className="text-slate-700 font-semibold text-sm line-clamp-1">
                {form.title || course.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge published={course.isPublished} />
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Course Title <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <FontAwesomeIcon
                icon={faBook}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
              />
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="Course title"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="What will students learn in this course…"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition resize-none"
            />
          </div>

          {/* Instructor (read-only) */}
          <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FontAwesomeIcon icon={faChalkboardTeacher} className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Instructor</span>
            </div>
            <div className="flex items-center gap-2">
              <TeacherAvatar teacher={course.teacher} />
              <span className="text-slate-700 text-sm font-semibold">
                {course.teacher?.name ?? "Unknown"}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? (
              <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
type FilterStatus = "all" | "published" | "draft";

export default function AdminCoursesPage() {
  const [courses, setCourses]           = useState<AdminCourse[]>([]);
  const [filtered, setFiltered]         = useState<AdminCourse[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [page, setPage]                 = useState(1);
  const [viewCourse, setViewCourse]     = useState<AdminCourse | null>(null);
  const [editCourse, setEditCourse]     = useState<AdminCourse | null>(null);
  const [deleteCourse, setDeleteCourse] = useState<AdminCourse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [toast, setToast]               = useState("");

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getCourses("?limit=200");
      const raw: any = res.data;
      const list: AdminCourse[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.courses)
        ? raw.courses
        : [];
      setCourses(list);
    } catch (err: any) {
      setError(err.message || "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  // ── Filter & search ─────────────────────────────────────────────────────
  useEffect(() => {
    const q = search.toLowerCase();
    let list = courses;

    if (statusFilter === "published") list = list.filter((c) => c.isPublished);
    if (statusFilter === "draft")     list = list.filter((c) => !c.isPublished);

    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.teacher?.name?.toLowerCase().includes(q)
      );
    }

    setFiltered(list);
    setPage(1);
  }, [search, statusFilter, courses]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteCourse) return;
    setDeleteLoading(true);
    try {
      await api.deleteCourse(deleteCourse.id);
      setCourses((prev) => prev.filter((c) => c.id !== deleteCourse.id));
      setDeleteCourse(null);
      showToast("Course deleted successfully.");
    } catch (err: any) {
      showToast(err.message || "Failed to delete course.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Toggle publish ──────────────────────────────────────────────────────
  const handleTogglePublish = async (course: AdminCourse) => {
    setTogglingId(course.id);
    try {
      await api.updateCourse(course.id, { isPublished: !course.isPublished });
      setCourses((prev) =>
        prev.map((c) =>
          c.id === course.id ? { ...c, isPublished: !c.isPublished } : c
        )
      );
      // also update modal if open
      if (viewCourse?.id === course.id) {
        setViewCourse((prev) =>
          prev ? { ...prev, isPublished: !prev.isPublished } : prev
        );
      }
      showToast(
        course.isPublished ? "Course unpublished." : "Course published."
      );
    } catch (err: any) {
      showToast(err.message || "Failed to update course.");
    } finally {
      setTogglingId(null);
    }
  };

  // ── Edit saved ──────────────────────────────────────────────────────────
  const handleEditSaved = (updated: AdminCourse) => {
    setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditCourse(null);
    showToast("Course updated successfully.");
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  const publishedCount  = courses.filter((c) => c.isPublished).length;
  const draftCount      = courses.filter((c) => !c.isPublished).length;
  const totalEnrollments = courses.reduce((s, c) => s + (c._count?.enrollments ?? 0), 0);

  // ── Pagination ──────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div
      className="flex h-screen bg-slate-50 overflow-hidden"
      style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
    >
      <Sidebar activeItem="Courses" />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Manage Courses</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {loading
                ? "Loading…"
                : `${filtered.length} course${filtered.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-full">
            <FontAwesomeIcon icon={faBook} className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-700 text-sm font-bold">{courses.length} Total</span>
          </div>
        </div>

        <div className="px-8 py-6">

          {/* Stats cards */}
          {!loading && !error && courses.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faBook} className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{courses.length}</div>
                  <div className="text-slate-400 text-xs font-semibold">Total Courses</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{publishedCount}</div>
                  <div className="text-slate-400 text-xs font-semibold">Published</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{draftCount}</div>
                  <div className="text-slate-400 text-xs font-semibold">Drafts</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faUserGraduate} className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{totalEnrollments}</div>
                  <div className="text-slate-400 text-xs font-semibold">Total Enrollments</div>
                </div>
              </div>
            </div>
          )}

          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Search by title, description or teacher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status filter pills */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <FontAwesomeIcon icon={faFilter} className="w-3.5 h-3.5 text-slate-400" />
              {(["all", "published", "draft"] as FilterStatus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition capitalize ${
                    statusFilter === f
                      ? "bg-emerald-600 text-white"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* States */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 animate-spin mb-3 text-emerald-500" />
              <span className="text-sm">Loading courses…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 mb-3 text-red-400" />
              <span className="text-sm text-red-500">{error}</span>
              <button
                onClick={fetchCourses}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faBook} className="w-10 h-10 mb-3 text-slate-300" />
              <span className="text-sm font-medium">
                {search || statusFilter !== "all"
                  ? "No courses match your filters."
                  : "No courses created yet."}
              </span>
            </div>
          )}

          {/* Table */}
          {!loading && !error && paginated.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Course
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
                        Instructor
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Students
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Status
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Created
                      </th>
                      <th className="text-right px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((course, i) => (
                      <tr
                        key={course.id}
                        className={`border-b border-slate-50 hover:bg-emerald-50/30 transition-colors ${
                          i === paginated.length - 1 ? "border-b-0" : ""
                        }`}
                      >
                        {/* Course */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <CourseThumbnail course={course} size={44} />
                            <div className="min-w-0">
                              <div className="text-slate-900 font-semibold truncate max-w-[180px]">
                                {course.title}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {/* show on mobile where other cols are hidden */}
                                <span className="lg:hidden">
                                  <StatusBadge published={course.isPublished} />
                                </span>
                                {course._count?.modules !== undefined && (
                                  <span className="text-slate-400 text-xs hidden sm:inline">
                                    {course._count.modules} module{course._count.modules !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Instructor */}
                        <td className="px-5 py-4 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <TeacherAvatar teacher={course.teacher} />
                            <span className="text-slate-600 text-sm">
                              {course.teacher?.name ?? "—"}
                            </span>
                          </div>
                        </td>

                        {/* Students */}
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faUserGraduate} className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-slate-700 font-semibold">
                              {course._count?.enrollments ?? 0}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <StatusBadge published={course.isPublished} />
                        </td>

                        {/* Created */}
                        <td className="px-5 py-4 text-slate-400 hidden lg:table-cell">
                          {formatDate(course.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {/* View */}
                            <button
                              onClick={() => setViewCourse(course)}
                              title="View course"
                              className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition flex items-center justify-center"
                            >
                              <FontAwesomeIcon icon={faEye} className="w-3.5 h-3.5" />
                            </button>
                            {/* Edit */}
                            <button
                              onClick={() => setEditCourse(course)}
                              title="Edit course"
                              className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition flex items-center justify-center"
                            >
                              <FontAwesomeIcon icon={faPencilAlt} className="w-3.5 h-3.5" />
                            </button>
                            {/* Toggle publish */}
                            <button
                              onClick={() => handleTogglePublish(course)}
                              disabled={togglingId === course.id}
                              title={course.isPublished ? "Unpublish" : "Publish"}
                              className={`w-8 h-8 rounded-lg border transition flex items-center justify-center disabled:opacity-50 ${
                                course.isPublished
                                  ? "border-slate-200 text-slate-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600"
                                  : "border-slate-200 text-slate-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
                              }`}
                            >
                              {togglingId === course.id ? (
                                <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FontAwesomeIcon
                                  icon={course.isPublished ? faToggleOn : faToggleOff}
                                  className="w-3.5 h-3.5"
                                />
                              )}
                            </button>
                            {/* Delete */}
                            <button
                              onClick={() => setDeleteCourse(course)}
                              title="Delete course"
                              className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition flex items-center justify-center"
                            >
                              <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50">
                  <span className="text-slate-400 text-xs">
                    Page {page} of {totalPages} · {filtered.length} courses
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="text-slate-300 px-1 text-xs">
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                              page === p
                                ? "bg-emerald-600 text-white border border-emerald-600"
                                : "border border-slate-200 text-slate-500 hover:bg-white"
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center"
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {viewCourse && (
        <CourseDetailModal
          course={viewCourse}
          onClose={() => setViewCourse(null)}
          onTogglePublish={handleTogglePublish}
          toggling={togglingId === viewCourse.id}
        />
      )}
      {editCourse && (
        <EditCourseModal
          course={editCourse}
          onClose={() => setEditCourse(null)}
          onSaved={handleEditSaved}
        />
      )}
      {deleteCourse && (
        <DeleteModal
          course={deleteCourse}
          onConfirm={handleDelete}
          onCancel={() => setDeleteCourse(null)}
          loading={deleteLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-3">
          {toast}
          <button onClick={() => setToast("")} className="text-white/60 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}