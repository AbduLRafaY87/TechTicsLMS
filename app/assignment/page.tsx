'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';

// ─── Font Awesome Loader ───────────────────────────────────────────────────────

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

// ─── Types ─────────────────────────────────────────────────────────────────────

type AssignmentStatus = 'pending' | 'submitted' | 'graded' | 'overdue';
type Priority = 'low' | 'medium' | 'high';
type AttachmentType = 'link' | 'pdf' | 'file';

interface Attachment {
  id: string;
  type: AttachmentType;
  name: string;
  url: string;
  size?: number;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: AssignmentStatus;
  priority: Priority;
  course: { id: string; title: string };
  grade?: number;
  maxGrade?: number;
  maxPoints?: number;
  submittedAt?: string;
  feedback?: string;
  attachments?: Attachment[];
  mySubmission?: {
    id: string;
    content?: string;
    fileUrl?: string;
    grade?: number;
    feedback?: string;
    submittedAt: string;
  };
}

// ─── Normalise raw API data ────────────────────────────────────────────────────

function normalizeAssignment(item: any): Assignment {
  const courseId = item.course?.id ?? item.courseId ?? 'unknown';
  const courseTitle = item.course?.title ?? item.courseTitle ?? String(item.courseId ?? 'Unknown course');

  // Determine status
  let status: AssignmentStatus = item.status ?? 'pending';
  if (!item.status) {
    const submission = item.submissions?.[0] ?? item.mySubmission;
    if (submission) {
      status = submission.grade != null ? 'graded' : 'submitted';
    } else if (item.dueDate && new Date(item.dueDate) < new Date()) {
      status = 'overdue';
    }
  }

  return {
    id: String(item.id ?? ''),
    title: String(item.title ?? 'Untitled assignment'),
    description: String(item.description ?? ''),
    dueDate: String(item.dueDate ?? ''),
    status,
    priority: (item.priority ?? 'medium') as Priority,
    course: { id: courseId, title: courseTitle },
    grade: item.grade ?? item.submissions?.[0]?.grade,
    maxGrade: item.maxGrade ?? item.maxPoints ?? item.maxScore,
    maxPoints: item.maxPoints ?? item.maxScore,
    submittedAt: item.submittedAt ?? item.submissions?.[0]?.submittedAt,
    feedback: item.feedback ?? item.submissions?.[0]?.feedback,
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map((att: any) => ({
          id: String(att.id ?? Math.random().toString(36).slice(2)),
          type: att.type === 'pdf' ? 'pdf' : att.type === 'file' ? 'file' : 'link',
          name: String(att.name ?? att.filename ?? 'Attachment'),
          url: String(att.url ?? att.path ?? ''),
          size: typeof att.size === 'number' ? att.size : undefined,
        }))
      : [],
    mySubmission: item.submissions?.[0] ?? item.mySubmission ?? null,
  };
}

