'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Quiz {
  id: string;
  title: string;
  description?: string;
  courseId: string;
  course?: { id: string; title: string };
  isPublished: boolean;
  status?: string;
  duration: number;
  totalMarks: number;
  maxAttempts: number;
  dueDate?: string;
  createdAt: string;
  _count: { questions: number; attempts: number };
}

interface QuizOption {
  text: string;
  imageUrl?: string; // base64 or URL
}

interface QuizQuestion {
  id?: string;          // set after save
  tempId: string;       // local only
  text: string;
  imageUrl?: string;    // question image (compressed base64)
  options: QuizOption[];
  correctOption: number; // 0-indexed
  explanation?: string;
  points: number;
}

interface QuizFormData {
  title: string;
  description: string;
  courseId: string;
  duration: string;
  maxAttempts: string;
  dueDate: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const EMPTY_FORM: QuizFormData = {
  title: '', description: '', courseId: '', duration: '30', maxAttempts: '1', dueDate: '',
};

// ─── Accent palette ────────────────────────────────────────────────────────────

const ACCENT_MAP: Record<number, { bar: string; color: string }> = {
  0: { bar: '#3B82F6', color: '#1E40AF' },
  1: { bar: '#6366F1', color: '#3730A3' },
  2: { bar: '#14B8A6', color: '#0D9488' },
  3: { bar: '#8B5CF6', color: '#5B21B6' },
  4: { bar: '#EC4899', color: '#BE185D' },
  5: { bar: '#0891B2', color: '#0E7490' },
  6: { bar: '#F97316', color: '#EA580C' },
  7: { bar: '#EF4444', color: '#DC2626' },
};
function getAccent(idx: number) {
  return ACCENT_MAP[idx % Object.keys(ACCENT_MAP).length];
}

function uid() { return Math.random().toString(36).slice(2); }

// ─── Image compression ─────────────────────────────────────────────────────────

async function compressImage(file: File, maxW = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio  = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas ctx null'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── FontAwesome Loader ────────────────────────────────────────────────────────

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

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, light, sub }: {
  label: string; value: string | number; icon: string; accent: string; light: string; sub: string;
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

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
      <div className="flex items-start gap-4 p-5">
        <div className="w-11 h-11 rounded-lg bg-slate-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
          <div className="h-3 bg-slate-100 rounded w-1/3" />
          <div className="h-3 bg-slate-100 rounded w-full mt-3" />
        </div>
      </div>
    </div>
  );
}

// ─── Image Upload Button ───────────────────────────────────────────────────────

