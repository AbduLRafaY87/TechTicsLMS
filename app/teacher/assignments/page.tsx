'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import type { Assignment, Course, CreateAssignmentData, UpdateAssignmentData } from '../../../lib/api';

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

// ─── Types ────────────────────────────────────────────────────────────────────

type AttachmentType = 'link' | 'pdf';

interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  url: string;
  size?: number;
  file?: File; // 👈 ADD THIS (temporary before upload)
}
// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function extractArray(res: any): any[] {
  console.log('🔍 [extractArray] res:', res);
  console.log('🔍 [extractArray] res.data:', res?.data);
  const d = res?.data;
  if (Array.isArray(d)) {
    console.log('🔍 [extractArray] matched: d is array, length:', d.length);
    return d;
  }
  if (Array.isArray(d?.assignments)) {
    console.log('🔍 [extractArray] matched: d.assignments is array');
    return d.assignments;
  }
  if (Array.isArray(d?.courses)) {
    console.log('🔍 [extractArray] matched: d.courses is array');
    return d.courses;
  }
  if (Array.isArray(d?.data)) {
    console.log('🔍 [extractArray] matched: d.data is array, length:', d.data.length);
    return d.data;
  }
  console.log('🔍 [extractArray] NO MATCH — returning []');
  return [];
}

function formatDate(dateString?: string) {
  if (!dateString) return 'No due date';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDueMeta(dueDate?: string): { label: string; classes: string } {
  if (!dueDate) return { label: 'No due date', classes: 'bg-slate-50 text-slate-400 border-slate-200' };
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { label: 'No due date', classes: 'bg-slate-50 text-slate-400 border-slate-200' };
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: 'Overdue', classes: 'bg-red-50 text-red-600 border-red-200' };
  if (diffDays === 0) return { label: 'Due today', classes: 'bg-amber-50 text-amber-600 border-amber-200' };
  if (diffDays <= 3) return { label: `Due in ${diffDays}d`, classes: 'bg-amber-50 text-amber-600 border-amber-200' };
  return { label: formatDate(dueDate), classes: 'bg-blue-50 text-blue-600 border-blue-200' };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent, light, sub,
}: {
  label: string; value: string | number; icon: string; accent: string; light: string; sub: string;
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

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="px-5 py-4 flex gap-3 animate-pulse border-b border-slate-50">
      <div className="w-9 h-9 bg-slate-100 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-3/5" />
        <div className="h-2.5 bg-slate-100 rounded w-2/5" />
      </div>
    </div>
  );
}

// ─── Attachment Chip (read-only display) ──────────────────────────────────────

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }) {
  const isLink = attachment.type === 'link';
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium group ${
      isLink
        ? 'bg-blue-50 border-blue-200 text-blue-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      <i className={`fa-solid ${isLink ? 'fa-link' : 'fa-file-pdf'} text-[11px] shrink-0`} />
      <span className="truncate max-w-[160px]">{attachment.name}</span>
      {attachment.size && (
        <span className="text-[10px] opacity-60 shrink-0">({formatBytes(attachment.size)})</span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-black/10 transition-all shrink-0"
          aria-label="Remove attachment"
        >
          <i className="fa-solid fa-xmark text-[10px]" />
        </button>
      ) : (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-black/10 transition-all shrink-0"
          aria-label="Open attachment"
        >
          <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
        </a>
      )}
    </div>
  );
}

// ─── Attachments Editor ───────────────────────────────────────────────────────