function normalizeAssignments(rawData: any): Assignment[] {
  if (!rawData) return [];
  const items = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData.assignments)
    ? rawData.assignments
    : Array.isArray(rawData.data)
    ? rawData.data
    : [];
  return items.map(normalizeAssignment);
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCENT_COLORS = ['#1E3A5F', '#2563EB', '#0F766E', '#6D28D9', '#B45309', '#DC2626', '#0369A1', '#4338CA'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_META: Record<AssignmentStatus, { label: string; color: string; bg: string; border: string; dot: string; icon: string }> = {
  pending:   { label: 'Assigned',  color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', dot: '#F59E0B', icon: 'fa-hourglass-half'     },
  submitted: { label: 'Turned In', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6', icon: 'fa-circle-check'       },
  graded:    { label: 'Graded',    color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981', icon: 'fa-star'               },
  overdue:   { label: 'Missing',   color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444', icon: 'fa-circle-exclamation' },
};

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; icon: string }> = {
  low:    { label: 'Low',    color: '#0369A1', bg: '#EFF6FF', icon: 'fa-angle-down'   },
  medium: { label: 'Medium', color: '#B45309', bg: '#FEF3C7', icon: 'fa-angles-right' },
  high:   { label: 'High',   color: '#DC2626', bg: '#FEF2F2', icon: 'fa-angle-up'     },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString?: string) {
  if (!dateString) return 'No due date';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDueDiff(dateString?: string): string {
  if (!dateString) return '';
  const due = new Date(dateString);
  if (isNaN(due.getTime())) return '';
  const now = new Date();
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, light, sub }: {
  label: string; value: string | number; icon: string; accent: string; light: string; sub: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: light, color: accent }}>
        <i className={`fa-solid ${icon} text-base`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-3xl font-black text-slate-900 leading-none tracking-tight">{value}</div>
        <div className="text-slate-500 text-[11px] font-semibold mt-1.5 uppercase tracking-widest">{label}</div>
        <div className="text-xs font-medium mt-1" style={{ color: accent }}>{sub}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse border-b border-slate-50">
      <div className="w-10 h-10 bg-slate-100 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="h-2.5 bg-slate-100 rounded w-1/3" />
      </div>
      <div className="w-20 h-6 bg-slate-100 rounded-full" />
    </div>
  );
}

// ─── Teacher Attachment Chip ───────────────────────────────────────────────────

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const isPdf = attachment.type === 'pdf';
  const isLink = attachment.type === 'link';
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all hover:shadow-sm group ${
        isPdf
          ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'
          : 'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isPdf ? 'bg-red-100' : 'bg-blue-100'}`}>
        <i className={`fa-solid ${isPdf ? 'fa-file-pdf' : isLink ? 'fa-link' : 'fa-file'} text-sm`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate max-w-[200px] font-semibold">{attachment.name}</div>
        {attachment.size && <div className="text-[10px] opacity-60">{formatBytes(attachment.size)}</div>}
      </div>
      <i className="fa-solid fa-arrow-up-right-from-square text-[10px] opacity-50 group-hover:opacity-100 transition-opacity" />
    </a>
  );
}

// ─── Student File Chip (for submission) ───────────────────────────────────────

function StudentFileChip({
  name, size, url, onRemove,
}: { name: string; size?: number; url?: string; onRemove?: () => void }) {
  const inner = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[12px] font-medium group hover:shadow-sm transition-all">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <i className="fa-solid fa-file text-slate-500 text-sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate max-w-[180px] text-slate-800 font-semibold">{name}</div>
        {size && <div className="text-[10px] text-slate-400">{formatBytes(size)}</div>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onRemove(); }}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
        >
          <i className="fa-solid fa-xmark text-[11px]" />
        </button>
      )}
      {url && !onRemove && (
        <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-slate-400 group-hover:text-slate-700 transition-colors shrink-0" />
      )}
    </div>
  );

  if (url && !onRemove) {
    return <a href={url} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  return inner;
}

// ─── Assignment Detail / Submission Modal ─────────────────────────────────────

interface SubmissionFile {
  id: string;
  name: string;
  size: number;
  file: File;
  localUrl: string;
}

