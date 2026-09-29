'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Sidebar from '../../../components/Sidebar';
import { api } from '../../../../lib/api';
import { useCache } from '../../../../lib/useCache';
import { cache, TTL } from '../../../../lib/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  duration?: number;
  order?: number;
  isFree?: boolean;
}

interface QuizOption {
  text: string;
  imageUrl?: string | null;
}

interface QuizQuestion {
  tempId: string;
  id?: string;
  text: string;
  imageUrl?: string | null;
  options: QuizOption[];
  correctOption: number;
  explanation?: string;
  points: number;
}

// A curriculum item is either a lesson, a quiz, or an assignment
type ItemType = 'lesson' | 'quiz' | 'assignment';

interface CurriculumItem {
  id: string;
  type: ItemType;
  title: string;
  order: number;
  // lesson-specific
  description?: string;
  videoUrl?: string;
  duration?: number;
  isFree?: boolean;
  // quiz-specific
  questions?: QuizQuestion[];
  quizDuration?: number;
  maxAttempts?: number;
  passingScore?: number;
  isPublished?: boolean;
  // assignment-specific
  assignmentDescription?: string;
  dueDate?: string;
  maxPoints?: number;
}

interface Module {
  id: string;
  title: string;
  description?: string;
  order?: number;
  items: CurriculumItem[]; // unified list of lessons + quizzes + assignments
}

interface Course {
  id: string;
  title: string;
  description?: string;
  isPublished: boolean;
  createdAt: string;
  _count: { enrollments: number; modules: number };
}

interface CachedCourseData {
  course: Course;
  modules: Module[];
}

// ─── Cache key ────────────────────────────────────────────────────────────────

const getCourseDetailCacheKey = (courseId: string) => `course:detail:${courseId}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(res: any, ...keys: string[]): T {
  let val = res?.data?.data;
  for (const k of keys) { if (val == null) break; val = val[k]; }
  if (val === undefined) {
    val = res?.data;
    for (const k of keys) { if (val == null) break; val = val[k]; }
  }
  return val as T;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

async function compressImage(file: File, maxW = 900, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no ctx'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── FA Loader ────────────────────────────────────────────────────────────────

function FontAwesomeLoader() {
  useEffect(() => {
    const id = 'fa-cdn';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    document.head.appendChild(link);
  }, []);
  return null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <i className={`fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
      {msg}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, light, sub }: {
  label: string; value: string | number; icon: string; accent: string; light: string; sub: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: light, color: accent, fontSize: '1rem' }}>
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

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 flex items-start gap-4 border border-slate-200 animate-pulse">
      <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-6 bg-slate-100 rounded w-1/3" />
        <div className="h-2.5 bg-slate-100 rounded w-1/2" />
      </div>
    </div>
  );
}

// ─── Video Upload ─────────────────────────────────────────────────────────────

function VideoInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<'url' | 'file'>('url');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (!f.type.startsWith('video/')) return;
    if (f.size > 100 * 1024 * 1024) { setUploadError('Max 100MB. Use YouTube URL instead.'); return; }
    setUploading(true); setUploadError(null);
    try {
      const res = await api.uploadVideo(f);
      onChange((res.data as any).data.url);
    } catch (err: any) { setUploadError(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div>
      <div className="flex gap-1 mb-3 p-1 bg-slate-100 rounded-lg w-fit">
        {(['url', 'file'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'url' ? <><i className="fa-solid fa-link mr-1.5" />Paste URL</> : <><i className="fa-solid fa-upload mr-1.5" />Upload</>}
          </button>
        ))}
      </div>
      {tab === 'url' ? (
        <input type="url" value={value} onChange={e => onChange(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-300" />
      ) : (
        <div onClick={() => !uploading && fileRef.current?.click()}
          className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${uploading ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-400'}`}>
          {uploading ? (
            <><span className="w-7 h-7 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin block mx-auto mb-2" />
            <p className="text-sm font-semibold text-blue-600">Uploading…</p></>
          ) : (
            <><i className="fa-solid fa-cloud-arrow-up text-2xl text-slate-300 mb-2 block" />
            <p className="text-sm font-semibold text-slate-500">Drop or click to upload</p>
            <p className="text-xs text-slate-400 mt-1">MP4, MOV — up to 100MB</p></>
          )}
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}
      {uploadError && <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><i className="fa-solid fa-circle-xmark" />{uploadError}</p>}
      {value && !uploading && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
          <i className="fa-solid fa-circle-check text-emerald-500 shrink-0" />
          <span className="text-xs text-emerald-700 truncate flex-1">{value.length > 55 ? value.slice(0, 55) + '…' : value}</span>
          <button type="button" onClick={() => onChange('')} className="text-slate-400 hover:text-red-500 transition shrink-0"><i className="fa-solid fa-xmark text-xs" /></button>
        </div>
      )}
    </div>
  );
}

// ─── Image Upload Button ──────────────────────────────────────────────────────

function ImageUploadBtn({ value, onChange }: { value?: string | null; onChange: (b64: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try { onChange(await compressImage(file)); } catch {}
    finally { setCompressing(false); e.target.value = ''; }
  };
  if (value) {
    return (
      <div className="relative inline-flex group">
        <img src={value} alt="" className="h-14 w-20 rounded-lg border border-slate-200 object-cover" />
        <button onClick={() => onChange(undefined)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    );
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
      <button onClick={() => ref.current?.click()} disabled={compressing}
        className="flex items-center gap-1.5 text-slate-400 border border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50 px-2.5 py-1.5 text-[11px]">
        {compressing ? <span className="w-3 h-3 border border-slate-300 border-t-blue-500 rounded-full animate-spin" /> : <i className="fa-solid fa-image text-[10px]" />}
        {compressing ? 'Compressing…' : 'Image'}
      </button>
    </>
  );
}

// ─── Lesson Modal ─────────────────────────────────────────────────────────────

interface LessonForm { title: string; description: string; videoUrl: string; duration: string; isFree: boolean; }
const EMPTY_LESSON: LessonForm = { title: '', description: '', videoUrl: '', duration: '', isFree: false };

function LessonModal({ mode, initial, saving, onSave, onClose }: {
  mode: 'add' | 'edit'; initial: LessonForm; saving: boolean;
  onSave: (f: LessonForm) => void; onClose: () => void;
}) {
  const [f, setF] = useState<LessonForm>(initial);
  useEffect(() => setF(initial), [initial]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100"
          style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">{mode === 'add' ? 'Add Lesson' : 'Edit Lesson'}</h2>
            <p className="text-xs text-blue-300 mt-0.5">Video lecture for this module</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-300 hover:bg-white/10 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Introduction to HTML"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} rows={2}
              placeholder="What will students learn?"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Video</label>
            <VideoInput value={f.videoUrl} onChange={v => setF(p => ({ ...p, videoUrl: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration (min)</label>
              <input type="number" min="0" value={f.duration} onChange={e => setF(p => ({ ...p, duration: e.target.value }))} placeholder="12"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div onClick={() => setF(p => ({ ...p, isFree: !p.isFree }))}
                  className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${f.isFree ? 'bg-blue-600' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${f.isFree ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm font-semibold text-slate-600">Free preview</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">Cancel</button>
          <button onClick={() => onSave(f)} disabled={saving || !f.title.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40 flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {mode === 'add' ? 'Add Lesson' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment Modal ─────────────────────────────────────────────────────────

interface AssignmentForm { title: string; description: string; dueDate: string; maxPoints: string; }
const EMPTY_ASSIGNMENT: AssignmentForm = { title: '', description: '', dueDate: '', maxPoints: '100' };

function AssignmentModal({ mode, initial, saving, onSave, onClose }: {
  mode: 'add' | 'edit'; initial: AssignmentForm; saving: boolean;
  onSave: (f: AssignmentForm) => void; onClose: () => void;
}) {
  const [f, setF] = useState<AssignmentForm>(initial);
  useEffect(() => setF(initial), [initial]);
  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100"
          style={{ background: 'linear-gradient(135deg, #78350f 0%, #B45309 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">{mode === 'add' ? 'Add Assignment' : 'Edit Assignment'}</h2>
            <p className="text-xs text-amber-200 mt-0.5">Students submit work for this</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-amber-200 hover:bg-white/10 hover:text-white transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Build a Landing Page" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instructions</label>
            <textarea value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} rows={3}
              placeholder="What should students do?"
              className={`${inputCls} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due Date</label>
              <input type="date" value={f.dueDate} onChange={e => setF(p => ({ ...p, dueDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max Points</label>
              <input type="number" min="1" value={f.maxPoints} onChange={e => setF(p => ({ ...p, maxPoints: e.target.value }))} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">Cancel</button>
          <button onClick={() => onSave(f)} disabled={saving || !f.title.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-40 flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {mode === 'add' ? 'Add Assignment' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Question Card (inline builder) ──────────────────────────────────────

function QuizQuestionCard({ q, idx, total, onChange, onDelete, onMove }: {
  q: QuizQuestion; idx: number; total: number;
  onChange: (q: QuizQuestion) => void; onDelete: () => void; onMove: (dir: 'up' | 'down') => void;
}) {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  const set = (patch: Partial<QuizQuestion>) => onChange({ ...q, ...patch });
  const updateOption = (i: number, patch: Partial<QuizOption>) =>
    set({ options: q.options.map((o, j) => j === i ? { ...o, ...patch } : o) });
  const addOption = () => { if (q.options.length < 5) set({ options: [...q.options, { text: '' }] }); };
  const removeOption = (i: number) => {
    const next = q.options.filter((_, j) => j !== i);
    set({ options: next, correctOption: Math.min(q.correctOption, next.length - 1) });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-purple-700 text-white text-[10px] font-black flex items-center justify-center">{idx + 1}</span>
          <span className="text-[11px] font-semibold text-slate-500">Question · {q.points} pt{q.points !== 1 ? 's' : ''}</span>
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove('up')} disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-white disabled:opacity-25"><i className="fa-solid fa-chevron-up text-[9px]" /></button>
          <button onClick={() => onMove('down')} disabled={idx === total - 1} className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-white disabled:opacity-25"><i className="fa-solid fa-chevron-down text-[9px]" /></button>
          <button onClick={onDelete} className="w-6 h-6 rounded flex items-center justify-center text-red-400 hover:bg-red-50"><i className="fa-solid fa-trash text-[9px]" /></button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <textarea value={q.text} onChange={e => set({ text: e.target.value })} placeholder="Type question…" rows={2}
            className="flex-1 text-sm font-medium text-slate-800 placeholder-slate-300 border-none outline-none resize-none leading-snug" />
          <div className="flex items-center gap-1.5 shrink-0">
            <input type="number" min="1" max="100" value={q.points} onChange={e => set({ points: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-14 text-center text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-purple-400" />
            <ImageUploadBtn value={q.imageUrl} onChange={b64 => set({ imageUrl: b64 ?? null })} />
          </div>
        </div>
        {q.imageUrl && <img src={q.imageUrl} alt="" className="max-h-32 rounded-lg object-contain border border-slate-200" />}
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg border p-2 transition-all ${q.correctOption === i ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'}`}>
              <button onClick={() => set({ correctOption: i })}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${q.correctOption === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>
                {q.correctOption === i && <i className="fa-solid fa-check text-[8px]" />}
              </button>
              <span className={`w-4 h-4 rounded text-[9px] font-black flex items-center justify-center shrink-0 ${q.correctOption === i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{letters[i]}</span>
              <input type="text" value={opt.text} onChange={e => updateOption(i, { text: e.target.value })} placeholder={`Option ${letters[i]}`}
                className="flex-1 text-xs text-slate-800 placeholder-slate-300 bg-transparent border-none outline-none" />
              {q.options.length > 2 && (
                <button onClick={() => removeOption(i)} className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-400 shrink-0">
                  <i className="fa-solid fa-xmark text-[9px]" />
                </button>
              )}
            </div>
          ))}
          {q.options.length < 5 && (
            <button onClick={addOption} className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-800 mt-1">
              <i className="fa-solid fa-plus text-[9px]" />Add option
            </button>
          )}
        </div>
        <div>
          <input value={q.explanation ?? ''} onChange={e => set({ explanation: e.target.value })} placeholder="Explanation (optional)"
            className="w-full text-xs text-slate-500 placeholder-slate-300 border border-slate-100 rounded-lg px-3 py-1.5 outline-none focus:border-purple-300 focus:ring-1 focus:ring-purple-100 transition-all" />
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Modal ───────────────────────────────────────────────────────────────

interface QuizForm { title: string; duration: string; maxAttempts: string; passingScore: string; }
const EMPTY_QUIZ: QuizForm = { title: '', duration: '30', maxAttempts: '1', passingScore: '60' };

function QuizModal({ mode, initial, initialQuestions, saving, onSave, onClose }: {
  mode: 'add' | 'edit';
  initial: QuizForm;
  initialQuestions: QuizQuestion[];
  saving: boolean;
  onSave: (f: QuizForm, questions: QuizQuestion[]) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<QuizForm>(initial);
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  useEffect(() => { setF(initial); setQuestions(initialQuestions); }, [initial]);

  const addQuestion = () => setQuestions(prev => [...prev, { tempId: uid(), text: '', options: [{ text: '' }, { text: '' }], correctOption: 0, points: 1 }]);
  const updateQ = (idx: number, q: QuizQuestion) => setQuestions(prev => prev.map((x, i) => i === idx ? q : x));
  const deleteQ = (idx: number) => setQuestions(prev => prev.filter((_, i) => i !== idx));
  const moveQ = (idx: number, dir: 'up' | 'down') => {
    setQuestions(prev => {
      const arr = [...prev];
      const to = dir === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return prev;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return arr;
    });
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all";
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch" style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="flex flex-col w-full bg-slate-50 overflow-hidden sm:m-4 sm:rounded-2xl sm:shadow-2xl">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <i className="fa-solid fa-xmark" />
            </button>
            <div>
              <h2 className="text-base font-black text-slate-800">{mode === 'add' ? 'Add Quiz to Module' : 'Edit Quiz'}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{questions.length} question{questions.length !== 1 ? 's' : ''} · {totalPoints} pts total</p>
            </div>
          </div>
          <button onClick={() => onSave(f, questions)} disabled={saving || !f.title.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-700 text-white text-sm font-semibold rounded-lg hover:bg-purple-800 disabled:opacity-40 transition-colors shadow-sm">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {mode === 'add' ? 'Add Quiz' : 'Save Changes'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            {/* Quiz settings */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-black text-slate-700">Quiz Settings</h3>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Title <span className="text-red-500">*</span></label>
                <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Module 1 Knowledge Check" className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Duration (min)</label>
                  <input type="number" min="1" value={f.duration} onChange={e => setF(p => ({ ...p, duration: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Max Attempts</label>
                  <input type="number" min="1" value={f.maxAttempts} onChange={e => setF(p => ({ ...p, maxAttempts: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Pass Score (%)</label>
                  <input type="number" min="0" max="100" value={f.passingScore} onChange={e => setF(p => ({ ...p, passingScore: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>

            {/* Questions */}
            {questions.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
                  <i className="fa-solid fa-circle-question text-purple-400 text-lg" />
                </div>
                <p className="text-slate-700 font-semibold text-sm">No questions yet</p>
                <p className="text-slate-400 text-xs mt-1 mb-4">Add your first MCQ question</p>
                <button onClick={addQuestion} className="px-4 py-2 bg-purple-700 text-white text-sm font-semibold rounded-xl hover:bg-purple-800 transition-colors flex items-center gap-2">
                  <i className="fa-solid fa-plus text-xs" />Add Question
                </button>
              </div>
            ) : (
              <>
                {questions.map((q, i) => (
                  <QuizQuestionCard key={q.tempId} q={q} idx={i} total={questions.length}
                    onChange={nq => updateQ(i, nq)} onDelete={() => deleteQ(i)}
                    onMove={dir => moveQ(i, dir)} />
                ))}
                <button onClick={addQuestion}
                  className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50/50 transition-all text-sm font-semibold flex items-center justify-center gap-2">
                  <i className="fa-solid fa-plus text-xs" />Add Another Question
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Modal ────────────────────────────────────────────────────────────

function SectionModal({ mode, initial, saving, onSave, onClose }: {
  mode: 'add' | 'edit'; initial: { title: string; description: string }; saving: boolean;
  onSave: (f: { title: string; description: string }) => void; onClose: () => void;
}) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100"
          style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 100%)' }}>
          <div>
            <h2 className="text-sm font-black text-white">{mode === 'add' ? 'New Section' : 'Edit Section'}</h2>
            <p className="text-xs text-blue-300 mt-0.5">Sections group related lessons, quizzes, and assignments.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-blue-300 hover:bg-white/10 transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title <span className="text-red-500">*</span></label>
            <input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Getting Started"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} rows={2}
              placeholder="Brief overview of this section"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">Cancel</button>
          <button onClick={() => onSave(f)} disabled={saving || !f.title.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40 flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {mode === 'add' ? 'Create Section' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Delete ───────────────────────────────────────────────────────────

function ConfirmDelete({ label, onConfirm, onCancel, deleting }: {
  label: string; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-4"><i className="fa-solid fa-trash text-red-600 text-lg" /></div>
        <h3 className="text-base font-black text-slate-800 mb-1">Delete "{label}"?</h3>
        <p className="text-sm text-slate-500 mb-6">This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={deleting} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {deleting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Curriculum Item Row ──────────────────────────────────────────────────────

function CurriculumItemRow({ item, index, onEdit, onDelete }: {
  item: CurriculumItem; index: number; onEdit: () => void; onDelete: () => void;
}) {
  const isLesson = item.type === 'lesson';
  const isQuiz = item.type === 'quiz';
  const isAssignment = item.type === 'assignment';

  const accent = isLesson ? { bg: 'bg-blue-50', text: 'text-blue-700', icon: item.videoUrl ? 'fa-play' : 'fa-video-slash', label: 'Lesson' }
    : isQuiz ? { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'fa-circle-question', label: 'Quiz' }
    : { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'fa-clipboard-list', label: 'Assignment' };

  return (
    <div className="group flex items-center gap-3 px-5 py-3.5 bg-white hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
      {/* Index badge */}
      <div className={`w-8 h-8 rounded-lg ${accent.bg} flex items-center justify-center ${accent.text} shrink-0`}>
        <i className={`fa-solid ${accent.icon} text-xs`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800 truncate">{item.title}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${accent.bg} ${accent.text}`}>{accent.label}</span>
          {isLesson && item.isFree && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase">Free</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {isLesson && item.videoUrl && <span className="text-[11px] text-emerald-600 flex items-center gap-1"><i className="fa-solid fa-circle-check text-[9px]" />Video</span>}
          {isLesson && !item.videoUrl && <span className="text-[11px] text-amber-500 flex items-center gap-1"><i className="fa-solid fa-triangle-exclamation text-[9px]" />No video</span>}
          {isLesson && item.duration != null && item.duration > 0 && <span className="text-[11px] text-slate-400">{item.duration} min</span>}
          {isQuiz && item.questions && <span className="text-[11px] text-slate-400">{item.questions.length} question{item.questions.length !== 1 ? 's' : ''}</span>}
          {isQuiz && item.quizDuration && <span className="text-[11px] text-slate-400">{item.quizDuration} min</span>}
          {isAssignment && item.maxPoints && <span className="text-[11px] text-slate-400">{item.maxPoints} pts</span>}
          {isAssignment && item.dueDate && <span className="text-[11px] text-slate-400">Due {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
          <i className="fa-solid fa-pen text-xs" />
        </button>
        <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors">
          <i className="fa-solid fa-trash text-xs" />
        </button>
      </div>
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────

type AddItemType = 'lesson' | 'quiz' | 'assignment';

function SectionBlock({
  module, sectionNum,
  onAddItem, onEditItem, onDeleteItem,
  onEditSection, onDeleteSection,
}: {
  module: Module; sectionNum: number;
  onAddItem: (moduleId: string, type: AddItemType) => void;
  onEditItem: (moduleId: string, item: CurriculumItem) => void;
  onDeleteItem: (moduleId: string, itemId: string, title: string) => void;
  onEditSection: (module: Module) => void;
  onDeleteSection: (module: Module) => void;
}) {
  const [open, setOpen] = useState(true);
  const lessonCount = module.items.filter(i => i.type === 'lesson').length;
  const quizCount = module.items.filter(i => i.type === 'quiz').length;
  const assignmentCount = module.items.filter(i => i.type === 'assignment').length;
  const totalMins = module.items.filter(i => i.type === 'lesson').reduce((s, l) => s + (l.duration ?? 0), 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-slate-50 transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">{sectionNum}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-800 text-sm">{module.title}</h3>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
            {lessonCount > 0 && <span>{lessonCount} lesson{lessonCount !== 1 ? 's' : ''}</span>}
            {quizCount > 0 && <span>{quizCount} quiz{quizCount !== 1 ? 'zes' : ''}</span>}
            {assignmentCount > 0 && <span>{assignmentCount} assignment{assignmentCount !== 1 ? 's' : ''}</span>}
            {totalMins > 0 && <span>{totalMins} min</span>}
            {module.description && <span className="truncate hidden sm:block">{module.description}</span>}
          </div>
        </div>
        {/* Add buttons */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onAddItem(module.id, 'lesson')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
            <i className="fa-solid fa-video text-[9px]" />Lesson
          </button>
          <button onClick={() => onAddItem(module.id, 'quiz')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg hover:bg-purple-100 transition-colors">
            <i className="fa-solid fa-circle-question text-[9px]" />Quiz
          </button>
          <button onClick={() => onAddItem(module.id, 'assignment')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100 transition-colors">
            <i className="fa-solid fa-clipboard-list text-[9px]" />Assignment
          </button>
          <button onClick={() => onEditSection(module)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors ml-1">
            <i className="fa-solid fa-pen text-[10px]" />
          </button>
          <button onClick={() => onDeleteSection(module)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
            <i className="fa-solid fa-trash text-[10px]" />
          </button>
          <i className={`fa-solid fa-chevron-down text-xs text-slate-400 ml-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Items */}
      {open && (
        <div className="border-t border-slate-100">
          {module.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2.5">
                <i className="fa-solid fa-layer-group text-slate-300 text-base" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No content yet</p>
              <p className="text-xs text-slate-400 mt-0.5">Add a lesson, quiz, or assignment above</p>
            </div>
          ) : (
            module.items
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((item) => (
                <CurriculumItemRow
                  key={item.id}
                  item={item}
                  index={item.order}
                  onEdit={() => onEditItem(module.id, item)}
                  onDelete={() => onDeleteItem(module.id, item.id, item.title)}
                />
              ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Video Preview Modal ──────────────────────────────────────────────────────

function VideoPreviewModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  const ytId = ytMatch?.[1];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-semibold text-sm truncate">{title}</p>
          <button onClick={onClose} className="text-white/60 hover:text-white ml-4 shrink-0"><i className="fa-solid fa-xmark text-xl" /></button>
        </div>
        <div className="bg-black rounded-xl overflow-hidden aspect-video">
          {ytId ? <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} className="w-full h-full" allowFullScreen allow="autoplay" />
            : <video src={url} controls autoPlay className="w-full h-full" />}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'section-add' }
  | { type: 'section-edit'; module: Module }
  | { type: 'lesson-add'; moduleId: string }
  | { type: 'lesson-edit'; moduleId: string; item: CurriculumItem }
  | { type: 'quiz-add'; moduleId: string }
  | { type: 'quiz-edit'; moduleId: string; item: CurriculumItem }
  | { type: 'assignment-add'; moduleId: string }
  | { type: 'assignment-edit'; moduleId: string; item: CurriculumItem }
  | { type: 'delete-section'; module: Module }
  | { type: 'delete-item'; moduleId: string; itemId: string; title: string }
  | { type: 'video-preview'; url: string; title: string };

export default function TeacherCourseManagePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params?.id as string;

  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok: boolean) => setToast({ msg, ok }), []);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [modules, setModules] = useState<Module[]>([]);
  const [course, setCourse] = useState<Course | null>(null);

  // ── Auth guard — redirect as a side-effect, never branch the render tree on it ──
  const isAuthorized = !!user && (user.role === 'TEACHER' || user.role === 'ADMIN');
  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      router.replace('/dashboard');
    }
  }, [authLoading, isAuthorized, router]);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchCourseData = useCallback(async (): Promise<CachedCourseData> => {
    if (!courseId) throw new Error('No course ID');
    const [cRes, mRes] = await Promise.all([
      api.teacher.getCourseById(courseId),
      api.teacher.getCourseModules(courseId),
    ]);
    const courseData: Course = unwrap<Course>(cRes, 'course') ?? unwrap<Course>(cRes);
    const rawModules = unwrap<any[]>(mRes, 'modules') ?? unwrap<any[]>(mRes);
    const modsData: Module[] = (Array.isArray(rawModules) ? rawModules : []).map((m: any) => {
      const lessons: CurriculumItem[] = (Array.isArray(m.lessons) ? m.lessons : []).map((l: any, li: number) => ({
        id: l.id, type: 'lesson' as ItemType, title: l.title ?? '', order: l.order ?? li,
        description: l.description, videoUrl: l.videoUrl, duration: l.duration, isFree: l.isFree,
      }));
      const quizzes: CurriculumItem[] = (Array.isArray(m.quizzes) ? m.quizzes : []).map((q: any, qi: number) => ({
        id: q.id, type: 'quiz' as ItemType, title: q.title ?? '', order: q.order ?? (lessons.length + qi),
        questions: (q.questions ?? []).map((qq: any) => ({ ...qq, tempId: qq.id ?? uid() })),
        quizDuration: q.duration, maxAttempts: q.maxAttempts, passingScore: q.passingScore, isPublished: q.isPublished,
      }));
      const assignments: CurriculumItem[] = (Array.isArray(m.assignments) ? m.assignments : []).map((a: any, ai: number) => ({
        id: a.id, type: 'assignment' as ItemType, title: a.title ?? '', order: a.order ?? (lessons.length + quizzes.length + ai),
        assignmentDescription: a.description, dueDate: a.dueDate, maxPoints: a.maxPoints,
      }));
      return { id: m.id, title: m.title, description: m.description, order: m.order, items: [...lessons, ...quizzes, ...assignments] };
    });
    return { course: courseData, modules: modsData };
  }, [courseId]);

  const cacheKey = courseId ? getCourseDetailCacheKey(courseId) : null;
  const { data: cachedData, loading, error, refresh } = useCache<CachedCourseData>(
    authLoading || !user || !courseId ? null : cacheKey,
    fetchCourseData,
    { ttl: TTL.COURSES, enabled: !authLoading && !!user && !!courseId }
  );

  useEffect(() => {
    if (cachedData) { setCourse(cachedData.course); setModules(cachedData.modules); }
  }, [cachedData]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalLessons = modules.reduce((s, m) => s + m.items.filter(i => i.type === 'lesson').length, 0);
  const totalQuizzes = modules.reduce((s, m) => s + m.items.filter(i => i.type === 'quiz').length, 0);
  const totalAssignments = modules.reduce((s, m) => s + m.items.filter(i => i.type === 'assignment').length, 0);
  const totalMins = modules.reduce((s, m) => s + m.items.filter(i => i.type === 'lesson').reduce((ss, l) => ss + (l.duration ?? 0), 0), 0);

  // ── Publish toggle ────────────────────────────────────────────────────────

  const togglePublish = async () => {
    if (!course) return;
    setTogglingPublish(true);
    try {
      await api.teacher.toggleCoursePublish(course.id);
      const updated = { ...course, isPublished: !course.isPublished };
      setCourse(updated);
      cache.set(cacheKey!, { course: updated, modules }, TTL.COURSES);
      showToast(course.isPublished ? 'Course set to draft.' : 'Course published!', true);
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setTogglingPublish(false); }
  };

  // ── Section CRUD ──────────────────────────────────────────────────────────

  const handleSaveSection = async (f: { title: string; description: string }) => {
    setSaving(true);
    try {
      if (modal.type === 'section-add') {
        const res = await api.teacher.createModule(courseId, { title: f.title, order: modules.length + 1 });
        const mod: any = unwrap(res, 'module') ?? unwrap(res);
        const updated = [...modules, { ...mod, items: [] }];
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Section created!', true);
      } else if (modal.type === 'section-edit') {
        await api.teacher.updateModule(modal.module.id, { title: f.title });
        const updated = modules.map(m => m.id === modal.module.id ? { ...m, title: f.title, description: f.description } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Section updated!', true);
      }
      setModal({ type: 'none' });
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setSaving(false); }
  };

  // ── Lesson CRUD ───────────────────────────────────────────────────────────

  const handleSaveLesson = async (f: LessonForm) => {
    if (modal.type !== 'lesson-add' && modal.type !== 'lesson-edit') return;
    const { moduleId } = modal;
    setSaving(true);
    const payload = { title: f.title, description: f.description || undefined, videoUrl: f.videoUrl || undefined, duration: f.duration ? parseInt(f.duration) : undefined, isFree: f.isFree };
    try {
      if (modal.type === 'lesson-add') {
        const mod = modules.find(m => m.id === moduleId);
        const order = (mod?.items.length ?? 0);
        const res = await api.teacher.createLesson(moduleId, { ...payload, order });
        const lesson: any = unwrap(res, 'lesson') ?? unwrap(res);
        const newItem: CurriculumItem = { id: lesson.id, type: 'lesson', order, ...payload };
        const updated = modules.map(m => m.id === moduleId ? { ...m, items: [...m.items, newItem] } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Lesson added!', true);
      } else if (modal.type === 'lesson-edit') {
        await api.teacher.updateLesson(modal.item.id, payload);
        const updated = modules.map(m => m.id === moduleId ? { ...m, items: m.items.map(i => i.id === modal.item.id ? { ...i, ...payload, title: f.title } : i) } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Lesson updated!', true);
      }
      setModal({ type: 'none' });
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setSaving(false); }
  };

  // ── Quiz CRUD ─────────────────────────────────────────────────────────────

  const handleSaveQuiz = async (f: QuizForm, questions: QuizQuestion[]) => {
    if (modal.type !== 'quiz-add' && modal.type !== 'quiz-edit') return;
    const { moduleId } = modal;
    setSaving(true);
    try {
      const quizPayload = {
        title: f.title, courseId,
        duration: Number(f.duration) || 30,
        maxAttempts: Number(f.maxAttempts) || 1,
        passingScore: Number(f.passingScore) || 60,
      };
      const qPayload = questions.map((q, i) => ({
        text: q.text, imageUrl: q.imageUrl ?? null,
        options: q.options.map(o => ({ text: o.text, imageUrl: (o as any).imageUrl ?? null })),
        correctOption: q.correctOption, explanation: q.explanation || null, points: q.points, order: i,
      }));

      if (modal.type === 'quiz-add') {
        const mod = modules.find(m => m.id === moduleId);
        const order = (mod?.items.length ?? 0);
        const res: any = await api.teacher.createQuiz({ ...quizPayload, moduleId } as any);
        const quizData = res?.data?.data?.quiz ?? res?.data?.quiz ?? res?.data ?? res;
        const quizId = quizData?.id;
        if (quizId && questions.length > 0) {
          await api.teacher.bulkAddQuestions(quizId, { questions: qPayload });
        }
        const newItem: CurriculumItem = {
          id: quizId ?? uid(), type: 'quiz', title: f.title, order,
          questions: questions.map((q, i) => ({ ...q, id: undefined })),
          quizDuration: Number(f.duration), maxAttempts: Number(f.maxAttempts), passingScore: Number(f.passingScore),
        };
        const updated = modules.map(m => m.id === moduleId ? { ...m, items: [...m.items, newItem] } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Quiz added!', true);
      } else if (modal.type === 'quiz-edit') {
        await api.teacher.updateQuiz(modal.item.id, quizPayload);
        if (questions.length > 0) {
          await api.teacher.replaceQuizQuestions(modal.item.id, { questions: qPayload });
        }
        const updated = modules.map(m => m.id === moduleId ? {
          ...m, items: m.items.map(i => i.id === modal.item.id ? {
            ...i, title: f.title, questions, quizDuration: Number(f.duration), maxAttempts: Number(f.maxAttempts), passingScore: Number(f.passingScore)
          } : i)
        } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Quiz updated!', true);
      }
      setModal({ type: 'none' });
    } catch (e: any) { showToast(e.message || 'Failed to save quiz', false); }
    finally { setSaving(false); }
  };

  // ── Assignment CRUD ───────────────────────────────────────────────────────

  const handleSaveAssignment = async (f: AssignmentForm) => {
    if (modal.type !== 'assignment-add' && modal.type !== 'assignment-edit') return;
    const { moduleId } = modal;
    setSaving(true);
    const payload = {
      courseId, title: f.title,
      description: f.description || undefined,
      dueDate: f.dueDate || undefined,
      maxPoints: f.maxPoints ? Number(f.maxPoints) : undefined,
      moduleId,
    };
    try {
      if (modal.type === 'assignment-add') {
        const mod = modules.find(m => m.id === moduleId);
        const order = (mod?.items.length ?? 0);
        const res: any = await api.teacher.createAssignment(payload as any);
        const assignData = res?.data?.data?.assignment ?? res?.data?.assignment ?? res?.data ?? res;
        const newItem: CurriculumItem = {
          id: assignData?.id ?? uid(), type: 'assignment', title: f.title, order,
          assignmentDescription: f.description, dueDate: f.dueDate, maxPoints: Number(f.maxPoints),
        };
        const updated = modules.map(m => m.id === moduleId ? { ...m, items: [...m.items, newItem] } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Assignment added!', true);
      } else if (modal.type === 'assignment-edit') {
        await api.teacher.updateAssignment(modal.item.id, payload as any);
        const updated = modules.map(m => m.id === moduleId ? {
          ...m, items: m.items.map(i => i.id === modal.item.id ? { ...i, title: f.title, assignmentDescription: f.description, dueDate: f.dueDate, maxPoints: Number(f.maxPoints) } : i)
        } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Assignment updated!', true);
      }
      setModal({ type: 'none' });
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (modal.type === 'delete-section') {
      setDeleting(true);
      try {
        await api.teacher.deleteModule(modal.module.id);
        const updated = modules.filter(m => m.id !== modal.module.id);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Section deleted.', true);
        setModal({ type: 'none' });
      } catch (e: any) { showToast(e.message || 'Failed', false); }
      finally { setDeleting(false); }
    } else if (modal.type === 'delete-item') {
      setDeleting(true);
      const { moduleId, itemId } = modal;
      const item = modules.flatMap(m => m.items).find(i => i.id === itemId);
      try {
        if (item?.type === 'lesson') await api.teacher.deleteLesson(itemId);
        else if (item?.type === 'quiz') await api.teacher.deleteQuiz(itemId);
        else if (item?.type === 'assignment') await api.teacher.deleteAssignment(itemId);
        const updated = modules.map(m => m.id === moduleId ? { ...m, items: m.items.filter(i => i.id !== itemId) } : m);
        setModules(updated);
        cache.set(cacheKey!, { course: course!, modules: updated }, TTL.COURSES);
        showToast('Deleted.', true);
        setModal({ type: 'none' });
      } catch (e: any) { showToast(e.message || 'Failed', false); refresh(); }
      finally { setDeleting(false); }
    }
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const getModalItem = () => (modal.type === 'lesson-edit' || modal.type === 'quiz-edit' || modal.type === 'assignment-edit') ? modal.item : null;
  const getLessonInitial = (): LessonForm => {
    const item = getModalItem();
    if (!item) return EMPTY_LESSON;
    return { title: item.title, description: item.description ?? '', videoUrl: item.videoUrl ?? '', duration: item.duration != null ? String(item.duration) : '', isFree: item.isFree ?? false };
  };
  const getQuizInitial = (): QuizForm => {
    const item = getModalItem();
    if (!item) return EMPTY_QUIZ;
    return { title: item.title, duration: String(item.quizDuration ?? 30), maxAttempts: String(item.maxAttempts ?? 1), passingScore: String(item.passingScore ?? 60) };
  };
  const getAssignmentInitial = (): AssignmentForm => {
    const item = getModalItem();
    if (!item) return EMPTY_ASSIGNMENT;
    return { title: item.title, description: item.assignmentDescription ?? '', dueDate: item.dueDate ?? '', maxPoints: String(item.maxPoints ?? 100) };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // IMPORTANT: the root shell below is rendered unconditionally on both
  // server and client. We never early-return a different root element
  // based on authLoading/user — that's what was causing the hydration
  // mismatch. All auth-dependent branching happens *inside* the shell.

  if (!mounted) return null;

  const showBlockingSpinner = authLoading || !isAuthorized;

  return (
    <>
      <FontAwesomeLoader />
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        {showBlockingSpinner ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
          </div>
        ) : (
          <>
            <Sidebar activeItem="Courses" />

            {/* Modals */}
            {(modal.type === 'section-add' || modal.type === 'section-edit') && (
              <SectionModal
                mode={modal.type === 'section-add' ? 'add' : 'edit'}
                initial={modal.type === 'section-edit' ? { title: modal.module.title, description: modal.module.description ?? '' } : { title: '', description: '' }}
                saving={saving} onSave={handleSaveSection} onClose={() => setModal({ type: 'none' })} />
            )}
            {(modal.type === 'lesson-add' || modal.type === 'lesson-edit') && (
              <LessonModal mode={modal.type === 'lesson-add' ? 'add' : 'edit'} initial={getLessonInitial()}
                saving={saving} onSave={handleSaveLesson} onClose={() => setModal({ type: 'none' })} />
            )}
            {(modal.type === 'quiz-add' || modal.type === 'quiz-edit') && (
              <QuizModal mode={modal.type === 'quiz-add' ? 'add' : 'edit'} initial={getQuizInitial()}
                initialQuestions={modal.type === 'quiz-edit' ? (modal.item.questions ?? []) : []}
                saving={saving} onSave={handleSaveQuiz} onClose={() => setModal({ type: 'none' })} />
            )}
            {(modal.type === 'assignment-add' || modal.type === 'assignment-edit') && (
              <AssignmentModal mode={modal.type === 'assignment-add' ? 'add' : 'edit'} initial={getAssignmentInitial()}
                saving={saving} onSave={handleSaveAssignment} onClose={() => setModal({ type: 'none' })} />
            )}
            {(modal.type === 'delete-section' || modal.type === 'delete-item') && (
              <ConfirmDelete
                label={modal.type === 'delete-section' ? modal.module.title : modal.title}
                deleting={deleting} onConfirm={handleDelete} onCancel={() => setModal({ type: 'none' })} />
            )}
            {modal.type === 'video-preview' && (
              <VideoPreviewModal url={modal.url} title={modal.title} onClose={() => setModal({ type: 'none' })} />
            )}
            {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {/* Header */}
              <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm px-8 h-16 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => router.push('/teacher/courses')} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0">
                    <i className="fa-solid fa-arrow-left text-sm" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-slate-800 font-bold text-[15px] truncate">{loading ? 'Loading…' : course?.title ?? 'Course'}</p>
                    <p className="text-slate-400 text-[11px]">Course Management</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {course && (
                    <button onClick={togglePublish} disabled={togglingPublish}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${course.isPublished ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                      {togglingPublish ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <i className={`fa-solid ${course.isPublished ? 'fa-eye-slash' : 'fa-globe'} text-xs`} />}
                      {course.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                  )}
                  <button onClick={() => setModal({ type: 'section-add' })}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
                    <i className="fa-solid fa-plus text-xs" />New Section
                  </button>
                </div>
              </header>

              {error && (
                <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                  <i className="fa-solid fa-circle-exclamation" />{error}
                  <button onClick={refresh} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">Retry</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">
                {/* Banner */}
                <div className="relative rounded-xl overflow-hidden px-8 py-6" style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
                  <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
                  <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Course Management</div>
                      <h2 className="text-white text-2xl font-black tracking-tight leading-tight">{loading ? 'Loading…' : course?.title ?? 'Course'}</h2>
                      <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                        {loading ? 'Loading…' : `${modules.length} section${modules.length !== 1 ? 's' : ''} · ${totalLessons} lessons · ${totalQuizzes} quiz${totalQuizzes !== 1 ? 'zes' : ''} · ${totalAssignments} assignment${totalAssignments !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="hidden lg:flex items-center gap-0 shrink-0">
                      {[
                        { v: modules.length, l: 'Sections' },
                        { v: totalLessons, l: 'Lessons' },
                        { v: totalQuizzes, l: 'Quizzes' },
                        { v: totalAssignments, l: 'Assignments' },
                      ].map((s, i) => (
                        <div key={s.l} className={`text-center px-5 ${i !== 0 ? 'border-l border-white/10' : ''}`}>
                          <div className="text-white text-2xl font-black">{loading ? '—' : s.v}</div>
                          <div className="text-blue-300 text-[11px] font-semibold mt-0.5 tracking-wide">{s.l}</div>
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
                    <StatCard label="Sections" value={modules.length} icon="fa-layer-group" accent="#2563EB" light="#EFF6FF" sub="Course sections" />
                    <StatCard label="Lessons" value={totalLessons} icon="fa-video" accent="#059669" light="#F0FDF4" sub="Video lectures" />
                    <StatCard label="Quizzes" value={totalQuizzes} icon="fa-circle-question" accent="#7C3AED" light="#F5F3FF" sub="Knowledge checks" />
                    <StatCard label="Assignments" value={totalAssignments} icon="fa-clipboard-list" accent="#D97706" light="#FFFBEB" sub={totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m content` : `${totalMins}m content`} />
                  </div>
                )}

                {/* Tip banner */}
                <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                  <i className="fa-solid fa-lightbulb text-blue-500 mt-0.5 shrink-0" />
                  <p>In each section you can add <span className="font-bold">Lessons</span> (video lectures), <span className="font-bold text-purple-700">Quizzes</span> (MCQ tests), and <span className="font-bold text-amber-700">Assignments</span> (student submission tasks) — students encounter them in order.</p>
                </div>

                {/* Course Content */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[14px] text-slate-800">Course Content</div>
                      <div className="text-xs text-slate-400 mt-0.5">{loading ? 'Loading…' : `${modules.length} section${modules.length !== 1 ? 's' : ''}`}</div>
                    </div>
                    <button onClick={() => setModal({ type: 'section-add' })}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
                      <i className="fa-solid fa-plus text-[10px]" />Add Section
                    </button>
                  </div>

                  {loading ? (
                    <div className="p-5 space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm animate-pulse">
                          <div className="flex items-center gap-3 px-5 py-4"><div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" /><div className="flex-1 space-y-2"><div className="h-4 bg-slate-200 rounded w-1/3" /><div className="h-3 bg-slate-100 rounded w-1/2" /></div></div>
                        </div>
                      ))}
                    </div>
                  ) : modules.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
                      <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center">
                        <i className="fa-solid fa-layer-group text-2xl text-slate-300" />
                      </div>
                      <p className="text-slate-600 font-semibold text-sm">No sections yet</p>
                      <p className="text-slate-400 text-xs max-w-sm">Start by creating a section — like "Introduction" or "Module 1". Then add lessons, quizzes, and assignments inside.</p>
                      <button onClick={() => setModal({ type: 'section-add' })}
                        className="mt-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors">
                        <i className="fa-solid fa-plus mr-1.5" />Create First Section
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 space-y-4">
                      {modules.map((mod, idx) => (
                        <SectionBlock
                          key={mod.id}
                          module={mod}
                          sectionNum={idx + 1}
                          onAddItem={(moduleId, type) => {
                            if (type === 'lesson') setModal({ type: 'lesson-add', moduleId });
                            else if (type === 'quiz') setModal({ type: 'quiz-add', moduleId });
                            else setModal({ type: 'assignment-add', moduleId });
                          }}
                          onEditItem={(moduleId, item) => {
                            if (item.type === 'lesson') setModal({ type: 'lesson-edit', moduleId, item });
                            else if (item.type === 'quiz') setModal({ type: 'quiz-edit', moduleId, item });
                            else setModal({ type: 'assignment-edit', moduleId, item });
                          }}
                          onDeleteItem={(moduleId, itemId, title) => setModal({ type: 'delete-item', moduleId, itemId, title })}
                          onEditSection={m => setModal({ type: 'section-edit', module: m })}
                          onDeleteSection={m => setModal({ type: 'delete-section', module: m })}
                        />
                      ))}
                      <p className="text-center text-xs text-slate-400 pt-2">
                        {totalLessons + totalQuizzes + totalAssignments} items across {modules.length} section{modules.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </>
        )}
      </div>
    </>
  );
}