function ImageUploadBtn({ value, onChange, label = 'Add image', size = 'sm' }: {
  value?: string;
  onChange: (b64: string | undefined) => void;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try {
      const b64 = await compressImage(file, 900, 0.78);
      onChange(b64);
    } catch {
      // silently ignore
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  };

  if (value) {
    return (
      <div className="relative inline-flex items-center group">
        <img src={value} alt="question"
          className={`rounded-lg border border-slate-200 object-cover ${size === 'sm' ? 'h-14 w-20' : 'h-24 w-36'}`} />
        <button onClick={() => onChange(undefined)}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    );
  }

  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={handle} />
      <button
        onClick={() => ref.current?.click()}
        disabled={compressing}
        className={`flex items-center gap-1.5 text-slate-400 border border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50 ${
          size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        {compressing
          ? <span className="w-3 h-3 border border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          : <i className="fa-solid fa-image text-[10px]" />}
        {compressing ? 'Compressing…' : label}
      </button>
    </>
  );
}

// ─── Option Row ────────────────────────────────────────────────────────────────

function OptionRow({ idx, option, isCorrect, onTextChange, onImageChange, onSelect, onRemove, canRemove }: {
  idx: number;
  option: QuizOption;
  isCorrect: boolean;
  onTextChange: (v: string) => void;
  onImageChange: (b64: string | undefined) => void;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 transition-all ${
      isCorrect ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}>
      {/* Correct toggle */}
      <button
        onClick={onSelect}
        title="Mark as correct"
        className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          isCorrect
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 hover:border-emerald-400'
        }`}
      >
        {isCorrect && <i className="fa-solid fa-check text-[9px]" />}
      </button>

      <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 ${
        isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {letters[idx]}
      </span>

      <div className="flex-1 min-w-0 space-y-1.5">
        <input
          type="text"
          value={option.text}
          onChange={e => onTextChange(e.target.value)}
          placeholder={`Option ${letters[idx]}`}
          className="w-full text-sm text-slate-800 placeholder-slate-300 bg-transparent border-none outline-none"
        />
        {option.imageUrl && (
          <img src={option.imageUrl} alt="" className="h-12 rounded-lg object-cover border border-slate-200" />
        )}
        <ImageUploadBtn value={option.imageUrl} onChange={onImageChange} label="Image" size="sm" />
      </div>

      {canRemove && (
        <button onClick={onRemove}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0 mt-0.5">
          <i className="fa-solid fa-xmark text-[10px]" />
        </button>
      )}
    </div>
  );
}

// ─── Question Card (in builder) ────────────────────────────────────────────────

function QuestionCard({ q, idx, total, onChange, onDelete, onMove }: {
  q: QuizQuestion;
  idx: number;
  total: number;
  onChange: (q: QuizQuestion) => void;
  onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  const set = (patch: Partial<QuizQuestion>) => onChange({ ...q, ...patch });

  const updateOption = (i: number, patch: Partial<QuizOption>) =>
    set({ options: q.options.map((o, j) => j === i ? { ...o, ...patch } : o) });

  const addOption = () => {
    if (q.options.length >= 5) return;
    set({ options: [...q.options, { text: '' }] });
  };

  const removeOption = (i: number) => {
    const next = q.options.filter((_, j) => j !== i);
    const correctIdx = q.correctOption >= next.length ? next.length - 1 : q.correctOption;
    set({ options: next, correctOption: Math.max(0, correctIdx) });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-[10px] font-black flex items-center justify-center">
            {idx + 1}
          </span>
          <span className="text-xs font-semibold text-slate-500">Question</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove('up')} disabled={idx === 0}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 transition-colors">
            <i className="fa-solid fa-chevron-up text-[10px]" />
          </button>
          <button onClick={() => onMove('down')} disabled={idx === total - 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 transition-colors">
            <i className="fa-solid fa-chevron-down text-[10px]" />
          </button>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors ml-1">
            <i className="fa-solid fa-trash text-[10px]" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Question text */}
        <div>
          <textarea
            value={q.text}
            onChange={e => set({ text: e.target.value })}
            placeholder="Type your question here…"
            rows={2}
            className="w-full text-[15px] font-medium text-slate-800 placeholder-slate-300 border-none outline-none resize-none leading-snug"
          />
          {/* Question image */}
          {q.imageUrl && (
            <div className="mt-2">
              <img src={q.imageUrl} alt="question"
                className="max-h-48 rounded-xl object-contain border border-slate-200" />
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            <ImageUploadBtn
              value={q.imageUrl}
              onChange={b64 => set({ imageUrl: b64 })}
              label="Add image to question"
              size="md"
            />
            <div className="flex items-center gap-1.5 ml-auto">
              <label className="text-[11px] text-slate-500 font-semibold">Points</label>
              <input
                type="number" min={1} max={100} value={q.points}
                onChange={e => set({ points: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-14 text-center text-sm font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Options */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Answer Choices — click circle to mark correct
          </p>
          {q.options.map((opt, i) => (
            <OptionRow
              key={i}
              idx={i}
              option={opt}
              isCorrect={q.correctOption === i}
              onTextChange={v => updateOption(i, { text: v })}
              onImageChange={b64 => updateOption(i, { imageUrl: b64 })}
              onSelect={() => set({ correctOption: i })}
              onRemove={() => removeOption(i)}
              canRemove={q.options.length > 2}
            />
          ))}
          {q.options.length < 5 && (
            <button onClick={addOption}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 mt-1 transition-colors">
              <i className="fa-solid fa-plus text-[9px]" />
              Add option
            </button>
          )}
        </div>

        {/* Explanation */}
        <div className="border-t border-slate-100 pt-3">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
            Explanation (shown after attempt)
          </label>
          <input
            type="text"
            value={q.explanation ?? ''}
            onChange={e => set({ explanation: e.target.value })}
            placeholder="Optional — explain why the answer is correct"
            className="w-full text-xs text-slate-600 placeholder-slate-300 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Builder Modal (Google Forms-style) ────────────────────────────────────

function QuizBuilderModal({ mode, quiz, courses, onClose, onSaved }: {
  mode: 'create' | 'edit';
  quiz?: Quiz;
  courses: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Step 1: details, Step 2: questions
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState<QuizFormData>(() => quiz
    ? {
        title: quiz.title,
        description: quiz.description ?? '',
        courseId: quiz.courseId,
        duration: String(quiz.duration ?? 30),
        maxAttempts: String(quiz.maxAttempts ?? 1),
        dueDate: quiz.dueDate ? quiz.dueDate.slice(0, 10) : '',
      }
    : { ...EMPTY_FORM }
  );

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);

  // Load existing questions when editing
  useEffect(() => {
    if (mode !== 'edit' || !quiz?.id) return;
    setLoadingQs(true);
    api.teacher.getQuizQuestions(quiz.id)
      .then((res: any) => {
        const raw = res?.data?.questions ?? res?.data ?? [];
        setQuestions((Array.isArray(raw) ? raw : []).map((q: any) => ({
          tempId: uid(),
          id: q.id,
          text: q.text ?? '',
          imageUrl: q.imageUrl ?? undefined,
          options: Array.isArray(q.options)
            ? q.options.map((o: any) =>
                typeof o === 'string' ? { text: o } : { text: o.text ?? '', imageUrl: o.imageUrl }
              )
            : [{ text: '' }, { text: '' }],
          correctOption: q.correctOption ?? 0,
          explanation: q.explanation ?? '',
          points: q.points ?? 1,
        })));
      })
      .catch(() => {})
      .finally(() => setLoadingQs(false));
  }, [mode, quiz?.id]);

  const addQuestion = () =>
    setQuestions(prev => [...prev, {
      tempId: uid(),
      text: '',
      options: [{ text: '' }, { text: '' }],
      correctOption: 0,
      points: 1,
    }]);

  const updateQ = (idx: number, q: QuizQuestion) =>
    setQuestions(prev => prev.map((x, i) => i === idx ? q : x));

  const deleteQ = (idx: number) =>
    setQuestions(prev => prev.filter((_, i) => i !== idx));

  const moveQ = (idx: number, dir: 'up' | 'down') => {
    setQuestions(prev => {
      const arr = [...prev];
      const to  = dir === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= arr.length) return prev;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return arr;
    });
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

  const handleSave = async () => {
    // Validate
    if (!form.title.trim() || !form.courseId) {
      setToast('Title and course are required');
      return;
    }
    if (step === 2) {
      const invalid = questions.find(q => !q.text.trim() || q.options.some(o => !o.text.trim() && !o.imageUrl));
      if (invalid) { setToast('All questions and options must have text or an image'); return; }
    }

    setSaving(true);
    try {
      let quizId: string;

      const payload = {
        title: form.title,
        description: form.description || undefined,
        courseId: form.courseId,
        duration: Number(form.duration) || 30,
        maxAttempts: Number(form.maxAttempts) || 1,
        dueDate: form.dueDate || undefined,
      };

      if (mode === 'create') {
        const res: any = await api.teacher.createQuiz(payload);

        // handle both { quiz: { id } } and { data: { quiz: { id } } } and { id }
        const quizData = res?.data?.data?.quiz ?? res?.data?.quiz ?? res?.quiz ?? res?.data ?? res;
        quizId = quizData?.id;

        if (!quizId) {
          setToast('Failed to get quiz ID after creation');
          setSaving(false);
          return;
        }
      } else {
        await api.teacher.updateQuiz(quiz!.id, payload);
        quizId = quiz!.id;
      }

      // Save questions
      if (questions.length > 0) {
        const qPayload = questions.map((q, i) => ({
          text: q.text,
          imageUrl: q.imageUrl ?? null,
          options: q.options.map(o => ({ text: o.text, imageUrl: o.imageUrl ?? null })),
          correctOption: q.correctOption,
          explanation: q.explanation || null,
          points: q.points,
          order: i,
        }));

        if (mode === 'create') {
          await api.teacher.bulkAddQuestions(quizId, { questions: qPayload });
        } else {
          // Replace all: delete then bulk add
          await api.teacher.replaceQuizQuestions(quizId, { questions: qPayload });
        }
      }

      onSaved();
    } catch (e: any) {
      setToast(e.message || 'Failed to save quiz');
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch"
      style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="flex flex-col w-full bg-slate-50 overflow-hidden sm:m-4 sm:rounded-2xl sm:shadow-2xl">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <i className="fa-solid fa-xmark" />
            </button>
            <div>
              <h2 className="text-base font-black text-slate-800">
                {mode === 'create' ? 'New Quiz' : `Edit: ${quiz?.title}`}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {questions.length} question{questions.length !== 1 ? 's' : ''} · {totalPoints} pts total
              </p>
            </div>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {(['Details', 'Questions'] as const).map((label, i) => (
              <button key={label}
                onClick={() => setStep((i + 1) as 1 | 2)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  step === i + 1 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black mr-1.5 ${
                  step === i + 1 ? 'bg-blue-700 text-white' : 'bg-slate-300 text-slate-600'
                }`}>{i + 1}</span>
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.courseId}
            className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : mode === 'create' ? 'Create Quiz' : 'Save Changes'}
          </button>
        </div>

        {/* Toast inside modal */}
        {toast && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium flex items-center gap-2 shrink-0">
            <i className="fa-solid fa-circle-exclamation" />
            {toast}
            <button onClick={() => setToast(null)} className="ml-auto text-red-500 hover:text-red-700">
              <i className="fa-solid fa-xmark text-[10px]" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Step 1: Details ── */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <h3 className="text-sm font-black text-slate-700 mb-1">Quiz Details</h3>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Chapter 3 Knowledge Check"
                    className={inputCls} />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Course <span className="text-red-500">*</span>
                  </label>
                  <select value={form.courseId}
                    onChange={e => setForm(p => ({ ...p, courseId: e.target.value }))}
                    className={inputCls}>
                    <option value="">Select a course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                    Description
                  </label>
                  <textarea value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    rows={3}
                    placeholder="What does this quiz cover?"
                    className={`${inputCls} resize-none`} />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Duration (min)</label>
                    <input type="number" min={1} value={form.duration}
                      onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Max Attempts</label>
                    <input type="number" min={1} value={form.maxAttempts}
                      onChange={e => setForm(p => ({ ...p, maxAttempts: e.target.value }))}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Due Date</label>
                    <input type="date" value={form.dueDate}
                      onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                      className={inputCls} />
                  </div>
                </div>
              </div>

              <button onClick={() => setStep(2)}
                disabled={!form.title.trim() || !form.courseId}
                className="w-full py-3 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-2">
                Next: Add Questions
                <i className="fa-solid fa-arrow-right text-xs" />
              </button>
            </div>
          )}

          {/* ── Step 2: Questions ── */}
          {step === 2 && (
            <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
              {loadingQs ? (
                <div className="flex justify-center py-12">
                  <div className="w-7 h-7 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
                </div>
              ) : (
                <>
                  {questions.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                      <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                        <i className="fa-solid fa-circle-question text-blue-500 text-xl" />
                      </div>
                      <p className="text-slate-700 font-semibold text-sm">No questions yet</p>
                      <p className="text-slate-400 text-xs mt-1 mb-5">Click below to add your first question</p>
                      <button onClick={addQuestion}
                        className="px-5 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm flex items-center gap-2">
                        <i className="fa-solid fa-plus text-xs" />
                        Add Question
                      </button>
                    </div>
                  ) : (
                    <>
                      {questions.map((q, i) => (
                        <QuestionCard
                          key={q.tempId}
                          q={q} idx={i} total={questions.length}
                          onChange={nq => updateQ(i, nq)}
                          onDelete={() => deleteQ(i)}
                          onMove={dir => moveQ(i, dir)}
                        />
                      ))}
                    </>
                  )}

                  {/* Add question button */}
                  {questions.length > 0 && (
                    <button onClick={addQuestion}
                      className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all text-sm font-semibold flex items-center justify-center gap-2">
                      <i className="fa-solid fa-plus text-xs" />
                      Add Another Question
                    </button>
                  )}

                  {/* Summary bar */}
                  {questions.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span><span className="font-bold text-slate-800">{questions.length}</span> questions</span>
                        <span className="text-slate-200">|</span>
                        <span><span className="font-bold text-slate-800">{totalPoints}</span> total points</span>
                        <span className="text-slate-200">|</span>
                        <span><span className="font-bold text-slate-800">{form.duration}m</span> duration</span>
                      </div>
                      <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors">
                        {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                        {mode === 'create' ? 'Create Quiz' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

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
        <h2 className="text-base font-black text-slate-800 mb-1">Delete Quiz?</h2>
        <p className="text-sm text-slate-500 mb-6">
          <span className="font-semibold text-slate-700">"{title}"</span> and all its questions and student attempts will be permanently deleted.
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

// ─── Attempts panel ────────────────────────────────────────────────────────────

interface Attempt {
  id: string;
  student?: { id: string; name: string; email: string; avatar?: string };
  user?: { id: string; name: string; email: string; avatar?: string };
  score: number;
  totalMarks: number;
  percentage: number;
  submittedAt?: string;
  completedAt?: string;
  timeTaken?: number;
}

function AttemptsPanel({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.teacher.getQuizAttempts(quiz.id);
        const raw = (res as any).data;
        setAttempts(Array.isArray(raw) ? raw : raw?.attempts ?? raw?.data ?? []);
      } catch (e: any) { setError(e.message || 'Failed to load'); }
      finally { setLoading(false); }
    })();
  }, [quiz.id]);

  const avgPct = attempts.length
    ? Math.round(attempts.reduce((a, x) => a + (x.percentage ?? 0), 0) / attempts.length)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-800">Quiz Attempts</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[260px]">{quiz.title}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {!loading && !error && attempts.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Average Score</span>
            <span className={`text-sm font-black ${avgPct >= 75 ? 'text-emerald-600' : avgPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {avgPct}%
            </span>
          </div>
        )}

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
          {!loading && !error && attempts.length === 0 && (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-clipboard-list text-xl text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">No attempts yet</p>
              <p className="text-xs text-slate-400 mt-1">Results will appear once students take this quiz.</p>
            </div>
          )}
          {!loading && attempts.map((a, i) => {
            const person = a.student ?? a.user;
            const pct = a.percentage ?? (a.totalMarks ? Math.round((a.score / a.totalMarks) * 100) : 0);
            return (
              <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== 0 ? 'border-t border-slate-50' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xs font-black shrink-0 overflow-hidden">
                  {person?.avatar
                    ? <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                    : (person?.name ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{person?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-400 truncate">{person?.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    pct >= 75 ? 'bg-emerald-50 text-emerald-700'
                    : pct >= 50 ? 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-700'
                  }`}>
                    {a.score}/{a.totalMarks}
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(a.submittedAt ?? a.completedAt ?? Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            {attempts.length} attempt{attempts.length !== 1 ? 's' : ''} submitted
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Quiz card ─────────────────────────────────────────────────────────────────

function TeacherQuizCard({ quiz, index, onEdit, onDelete, onViewAttempts, onTogglePublish, toggling }: {
  quiz: Quiz;
  index: number;
  onEdit: (q: Quiz) => void;
  onDelete: (q: Quiz) => void;
  onViewAttempts: (q: Quiz) => void;
  onTogglePublish: (q: Quiz) => void;
  toggling: string | null;
}) {
  const accent = getAccent(index);
  const abbr = quiz.title.slice(0, 2).toUpperCase();
  const isToggling = toggling === quiz.id;
  const published = quiz.isPublished || quiz.status === 'PUBLISHED';

  return (
    <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group">
      <div className="flex items-start gap-4 p-5 flex-1 min-w-0">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center text-white font-black text-sm shrink-0"
          style={{ background: accent.bar }}>
          {abbr}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-slate-800 text-[13.5px] font-semibold truncate group-hover:text-blue-700 transition-colors">
              {quiz.title}
            </h3>
            {quiz.course?.title && (
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                {quiz.course.title}
              </span>
            )}
          </div>
          {quiz.description && (
            <p className="text-slate-600 text-xs mt-2 line-clamp-2">{quiz.description}</p>
          )}
          <div className="mt-3.5 flex items-center justify-between gap-3">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <i className="fa-solid fa-circle-question text-[10px]" />
              {quiz._count?.questions ?? 0} questions
            </span>
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <i className="fa-solid fa-clock text-[10px]" />
              {quiz.duration}m
            </span>
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <i className="fa-solid fa-rotate-right text-[10px]" />
              {quiz.maxAttempts} attempt{quiz.maxAttempts !== 1 ? 's' : ''}
            </span>
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <i className="fa-solid fa-users text-[10px]" />
              {quiz._count?.attempts ?? 0} submitted
            </span>
            <a href={`/teacher/quizzes/${quiz.id}`}
              className="text-[11px] font-semibold transition-colors"
              style={{ color: accent.bar }}>
              Manage →
            </a>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 flex flex-col items-end justify-between border-l border-slate-100 shrink-0 min-w-[140px]">
        
        {/* Publish toggle — prominent, labeled, with status context */}
        <div className="flex flex-col items-end gap-1.5">
          {!published && (
            <p className="text-[10px] text-blue-600 font-semibold flex items-center gap-1 mb-0.5">
              <i className="fa-solid fa-arrow-up text-[8px]" />
              Click to go live
            </p>
          )}
          <button
            onClick={() => onTogglePublish(quiz)}
            disabled={isToggling}
            title={published ? 'Click to unpublish (hide from students)' : 'Click to publish (make visible to students)'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all disabled:opacity-60 ${
              published
                ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 hover:border-emerald-600 shadow-sm'
                : 'bg-white text-blue-600 border-blue-400 hover:bg-blue-600 hover:text-white shadow-sm animate-pulse'
            }`}>
            {isToggling
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <i className={`fa-solid ${published ? 'fa-eye' : 'fa-rocket'} text-[10px]`} />}
            {isToggling ? '…' : published ? 'Published' : 'Publish now'}
          </button>
          <span className={`text-[10px] font-medium ${published ? 'text-emerald-600' : 'text-slate-400'}`}>
            {published ? 'Visible to students' : 'Hidden from students'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => onViewAttempts(quiz)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="View attempts">
            <i className="fa-solid fa-chart-simple text-xs" />
          </button>
          <button onClick={() => onEdit(quiz)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Edit quiz">
            <i className="fa-solid fa-pen text-xs" />
          </button>
          <button onClick={() => onDelete(quiz)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Delete quiz">
            <i className="fa-solid fa-trash text-xs" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Published', 'Drafts'] as const;
type Filter = typeof FILTERS[number];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TeacherQuizzesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [quizzes, setQuizzes]       = useState<Quiz[]>([]);
  const [courses, setCourses]       = useState<{ id: string; title: string }[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const [filter, setFilter]                   = useState<Filter>('All');
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]                       = useState(1);

  // Modal state
  const [showCreate, setShowCreate]         = useState(false);
  const [editTarget, setEditTarget]         = useState<Quiz | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<Quiz | null>(null);
  const [attemptsTarget, setAttemptsTarget] = useState<Quiz | null>(null);
  const [deleting, setDeleting]             = useState(false);
  const [toggling, setToggling]             = useState<string | null>(null);

  const pageRef   = useRef(page);
  const searchRef = useRef(debouncedSearch);
  pageRef.current   = page;
  searchRef.current = debouncedSearch;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  // Fetch courses (once)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.teacher.getCourses('?limit=100');
        const raw = (res as any).data;
        const list = Array.isArray(raw) ? raw : raw?.courses ?? raw?.data ?? [];
        setCourses(list.map((c: any) => ({ id: c.id, title: c.title })));
      } catch {}
    })();
  }, [user]);

  const fetchQuizzes = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageRef.current));
      params.set('limit', '12');
      if (searchRef.current) params.set('search', searchRef.current);

      const res = await api.teacher.getQuizzes(`?${params.toString()}`);
      const raw = (res as any).data;
      if (Array.isArray(raw)) {
        setQuizzes(raw); setPagination(null);
      } else {
        setQuizzes(raw?.quizzes ?? raw?.data ?? []);
        setPagination(raw?.pagination ?? null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load quizzes');
    } finally { setLoading(false); }
  }, []);

  const lastKey = useRef('');
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') { router.replace('/dashboard'); return; }
    const key = `${user.id}:${page}:${debouncedSearch}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    fetchQuizzes();
  }, [authLoading, user, page, debouncedSearch, router, fetchQuizzes]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const handleTogglePublish = async (quiz: Quiz) => {
    setToggling(quiz.id);
    try {
      await api.teacher.toggleQuizPublish(quiz.id);
      const published = quiz.isPublished || quiz.status === 'PUBLISHED';
      setQuizzes(prev => prev.map(q =>
        q.id === quiz.id ? { ...q, isPublished: !published, status: published ? 'DRAFT' : 'PUBLISHED' } : q
      ));
      showToast(published ? 'Quiz set to draft.' : 'Quiz published.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to update publish status', false);
    } finally { setToggling(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.teacher.deleteQuiz(deleteTarget.id);
      setQuizzes(prev => prev.filter(q => q.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Quiz deleted.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to delete quiz', false);
    } finally { setDeleting(false); }
  };

  if (!mounted) return null;
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  const filtered       = quizzes.filter(q => {
    const published = q.isPublished || q.status === 'PUBLISHED';
    return filter === 'Published' ? published : filter === 'Drafts' ? !published : true;
  });
  const publishedCount = quizzes.filter(q => q.isPublished || q.status === 'PUBLISHED').length;
  const draftCount     = quizzes.length - publishedCount;
  const totalAttempts  = quizzes.reduce((acc, q) => acc + (q._count?.attempts ?? 0), 0);
  const totalPages     = pagination?.totalPages ?? 1;

  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const statCards = [
    { icon: 'fa-circle-question', value: pagination?.total ?? quizzes.length, label: 'My Quizzes',  accent: '#2563EB', light: '#EFF6FF', sub: 'Across all courses'  },
    { icon: 'fa-globe',           value: publishedCount,                       label: 'Published',   accent: '#059669', light: '#F0FDF4', sub: 'Visible to students' },
    { icon: 'fa-file-pen',        value: draftCount,                           label: 'Drafts',      accent: '#D97706', light: '#FFFBEB', sub: 'Not yet visible'     },
    { icon: 'fa-users',           value: totalAttempts,                        label: 'Submissions', accent: '#7C3AED', light: '#F5F3FF', sub: 'Total attempts'      },
  ];

  return (
    <>
      <FontAwesomeLoader />

      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Quizzes" />

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
            <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
            {toast.msg}
          </div>
        )}

        {/* Modals */}
        {showCreate && (
          <QuizBuilderModal
            mode="create"
            courses={courses}
            onClose={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); showToast('Quiz created!', true); lastKey.current = ''; fetchQuizzes(); }}
          />
        )}
        {editTarget && (
          <QuizBuilderModal
            mode="edit"
            quiz={editTarget}
            courses={courses}
            onClose={() => setEditTarget(null)}
            onSaved={() => { setEditTarget(null); showToast('Quiz updated!', true); lastKey.current = ''; fetchQuizzes(); }}
          />
        )}
        {deleteTarget && (
          <DeleteDialog title={deleteTarget.title} deleting={deleting}
            onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
        )}
        {attemptsTarget && (
          <AttemptsPanel quiz={attemptsTarget} onClose={() => setAttemptsTarget(null)} />
        )}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Header */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <div>
              <p className="text-slate-900 font-bold text-[15px]">My Quizzes</p>
              <p className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative hidden md:block">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input type="search" placeholder="Search quizzes…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-600 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-56"
                />
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
                <i className="fa-solid fa-plus text-xs" />
                New Quiz
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

            {/* Hero Banner */}
            <div className="relative rounded-xl overflow-hidden px-8 py-6"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
              <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Teacher Portal</div>
                  <h2 className="text-white text-2xl font-black tracking-tight leading-tight">
                    {greeting}, {displayName} 👋
                  </h2>
                  <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                    {loading
                      ? 'Loading your quizzes…'
                      : `${draftCount} draft${draftCount !== 1 ? 's' : ''} · ${totalAttempts} student submission${totalAttempts !== 1 ? 's' : ''} so far`}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-5">
                  {[
                    { v: pagination?.total ?? quizzes.length, l: 'My\nQuizzes'     },
                    { v: publishedCount,                      l: 'Published\nLive' },
                    { v: totalAttempts,                       l: 'Total\nAttempts' },
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
              {statCards.map(s => (
                <StatCard key={s.label} label={s.label} value={loading ? '—' : s.value}
                  icon={s.icon} accent={s.accent} light={s.light} sub={s.sub} />
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation shrink-0" />
                {error}
                <button onClick={fetchQuizzes} className="ml-auto text-red-600 font-semibold text-xs hover:text-red-800">Retry</button>
              </div>
            )}

            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 shadow-sm w-fit">
                {FILTERS.map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filter === f ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Quiz List */}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                  <i className="fa-solid fa-inbox text-slate-300 text-2xl" />
                </div>
                <p className="text-slate-700 font-semibold text-sm">
                  {search || filter !== 'All' ? 'No quizzes match your filters' : "You haven't created any quizzes yet"}
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  {search || filter !== 'All' ? 'Try adjusting your filters.' : 'Click New Quiz to get started.'}
                </p>
                {search || filter !== 'All' ? (
                  <button onClick={() => { setFilter('All'); setSearch(''); }}
                    className="mt-4 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                    Clear filters
                  </button>
                ) : (
                  <button onClick={() => setShowCreate(true)}
                    className="mt-4 px-4 py-2 text-xs font-bold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors">
                    <i className="fa-solid fa-plus mr-1.5" />Create Quiz
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((quiz, idx) => (
                  <TeacherQuizCard key={quiz.id} quiz={quiz} index={idx}
                    onEdit={setEditTarget} onDelete={setDeleteTarget}
                    onViewAttempts={setAttemptsTarget}
                    onTogglePublish={handleTogglePublish} toggling={toggling} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1">
                  <i className="fa-solid fa-chevron-left text-[10px]" /> Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i + 1 : Math.max(1, page - 3) + i;
                  if (p > totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs font-semibold rounded-lg transition-all ${
                        p === page ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}>
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
        </main>
      </div>
    </>
  );
}