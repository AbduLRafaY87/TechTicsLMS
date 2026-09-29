'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import Sidebar from '../../../components/Sidebar';
import { api } from '../../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizOption {
  text: string;
  imageUrl?: string | null;
}

interface Question {
  id: string;
  quizId: string;
  text: string;
  imageUrl?: string | null;
  options: QuizOption[];
  correctOption: number;
  explanation?: string | null;
  points: number;
  order: number;
}

interface Attempt {
  id: string;
  userId: string;
  quizId: string;
  score?: number | null;
  passed?: boolean | null;
  startedAt: string;
  completedAt?: string | null;
  user: { id: string; name: string; email: string; avatar?: string | null };
  answers?: Answer[];
}

interface Answer {
  id: string;
  questionId: string;
  selectedOption: number;
  isCorrect: boolean;
}

interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  courseId: string;
  course?: { id: string; title: string };
  status: string;
  isPublished: boolean;
  duration?: number | null;
  maxAttempts: number;
  passingScore: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
  attempts: Attempt[];
  _count: { questions: number; attempts: number };
}

// ─── FontAwesome ──────────────────────────────────────────────────────────────

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

// ─── Image compression ────────────────────────────────────────────────────────

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

// ─── Image Upload Button ──────────────────────────────────────────────────────

