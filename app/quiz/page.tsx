'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuizStatus = 'upcoming' | 'available' | 'attempted' | 'missed';

interface Quiz {
  id: string;
  title: string;
  description?: string;
  course: { id: string; title: string };
  status: QuizStatus;
  dueDate: string;
  duration: number;
  totalQuestions: number;
  totalMarks: number;
  attempts: number;
  maxAttempts: number;
  lastScore?: number;
  lastAttemptAt?: string;
}

interface QuizSummary {
  total: number;
  available: number;
  attempted: number;
  upcoming: number;
  missed: number;
  avgScore: number;
}

interface QuizzesData {
  summary: QuizSummary;
  quizzes: Quiz[];
}

interface Option { id: string; text: string; imageUrl?: string | null }

interface Question {
  id: string;
  text: string;
  imageUrl?: string | null;
  options: Option[];
  correctOption?: number;
  points: number;
  order: number;
}

interface QuizResult {
  score: number;
  totalMarks: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  timeTaken: number;
  passed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_COLORS = ['#1E3A5F','#2563EB','#0F766E','#6D28D9','#B45309','#DC2626','#0369A1','#4338CA'];

const STATUS_META: Record<QuizStatus, { label: string; color: string; bg: string; dot: string; icon: string }> = {
  available: { label: 'Available', color: '#0F766E', bg: '#F0FDF4', dot: '#22C55E', icon: 'fa-circle-play'       },
  attempted: { label: 'Attempted', color: '#2563EB', bg: '#EFF6FF', dot: '#3B82F6', icon: 'fa-circle-check'      },
  upcoming:  { label: 'Upcoming',  color: '#6D28D9', bg: '#F5F3FF', dot: '#8B5CF6', icon: 'fa-clock'             },
  missed:    { label: 'Missed',    color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444', icon: 'fa-circle-exclamation' },
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt = (secs: number) => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const MAX_WARNINGS = 3;

// ─── Derive status ────────────────────────────────────────────────────────────

function deriveStatus(raw: any): QuizStatus {
  if (raw.status && STATUS_META[raw.status as QuizStatus]) return raw.status as QuizStatus;
  const now         = new Date();
  const due         = raw.dueDate ? new Date(raw.dueDate) : null;
  const attempts    = raw.attempts ?? raw._count?.attempts ?? 0;
  const maxAttempts = raw.maxAttempts ?? 1;
  const attemptsLeft = maxAttempts - attempts;
  const isPublished  = raw.isPublished === true || raw.status === 'PUBLISHED';

  if (attempts > 0 && attemptsLeft <= 0) return 'attempted';
  if (due && due < now && !isPublished)   return 'missed';
  if (due && due < now && attemptsLeft <= 0) return 'missed';
  if (isPublished && attemptsLeft > 0)    return 'available';
  return 'upcoming';
}

function normalizeQuiz(raw: any): Quiz {
  return {
    id:             raw.id,
    title:          raw.title ?? 'Untitled Quiz',
    description:    raw.description ?? undefined,
    course:         raw.course ?? { id: raw.courseId ?? '', title: 'Unknown Course' },
    status:         deriveStatus(raw),
    dueDate:        raw.dueDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    duration:       raw.duration ?? 30,
    totalQuestions: raw.totalQuestions ?? raw._count?.questions ?? 0,
    totalMarks:     raw.totalMarks ?? 0,
    attempts:       raw.attempts ?? 0,
    maxAttempts:    raw.maxAttempts ?? 1,
    lastScore:      raw.lastScore ?? undefined,
    lastAttemptAt:  raw.lastAttemptAt ?? undefined,
  };
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

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
    </div>
  );
}

function ScoreRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const r      = size / 2 - 5;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color  = pct >= 75 ? '#0F766E' : pct >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-black text-slate-900" style={{ fontSize: size * 0.22 }}>{pct}%</span>
      </div>
    </div>
  );
}

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

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div className="w-10 h-8 bg-slate-100 rounded shrink-0" />
      <div className="w-px h-8 bg-slate-100 shrink-0" />
      <div className="w-8 h-8 rounded-lg bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-100 rounded w-1/3" />
      </div>
      <div className="w-20 h-5 bg-slate-100 rounded-full" />
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Quiz Detail Modal ────────────────────────────────────────────────────────

