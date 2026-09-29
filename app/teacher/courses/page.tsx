'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import { useCache } from '../../../lib/useCache';
import { cache, TTL } from '../../../lib/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Course {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  trailerUrl?: string;
  isPublished: boolean;
  teacherId: string;
  createdAt: string;
  updatedAt?: string;
  teacher?: { id: string; name: string; email: string; avatar?: string };
  _count: { enrollments: number; modules: number };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CourseFormData {
  title: string;
  description: string;
  thumbnail: string;
  trailerUrl: string;
}

const EMPTY_FORM: CourseFormData = { title: '', description: '', thumbnail: '', trailerUrl: '' };

// ─── Cache Keys ───────────────────────────────────────────────────────────────

const getCacheKey = (page: number, search: string) =>
  `teacher:courses:p${page}:${search ? `s${search}` : 'all'}`;

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
  label: string; value: string | number; icon: string;
  accent: string; light: string; sub: string;
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

// ─── Card Skeleton ────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 flex items-center gap-3 border border-slate-200 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-2/5" />
        <div className="h-2.5 bg-slate-100 rounded w-3/5" />
      </div>
    </div>
  );
}

// ─── Trailer Upload Button ────────────────────────────────────────────────────

function TrailerUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    setUploadErr(null);
    setUploading(true);
    setProgress(0);

    // Fake incremental progress while Cloudinary works
    const tick = setInterval(() => setProgress(p => Math.min(p + 3, 88)), 400);

    try {
      const res = await api.uploadVideo(file);
      clearInterval(tick);
      setProgress(100);
      onChange((res.data as any).data?.url ?? (res.data as any).url ?? '');
    } catch (e: any) {
      clearInterval(tick);
      setUploadErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) handleFile(file);
  };

  // If a URL is already set (Cloudinary or YouTube/Vimeo), show preview strip
  const isYouTube = /youtu(be\.com|\.be)/.test(value);
  const isVimeo   = /vimeo\.com/.test(value);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        Course Trailer
        <span className="ml-1.5 font-normal text-slate-400">(video upload or paste URL)</span>
      </label>

      {/* URL text input */}
      <div className="relative">
        <i className="fa-solid fa-link absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://youtube.com/watch?v=... or Cloudinary URL"
          className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <i className="fa-solid fa-xmark text-xs" />
          </button>
        )}
      </div>

      {/* Upload drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg px-4 py-5 text-center transition-all cursor-pointer
          ${uploading ? 'border-blue-300 bg-blue-50 cursor-default' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        {uploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-blue-600 text-sm font-semibold">
              <span className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              Uploading…
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-blue-400">{progress}%</p>
          </div>
        ) : value && !isYouTube && !isVimeo ? (
          // Cloudinary URL already set — show a replace hint
          <div className="flex items-center justify-center gap-2 text-emerald-600 text-xs font-semibold">
            <i className="fa-solid fa-circle-check" />
            Video uploaded — click to replace
          </div>
        ) : (
          <div className="text-slate-400 text-xs space-y-1">
            <i className="fa-solid fa-cloud-arrow-up text-xl mb-1 block" />
            <p className="font-medium text-slate-500">Drop a video or click to browse</p>
            <p>MP4, MOV, AVI · max 500MB</p>
          </div>
        )}
      </div>

      {uploadErr && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <i className="fa-solid fa-circle-exclamation" />
          {uploadErr}
        </p>
      )}

      {/* Preview for YouTube / Vimeo */}
      {value && (isYouTube || isVimeo) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <i className={`fa-brands ${isYouTube ? 'fa-youtube text-red-500' : 'fa-vimeo text-blue-500'} text-sm`} />
          <span className="text-xs text-slate-600 truncate flex-1">{value}</span>
          <i className="fa-solid fa-check text-emerald-500 text-xs shrink-0" />
        </div>
      )}
    </div>
  );
}

// ─── Course Modal ─────────────────────────────────────────────────────────────