function AttachmentsEditor({
  attachments,
  onChange,
}: {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkError, setLinkError] = useState('');

  function addLink() {
    const url = linkUrl.trim();
    if (!url) { setLinkError('Enter a URL.'); return; }
    const isValid = /^https?:\/\/.+/.test(url);
    if (!isValid) { setLinkError('URL must start with http:// or https://'); return; }
    const name = linkName.trim() || url;
    const newAttachment: Attachment = { id: generateId(), type: 'link', name, url };
    console.log('🔍 [AttachmentsEditor.addLink] Adding link attachment:', newAttachment);
    const next = [...attachments, newAttachment];
    console.log('🔍 [AttachmentsEditor.addLink] New attachments array:', next);
    onChange(next);
    setLinkUrl('');
    setLinkName('');
    setLinkError('');
    setShowLinkForm(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(e.target.files ?? []);
  const pdfs = files.filter((f) => f.type === 'application/pdf');
  if (pdfs.length === 0) return;

  const newAttachments: Attachment[] = pdfs.map((file) => ({
    id: generateId(),
    type: 'pdf',
    name: file.name,
    url: '',        // will be filled after upload
    size: file.size,
    file,           // keep file for upload
  }));

  console.log('🔍 [AttachmentsEditor.handleFileChange] new pdf attachments (pending upload):', newAttachments);
  onChange([...attachments, ...newAttachments]);
  e.target.value = '';
}

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Attachments</label>

      {/* Existing chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <AttachmentChip key={att.id} attachment={att} onRemove={() => remove(att.id)} />
          ))}
        </div>
      )}

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Link */}
        {!showLinkForm ? (
          <button
            type="button"
            onClick={() => setShowLinkForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <i className="fa-solid fa-link text-[11px]" />
            Add link
          </button>
        ) : null}

        {/* PDF */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold rounded-lg border border-dashed border-red-300 text-red-600 hover:bg-red-50 transition-colors"
        >
          <i className="fa-solid fa-file-pdf text-[11px]" />
          Attach PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Inline link form */}
      {showLinkForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-link text-blue-400 text-[11px]" />
            <span className="text-[12px] font-semibold text-blue-700">Add a link</span>
          </div>
          <input
            value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
            placeholder="https://example.com/resource"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
          />
          <input
            value={linkName}
            onChange={(e) => setLinkName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
            placeholder="Display name (optional)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
          />
          {linkError && (
            <p className="text-red-500 text-[11px] flex items-center gap-1">
              <i className="fa-solid fa-circle-exclamation" /> {linkError}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkName(''); setLinkError(''); }}
              className="px-3 py-1.5 text-[12px] font-semibold text-slate-500 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addLink}
              className="px-3 py-1.5 text-[12px] font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
            >
              Add link
            </button>
          </div>
        </div>
      )}

      {attachments.length === 0 && !showLinkForm && (
        <p className="text-[11px] text-slate-400 italic">
          No attachments yet — add a link or upload a PDF for students to reference.
        </p>
      )}
    </div>
  );
}

// ─── Local form state ─────────────────────────────────────────────────────────

interface AssignmentFormState {
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: string;
  attachments: Attachment[];
}

const EMPTY_FORM: AssignmentFormState = {
  courseId: '',
  title: '',
  description: '',
  dueDate: '',
  maxPoints: '',
  attachments: [],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeacherAssignmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [form, setForm] = useState<AssignmentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Preview panel (Google Classroom style — click row to preview)
  const [previewAssignment, setPreviewAssignment] = useState<Assignment | null>(null);

  const isAuthorized = !!user && (user.role === 'TEACHER' || user.role === 'ADMIN');

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, authLoading, router]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAssignments = useCallback(async (courseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = courseId ? `?courseId=${courseId}` : '';
      console.log('🔍 [loadAssignments] fetching with query:', query);
      const res = await api.teacher.getAssignments(query);
      console.log('🔍 [loadAssignments] RAW response:', res);
      console.log('🔍 [loadAssignments] JSON.stringify(res.data):', JSON.stringify(res?.data, null, 2));
      const list = extractArray(res);
      console.log('🔍 [loadAssignments] extracted list:', list);
      list.forEach((a: any) => {
        console.log(`🔍 [loadAssignments] "${a.title}" → attachments:`, a.attachments);
      });
      setAssignments(list);
    } catch (err: any) {
      console.log('🔍 [loadAssignments] ERROR:', err);
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    api.teacher
      .getCourses()
      .then((res) => setCourses(extractArray(res)))
      .catch((err: any) => console.error('Failed to load courses', err));
  }, [authLoading, isAuthorized]);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    loadAssignments(selectedCourseId);
  }, [authLoading, isAuthorized, selectedCourseId, loadAssignments]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const courseTitleById = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c) => map.set(c.id, c.title));
    return map;
  }, [courses]);

  const filteredAssignments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return assignments;
    return assignments.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        (a.description ?? '').toLowerCase().includes(term),
    );
  }, [assignments, searchTerm]);

  async function uploadAttachments(attachments: Attachment[]) {
    console.log('🔍 [uploadAttachments] INPUT attachments:', attachments);
    const uploaded: Attachment[] = [];

    for (const att of attachments) {
      console.log('🔍 [uploadAttachments] processing attachment:', att);
      if (att.type === 'pdf' && att.file) {
        console.log('🔍 [uploadAttachments] uploading PDF file:', att.file.name);
        const formData = new FormData();
        formData.append('file', att.file);

        const res = await api.teacher.uploadFile(formData);
        console.log('🔍 [uploadAttachments] PDF upload response:', res);
        uploaded.push({
          id: att.id,
          type: 'pdf',
          name: att.name,
          url: res.data.url,
          size: att.size,
        });
      } else {
        console.log('🔍 [uploadAttachments] passing through (link or no file):', att);
        uploaded.push({
          id: att.id,
          type: att.type,
          name: att.name,
          url: att.url,
          size: att.size,
        });
      }
    }

    console.log('🔍 [uploadAttachments] FINAL uploaded array:', uploaded);
    return uploaded;
  }
  const stats = useMemo(() => {
    const now = new Date();
    let overdue = 0, dueSoon = 0, totalPoints = 0, pointsCount = 0;
    assignments.forEach((a) => {
      if (a.dueDate) {
        const due = new Date(a.dueDate);
        if (!Number.isNaN(due.getTime())) {
          const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) overdue += 1;
          else if (diffDays <= 7) dueSoon += 1;
        }
      }
      if (typeof a.maxPoints === 'number') { totalPoints += a.maxPoints; pointsCount += 1; }
    });
    return { total: assignments.length, overdue, dueSoon, avgPoints: pointsCount ? Math.round(totalPoints / pointsCount) : 0 };
  }, [assignments]);

  const statCards = [
    { icon: 'fa-clipboard-list', value: stats.total,    label: 'Total Assignments', accent: '#2563EB', light: '#EFF6FF', sub: 'Across all courses'  },
    { icon: 'fa-clock',          value: stats.dueSoon,  label: 'Due This Week',     accent: '#D97706', light: '#FFFBEB', sub: 'Needs attention soon' },
    { icon: 'fa-circle-exclamation', value: stats.overdue, label: 'Overdue',        accent: '#DC2626', light: '#FEF2F2', sub: 'Past their due date'  },
    { icon: 'fa-award',          value: stats.avgPoints, label: 'Avg. Max Points',  accent: '#7C3AED', light: '#F5F3FF', sub: 'Per assignment'       },
  ];

  // ── Modal handlers ────────────────────────────────────────────────────────
  function openCreateModal() {
    setEditingAssignment(null);
    setForm({ ...EMPTY_FORM, courseId: selectedCourseId || courses[0]?.id || '' });
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(assignment: Assignment) {
    setEditingAssignment(assignment);
    setForm({
      courseId: assignment.courseId,
      title: assignment.title,
      description: assignment.description ?? '',
      dueDate: assignment.dueDate ? assignment.dueDate.slice(0, 10) : '',
      maxPoints: assignment.maxPoints != null ? String(assignment.maxPoints) : '',
      attachments: Array.isArray((assignment as any).attachments) ? (assignment as any).attachments : [],
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
    setEditingAssignment(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.courseId) { setFormError('Choose a course for this assignment.'); return; }
    if (!form.title.trim()) { setFormError('Give the assignment a title.'); return; }

    console.log('🔍 [handleSubmit] ============ SUBMIT START ============');
    console.log('🔍 [handleSubmit] form.attachments BEFORE upload:', form.attachments);

    setSaving(true);
    setFormError(null);
    try {
      const attachments = await uploadAttachments(form.attachments);
      console.log('🔍 [handleSubmit] attachments AFTER upload:', attachments);

      if (editingAssignment) {
        const payload: UpdateAssignmentData & { attachments?: Attachment[] } = {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          dueDate: form.dueDate || undefined,
          maxPoints: form.maxPoints ? Number(form.maxPoints) : undefined,
          attachments,
        };
        console.log('🔍 [handleSubmit] UPDATE payload:', payload);
        console.log('🔍 [handleSubmit] UPDATE payload JSON:', JSON.stringify(payload, null, 2));
        const res = await api.teacher.updateAssignment(editingAssignment.id, payload);
        console.log('🔍 [handleSubmit] UPDATE response:', res);
        console.log('🔍 [handleSubmit] UPDATE response JSON:', JSON.stringify(res?.data, null, 2));
      } else {
        const payload: CreateAssignmentData & { attachments?: Attachment[] } = {
          courseId: form.courseId,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          dueDate: form.dueDate || undefined,
          maxPoints: form.maxPoints ? Number(form.maxPoints) : undefined,
          attachments,
        };
        console.log('🔍 [handleSubmit] CREATE payload:', payload);
        console.log('🔍 [handleSubmit] CREATE payload JSON:', JSON.stringify(payload, null, 2));
        const res = await api.teacher.createAssignment(payload);
        console.log('🔍 [handleSubmit] CREATE response:', res);
        console.log('🔍 [handleSubmit] CREATE response JSON:', JSON.stringify(res?.data, null, 2));
      }
      console.log('🔍 [handleSubmit] ============ SUBMIT SUCCESS — reloading list ============');
      closeModal();
      await loadAssignments(selectedCourseId);
    } catch (err: any) {
      console.log('🔍 [handleSubmit] ERROR:', err);
      setFormError(err.message || 'Could not save the assignment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.teacher.deleteAssignment(id);
      setConfirmDeleteId(null);
      if (previewAssignment?.id === id) setPreviewAssignment(null);
      await loadAssignments(selectedCourseId);
    } catch (err: any) {
      setError(err.message || 'Could not delete the assignment.');
    } finally {
      setDeleting(false);
    }
  }

  // ── Auth gate render ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <FontAwesomeLoader />

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Assignments" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">Assignments</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {loading ? 'Loading…' : `${stats.total} assignment${stats.total === 1 ? '' : 's'} across your courses`}
              </div>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm"
            >
              <i className="fa-solid fa-plus text-xs" />
              New Assignment
            </button>
          </header>

          {/* Error Banner */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <StatCard key={s.label} label={s.label} value={loading ? '—' : s.value} icon={s.icon} accent={s.accent} light={s.light} sub={s.sub} />
              ))}
            </div>

            {/* Filters */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search assignments..."
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">All courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {/* Two-column layout when preview open */}
            <div className={`flex gap-5 items-start transition-all ${previewAssignment ? 'flex-col lg:flex-row' : ''}`}>
              {/* Assignment List */}
              <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ${previewAssignment ? 'lg:flex-1' : 'w-full'}`}>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[14px] text-slate-800">All Assignments</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {previewAssignment ? 'Click a row to preview' : 'Manage assignments across your courses'}
                    </div>
                  </div>
                  {stats.overdue > 0 && (
                    <span className="bg-red-50 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">
                      {stats.overdue} overdue
                    </span>
                  )}
                </div>

                {loading ? (
                  [0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)
                ) : filteredAssignments.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                      <i className="fa-solid fa-clipboard-list text-2xl text-slate-300" />
                    </div>
                    <p className="text-slate-600 font-semibold text-sm">
                      {assignments.length === 0 ? 'No assignments yet' : 'No matches found'}
                    </p>
                    <p className="text-slate-400 text-xs max-w-xs">
                      {assignments.length === 0
                        ? 'Create your first assignment to give students something to work on.'
                        : 'Try a different search term or course filter.'}
                    </p>
                    {assignments.length === 0 && (
                      <button
                        onClick={openCreateModal}
                        className="mt-1 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
                      >
                        Create Assignment
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {filteredAssignments.map((assignment) => {
                      const dueMeta = getDueMeta(assignment.dueDate);
                      const attachments: Attachment[] = Array.isArray((assignment as any).attachments)
                        ? (assignment as any).attachments
                        : [];
                      const isSelected = previewAssignment?.id === assignment.id;

                      return (
                        <div
                          key={assignment.id}
                          onClick={() => setPreviewAssignment(isSelected ? null : assignment)}
                          className={`px-5 py-4 border-b border-slate-50 last:border-b-0 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 shrink-0">
                            <i className="fa-solid fa-clipboard-list text-sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-slate-800 truncate">{assignment.title}</div>
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                              <span>{courseTitleById.get(assignment.courseId) ?? 'Unknown course'}</span>
                              <span>·</span>
                              <span>Due {formatDate(assignment.dueDate)}</span>
                              {assignment.maxPoints != null && <><span>·</span><span>{assignment.maxPoints} pts</span></>}
                              {attachments.length > 0 && (
                                <span className="flex items-center gap-1 text-slate-500">
                                  <i className="fa-solid fa-paperclip text-[10px]" />
                                  {attachments.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${dueMeta.classes}`}>
                            {dueMeta.label}
                          </span>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => openEditModal(assignment)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                              aria-label="Edit assignment"
                            >
                              <i className="fa-solid fa-pen text-xs" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(assignment.id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              aria-label="Delete assignment"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preview Panel (Google Classroom style) */}
              {previewAssignment && (
                <div className="lg:w-80 xl:w-96 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden shrink-0 w-full">
                  {/* Panel header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-600">
                    <div className="text-white font-bold text-[13px] truncate pr-2">{previewAssignment.title}</div>
                    <button
                      onClick={() => setPreviewAssignment(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-200 hover:text-white hover:bg-blue-800/50 transition-colors shrink-0"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Course */}
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-book text-blue-400 text-[11px]" />
                      <span className="text-[12px] text-slate-600 font-medium">
                        {courseTitleById.get(previewAssignment.courseId) ?? 'Unknown course'}
                      </span>
                    </div>

                    {/* Meta chips */}
                    <div className="flex flex-wrap gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                        <i className="fa-solid fa-calendar text-[10px]" />
                        {formatDate(previewAssignment.dueDate)}
                      </span>
                      {previewAssignment.maxPoints != null && (
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full">
                          <i className="fa-solid fa-award text-[10px]" />
                          {previewAssignment.maxPoints} pts
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {previewAssignment.description && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Instructions</div>
                        <p className="text-[12px] text-slate-600 leading-relaxed">{previewAssignment.description}</p>
                      </div>
                    )}

                    {/* Attachments */}
                    {(() => {
                      const atts: Attachment[] = Array.isArray((previewAssignment as any).attachments)
                        ? (previewAssignment as any).attachments
                        : [];
                      console.log('🔍 [PreviewPanel] previewAssignment.attachments:', (previewAssignment as any).attachments, '| parsed atts:', atts);
                      if (atts.length === 0) return null;
                      return (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            Attachments ({atts.length})
                          </div>
                          <div className="space-y-1.5">
                            {atts.map((att) => (
                              <AttachmentChip key={att.id} attachment={att} />
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => openEditModal(previewAssignment)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <i className="fa-solid fa-pen text-[10px]" /> Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(previewAssignment.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <i className="fa-solid fa-trash text-[10px]" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Create / Edit Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h2 className="text-[15px] font-bold text-slate-900">
                {editingAssignment ? 'Edit Assignment' : 'New Assignment'}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              <form id="assignment-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Course</label>
                  <select
                    value={form.courseId}
                    onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                    disabled={!!editingAssignment}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">Select a course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Chapter 4 Problem Set"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Instructions</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="What should students do for this assignment?"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Due date</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Max points</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxPoints}
                      onChange={(e) => setForm((f) => ({ ...f, maxPoints: e.target.value }))}
                      placeholder="100"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                {/* ── Attachments ── */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <AttachmentsEditor
                    attachments={form.attachments}
                    onChange={(next) => {
                      console.log('🔍 [form.attachments onChange] next value:', next);
                      setForm((f) => ({ ...f, attachments: next }));
                    }}
                  />
                </div>

                {formError && (
                  <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    <i className="fa-solid fa-circle-exclamation" />
                    {formError}
                  </p>
                )}
              </form>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="assignment-form"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
              >
                {saving && <i className="fa-solid fa-circle-notch fa-spin" />}
                {editingAssignment ? 'Save Changes' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
              <i className="fa-solid fa-trash text-red-600" />
            </div>
            <h3 className="mt-4 text-[15px] font-bold text-slate-900">Delete this assignment?</h3>
            <p className="mt-1 text-sm text-slate-500">
              This removes it for every enrolled student and cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <i className="fa-solid fa-circle-notch fa-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}