function QuizDetailModal({ quiz, onClose, onStart }: {
  quiz: Quiz; onClose: () => void; onStart: () => void;
}) {
  const meta     = STATUS_META[quiz.status];
  const due      = new Date(quiz.dueDate);
  const canStart = quiz.status === 'available' && quiz.attempts < quiz.maxAttempts;

  return (
    <Modal onClose={onClose}>
      <div className="px-6 py-5 rounded-t-2xl" style={{ background: 'linear-gradient(135deg,#0F2040,#1E3A5F,#1D4ED8)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mb-1">{quiz.course.title}</div>
            <h2 className="text-white font-black text-[17px] leading-snug">{quiz.title}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-300 hover:text-white hover:bg-white/10 transition-all ml-3 shrink-0">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="flex gap-4 mt-4 flex-wrap">
          {[
            { icon: 'fa-circle-question', v: `${quiz.totalQuestions} Qs`                  },
            { icon: 'fa-clock',           v: `${quiz.duration} min`                       },
            { icon: 'fa-star',            v: `${quiz.totalMarks} marks`                   },
            { icon: 'fa-rotate-right',    v: `${quiz.attempts}/${quiz.maxAttempts} tries`  },
          ].map(s => (
            <div key={s.v} className="flex items-center gap-1.5 text-blue-200 text-[11px] font-semibold">
              <i className={`fa-solid ${s.icon} text-[10px]`} />{s.v}
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 py-5">
        {quiz.description && (
          <p className="text-slate-500 text-[13px] leading-relaxed mb-4">{quiz.description}</p>
        )}

        <div className="flex flex-wrap gap-2 mb-5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full"
            style={{ color: meta.color, background: meta.bg }}>
            <i className={`fa-solid ${meta.icon} text-[10px]`} />{meta.label}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full text-slate-600 bg-slate-100">
            <i className="fa-solid fa-calendar-days text-[10px]" />
            Due {MONTH_NAMES[due.getMonth()]} {due.getDate()}, {due.getFullYear()}
          </span>
        </div>

        {quiz.lastScore !== undefined && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-5 flex items-center gap-4">
            <ScoreRing pct={quiz.lastScore} size={60} />
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Last Attempt</div>
              <div className="text-slate-800 font-black text-xl">{quiz.lastScore}%</div>
              {quiz.lastAttemptAt && (
                <div className="text-slate-400 text-[11px] mt-0.5">
                  {new Date(quiz.lastAttemptAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4">
          <div className="text-red-700 font-bold text-[12px] mb-2 flex items-center gap-1.5">
            <i className="fa-solid fa-shield-halved text-[11px]" /> Secure Test Mode
          </div>
          <ul className="space-y-1">
            {[
              'The quiz will enter full-screen mode. Pressing Escape or exiting full-screen counts as a violation.',
              `Switching tabs or minimizing counts as a violation (${MAX_WARNINGS} violations = auto-submit).`,
              'Copy, paste, and right-click are disabled.',
              `You have ${quiz.maxAttempts - quiz.attempts} attempt(s) remaining.`,
              `You have ${quiz.duration} minutes to complete this quiz.`,
              'Each question shows instant feedback before moving to the next.',
            ].map(t => (
              <li key={t} className="text-red-600 text-[11px] flex items-start gap-1.5">
                <i className="fa-solid fa-circle text-[5px] mt-1.5 shrink-0" />{t}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 text-[13px] font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all">
            Cancel
          </button>
          {canStart
            ? <button onClick={onStart}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-lg text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#0F2040,#2563EB)' }}>
                <i className="fa-solid fa-lock text-xs" /> Start Secure Quiz
              </button>
            : <div className="flex-1 px-4 py-2.5 text-[13px] font-semibold rounded-lg text-center text-slate-400 bg-slate-100">
                {quiz.status === 'missed' ? 'Quiz Closed' : 'No Attempts Left'}
              </div>
          }
        </div>
      </div>
    </Modal>
  );
}

// ─── Warning Overlay ──────────────────────────────────────────────────────────

function WarningOverlay({ count, onDismiss, onSubmit }: {
  count: number; onDismiss: () => void; onSubmit: () => void;
}) {
  const remaining = MAX_WARNINGS - count;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(127,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-triangle-exclamation text-red-600 text-2xl" />
        </div>
        <h2 className="text-base font-black text-slate-800 mb-1">Violation Detected!</h2>
        <p className="text-sm text-slate-500 mb-1">You exited full-screen or switched tabs.</p>
        <p className={`text-sm font-bold mb-5 ${remaining <= 1 ? 'text-red-600' : 'text-amber-600'}`}>
          {remaining > 0
            ? `Warning ${count} of ${MAX_WARNINGS} — ${remaining} remaining before auto-submit.`
            : 'Final warning reached — quiz will be submitted now.'}
        </p>
        {remaining > 0
          ? <button onClick={onDismiss}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors">
              Return to Quiz (Re-enters Full-Screen)
            </button>
          : <button onClick={onSubmit}
              className="w-full py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
              Submit Quiz Now
            </button>
        }
      </div>
    </div>
  );
}

// ─── Fullscreen Prompt ────────────────────────────────────────────────────────

function FullscreenPrompt({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(15,32,64,0.95)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-expand text-blue-600 text-2xl" />
        </div>
        <h2 className="text-base font-black text-slate-800 mb-1">Enter Full-Screen</h2>
        <p className="text-sm text-slate-500 mb-5">
          This quiz requires full-screen mode. Exiting full-screen at any point counts as a violation.
        </p>
        <button onClick={onEnter}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-colors"
          style={{ background: 'linear-gradient(135deg,#0F2040,#2563EB)' }}>
          <i className="fa-solid fa-expand mr-2 text-xs" />Enter Full-Screen & Start
        </button>
      </div>
    </div>
  );
}

// ─── Answer Feedback Overlay ──────────────────────────────────────────────────

function AnswerFeedback({ isCorrect, correctLetter, onNext, isLast }: {
  isCorrect: boolean;
  correctLetter: string;
  onNext: () => void;
  isLast: boolean;
}) {
  // Auto-advance after 1.5s
  useEffect(() => {
    const t = setTimeout(onNext, 1500);
    return () => clearTimeout(t);
  }, [onNext]);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto rounded-2xl shadow-2xl px-10 py-8 text-center flex flex-col items-center gap-3 max-w-xs w-full mx-4"
        style={{
          background: isCorrect
            ? 'linear-gradient(135deg,#052e16,#0F766E)'
            : 'linear-gradient(135deg,#450a0a,#DC2626)',
          animation: 'popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isCorrect ? 'bg-green-400/20' : 'bg-red-400/20'}`}>
          <i className={`fa-solid ${isCorrect ? 'fa-circle-check text-green-300' : 'fa-circle-xmark text-red-300'} text-3xl`} />
        </div>
        <div className="text-white font-black text-xl">{isCorrect ? 'Correct!' : 'Incorrect'}</div>
        {!isCorrect && (
          <div className="text-white/70 text-sm">
            Correct answer: <span className="text-white font-bold">{correctLetter}</span>
          </div>
        )}
        <button
          onClick={onNext}
          className="mt-1 px-6 py-2 rounded-lg text-[13px] font-semibold bg-white/20 hover:bg-white/30 text-white transition-all"
        >
          {isLast ? 'Submit Quiz' : 'Next Question'} →
        </button>
      </div>
    </div>
  );
}

// ─── Fullscreen utility ───────────────────────────────────────────────────────

function requestFullscreen() {
  const el = document.documentElement as any;
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
  return Promise.resolve();
}

function exitFullscreen() {
  const doc = document as any;
  if (doc.exitFullscreen) return doc.exitFullscreen();
  if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
  if (doc.mozCancelFullScreen) return doc.mozCancelFullScreen();
  if (doc.msExitFullscreen) return doc.msExitFullscreen();
  return Promise.resolve();
}

function isFullscreenActive() {
  const doc = document as any;
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
}

// ─── Quiz Taker ───────────────────────────────────────────────────────────────

function QuizTaker({ quiz, questions, onSubmit }: {
  quiz: Quiz;
  questions: Question[];
  onSubmit: (answers: Record<string, number>) => void;
}) {
  const total                           = questions.length;
  const [current, setCurrent]           = useState(0);
  const [answers, setAnswers]           = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft]         = useState(quiz.duration * 60);
  const [flagged, setFlagged]           = useState<Set<string>>(new Set());
  const [showNav, setShowNav]           = useState(false);
  const [warnings, setWarnings]         = useState(0);
  const [showWarning, setShowWarning]   = useState(false);
  const [showFSPrompt, setShowFSPrompt] = useState(true);
  const [isInFullscreen, setIsInFullscreen] = useState(false);

  // Answer feedback state
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    isCorrect: boolean;
    correctLetter: string;
  }>({ visible: false, isCorrect: false, correctLetter: '' });

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef      = useRef(answers);
  const warningsRef     = useRef(warnings);
  const isInFullRef     = useRef(false);
  const showFSPromptRef = useRef(true);
  const violationLock   = useRef(false); // prevent double-firing
  const submitCalled    = useRef(false);

  answersRef.current      = answers;
  warningsRef.current     = warnings;
  isInFullRef.current     = isInFullscreen;
  showFSPromptRef.current = showFSPrompt;

  const letters = ['A','B','C','D','E'];

  // ── Fullscreen entry ──
  const enterFullscreen = useCallback(async () => {
    try { await requestFullscreen(); } catch (_) {}
    setIsInFullscreen(true);
    setShowFSPrompt(false);
  }, []);

  // ── Force re-enter fullscreen ──
  const forceFullscreen = useCallback(() => {
    setTimeout(async () => {
      try { await requestFullscreen(); } catch (_) {}
    }, 200);
  }, []);

  // ── Submit ──
  const handleSubmit = useCallback((_auto = false) => {
    if (submitCalled.current) return;
    submitCalled.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (isFullscreenActive()) exitFullscreen().catch(() => {});
    onSubmit(answersRef.current);
  }, [onSubmit]);

  // ── Violation ──
  const handleViolation = useCallback(() => {
    if (showFSPromptRef.current) return;   // quiz hasn't started yet
    if (violationLock.current) return;     // debounce
    violationLock.current = true;
    setTimeout(() => { violationLock.current = false; }, 1000);

    const next = warningsRef.current + 1;
    setWarnings(next);
    setShowWarning(true);

    if (next >= MAX_WARNINGS) {
      setTimeout(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        onSubmit(answersRef.current);
      }, 2500);
    }
  }, [onSubmit]);

  // ── Fullscreen change listener ──
  useEffect(() => {
    const onFSChange = () => {
      const inFS = isFullscreenActive();
      setIsInFullscreen(inFS);
      if (!inFS && !showFSPromptRef.current) {
        handleViolation();
        forceFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    document.addEventListener('mozfullscreenchange', onFSChange);
    document.addEventListener('MSFullscreenChange', onFSChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      document.removeEventListener('webkitfullscreenchange', onFSChange);
      document.removeEventListener('mozfullscreenchange', onFSChange);
      document.removeEventListener('MSFullscreenChange', onFSChange);
    };
  }, [handleViolation, forceFullscreen]);

  // ── Tab visibility listener ──
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && !showFSPromptRef.current) handleViolation();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [handleViolation]);

  // ── Block Escape key and devtools shortcuts ──
  useEffect(() => {
    const keyBlock = (e: KeyboardEvent) => {
      // Always block Escape during quiz
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
      const blocked = [
        e.ctrlKey && ['a','c','v','x','p','s','u'].includes(e.key.toLowerCase()),
        e.metaKey && ['a','c','v','x','p','s','u'].includes(e.key.toLowerCase()),
        e.key === 'F12',
        e.ctrlKey && e.shiftKey && ['i','j','c'].includes(e.key.toLowerCase()),
      ];
      if (blocked.some(Boolean)) e.preventDefault();
    };
    // capture: true ensures this fires before browser handles Escape for fullscreen exit
    document.addEventListener('keydown', keyBlock, true);
    return () => document.removeEventListener('keydown', keyBlock, true);
  }, []);

  // ── Block copy/paste/right-click ──
  useEffect(() => {
    const noop = (e: Event) => e.preventDefault();
    document.addEventListener('copy',        noop);
    document.addEventListener('cut',         noop);
    document.addEventListener('paste',       noop);
    document.addEventListener('contextmenu', noop);
    return () => {
      document.removeEventListener('copy',        noop);
      document.removeEventListener('cut',         noop);
      document.removeEventListener('paste',       noop);
      document.removeEventListener('contextmenu', noop);
    };
  }, []);

  // ── Disable text selection ──
  useEffect(() => {
    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    return () => {
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
    };
  }, []);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isFullscreenActive()) exitFullscreen().catch(() => {});
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
    };
  }, []);

  // ── Countdown timer ──
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current!); };
  }, []); // eslint-disable-line

  // ── Answer selection + feedback ──
  const selectAnswer = useCallback((questionId: string, optionIndex: number) => {
    if (feedback.visible) return; // already answered this question
    const q = questions.find(q => q.id === questionId);
    if (!q) return;

    const newAnswers = { ...answersRef.current, [questionId]: optionIndex };
    setAnswers(newAnswers);

    // Determine correctness
    let isCorrect = false;
    let correctLetter = letters[0];

    if (q.correctOption !== undefined && q.correctOption !== null) {
      isCorrect = optionIndex === q.correctOption;
      correctLetter = letters[q.correctOption] ?? 'A';
    }
    // If no correctOption from backend, we still show feedback without revealing answer
    setFeedback({ visible: true, isCorrect, correctLetter });
  }, [questions, current, total, feedback.visible, letters]); // eslint-disable-line

  const handleFeedbackNext = useCallback(() => {
    setFeedback({ visible: false, isCorrect: false, correctLetter: '' });
    if (current < total - 1) {
      setCurrent(c => c + 1);
    } else {
      handleSubmit(false);
    }
  }, [current, total, handleSubmit]);

  // Warning dismiss re-enters fullscreen
  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    forceFullscreen();
  }, [forceFullscreen]);

  if (showFSPrompt) return <FullscreenPrompt onEnter={enterFullscreen} />;

  const q        = questions[current];
  const answered = Object.keys(answers).length;
  const progress = Math.round((answered / total) * 100);
  const timeWarn = timeLeft < 120;
  const selectedOpt = answers[q.id];
  const hasFeedback = feedback.visible;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-50 overflow-hidden"
      style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Feedback overlay */}
      {hasFeedback && (
        <AnswerFeedback
          isCorrect={feedback.isCorrect}
          correctLetter={feedback.correctLetter}
          onNext={handleFeedbackNext}
          isLast={current === total - 1}
        />
      )}

      {showWarning && (
        <WarningOverlay
          count={warnings}
          onDismiss={dismissWarning}
          onSubmit={() => { setShowWarning(false); handleSubmit(); }}
        />
      )}

      {/* Question navigator */}
      {showNav && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center"
          style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowNav(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-black text-slate-800">Jump to Question</span>
              <button onClick={() => setShowNav(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {questions.map((question, idx) => {
                const isAns     = answers[question.id] !== undefined;
                const isFlag    = flagged.has(question.id);
                const isCurrent = idx === current;
                return (
                  <button key={question.id} onClick={() => {
                    if (!hasFeedback) { setCurrent(idx); setShowNav(false); }
                  }}
                    className={`w-11 h-11 rounded-lg text-[12px] font-bold transition-all ${
                      isCurrent ? 'text-white ring-2 ring-offset-1 ring-blue-500'
                      : isAns   ? 'text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    } ${isFlag ? 'ring-2 ring-amber-400' : ''}`}
                    style={isAns && !isCurrent ? { background: '#2563EB' } : isCurrent ? { background: '#1E3A5F' } : {}}>
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5 pt-3 border-t border-slate-100">
              {[
                { bg: '#2563EB', label: 'Answered'   },
                { bg: '#1E3A5F', label: 'Current'    },
                { bg: '#F59E0B', label: 'Flagged'    },
                { bg: '#E2E8F0', label: 'Unanswered' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: l.bg }} />{l.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {warnings > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[11px] font-bold shrink-0">
              <i className="fa-solid fa-triangle-exclamation text-[10px]" />
              {warnings}/{MAX_WARNINGS} violations
            </div>
          )}
          <div className="min-w-0">
            <div className="text-slate-900 font-bold text-[13px] leading-none truncate">{quiz.title}</div>
            <div className="text-slate-400 text-[10px] mt-0.5 truncate">{quiz.course.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#2563EB,#0F766E)' }} />
            </div>
            <span className="text-[11px] font-semibold text-slate-500">{answered}/{total}</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[14px] tabular-nums ${
            timeWarn ? 'text-red-600 bg-red-50 animate-pulse' : 'text-slate-800 bg-slate-100'
          }`}>
            <i className={`fa-solid fa-clock text-[11px] ${timeWarn ? 'text-red-500' : 'text-slate-400'}`} />
            {fmt(timeLeft)}
          </div>
          <button onClick={() => setShowNav(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
            <i className="fa-solid fa-table-cells text-[11px]" />
            <span className="hidden sm:inline">Questions</span>
          </button>
          <button onClick={() => handleSubmit()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#0F766E,#2563EB)' }}>
            <i className="fa-solid fa-paper-plane text-[10px]" />
            <span className="hidden sm:inline">Submit</span>
          </button>
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-xl">
          <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${hasFeedback ? 'opacity-60 pointer-events-none' : 'border-slate-200'}`}>

            {/* Question header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[12px] font-black"
                  style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                  {current + 1}
                </span>
                <span className="text-slate-400 text-[12px] font-semibold">
                  of {total} · {q.points} mark{q.points !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => !hasFeedback && setFlagged(prev => {
                  const n = new Set(prev);
                  n.has(q.id) ? n.delete(q.id) : n.add(q.id);
                  return n;
                })}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[12px] ${
                  flagged.has(q.id) ? 'text-amber-600 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                }`} title="Flag for review">
                <i className="fa-solid fa-flag" />
              </button>
            </div>

            {/* Question body */}
            <div className="px-6 py-5">
              <p className="text-slate-800 font-semibold text-[15px] leading-relaxed mb-5 select-none">
                {q.text}
              </p>
              {q.imageUrl && (
                <img src={q.imageUrl} alt="" draggable={false}
                  className="mb-5 max-h-48 rounded-xl object-contain border border-slate-200 pointer-events-none" />
              )}
              <div className="space-y-2.5">
                {q.options.map((opt, oi) => {
                  const chosen  = selectedOpt === oi;
                  // After feedback, show correct/wrong coloring if correctOption is known
                  const isCorrectOpt = q.correctOption !== undefined && q.correctOption === oi;
                  const isWrongChosen = hasFeedback && chosen && !isCorrectOpt;
                  const isCorrectHighlight = hasFeedback && isCorrectOpt;

                  let borderColor = 'border-slate-200';
                  let bgColor     = 'bg-white';
                  let textColor   = 'text-slate-700';
                  let badgeBg     = 'bg-slate-100';
                  let badgeText   = 'text-slate-500';

                  if (!hasFeedback && chosen) {
                    borderColor = 'border-blue-500';
                    bgColor     = 'bg-blue-50';
                    textColor   = 'text-blue-800';
                    badgeBg     = 'bg-blue-600';
                    badgeText   = 'text-white';
                  } else if (hasFeedback && isCorrectHighlight && q.correctOption !== undefined) {
                    borderColor = 'border-green-500';
                    bgColor     = 'bg-green-50';
                    textColor   = 'text-green-800';
                    badgeBg     = 'bg-green-500';
                    badgeText   = 'text-white';
                  } else if (hasFeedback && isWrongChosen) {
                    borderColor = 'border-red-400';
                    bgColor     = 'bg-red-50';
                    textColor   = 'text-red-700';
                    badgeBg     = 'bg-red-500';
                    badgeText   = 'text-white';
                  }

                  return (
                    <button key={opt.id ?? oi}
                      onClick={() => !hasFeedback && selectAnswer(q.id, oi)}
                      disabled={hasFeedback}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all select-none ${borderColor} ${bgColor}`}>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 transition-all ${badgeBg} ${badgeText}`}>
                        {letters[oi]}
                      </span>
                      <span className={`text-[13px] font-medium transition-colors flex-1 ${textColor}`}>{opt.text}</span>
                      {opt.imageUrl && (
                        <img src={opt.imageUrl} alt="" draggable={false}
                          className="h-10 rounded-lg object-cover border border-slate-200 pointer-events-none" />
                      )}
                      {!hasFeedback && chosen && <i className="fa-solid fa-circle-check text-blue-500 ml-auto text-sm shrink-0" />}
                      {hasFeedback && isCorrectHighlight && q.correctOption !== undefined && (
                        <i className="fa-solid fa-circle-check text-green-500 ml-auto text-sm shrink-0" />
                      )}
                      {hasFeedback && isWrongChosen && (
                        <i className="fa-solid fa-circle-xmark text-red-500 ml-auto text-sm shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Prompt to select if not yet answered */}
              {selectedOpt === undefined && !hasFeedback && (
                <p className="text-center text-slate-400 text-[11px] font-medium mt-4">
                  Select an answer to continue
                </p>
              )}
            </div>

            {/* Nav footer — only show Prev, no Next (answers auto-advance) */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button onClick={() => !hasFeedback && current > 0 && setCurrent(c => c - 1)}
                disabled={current === 0 || hasFeedback}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-white transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                <i className="fa-solid fa-arrow-left text-xs" /> Prev
              </button>

              <div className="flex gap-1 max-w-[180px] overflow-hidden">
                {questions.slice(Math.max(0, current - 3), current + 4).map((_, relIdx) => {
                  const absIdx = Math.max(0, current - 3) + relIdx;
                  return (
                    <button key={absIdx} onClick={() => !hasFeedback && setCurrent(absIdx)}
                      className={`h-2 rounded-full transition-all ${
                        absIdx === current                                       ? 'bg-blue-600 w-5'
                        : answers[questions[absIdx]?.id] !== undefined ? 'bg-blue-300 w-2'
                        : 'bg-slate-200 w-2'
                      }`} />
                  );
                })}
              </div>

              {/* Right side: Submit all button (manual early submit) */}
              <button onClick={() => !hasFeedback && handleSubmit()}
                disabled={hasFeedback}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#0F766E,#2563EB)' }}>
                <i className="fa-solid fa-paper-plane text-xs" /> Submit All
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 font-medium px-1 select-none">
            <span><span className="text-blue-600 font-bold">{answered}</span> answered</span>
            <span><span className="text-amber-500 font-bold">{flagged.size}</span> flagged</span>
            <span><span className="text-slate-500 font-bold">{total - answered}</span> remaining</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({ quiz, result, onClose }: { quiz: Quiz; result: QuizResult; onClose: () => void }) {
  const pass    = result.passed ?? result.percentage >= 50;
  const timeFmt = result.timeTaken < 3600
    ? `${Math.floor(result.timeTaken / 60)}m ${result.timeTaken % 60}s`
    : `${Math.floor(result.timeTaken / 3600)}h ${Math.floor((result.timeTaken % 3600) / 60)}m`;

  return (
    <Modal wide>
      <div className="px-6 py-7 rounded-t-2xl text-center relative overflow-hidden"
        style={{ background: pass ? 'linear-gradient(135deg,#0F2040,#0F766E)' : 'linear-gradient(135deg,#0F2040,#DC2626)' }}>
        <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative z-10">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${pass ? 'bg-teal-500/20' : 'bg-red-500/20'}`}>
            <i className={`fa-solid ${pass ? 'fa-trophy text-yellow-300' : 'fa-circle-xmark text-red-300'} text-2xl`} />
          </div>
          <div className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${pass ? 'text-teal-300' : 'text-red-300'}`}>
            {pass ? 'Passed' : 'Failed'}
          </div>
          <h2 className="text-white font-black text-2xl">{Math.round(result.percentage)}%</h2>
          <p className="text-white/60 text-[12px] mt-1">{result.score} / {result.totalMarks} marks</p>
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { icon: 'fa-circle-check', label: 'Correct', value: result.correct, color: '#0F766E', bg: '#F0FDF4' },
            { icon: 'fa-circle-xmark', label: 'Wrong',   value: result.wrong,   color: '#DC2626', bg: '#FEF2F2' },
            { icon: 'fa-circle-minus', label: 'Skipped', value: result.skipped, color: '#B45309', bg: '#FEF3C7' },
          ].map(s => (
            <div key={s.label} className="rounded-xl py-3 text-center" style={{ background: s.bg }}>
              <i className={`fa-solid ${s.icon} mb-1 block`} style={{ color: s.color }} />
              <div className="font-black text-xl leading-none" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: s.color }}>{s.label}</div>
            </div>
          ))}
        </div>

        {result.timeTaken > 0 && (
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between mb-5">
            <div className="flex items-center gap-1.5 text-slate-500 text-[12px]">
              <i className="fa-solid fa-clock text-[11px]" /> Time taken:
              <span className="font-bold text-slate-700 ml-1">{timeFmt}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-[12px]">
              <i className="fa-solid fa-bullseye text-[11px]" /> Accuracy:
              <span className="font-bold text-slate-700 ml-1">
                {result.correct + result.wrong > 0
                  ? Math.round((result.correct / (result.correct + result.wrong)) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        )}

        <div className="mb-5">
          <div className="flex justify-between text-[11px] font-semibold text-slate-400 mb-1.5">
            <span>Score</span><span>{Math.round(result.percentage)}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, result.percentage)}%`, background: pass ? 'linear-gradient(90deg,#2563EB,#0F766E)' : '#EF4444' }} />
          </div>
        </div>

        <button onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold rounded-lg text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
          <i className="fa-solid fa-arrow-left text-xs" /> Back to Quizzes
        </button>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Screen = 'list' | 'taking' | 'results';

export default function QuizPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted]         = useState(false);
  const [quizzesData, setQuizzesData] = useState<QuizzesData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const fetchedForUserId              = useRef<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | QuizStatus>('all');
  const [activeCourse, setActiveCourse] = useState<string>('all');
  const [searchQuery, setSearchQuery]   = useState('');

  const [screen, setScreen]             = useState<Screen>('list');
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [showDetail, setShowDetail]     = useState(false);
  const [questions, setQuestions]       = useState<Question[]>([]);
  const [loadingQs, setLoadingQs]       = useState(false);
  const [result, setResult]             = useState<QuizResult | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const startTime                       = useRef<number>(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'TEACHER' || user.role === 'ADMIN') { router.replace('/teacher/dashboard'); return; }
    if (fetchedForUserId.current === user.id) return;
    fetchedForUserId.current = user.id;

    (async () => {
      setLoadingData(true); setError(null);
      try {
        const res: any = await (api as any).getQuizzes();
        const raw = res?.data?.data ?? res?.data ?? null;
        let rawQuizzes: any[] = [];
        let summary: QuizSummary | null = null;

        if (Array.isArray(raw)) {
          rawQuizzes = raw;
        } else if (raw?.quizzes) {
          rawQuizzes = raw.quizzes;
          summary    = raw.summary ?? null;
        } else if (raw?.data) {
          rawQuizzes = Array.isArray(raw.data) ? raw.data : raw.data?.quizzes ?? [];
          summary    = raw.data?.summary ?? null;
        }

        const normalized = rawQuizzes.map(normalizeQuiz);
        const derivedSummary: QuizSummary = summary ?? {
          total:     normalized.length,
          available: normalized.filter(q => q.status === 'available').length,
          attempted: normalized.filter(q => q.status === 'attempted').length,
          upcoming:  normalized.filter(q => q.status === 'upcoming').length,
          missed:    normalized.filter(q => q.status === 'missed').length,
          avgScore:  0,
        };

        setQuizzesData({ summary: derivedSummary, quizzes: normalized });
      } catch (err: any) {
        setError(err.message || 'Failed to load quizzes');
        fetchedForUserId.current = null;
      } finally { setLoadingData(false); }
    })();
  }, [mounted, user, authLoading, router]);

  if (!mounted || authLoading) return <FullPageSpinner />;
  if (!user || user.role === 'TEACHER' || user.role === 'ADMIN') return null;

  const summary = quizzesData?.summary;
  const quizzes = quizzesData?.quizzes ?? [];

  const courseSet = new Map<string, string>();
  quizzes.forEach(q => q.course && courseSet.set(q.course.id, q.course.title));
  const courseOptions = [{ id: 'all', title: 'All Courses' }, ...Array.from(courseSet, ([id, title]) => ({ id, title }))];

  const filtered = quizzes.filter(q => {
    const statusOk = activeFilter === 'all' || q.status === activeFilter;
    const courseOk = activeCourse === 'all' || q.course?.id === activeCourse;
    const searchOk = !searchQuery
      || q.title.toLowerCase().includes(searchQuery.toLowerCase())
      || q.course?.title.toLowerCase().includes(searchQuery.toLowerCase());
    return statusOk && courseOk && searchOk;
  });

  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = (user?.name || '').split(' ')[0] || 'there';

  const STATS = [
    { label: 'Total Quizzes', value: summary?.total     ?? '—', icon: 'fa-circle-question', accent: '#1E3A5F', light: '#EFF6FF', sub: 'This term'          },
    { label: 'Available',     value: summary?.available ?? '—', icon: 'fa-circle-play',     accent: '#0F766E', light: '#F0FDF4', sub: 'Ready to attempt'   },
    { label: 'Attempted',     value: summary?.attempted ?? '—', icon: 'fa-circle-check',    accent: '#2563EB', light: '#EFF6FF', sub: 'Completed'           },
    { label: 'Avg Score',     value: `${summary?.avgScore ?? '—'}%`, icon: 'fa-chart-simple', accent: '#6D28D9', light: '#F5F3FF', sub: 'Across all quizzes' },
  ];

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const openDetail = (q: Quiz) => { setSelectedQuiz(q); setShowDetail(true); };

  const startQuiz = async () => {
    if (!selectedQuiz) return;
    setShowDetail(false);
    setLoadingQs(true);
    try {
      const res: any = await (api as any).getStudentQuestions(selectedQuiz.id);
      const rawQs: any[] = res?.data?.data?.questions ?? res?.data?.questions ?? res?.data ?? [];
      const shaped: Question[] = rawQs.map((q: any, idx: number) => ({
        id:            q.id,
        text:          q.text,
        imageUrl:      q.imageUrl ?? null,
        points:        q.points ?? 1,
        order:         q.order  ?? idx,
        correctOption: q.correctOption ?? q.correct_option ?? undefined,
        options: Array.isArray(q.options)
          ? q.options.map((o: any, oi: number) => ({
              id:       String(oi),
              text:     typeof o === 'string' ? o : (o.text ?? ''),
              imageUrl: typeof o === 'string' ? null : (o.imageUrl ?? null),
            }))
          : [],
      }));
      setQuestions(shaped);
      startTime.current = Date.now();
      setScreen('taking');
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
    } finally { setLoadingQs(false); }
  };

  const submitQuiz = async (answers: Record<string, number>) => {
    if (!selectedQuiz) return;
    const timeTaken    = Math.round((Date.now() - startTime.current) / 1000);
    const answersArray = Object.entries(answers).map(([questionId, selectedOption]) => ({ questionId, selectedOption }));

    try {
      const res: any = await (api as any).submitQuiz(selectedQuiz.id, answersArray);
      const raw       = res?.data?.data ?? res?.data ?? {};
      const attempt   = raw?.attempt ?? raw;
      const scorePercent = raw?.score ?? attempt?.score ?? 0;
      const totalPoints  = questions.reduce((s, q) => s + q.points, 0);
      const scoreRaw     = Math.round((scorePercent / 100) * totalPoints);
      const skippedCount = questions.length - answersArray.length;
      const correctCount = Math.round((scorePercent / 100) * answersArray.length);

      const quizResult: QuizResult = {
        score:      scoreRaw,
        totalMarks: totalPoints,
        percentage: typeof scorePercent === 'number' ? scorePercent : parseFloat(scorePercent) || 0,
        correct:    correctCount,
        wrong:      answersArray.length - correctCount,
        skipped:    skippedCount,
        timeTaken,
        passed:     raw?.passed ?? attempt?.passed ?? scorePercent >= 50,
      };

      setResult(quizResult);
      setScreen('results');

      setQuizzesData(prev => prev ? {
        ...prev,
        summary: {
          ...prev.summary,
          attempted: (prev.summary.attempted ?? 0) + 1,
          available: Math.max(0, (prev.summary.available ?? 1) - 1),
          avgScore:  Math.round(
            ((prev.summary.avgScore ?? 0) * (prev.summary.attempted ?? 0) + quizResult.percentage)
            / ((prev.summary.attempted ?? 0) + 1)
          ),
        },
        quizzes: prev.quizzes.map(q =>
          q.id === selectedQuiz.id
            ? { ...q, status: 'attempted' as QuizStatus, attempts: q.attempts + 1, lastScore: Math.round(quizResult.percentage), lastAttemptAt: new Date().toISOString() }
            : q
        ),
      } : prev);

      flash('Quiz submitted!');
    } catch (err: any) {
      setError(err.message || 'Failed to submit quiz');
      setScreen('list');
    }
  };

  const closeResults = () => { setScreen('list'); setResult(null); setSelectedQuiz(null); };

  return (
    <>
      <FontAwesomeLoader />

      {loadingQs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(15,32,64,0.6)', backdropFilter: 'blur(3px)' }}>
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-2xl">
            <div className="w-10 h-10 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
            <p className="text-slate-700 font-semibold text-[13px]">Loading questions…</p>
          </div>
        </div>
      )}

      {showDetail && selectedQuiz && (
        <QuizDetailModal quiz={selectedQuiz} onClose={() => setShowDetail(false)} onStart={startQuiz} />
      )}

      {screen === 'taking' && selectedQuiz && questions.length > 0 && (
        <QuizTaker quiz={selectedQuiz} questions={questions} onSubmit={submitQuiz} />
      )}

      {screen === 'results' && selectedQuiz && result && (
        <ResultsScreen quiz={selectedQuiz} result={result} onClose={closeResults} />
      )}

      {successMsg && (
        <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-4 py-3 bg-white border border-green-200 rounded-xl shadow-lg text-green-700 text-[13px] font-semibold"
          style={{ animation: 'fadeSlideUp 0.3s ease' }}>
          <i className="fa-solid fa-circle-check text-green-500" />{successMsg}
        </div>
      )}

      {screen === 'list' && (
        <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
          <Sidebar activeItem="Quiz" />

          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div>
                <div className="text-slate-900 font-bold text-[15px]">{greeting}, {displayName}</div>
                <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <a href="/dashboard" className="flex items-center gap-1.5 text-slate-500 text-[13px] font-semibold hover:text-blue-700 transition-colors">
                <i className="fa-solid fa-arrow-left text-xs" /> Dashboard
              </a>
            </header>

            {error && (
              <div className="mx-8 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation" />{error}
                <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

              {/* Hero */}
              <div className="relative rounded-xl overflow-hidden px-8 py-6"
                style={{ background: 'linear-gradient(135deg,#0F2040 0%,#1E3A5F 50%,#1D4ED8 100%)' }}>
                <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
                <div className="absolute -right-4 -bottom-12 w-36 h-36 rounded-full bg-white/5" />
                <div className="relative z-10 flex items-center justify-between">
                  <div>
                    <div className="text-blue-300 text-[11px] font-bold uppercase tracking-widest mb-2">Quizzes</div>
                    <h2 className="text-white text-2xl font-black tracking-tight">Your Quiz Dashboard</h2>
                    <p className="text-blue-200 text-sm mt-1.5 max-w-sm">
                      {summary?.available ?? 0} quiz{(summary?.available ?? 0) !== 1 ? 'zes' : ''} available · avg score {summary?.avgScore ?? 0}%
                    </p>
                  </div>
                  <div className="hidden lg:flex items-center gap-5">
                    {[
                      { v: String(summary?.total  ?? '—'), l: 'Total\nQuizzes'  },
                      { v: String(summary?.missed ?? '—'), l: 'Missed\nQuizzes' },
                      { v: `${summary?.avgScore ?? '—'}%`, l: 'Average\nScore'  },
                    ].map(s => (
                      <div key={s.l} className="text-center px-5 border-l border-white/10 first:border-l-0">
                        <div className="text-white text-3xl font-black">{s.v}</div>
                        <div className="text-blue-300 text-[11px] font-semibold mt-1 whitespace-pre-line leading-tight tracking-wide">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {STATS.map(s => <StatCard key={s.label} {...s} />)}
              </div>

              {/* Quiz list */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-5 border-b border-slate-100 gap-3">
                  <div>
                    <div className="text-slate-900 font-bold text-[14px]">All Quizzes</div>
                    <div className="text-slate-400 text-xs mt-0.5">Click a quiz to view details or start</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative">
                      <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[11px]" />
                      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search…"
                        className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all w-36" />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(['all','available','attempted','upcoming','missed'] as const).map(f => (
                        <button key={f} onClick={() => setActiveFilter(f)}
                          className={`px-3 py-1.5 text-[11px] font-semibold rounded capitalize transition-all ${
                            activeFilter === f
                              ? 'bg-blue-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-blue-700 hover:text-white hover:border-blue-700'
                          }`}>{f}</button>
                      ))}
                    </div>
                    <select value={activeCourse} onChange={e => setActiveCourse(e.target.value)}
                      className="text-[12px] border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                      {courseOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {loadingData
                    ? [0,1,2,3].map(i => <SkeletonRow key={i} />)
                    : filtered.length === 0
                      ? (
                        <div className="px-6 py-14 text-center">
                          <i className="fa-solid fa-circle-question text-3xl text-slate-200 mb-3 block" />
                          <p className="text-slate-400 text-sm">No quizzes match your filters.</p>
                        </div>
                      )
                      : filtered.map((q, i) => {
                          const meta     = STATUS_META[q.status];
                          const due      = new Date(q.dueDate);
                          const color    = ACCENT_COLORS[i % ACCENT_COLORS.length];
                          const canStart = q.status === 'available' && q.attempts < q.maxAttempts;

                          return (
                            <div key={q.id} onClick={() => openDetail(q)}
                              className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer group">
                              <div className="w-10 text-center shrink-0">
                                <div className={`text-[13px] font-black leading-none ${q.status === 'missed' ? 'text-red-500' : 'text-slate-800'}`}>
                                  {due.getDate()}
                                </div>
                                <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wide mt-0.5">
                                  {MONTH_NAMES[due.getMonth()]}
                                </div>
                              </div>
                              <div className="w-px h-8 bg-slate-100 shrink-0" />
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0"
                                style={{ background: color }}>
                                {q.course?.title?.slice(0, 2).toUpperCase() ?? '??'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-slate-800 text-[13px] font-semibold truncate group-hover:text-blue-700 transition-colors">{q.title}</div>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-slate-400 text-[11px]">{q.course?.title}</span>
                                  <span className="text-slate-300 text-[11px]">·</span>
                                  <span className="text-slate-400 text-[11px]"><i className="fa-solid fa-clock text-[9px] mr-1" />{q.duration}m</span>
                                  <span className="text-slate-300 text-[11px]">·</span>
                                  <span className="text-slate-400 text-[11px]"><i className="fa-solid fa-circle-question text-[9px] mr-1" />{q.totalQuestions} Qs</span>
                                </div>
                              </div>
                              {q.lastScore !== undefined && <ScoreRing pct={q.lastScore} size={40} />}
                              <span className="text-[10px] font-bold text-slate-400 hidden sm:block shrink-0">
                                {q.attempts}/{q.maxAttempts}
                              </span>
                              <span className="text-[11px] font-bold px-3 py-1 rounded-full shrink-0 flex items-center gap-1.5"
                                style={{ color: meta.color, background: meta.bg }}>
                                <i className={`fa-solid ${meta.icon} text-[10px]`} />{meta.label}
                              </span>
                              {canStart && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <span className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg text-white"
                                    style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                                    <i className="fa-solid fa-circle-play text-[10px]" /> Start
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                  }
                </div>

                {!loadingData && quizzes.length > 0 && (
                  <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Showing {filtered.length} of {quizzes.length} quizzes
                    </span>
                    <div className="flex gap-3">
                      {(['available','attempted','upcoming','missed'] as const).map(s => {
                        const cnt  = quizzes.filter(q => q.status === s).length;
                        const meta = STATUS_META[s];
                        return (
                          <span key={s} className="text-[11px] font-bold flex items-center gap-1" style={{ color: meta.color }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: meta.dot }} />
                            {cnt} {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}