function ImageUploadBtn({ value, onChange, size = 'sm' }: {
  value?: string | null;
  onChange: (b64: string | undefined) => void;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    try { onChange(await compressImage(file)); }
    catch {}
    finally { setCompressing(false); e.target.value = ''; }
  };

  if (value) {
    return (
      <div className="relative inline-flex group">
        <img src={value} alt="" className={`rounded-lg border border-slate-200 object-cover ${size === 'sm' ? 'h-14 w-20' : 'h-28 w-44'}`} />
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
      <button onClick={() => ref.current?.click()} disabled={compressing}
        className="flex items-center gap-1.5 text-slate-400 border border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50 px-2.5 py-1.5 text-[11px]">
        {compressing ? <span className="w-3 h-3 border border-slate-300 border-t-blue-500 rounded-full animate-spin" /> : <i className="fa-solid fa-image text-[10px]" />}
        {compressing ? 'Compressing…' : 'Image'}
      </button>
    </>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl flex items-center gap-2 text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <i className={`fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
      {msg}
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel = 'Delete', danger = true, loading, onConfirm, onClose }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean;
  loading: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${danger ? 'bg-red-50' : 'bg-amber-50'}`}>
          <i className={`fa-solid ${danger ? 'fa-trash text-red-600' : 'fa-triangle-exclamation text-amber-600'} text-lg`} />
        </div>
        <h2 className="text-base font-black text-slate-800 mb-1">{title}</h2>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Question Editor Modal ────────────────────────────────────────────────────

interface QForm {
  text: string;
  imageUrl: string | null;
  options: QuizOption[];
  correctOption: number;
  explanation: string;
  points: number;
}

const EMPTY_QFORM: QForm = {
  text: '', imageUrl: null,
  options: [{ text: '' }, { text: '' }],
  correctOption: 0, explanation: '', points: 1,
};

function QuestionEditorModal({ question, quizId, onClose, onSaved }: {
  question?: Question;
  quizId: string;
  onClose: () => void;
  onSaved: (q: Question) => void;
}) {
  const [form, setForm] = useState<QForm>(() => question ? {
    text: question.text,
    imageUrl: question.imageUrl ?? null,
    options: question.options.map(o => typeof o === 'string' ? { text: o } : { text: o.text, imageUrl: o.imageUrl ?? undefined }),
    correctOption: question.correctOption,
    explanation: question.explanation ?? '',
    points: question.points,
  } : { ...EMPTY_QFORM });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const updateOption = (i: number, patch: Partial<QuizOption>) =>
    setForm(p => ({ ...p, options: p.options.map((o, j) => j === i ? { ...o, ...patch } : o) }));

  const addOption = () => {
    if (form.options.length >= 5) return;
    setForm(p => ({ ...p, options: [...p.options, { text: '' }] }));
  };

  const removeOption = (i: number) => {
    const next = form.options.filter((_, j) => j !== i);
    setForm(p => ({ ...p, options: next, correctOption: Math.min(p.correctOption, next.length - 1) }));
  };

  const handleSave = async () => {
    if (!form.text.trim()) { setErr('Question text is required'); return; }
    if (form.options.some(o => !o.text.trim() && !o.imageUrl)) { setErr('All options need text or an image'); return; }
    setSaving(true); setErr(null);
    try {
      const payload = {
        text: form.text,
        imageUrl: form.imageUrl ?? null,
        options: form.options.map(o => ({ text: o.text, imageUrl: (o as any).imageUrl ?? null })),
        correctOption: form.correctOption,
        explanation: form.explanation || null,
        points: form.points,
      };
      let result: any;
      if (question) {
        result = await api.teacher.updateQuestion(question.id, payload);
      } else {
        result = await api.teacher.addQuestion(quizId, payload);
      }
      const q = result?.data?.data?.question ?? result?.data?.question ?? result?.data ?? result;
      onSaved(q as Question);
    } catch (e: any) {
      setErr(e.message || 'Failed to save question');
    } finally { setSaving(false); }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-black text-slate-800">
            {question ? 'Edit Question' : 'Add Question'}
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {err && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation" /> {err}
            </div>
          )}

          {/* Question text */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              Question <span className="text-red-500">*</span>
            </label>
            <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
              rows={3} placeholder="Type your question…"
              className={`${inputCls} resize-none`} />
            {form.imageUrl && (
              <img src={form.imageUrl} alt="" className="mt-2 max-h-40 rounded-xl object-contain border border-slate-200" />
            )}
            <div className="mt-2">
              <ImageUploadBtn value={form.imageUrl} onChange={b64 => setForm(p => ({ ...p, imageUrl: b64 ?? null }))} size="md" />
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Answer Choices
            </label>
            <div className="space-y-2">
              {form.options.map((opt, i) => (
                <div key={i}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 transition-all ${form.correctOption === i ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                  <button onClick={() => setForm(p => ({ ...p, correctOption: i }))}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${form.correctOption === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'}`}>
                    {form.correctOption === i && <i className="fa-solid fa-check text-[9px]" />}
                  </button>
                  <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 ${form.correctOption === i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {letters[i]}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input type="text" value={opt.text}
                      onChange={e => updateOption(i, { text: e.target.value })}
                      placeholder={`Option ${letters[i]}`}
                      className="w-full text-sm text-slate-800 placeholder-slate-300 bg-transparent border-none outline-none" />
                    {(opt as any).imageUrl && (
                      <img src={(opt as any).imageUrl} alt="" className="h-10 rounded-lg object-cover border border-slate-200" />
                    )}
                    <ImageUploadBtn value={(opt as any).imageUrl} onChange={b64 => updateOption(i, { imageUrl: b64 } as any)} />
                  </div>
                  {form.options.length > 2 && (
                    <button onClick={() => removeOption(i)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0 mt-0.5">
                      <i className="fa-solid fa-xmark text-[10px]" />
                    </button>
                  )}
                </div>
              ))}
              {form.options.length < 5 && (
                <button onClick={addOption}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors mt-1">
                  <i className="fa-solid fa-plus text-[9px]" /> Add option
                </button>
              )}
            </div>
          </div>

          {/* Points + Explanation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Points</label>
              <input type="number" min={1} max={100} value={form.points}
                onChange={e => setForm(p => ({ ...p, points: Math.max(1, parseInt(e.target.value) || 1) }))}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Explanation</label>
              <input type="text" value={form.explanation}
                onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))}
                placeholder="Optional"
                className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-40 flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {question ? 'Save Changes' : 'Add Question'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attempt Detail Modal ─────────────────────────────────────────────────────

function AttemptDetailModal({ attempt, questions, maxScore, onClose }: {
  attempt: Attempt; questions: Question[]; maxScore: number; onClose: () => void;
}) {
  const score = attempt.score ?? 0;
  const pct   = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-800">{attempt.user?.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{attempt.user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-black px-3 py-1 rounded-full ${pct >= 75 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
              {score}/{maxScore} ({pct}%)
            </span>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {questions.map((q, i) => {
            const ans = attempt.answers?.find(a => a.questionId === q.id);
            const correct = ans?.isCorrect ?? false;
            return (
              <div key={q.id} className={`rounded-xl border p-4 ${correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/30'}`}>
                <div className="flex items-start gap-2 mb-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5 ${correct ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                    {correct ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-xmark" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{i + 1}. {q.text}</p>
                    {q.imageUrl && <img src={q.imageUrl} alt="" className="mt-1.5 max-h-24 rounded-lg object-contain border border-slate-200" />}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 shrink-0">{q.points}pt{q.points !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-1 ml-7">
                  {q.options.map((opt, j) => {
                    const isSelected = ans?.selectedOption === j;
                    const isCorrectOpt = q.correctOption === j;
                    return (
                      <div key={j} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isCorrectOpt ? 'bg-emerald-100 text-emerald-800'
                        : isSelected ? 'bg-red-100 text-red-700'
                        : 'text-slate-500'
                      }`}>
                        <span className="font-black">{'ABCDE'[j]}.</span>
                        <span>{opt.text}</span>
                        {isCorrectOpt && <i className="fa-solid fa-check ml-auto text-emerald-600" />}
                        {isSelected && !isCorrectOpt && <i className="fa-solid fa-xmark ml-auto text-red-500" />}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <p className="mt-2 ml-7 text-[11px] text-slate-500 italic">
                    <i className="fa-solid fa-lightbulb text-amber-400 mr-1" />
                    {q.explanation}
                  </p>
                )}
              </div>
            );
          })}
          {questions.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">No question detail available.</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Submitted {attempt.completedAt
              ? new Date(attempt.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </span>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${attempt.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {attempt.passed ? 'Passed' : 'Failed'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Questions ───────────────────────────────────────────────────────────

function QuestionsTab({ quiz, onQuizUpdate }: { quiz: Quiz; onQuizUpdate: (q: Quiz) => void }) {
  const [questions, setQuestions] = useState<Question[]>(quiz.questions ?? []);
  const [editTarget, setEditTarget]   = useState<Question | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [reordering, setReordering]   = useState(false);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaved = (q: Question) => {
    setQuestions(prev => {
      const exists = prev.find(x => x.id === q.id);
      return exists ? prev.map(x => x.id === q.id ? q : x) : [...prev, q];
    });
    setEditTarget(null);
    setShowAdd(false);
    showToast(editTarget ? 'Question updated.' : 'Question added.', true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.teacher.deleteQuestion(deleteTarget.id);
      setQuestions(prev => prev.filter(q => q.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Question deleted.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to delete', false);
    } finally { setDeleting(false); }
  };

  const move = async (idx: number, dir: 'up' | 'down') => {
    const next = [...questions];
    const to   = dir === 'up' ? idx - 1 : idx + 1;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    setQuestions(next);
    setReordering(true);
    try {
      await api.teacher.reorderQuestions?.(quiz.id, next.map((q, i) => ({ id: q.id, order: i })));
    } catch {}
    finally { setReordering(false); }
  };

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className="space-y-4">
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
      {(showAdd || editTarget) && (
        <QuestionEditorModal
          question={editTarget ?? undefined}
          quizId={quiz.id}
          onClose={() => { setShowAdd(false); setEditTarget(null); }}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Question?"
          message={`"${deleteTarget.text.slice(0, 60)}${deleteTarget.text.length > 60 ? '…' : ''}" will be permanently removed.`}
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span><span className="font-bold text-slate-800">{questions.length}</span> questions</span>
          <span className="text-slate-200">|</span>
          <span><span className="font-bold text-slate-800">{totalPoints}</span> total points</span>
          {reordering && <span className="text-blue-500 flex items-center gap-1"><span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />Saving order…</span>}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 transition-colors shadow-sm">
          <i className="fa-solid fa-plus text-[10px]" /> Add Question
        </button>
      </div>

      {/* Question list */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
            <i className="fa-solid fa-circle-question text-blue-400 text-xl" />
          </div>
          <p className="text-slate-700 font-semibold text-sm">No questions yet</p>
          <p className="text-slate-400 text-xs mt-1 mb-5">Add your first MCQ question to get started.</p>
          <button onClick={() => setShowAdd(true)}
            className="px-5 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-xl hover:bg-blue-800 transition-colors shadow-sm flex items-center gap-2">
            <i className="fa-solid fa-plus text-xs" /> Add Question
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Q header */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Question</span>
                  <span className="text-[11px] font-bold text-slate-500 ml-1">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => move(idx, 'up')} disabled={idx === 0}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-25 transition-colors">
                    <i className="fa-solid fa-chevron-up text-[10px]" />
                  </button>
                  <button onClick={() => move(idx, 'down')} disabled={idx === questions.length - 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-25 transition-colors">
                    <i className="fa-solid fa-chevron-down text-[10px]" />
                  </button>
                  <button onClick={() => setEditTarget(q)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-white hover:text-blue-600 transition-colors ml-1">
                    <i className="fa-solid fa-pen text-[10px]" />
                  </button>
                  <button onClick={() => setDeleteTarget(q)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <i className="fa-solid fa-trash text-[10px]" />
                  </button>
                </div>
              </div>

              {/* Q body */}
              <div className="p-5">
                <p className="text-[15px] font-semibold text-slate-800 leading-snug">{q.text}</p>
                {q.imageUrl && (
                  <img src={q.imageUrl} alt="" className="mt-3 max-h-40 rounded-xl object-contain border border-slate-200" />
                )}

                <div className="mt-4 space-y-1.5">
                  {q.options.map((opt, i) => (
                    <div key={i}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${q.correctOption === i ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}>
                      <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center shrink-0 ${q.correctOption === i ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {letters[i]}
                      </span>
                      <span className={q.correctOption === i ? 'text-emerald-800 font-medium' : 'text-slate-600'}>
                        {opt.text}
                      </span>
                      {opt.imageUrl && <img src={opt.imageUrl} alt="" className="h-8 rounded object-cover border border-slate-200 ml-auto" />}
                      {q.correctOption === i && <i className="fa-solid fa-check text-emerald-500 text-xs ml-auto" />}
                    </div>
                  ))}
                </div>

                {q.explanation && (
                  <p className="mt-3 text-xs text-slate-500 italic flex items-start gap-1.5">
                    <i className="fa-solid fa-lightbulb text-amber-400 mt-0.5 shrink-0" />
                    {q.explanation}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Attempts ────────────────────────────────────────────────────────────

function AttemptsTab({ quiz }: { quiz: Quiz }) {
  const [attempts, setAttempts] = useState<Attempt[]>(quiz.attempts ?? []);
  const [loading, setLoading]   = useState(false);
  const [detail, setDetail]     = useState<Attempt | null>(null);

  const totalPoints = (quiz.questions ?? []).reduce((s, q) => s + q.points, 0);
  const avgScore    = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.score ?? 0), 0) / attempts.length)
    : 0;
  const passRate = attempts.length
    ? Math.round((attempts.filter(a => a.passed).length / attempts.length) * 100)
    : 0;

  useEffect(() => {
    if (quiz.attempts?.length) return; // already loaded with quiz
    setLoading(true);
    api.teacher.getQuizAttempts(quiz.id)
      .then((res: any) => {
        const raw = res?.data?.data ?? res?.data ?? [];
        setAttempts(Array.isArray(raw) ? raw : raw?.attempts ?? raw?.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [quiz.id]);

  return (
    <div className="space-y-4">
      {detail && (
        <AttemptDetailModal
          attempt={detail}
          questions={quiz.questions ?? []}
          maxScore={totalPoints}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Stats row */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Submissions', value: attempts.length, icon: 'fa-users', accent: '#2563EB', light: '#EFF6FF' },
            { label: 'Avg Score', value: `${avgScore}/${totalPoints}`, icon: 'fa-chart-bar', accent: '#7C3AED', light: '#F5F3FF' },
            { label: 'Pass Rate', value: `${passRate}%`, icon: 'fa-trophy', accent: '#059669', light: '#F0FDF4' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: s.light, color: s.accent }}>
                <i className={`fa-solid ${s.icon} text-sm`} />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">{s.value}</div>
                <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-2.5 bg-slate-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
            <i className="fa-solid fa-clipboard-list text-slate-300 text-xl" />
          </div>
          <p className="text-slate-700 font-semibold text-sm">No submissions yet</p>
          <p className="text-slate-400 text-xs mt-1">Results will appear once students take this quiz.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Student</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Score</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Result</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Submitted</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {attempts.map((a, i) => {
                const pct = totalPoints > 0 ? Math.round(((a.score ?? 0) / totalPoints) * 100) : 0;
                return (
                  <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i === attempts.length - 1 ? 'border-none' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xs font-black shrink-0 overflow-hidden">
                          {a.user?.avatar
                            ? <img src={a.user.avatar} alt="" className="w-full h-full object-cover" />
                            : (a.user?.name ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-[13px] truncate">{a.user?.name ?? '—'}</p>
                          <p className="text-[11px] text-slate-400 truncate">{a.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{a.score ?? 0}/{totalPoints}</span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${a.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {a.passed ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {a.completedAt
                        ? new Date(a.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : a.startedAt
                          ? new Date(a.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => setDetail(a)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                        View →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────

function SettingsTab({ quiz, onQuizUpdate }: { quiz: Quiz; onQuizUpdate: (q: Quiz) => void }) {
  const [form, setForm] = useState({
    title:       quiz.title,
    description: quiz.description ?? '',
    duration:    String(quiz.duration ?? 30),
    maxAttempts: String(quiz.maxAttempts ?? 1),
    passingScore:String(quiz.passingScore ?? 60),
    dueDate:     quiz.dueDate ? quiz.dueDate.slice(0, 10) : '',
  });
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required', false); return; }
    setSaving(true);
    try {
      const res: any = await api.teacher.updateQuiz(quiz.id, {
        title:       form.title,
        description: form.description || undefined,
        duration:    Number(form.duration) || 30,
        maxAttempts: Number(form.maxAttempts) || 1,
        passingScore:Number(form.passingScore) || 60,
        dueDate:     form.dueDate || undefined,
      });
      const updated = res?.data?.data?.quiz ?? res?.data?.quiz ?? res?.data ?? quiz;
      onQuizUpdate({ ...quiz, ...updated });
      showToast('Settings saved.', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to save', false);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.teacher.deleteQuiz(quiz.id);
      router.replace('/teacher/quizzes');
    } catch (e: any) {
      showToast(e.message || 'Failed to delete quiz', false);
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all";

  return (
    <div className="space-y-5 max-w-2xl">
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
      {showDelete && (
        <ConfirmDialog
          title="Delete Quiz?"
          message={`"${quiz.title}" and all its questions and student attempts will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Quiz"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}

      {/* General */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-700">General</h3>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Title <span className="text-red-500">*</span></label>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className={inputCls} placeholder="Quiz title" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3} placeholder="What does this quiz cover?"
            className={`${inputCls} resize-none`} />
        </div>
      </div>

      {/* Rules */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-black text-slate-700">Rules</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Duration (min)</label>
            <input type="number" min={1} value={form.duration}
              onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Max Attempts</label>
            <input type="number" min={1} value={form.maxAttempts}
              onChange={e => setForm(p => ({ ...p, maxAttempts: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Passing Score (%)</label>
            <input type="number" min={0} max={100} value={form.passingScore}
              onChange={e => setForm(p => ({ ...p, passingScore: e.target.value }))} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Due Date</label>
          <input type="date" value={form.dueDate}
            onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
            className={`${inputCls} max-w-[200px]`} />
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors shadow-sm">
        {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        Save Settings
      </button>

      {/* Danger zone */}
      <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
        <h3 className="text-sm font-black text-red-700 mb-1">Danger Zone</h3>
        <p className="text-xs text-slate-500 mb-4">Deleting this quiz will permanently remove all questions and student attempts.</p>
        <button onClick={() => setShowDelete(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
          <i className="fa-solid fa-trash text-xs" /> Delete Quiz
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ['Questions', 'Attempts', 'Settings'] as const;
type Tab = typeof TABS[number];

export default function TeacherQuizManagePage() {
  const { user, loading: authLoading } = useAuth();
  const router   = useRouter();
  const params   = useParams();
  const quizId   = params?.id as string;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [quiz, setQuiz]       = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>('Questions');
  const [toggling, setToggling] = useState(false);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchQuiz = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res: any = await api.teacher.getQuizById(quizId);
      const q = res?.data?.data?.quiz ?? res?.data?.quiz ?? res?.data ?? res;
      setQuiz(q as Quiz);
    } catch (e: any) {
      setError(e.message || 'Failed to load quiz');
    } finally { setLoading(false); }
  }, [quizId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'TEACHER' && user.role !== 'ADMIN') { router.replace('/dashboard'); return; }
    fetchQuiz();
  }, [authLoading, user, fetchQuiz, router]);

  const handleTogglePublish = async () => {
    if (!quiz) return;
    setToggling(true);
    try {
      await api.teacher.toggleQuizPublish(quiz.id);
      const published = quiz.isPublished || quiz.status === 'PUBLISHED';
      setQuiz(q => q ? { ...q, isPublished: !published, status: published ? 'DRAFT' : 'PUBLISHED' } : q);
      showToast(published ? 'Quiz set to draft.' : 'Quiz published!', true);
    } catch (e: any) {
      showToast(e.message || 'Failed to update', false);
    } finally { setToggling(false); }
  };

  if (!mounted) return null;

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <FontAwesomeLoader />
        <Sidebar activeItem="Quizzes" />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
        </main>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <FontAwesomeLoader />
        <Sidebar activeItem="Quizzes" />
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-red-50 flex items-center justify-center">
            <i className="fa-solid fa-circle-exclamation text-red-500 text-xl" />
          </div>
          <p className="text-slate-700 font-semibold">{error || 'Quiz not found'}</p>
          <button onClick={() => router.back()}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900 transition-colors">
            ← Go back
          </button>
        </main>
      </div>
    );
  }

  const published   = quiz.isPublished || quiz.status === 'PUBLISHED';
  const totalPoints = (quiz.questions ?? []).reduce((s, q) => s + q.points, 0);

  const tabIcons: Record<Tab, string> = {
    Questions: 'fa-circle-question',
    Attempts:  'fa-users',
    Settings:  'fa-gear',
  };

  return (
    <>
      <FontAwesomeLoader />
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Quizzes" />

        {toast && <Toast msg={toast.msg} ok={toast.ok} />}

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* ── Top header ── */}
          <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => router.push('/teacher/quizzes')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0">
                <i className="fa-solid fa-arrow-left text-sm" />
              </button>
              <div className="min-w-0">
                <p className="text-slate-900 font-bold text-[15px] truncate">{quiz.title}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {quiz.course?.title && <span className="mr-2">{quiz.course.title}</span>}
                  <span className="tracking-wide">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Publish toggle */}
              <button onClick={handleTogglePublish} disabled={toggling}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
                  published
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}>
                {toggling
                  ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <i className={`fa-solid ${published ? 'fa-globe' : 'fa-file-pen'} text-xs`} />}
                {published ? 'Published' : 'Draft'}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto">
            {/* ── Hero banner ── */}
            <div className="relative px-8 py-6 overflow-hidden shrink-0"
              style={{ background: 'linear-gradient(135deg, #0F2040 0%, #1E3A5F 50%, #1D4ED8 100%)' }}>
              <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
              <div className="absolute right-20 -bottom-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Quiz Manager</div>
                  <h1 className="text-white text-xl font-black tracking-tight leading-tight truncate max-w-xl">{quiz.title}</h1>
                  {quiz.description && (
                    <p className="text-blue-200 text-sm mt-1 max-w-lg line-clamp-1">{quiz.description}</p>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-0 shrink-0">
                  {[
                    { v: quiz._count?.questions ?? quiz.questions?.length ?? 0, l: 'Questions' },
                    { v: `${quiz.duration ?? '—'}m`,                             l: 'Duration'  },
                    { v: `${quiz.passingScore}%`,                                l: 'Pass Mark' },
                    { v: quiz._count?.attempts ?? quiz.attempts?.length ?? 0,   l: 'Attempts'  },
                  ].map((s, i) => (
                    <div key={s.l} className={`text-center px-5 ${i !== 0 ? 'border-l border-white/10' : ''}`}>
                      <div className="text-white text-2xl font-black">{s.v}</div>
                      <div className="text-blue-300 text-[11px] font-semibold mt-0.5 tracking-wide">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tab bar ── */}
            <div className="bg-white border-b border-slate-200 px-8">
              <div className="flex items-center gap-1">
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`flex items-center gap-2 px-4 py-3.5 text-xs font-semibold border-b-2 transition-all ${
                      tab === t
                        ? 'border-blue-700 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}>
                    <i className={`fa-solid ${tabIcons[t]} text-[11px]`} />
                    {t}
                    {t === 'Questions' && (
                      <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {quiz._count?.questions ?? quiz.questions?.length ?? 0}
                      </span>
                    )}
                    {t === 'Attempts' && (
                      <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        {quiz._count?.attempts ?? quiz.attempts?.length ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tab content ── */}
            <div className="px-8 py-7">
              {tab === 'Questions' && <QuestionsTab quiz={quiz} onQuizUpdate={setQuiz} />}
              {tab === 'Attempts'  && <AttemptsTab  quiz={quiz} />}
              {tab === 'Settings'  && <SettingsTab  quiz={quiz} onQuizUpdate={setQuiz} />}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}