function CourseModal({ mode, initial, saving, onSave, onClose }: {
  mode: 'create' | 'edit';
  initial: CourseFormData;
  saving: boolean;
  onSave: (data: CourseFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CourseFormData>(initial);
  const field = (k: keyof CourseFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0"
          style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">
              {mode === 'create' ? 'Create New Course' : 'Edit Course'}
            </h2>
            <p className="text-xs text-blue-300 mt-0.5">
              {mode === 'create' ? 'Fill in the details to get started.' : 'Update the course details.'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-white/10 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Course Title <span className="text-red-500">*</span>
            </label>
            <input value={form.title} onChange={field('title')}
              placeholder="e.g. Introduction to Web Development"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea value={form.description} onChange={field('description')} rows={3}
              placeholder="What will students learn in this course?"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
          </div>

          {/* Thumbnail URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Thumbnail URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <i className="fa-solid fa-image absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
                <input value={form.thumbnail} onChange={field('thumbnail')}
                  placeholder="https://example.com/image.jpg"
                  className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
              </div>
              {form.thumbnail && (
                <div className="w-10 h-10 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-100">
                  <img
                    src={form.thumbnail}
                    alt="thumb"
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Trailer */}
          <TrailerUpload
            value={form.trailerUrl}
            onChange={url => setForm(prev => ({ ...prev, trailerUrl: url }))}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.title.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {mode === 'create' ? 'Create Course' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

function DeleteDialog({ title, deleting, onConfirm, onClose }: {
  title: string; deleting: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-trash text-red-600 text-lg" />
        </div>
        <h2 className="text-base font-black text-slate-800 mb-1">Delete Course?</h2>
        <p className="text-sm text-slate-500 mb-6">
          <span className="font-semibold text-slate-700">"{title}"</span> and all its modules and lessons will be permanently deleted.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {deleting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Students Panel ───────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  enrolledAt?: string;
}

function StudentsPanel({ course, onClose }: { course: Course; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.teacher.getCourseStudents(course.id);
        const raw = (res as any).data;
        setStudents(Array.isArray(raw) ? raw : raw?.students ?? raw?.data ?? []);
      } catch (e: any) {
        setError(e.message || 'Failed to load students');
      } finally {
        setLoading(false);
      }
    })();
  }, [course.id]);

  const handleRemove = async (userId: string) => {
    setRemoving(userId);
    try {
      await api.teacher.removeStudentFromCourse(course.id, userId);
      setStudents(prev => prev.filter(s => s.id !== userId));
    } catch { /* silently fail */ } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100"
          style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">Enrolled Students</h2>
            <p className="text-xs text-blue-300 mt-0.5 truncate max-w-[260px]">{course.title}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:bg-white/10 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                    <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                  </div>
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
          {!loading && !error && students.length === 0 && (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-users text-xl text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No students enrolled yet</p>
              <p className="text-xs text-slate-400 mt-1">Share the course so students can enroll.</p>
            </div>
          )}
          {!loading && students.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-3 py-3 ${i !== 0 ? 'border-t border-slate-50' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xs font-black shrink-0 overflow-hidden">
                {s.avatar
                  ? <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                  : s.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                <p className="text-xs text-slate-400 truncate">{s.email}</p>
              </div>
              {s.enrolledAt && (
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(s.enrolledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <button onClick={() => handleRemove(s.id)} disabled={removing === s.id}
                title="Remove student"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 shrink-0">
                {removing === s.id
                  ? <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                  : <i className="fa-solid fa-user-minus text-xs" />}
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            {students.length} student{students.length !== 1 ? 's' : ''} enrolled
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Course Card ──────────────────────────────────────────────────────────────

function CourseCard({ course, onEdit, onDelete, onViewStudents, onTogglePublish, toggling }: {
  course: Course;
  onEdit: (c: Course) => void;
  onDelete: (c: Course) => void;
  onViewStudents: (c: Course) => void;
  onTogglePublish: (c: Course) => void;
  toggling: string | null;
}) {
  const isToggling = toggling === course.id;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-sm transition-all">
      {/* Thumbnail or initials */}
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center font-bold text-sm text-blue-700 shrink-0 overflow-hidden">
        {course.thumbnail
          ? <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          : course.title.slice(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-slate-800 truncate flex items-center gap-1.5">
          {course.title}
          {course.trailerUrl && (
            <span title="Has trailer" className="text-purple-400 text-[10px]">
              <i className="fa-solid fa-film" />
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
          <span>{course._count.enrollments} students</span>
          <span>{course._count.modules} modules</span>
          <button
            onClick={() => onTogglePublish(course)}
            disabled={isToggling}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors disabled:opacity-60 ${
              course.isPublished
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}>
            {isToggling
              ? <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin align-middle" />
              : course.isPublished ? 'Published' : 'Draft'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onViewStudents(course)} title="View students"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <i className="fa-solid fa-users text-xs" />
        </button>
        <button onClick={() => onEdit(course)} title="Edit course"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <i className="fa-solid fa-pen text-xs" />
        </button>
        <button onClick={() => onDelete(course)} title="Delete course"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
          <i className="fa-solid fa-trash text-xs" />
        </button>
        <a href={`/teacher/courses/${course.id}`}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 transition flex items-center gap-1 shrink-0 ml-1">
          Manage <i className="fa-solid fa-arrow-right text-[10px]" />
        </a>
      </div>
    </div>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Published', 'Drafts'] as const;
type Filter = typeof FILTERS[number];

// ─── Cached Data Structure ────────────────────────────────────────────────────

interface CachedCoursesData {
  courses: Course[];
  pagination: Pagination | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherCoursesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [filter, setFilter]                   = useState<Filter>('All');
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]                       = useState(1);

  const [showCreate, setShowCreate]         = useState(false);
  const [editTarget, setEditTarget]         = useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<Course | null>(null);
  const [studentsTarget, setStudentsTarget] = useState<Course | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  const cacheKey = getCacheKey(page, debouncedSearch);

  const fetchCourses = useCallback(async (): Promise<CachedCoursesData> => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '12');
    if (debouncedSearch) params.set('search', debouncedSearch);

    const res = await api.teacher.getCourses(`?${params.toString()}`);
    const raw = (res as any).data;

    if (Array.isArray(raw)) return { courses: raw, pagination: null };
    return {
      courses: raw?.courses ?? raw?.data ?? [],
      pagination: raw?.pagination ?? null,
    };
  }, [page, debouncedSearch]);

  const { data: cachedData, loading, error, refresh } = useCache<CachedCoursesData>(
    authLoading || !user ? null : cacheKey,
    fetchCourses,
    { ttl: TTL.COURSES, enabled: !authLoading && !!user }
  );

  const courses    = cachedData?.courses ?? [];
  const pagination = cachedData?.pagination ?? null;

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (form: CourseFormData) => {
    setSaving(true);
    try {
      await api.teacher.createCourse({
        title:       form.title,
        description: form.description || undefined,
        thumbnail:   form.thumbnail   || undefined,
        trailerUrl:  form.trailerUrl  || undefined,
      });
      setShowCreate(false);
      showToast('Course created successfully.', true);
      cache.invalidatePrefix('teacher:courses:');
      refresh();
    } catch (e: any) {
      showToast(e.message || 'Failed to create course', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const handleEdit = async (form: CourseFormData) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.teacher.updateCourse(editTarget.id, {
        title:       form.title,
        description: form.description || undefined,
        thumbnail:   form.thumbnail   || undefined,
        trailerUrl:  form.trailerUrl  || undefined,
      });
      setEditTarget(null);
      showToast('Course updated successfully.', true);
      cache.invalidatePrefix('teacher:courses:');
      refresh();
    } catch (e: any) {
      showToast(e.message || 'Failed to update course', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle publish ──────────────────────────────────────────────────────────
  const handleTogglePublish = async (course: Course) => {
    setToggling(course.id);
    try {
      await api.teacher.toggleCoursePublish(course.id);
      const updated = courses.map(c =>
        c.id === course.id ? { ...c, isPublished: !c.isPublished } : c
      );
      cache.set(cacheKey, { courses: updated, pagination }, TTL.COURSES);
      showToast(course.isPublished ? 'Course set to draft.' : 'Course published.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to update publish status', false);
      refresh();
    } finally {
      setToggling(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.teacher.deleteCourse(deleteTarget.id);
      const updated = courses.filter(c => c.id !== deleteTarget.id);
      cache.set(cacheKey, { courses: updated, pagination }, TTL.COURSES);
      setDeleteTarget(null);
      showToast('Course deleted.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to delete course', false);
      refresh();
    } finally {
      setDeleting(false);
    }
  };

  // ── Auth guard ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    router.replace('/dashboard');
    return null;
  }

  const filtered       = courses.filter(c => filter === 'Published' ? c.isPublished : filter === 'Drafts' ? !c.isPublished : true);
  const publishedCount = courses.filter(c => c.isPublished).length;
  const draftCount     = courses.filter(c => !c.isPublished).length;
  const totalStudents  = courses.reduce((acc, c) => acc + (c._count?.enrollments ?? 0), 0);
  const totalPages     = pagination?.totalPages ?? 1;
  const totalCourses   = pagination?.total ?? courses.length;

  return (
    <>
      <FontAwesomeLoader />

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Courses" />

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
            <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
            {toast.msg}
          </div>
        )}

        {/* Modals */}
        {showCreate && (
          <CourseModal mode="create" initial={EMPTY_FORM} saving={saving}
            onSave={handleCreate} onClose={() => setShowCreate(false)} />
        )}
        {editTarget && (
          <CourseModal mode="edit"
            initial={{
              title:       editTarget.title,
              description: editTarget.description ?? '',
              thumbnail:   editTarget.thumbnail   ?? '',
              trailerUrl:  editTarget.trailerUrl  ?? '',
            }}
            saving={saving} onSave={handleEdit} onClose={() => setEditTarget(null)} />
        )}
        {deleteTarget && (
          <DeleteDialog title={deleteTarget.title} deleting={deleting}
            onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
        )}
        {studentsTarget && (
          <StudentsPanel course={studentsTarget} onClose={() => setStudentsTarget(null)} />
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">My Courses</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {loading ? 'Loading…' : `${totalCourses} course${totalCourses !== 1 ? 's' : ''} total`}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none" />
                <input type="search" placeholder="Search courses…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-lg text-sm bg-slate-50 border border-slate-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all w-44 md:w-56" />
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
                <i className="fa-solid fa-plus text-xs" />
                New Course
              </button>
            </div>
          </header>

          {/* Error Banner */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={refresh} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">Retry</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Banner */}
            <div className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Course Management</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">Your Course Library</h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {loading
                      ? 'Loading your courses…'
                      : `${publishedCount} published · ${draftCount} draft${draftCount !== 1 ? 's' : ''} · ${totalStudents} total students`}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: totalCourses, l: 'My\nCourses' },
                    { v: publishedCount, l: 'Published' },
                    { v: totalStudents, l: 'Total\nStudents' },
                  ].map(s => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      <div className="text-white text-3xl font-black">{loading ? '—' : s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="My Courses"     value={loading ? '—' : totalCourses}   icon="fa-book-open" accent="#2563EB" light="#EFF6FF" sub="Total courses" />
              <StatCard label="Published"      value={loading ? '—' : publishedCount}  icon="fa-globe"     accent="#059669" light="#F0FDF4" sub="Live courses" />
              <StatCard label="Drafts"         value={loading ? '—' : draftCount}      icon="fa-file-pen"  accent="#D97706" light="#FFFBEB" sub="Unpublished" />
              <StatCard label="Total Students" value={loading ? '—' : totalStudents}   icon="fa-users"     accent="#7C3AED" light="#F5F3FF" sub="Across all courses" />
            </div>

            {/* Course List */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-bold text-[14px] text-slate-800">All Courses</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {loading ? 'Loading…' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-200 p-1">
                  {FILTERS.map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                    <i className="fa-solid fa-inbox text-2xl text-slate-300" />
                  </div>
                  <p className="text-slate-600 font-semibold text-sm">
                    {search || filter !== 'All' ? 'No courses match your filters' : "You haven't created any courses yet"}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {search || filter !== 'All' ? 'Try adjusting your filters or search term.' : 'Create your first course to get started.'}
                  </p>
                  {search || filter !== 'All' ? (
                    <button onClick={() => { setFilter('All'); setSearch(''); }}
                      className="mt-1 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                      Clear filters
                    </button>
                  ) : (
                    <button onClick={() => setShowCreate(true)}
                      className="mt-1 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors">
                      <i className="fa-solid fa-plus mr-1.5" />Create Course
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-5 space-y-3">
                  {filtered.map(course => (
                    <CourseCard key={course.id} course={course}
                      onEdit={setEditTarget} onDelete={setDeleteTarget}
                      onViewStudents={setStudentsTarget}
                      onTogglePublish={handleTogglePublish} toggling={toggling} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-slate-100">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1">
                    <i className="fa-solid fa-chevron-left text-[10px]" /> Prev
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = totalPages <= 7 ? i + 1 : Math.max(1, page - 3) + i;
                    if (p > totalPages) return null;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-8 h-8 text-xs font-semibold rounded-lg transition-all ${p === page ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1">
                    Next <i className="fa-solid fa-chevron-right text-[10px]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}