function AssignmentDetailModal({
  assignment,
  onClose,
  onSubmitted,
}: {
  assignment: Assignment;
  onClose: () => void;
  onSubmitted: (updated: Assignment) => void;
}) {
  const [tab, setTab] = useState<'instructions' | 'submission'>('instructions');
  const [submissionText, setSubmissionText] = useState(assignment.mySubmission?.content ?? '');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unsubmitting, setUnsubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitted = assignment.status === 'submitted' || assignment.status === 'graded';
  const isGraded = assignment.status === 'graded';
  const due = assignment.dueDate ? new Date(assignment.dueDate) : null;
  const dueDiff = getDueDiff(assignment.dueDate);
  const statusMeta = STATUS_META[assignment.status];

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function addFiles(picked: File[]) {
    const next: SubmissionFile[] = picked.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size,
      file: f,
      localUrl: URL.createObjectURL(f),
    }));
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!url) { setLinkError('Please enter a URL.'); return; }
    if (!/^https?:\/\/.+/.test(url)) { setLinkError('URL must start with http:// or https://'); return; }
    // Treat link as a text note
    setSubmissionText((prev) => prev ? `${prev}\n${url}` : url);
    setLinkUrl('');
    setLinkError('');
  }

  async function handleTurnIn() {
    if (!submissionText.trim() && files.length === 0) {
      setSubmitError('Add a comment, link, or file before turning in.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      let fileUrl: string | undefined;

      // Upload first file if present
      if (files.length > 0) {
        const formData = new FormData();
        formData.append('file', files[0].file);
        const uploadRes = await (api as any).teacher.uploadFile(formData);
        fileUrl = uploadRes?.data?.url ?? uploadRes?.data?.fileUrl;
      }

      const res = await api.createSubmission({
        assignmentId: assignment.id,
        content: submissionText.trim() || undefined,
        fileUrl,
      });

      const updated: Assignment = {
        ...assignment,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        mySubmission: {
          id: (res as any).data?.id ?? (res as any).data?.submission?.id ?? '',
          content: submissionText.trim(),
          fileUrl,
          submittedAt: new Date().toISOString(),
        },
      };
      onSubmitted(updated);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleUnsubmit() {
    // Optimistic local unsubmit (API may not support DELETE on submission)
    setUnsubmitting(true);
    setTimeout(() => {
      const updated: Assignment = {
        ...assignment,
        status: 'pending',
        submittedAt: undefined,
        mySubmission: undefined,
      };
      onSubmitted(updated);
      setUnsubmitting(false);
    }, 600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 860, maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0"
            style={{ background: ACCENT_COLORS[assignment.course.title.length % ACCENT_COLORS.length] }}
          >
            {assignment.course.title.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-widest">{assignment.course.title}</div>
            <h2 className="text-slate-900 font-black text-[17px] leading-tight truncate">{assignment.title}</h2>
          </div>
          <span
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full border shrink-0"
            style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}
          >
            <i className={`fa-solid ${statusMeta.icon} text-[10px]`} />
            {statusMeta.label}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-slate-100 px-6 shrink-0">
          {(['instructions', 'submission'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-[13px] font-semibold border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'instructions' ? 'Instructions' : 'Your Work'}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'instructions' ? (
            <div className="p-6 space-y-6">
              {/* Due date bar */}
              <div className="flex flex-wrap items-center gap-3">
                {due && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <i className="fa-solid fa-calendar-days text-slate-400 text-sm" />
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Due</div>
                      <div className="text-[13px] font-bold text-slate-800">
                        {formatDate(assignment.dueDate)}
                        <span className="ml-2 text-[11px] font-medium text-slate-400">{dueDiff}</span>
                      </div>
                    </div>
                  </div>
                )}
                {assignment.maxGrade != null && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200">
                    <i className="fa-solid fa-award text-purple-500 text-sm" />
                    <div>
                      <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Points</div>
                      <div className="text-[13px] font-bold text-purple-800">{assignment.maxGrade}</div>
                    </div>
                  </div>
                )}
                {isGraded && assignment.grade !== undefined && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <i className="fa-solid fa-star text-emerald-500 text-sm" />
                    <div>
                      <div className="text-[10px] text-emerald-500 font-semibold uppercase tracking-widest">Your Grade</div>
                      <div className="text-[13px] font-bold text-emerald-800">
                        {assignment.grade} / {assignment.maxGrade ?? 100}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {assignment.description ? (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Instructions</div>
                  <p className="text-slate-700 text-[14px] leading-relaxed whitespace-pre-wrap">{assignment.description}</p>
                </div>
              ) : (
                <p className="text-slate-400 text-sm italic">No instructions provided.</p>
              )}

              {/* Teacher attachments */}
              {assignment.attachments && assignment.attachments.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-paperclip" />
                    Materials ({assignment.attachments.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {assignment.attachments.map((att) => (
                      <AttachmentChip key={att.id} attachment={att} />
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback (if graded) */}
              {isGraded && assignment.feedback && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <i className="fa-solid fa-comment-dots" />
                    Teacher Feedback
                  </div>
                  <p className="text-emerald-800 text-[13px] leading-relaxed">{assignment.feedback}</p>
                </div>
              )}
            </div>
          ) : (
            /* ── Your Work Tab ── */
            <div className="p-6 space-y-5">
              {isSubmitted ? (
                /* Already submitted state */
                <div className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
                    <i className="fa-solid fa-circle-check text-blue-600 text-xl mt-0.5" />
                    <div>
                      <div className="font-bold text-blue-900 text-[14px]">
                        {isGraded ? 'Graded' : 'Turned in'}
                      </div>
                      <div className="text-blue-700 text-[12px] mt-0.5">
                        {assignment.submittedAt
                          ? `Submitted ${new Date(assignment.submittedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
                          : 'Your work has been submitted.'}
                      </div>
                    </div>
                  </div>

                  {/* Submitted content */}
                  {assignment.mySubmission?.content && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Your comment</div>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-700 whitespace-pre-wrap">
                        {assignment.mySubmission.content}
                      </div>
                    </div>
                  )}

                  {/* Submitted file */}
                  {assignment.mySubmission?.fileUrl && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Submitted file</div>
                      <StudentFileChip
                        name={assignment.mySubmission.fileUrl.split('/').pop() ?? 'Submitted file'}
                        url={assignment.mySubmission.fileUrl}
                      />
                    </div>
                  )}

                  {/* Unsubmit button (only if not graded) */}
                  {!isGraded && (
                    <button
                      onClick={handleUnsubmit}
                      disabled={unsubmitting}
                      className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {unsubmitting
                        ? <><i className="fa-solid fa-circle-notch fa-spin text-xs" />Unsubmitting…</>
                        : <><i className="fa-solid fa-rotate-left text-xs" />Unsubmit</>
                      }
                    </button>
                  )}
                </div>
              ) : (
                /* Work submission area */
                <div className="space-y-4">
                  {/* Add comment */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Comment / Notes
                    </label>
                    <textarea
                      value={submissionText}
                      onChange={(e) => setSubmissionText(e.target.value)}
                      placeholder="Add a private comment or notes for your teacher…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Add link */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Add a link
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={linkUrl}
                        onChange={(e) => { setLinkUrl(e.target.value); setLinkError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
                        placeholder="https://docs.google.com/..."
                        className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={addLink}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 text-[12px] font-semibold rounded-xl hover:bg-slate-200 transition-colors shrink-0"
                      >
                        <i className="fa-solid fa-plus mr-1.5" />
                        Add
                      </button>
                    </div>
                    {linkError && (
                      <p className="mt-1.5 text-red-500 text-[11px] flex items-center gap-1">
                        <i className="fa-solid fa-circle-exclamation" /> {linkError}
                      </p>
                    )}
                  </div>

                  {/* File upload area */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Attach Files
                    </label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mx-auto mb-2 transition-colors">
                        <i className="fa-solid fa-cloud-arrow-up text-slate-400 group-hover:text-blue-600 text-lg transition-colors" />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-600 group-hover:text-blue-700 transition-colors">
                        Click to upload files
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">PDF, images, documents — any file type</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                    />
                  </div>

                  {/* Queued files */}
                  {files.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Files to submit</div>
                      {files.map((f) => (
                        <StudentFileChip key={f.id} name={f.name} size={f.size} onRemove={() => removeFile(f.id)} />
                      ))}
                    </div>
                  )}

                  {submitError && (
                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[12px]">
                      <i className="fa-solid fa-circle-exclamation" />
                      {submitError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-[13px] font-semibold text-slate-600 rounded-xl hover:bg-white hover:border-slate-200 border border-transparent transition-all"
          >
            Close
          </button>
          {!isSubmitted && tab === 'submission' && (
            <button
              onClick={handleTurnIn}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-[13px] font-bold rounded-xl hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <><i className="fa-solid fa-circle-notch fa-spin" />Turning in…</>
              ) : (
                <><i className="fa-solid fa-paper-plane" />Turn In</>
              )}
            </button>
          )}
          {!isSubmitted && tab === 'instructions' && (
            <button
              onClick={() => setTab('submission')}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-[13px] font-bold rounded-xl hover:bg-blue-800 transition-colors shadow-sm"
            >
              <i className="fa-solid fa-arrow-right" />
              Add Work
            </button>
          )}
          {isSubmitted && !isGraded && (
            <div className="flex items-center gap-2 text-blue-700 text-[13px] font-semibold">
              <i className="fa-solid fa-circle-check" />
              Turned in
            </div>
          )}
          {isGraded && assignment.grade !== undefined && (
            <div className="flex items-center gap-2 text-emerald-700 text-[13px] font-semibold">
              <i className="fa-solid fa-star" />
              {assignment.grade} / {assignment.maxGrade ?? 100}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function StudentAssignmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | AssignmentStatus>('all');
  const [activeCourse, setActiveCourse] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Auth + fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'TEACHER' || user.role === 'ADMIN') { router.replace('/teacher/assignments'); return; }
    if (fetchedRef.current === user.id) return;
    fetchedRef.current = user.id;

    (async () => {
      setLoadingData(true);
      setError(null);
      try {
        const res: any = await api.getAssignments();
        const payload = res?.data?.data ?? res?.data ?? res;
        setAssignments(normalizeAssignments(payload));
      } catch (err: any) {
        setError(err.message || 'Failed to load assignments');
        fetchedRef.current = null;
      } finally {
        setLoadingData(false);
      }
    })();
  }, [user, authLoading, router]);

  const handleSubmitted = useCallback((updated: Assignment) => {
    setAssignments((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    // Update the open modal assignment too
    setSelectedAssignment(updated);
    if (updated.status === 'submitted') {
      setSuccessMsg('Assignment turned in!');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = assignments.length;
    const pending = assignments.filter((a) => a.status === 'pending').length;
    const submitted = assignments.filter((a) => a.status === 'submitted').length;
    const graded = assignments.filter((a) => a.status === 'graded').length;
    const overdue = assignments.filter((a) => a.status === 'overdue').length;
    const gradedItems = assignments.filter((a) => typeof a.grade === 'number');
    const avgGrade = gradedItems.length
      ? Math.round(gradedItems.reduce((s, a) => s + (a.grade ?? 0), 0) / gradedItems.length)
      : 0;
    return { total, pending, submitted, graded, overdue, avgGrade };
  }, [assignments]);

  const courseOptions = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach((a) => map.set(a.course.id, a.course.title));
    return [{ id: 'all', title: 'All Courses' }, ...Array.from(map, ([id, title]) => ({ id, title }))];
  }, [assignments]);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      const statusOk = activeFilter === 'all' || a.status === activeFilter;
      const courseOk = activeCourse === 'all' || a.course.id === activeCourse;
      const searchOk = !searchQuery
        || a.title.toLowerCase().includes(searchQuery.toLowerCase())
        || a.course.title.toLowerCase().includes(searchQuery.toLowerCase());
      return statusOk && courseOk && searchOk;
    });
  }, [assignments, activeFilter, activeCourse, searchQuery]);

  const STATS = [
    { label: 'Total',     value: summary.total,     icon: 'fa-clipboard-list',   accent: '#1E3A5F', light: '#EFF6FF', sub: 'All assignments'    },
    { label: 'Assigned',  value: summary.pending,   icon: 'fa-hourglass-half',   accent: '#92400E', light: '#FEF3C7', sub: 'Awaiting your work' },
    { label: 'Turned In', value: summary.submitted, icon: 'fa-paper-plane',      accent: '#1D4ED8', light: '#EFF6FF', sub: 'Submitted'          },
    { label: 'Graded',    value: summary.graded,    icon: 'fa-star',             accent: '#065F46', light: '#ECFDF5', sub: 'Results available'   },
  ];

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user || user.role === 'TEACHER' || user.role === 'ADMIN') return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = (user.name || '').split(' ')[0] || 'there';

  return (
    <>
      <FontAwesomeLoader />

      {/* Assignment Detail Modal */}
      {selectedAssignment && (
        <AssignmentDetailModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
          onSubmitted={handleSubmitted}
        />
      )}

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-5 py-3 bg-white border border-emerald-200 rounded-2xl shadow-xl text-emerald-700 text-[13px] font-semibold animate-fadeSlideUp">
          <i className="fa-solid fa-circle-check text-emerald-500 text-base" />
          {successMsg}
        </div>
      )}

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Assignments" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* ── Header ── */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <div className="text-slate-900 font-bold text-[15px]">{greeting}, {displayName}</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {summary.overdue > 0 && (
                <button
                  onClick={() => setActiveFilter('overdue')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 text-[12px] font-bold rounded-lg hover:bg-red-100 transition-colors"
                >
                  <i className="fa-solid fa-circle-exclamation text-xs" />
                  {summary.overdue} Missing
                </button>
              )}
              <a
                href="/dashboard"
                className="flex items-center gap-1.5 text-slate-500 text-[13px] font-semibold hover:text-blue-700 transition-colors"
              >
                <i className="fa-solid fa-arrow-left text-xs" />
                Dashboard
              </a>
            </div>
          </header>

          {/* ── Error bar ── */}
          {error && (
            <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

            {/* ── Hero ── */}
            <div
              className="relative rounded-2xl overflow-hidden px-8 py-7"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}
            >
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="absolute right-32 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Classwork</div>
                  <h1 className="text-white text-2xl font-black tracking-tight leading-tight">Your Assignments</h1>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {summary.pending} to do
                    {summary.overdue > 0 && <span className="text-red-300 font-bold"> · {summary.overdue} missing</span>}
                    {summary.graded > 0 && ` · ${summary.graded} graded`}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: String(summary.total),    l: 'Total\nAssignments' },
                    { v: String(summary.overdue),  l: 'Missing\nItems'     },
                    { v: `${summary.avgGrade}%`,   l: 'Average\nGrade'     },
                  ].map((s) => (
                    <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                      <div className="text-white text-3xl font-black">{s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {STATS.map((s) => (
                <StatCard key={s.label} {...s} value={loadingData ? '—' : s.value} />
              ))}
            </div>

            {/* ── Assignments Table ── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Table header + filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-5 border-b border-slate-100 gap-3">
                <div>
                  <div className="text-slate-900 font-bold text-[14px] tracking-tight">All Assignments</div>
                  <div className="text-slate-400 text-[11px] mt-0.5">Click any assignment to view details and turn in your work</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative">
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[11px]" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search…"
                      className="pl-8 pr-3 py-2 text-[12px] border border-slate-200 rounded-xl text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-40"
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {(['all', 'pending', 'submitted', 'graded', 'overdue'] as const).map((f) => {
                      const labels: Record<string, string> = {
                        all: 'All', pending: 'Assigned', submitted: 'Turned In',
                        graded: 'Graded', overdue: 'Missing',
                      };
                      return (
                        <button
                          key={f}
                          onClick={() => setActiveFilter(f)}
                          className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg capitalize transition-all ${
                            activeFilter === f
                              ? 'bg-blue-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {labels[f]}
                        </button>
                      );
                    })}
                  </div>
                  <select
                    value={activeCourse}
                    onChange={(e) => setActiveCourse(e.target.value)}
                    className="text-[12px] border border-slate-200 rounded-xl px-3 py-2 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  >
                    {courseOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-50">
                {loadingData ? (
                  [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <i className="fa-solid fa-file-circle-xmark text-2xl text-slate-300" />
                    </div>
                    <p className="text-slate-600 font-semibold text-sm">
                      {assignments.length === 0 ? 'No assignments yet' : 'Nothing matches your filters'}
                    </p>
                    <p className="text-slate-400 text-xs max-w-xs">
                      {assignments.length === 0
                        ? 'Your teachers haven\'t posted any assignments yet.'
                        : 'Try adjusting your search or filter.'}
                    </p>
                  </div>
                ) : (
                  filtered.map((a, i) => {
                    const statusMeta = STATUS_META[a.status];
                    const priorityMeta = PRIORITY_META[a.priority];
                    const due = a.dueDate ? new Date(a.dueDate) : null;
                    const color = ACCENT_COLORS[i % ACCENT_COLORS.length];
                    const attachCount = a.attachments?.length ?? 0;
                    const dueDiff = getDueDiff(a.dueDate);

                    return (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAssignment(a)}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        {/* Date box */}
                        <div className="w-11 text-center shrink-0">
                          {due ? (
                            <>
                              <div className={`text-[15px] font-black leading-none ${a.status === 'overdue' ? 'text-red-500' : 'text-slate-800'}`}>
                                {due.getDate()}
                              </div>
                              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                                {MONTH_NAMES[due.getMonth()]}
                              </div>
                            </>
                          ) : (
                            <div className="text-slate-300 text-[11px] font-semibold">—</div>
                          )}
                        </div>

                        <div className="w-px h-10 bg-slate-100 shrink-0" />

                        {/* Course avatar */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0"
                          style={{ background: color }}
                        >
                          {a.course.title.slice(0, 2).toUpperCase()}
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-800 text-[13px] font-semibold truncate group-hover:text-blue-700 transition-colors flex items-center gap-2">
                            {a.title}
                            {attachCount > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-normal text-slate-400 shrink-0">
                                <i className="fa-solid fa-paperclip text-[10px]" />
                                {attachCount}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-400 text-[11px] truncate">{a.course.title}</span>
                            {dueDiff && (
                              <>
                                <span className="text-slate-200 text-[10px]">·</span>
                                <span className={`text-[11px] font-medium ${a.status === 'overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                                  {dueDiff}
                                </span>
                              </>
                            )}
                            {a.maxGrade != null && (
                              <>
                                <span className="text-slate-200 text-[10px]">·</span>
                                <span className="text-[11px] text-slate-400">{a.maxGrade} pts</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Priority */}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg hidden sm:flex items-center gap-1 shrink-0"
                          style={{ color: priorityMeta.color, background: priorityMeta.bg }}
                        >
                          <i className={`fa-solid ${priorityMeta.icon} text-[9px]`} />
                          {priorityMeta.label}
                        </span>

                        {/* Grade chip */}
                        {a.status === 'graded' && a.grade !== undefined && (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full hidden sm:block shrink-0">
                            {a.grade}/{a.maxGrade ?? 100}
                          </span>
                        )}

                        {/* Status badge */}
                        <span
                          className="text-[11px] font-bold px-3 py-1.5 rounded-full border shrink-0 flex items-center gap-1.5"
                          style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border }}
                        >
                          <i className={`fa-solid ${statusMeta.icon} text-[10px]`} />
                          {statusMeta.label}
                        </span>

                        {/* Arrow */}
                        <i className="fa-solid fa-chevron-right text-slate-300 group-hover:text-blue-400 text-[11px] transition-colors shrink-0" />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer summary */}
              {!loadingData && assignments.length > 0 && (
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Showing {filtered.length} of {assignments.length} assignments
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {(['pending', 'submitted', 'graded', 'overdue'] as const).map((s) => {
                      const cnt = assignments.filter((a) => a.status === s).length;
                      const meta = STATUS_META[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setActiveFilter(activeFilter === s ? 'all' : s)}
                          className="text-[11px] font-bold flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                          style={{ color: meta.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: meta.dot }} />
                          {cnt} {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          </div>
        </main>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .animate-fadeSlideUp { animation: fadeSlideUp 0.25s ease; }
      `}</style>
    </>
  );
}