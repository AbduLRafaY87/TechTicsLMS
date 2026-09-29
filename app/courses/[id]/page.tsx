'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';
import Sidebar from '../../components/Sidebar';
import { api } from '../../../lib/api';
import { cache, TTL } from '../../../lib/cache';
import { CACHE_KEYS, invalidateCourseData, invalidateProgress } from '../../../lib/cachedApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  content?: string;
  videoUrl?: string;
  duration?: number;
  order: number;
  isPublished: boolean;
  isFree?: boolean;
}

interface QuizItem {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  maxAttempts?: number;
  passingScore?: number;
  totalQuestions?: number;
  _count?: { questions: number };
  order: number;
  isPublished?: boolean;
  status?: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  maxPoints?: number;
  maxScore?: number;
  order: number;
}

type CurriculumItemType = 'lesson' | 'quiz' | 'assignment';

interface CurriculumItem {
  id: string;
  type: CurriculumItemType;
  title: string;
  order: number;
  content?: string;
  videoUrl?: string;
  duration?: number;
  isFree?: boolean;
  isPublished?: boolean;
  description?: string;
  maxAttempts?: number;
  passingScore?: number;
  totalQuestions?: number;
  dueDate?: string;
  maxPoints?: number;
}

interface Module {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: Lesson[];
  quizzes?: QuizItem[];
  assignments?: AssignmentItem[];
  items?: CurriculumItem[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  isPublished: boolean;
  teacher: { id: string; name: string; email: string; avatar?: string };
  modules: Module[];
  quizzes?: QuizItem[];
  assignments?: AssignmentItem[];
  _count: { enrollments: number; modules: number; assignments: number };
}

interface ProgressRecord {
  lessonId: string;
  completed: boolean;
}

// ─── Quiz-specific types ──────────────────────────────────────────────────────

interface QuizOption { id: string; text: string; imageUrl?: string | null }

interface QuizQuestion {
  id: string;
  text: string;
  imageUrl?: string | null;
  options: QuizOption[];
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

// ─── Quiz constants ───────────────────────────────────────────────────────────

const MAX_WARNINGS = 3;
const QUIZ_LETTERS = ['A', 'B', 'C', 'D', 'E'];

const fmtTime = (secs: number) => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ─── Cache key helpers ────────────────────────────────────────────────────────

const courseDetailCacheKey = (id: string) => CACHE_KEYS.courseDetail(id);
const enrollmentsCacheKey  = (userId: string) => CACHE_KEYS.enrollments(userId);
const progressCacheKey     = (userId: string, courseId: string) => CACHE_KEYS.progressCourse(userId, courseId);

// ─── FA Loader ────────────────────────────────────────────────────────────────

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

// ─── Anti-Piracy Hook ─────────────────────────────────────────────────────────

function useAntiPiracy() {
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  useEffect(() => {
    const blockContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', blockContext);

    const style = document.createElement('style');
    style.id = 'anti-piracy-styles';
    style.textContent = `
      .protected-content { -webkit-user-select: none !important; user-select: none !important; }
      .lesson-text        { -webkit-user-select: none !important; user-select: none !important; }
    `;
    document.head.appendChild(style);

    const blockKeys = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'F12') { e.preventDefault(); return false; }
      if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) { e.preventDefault(); return false; }
      if (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) { e.preventDefault(); return false; }
      if (e.ctrlKey && key === 'u') { e.preventDefault(); return false; }
      if (e.ctrlKey && key === 's') { e.preventDefault(); return false; }
      if (e.ctrlKey && (key === 'c' || key === 'a')) { e.preventDefault(); return false; }
      if (e.ctrlKey && key === 'p') { e.preventDefault(); return false; }
    };
    document.addEventListener('keydown', blockKeys, true);

    const blockCopy = (e: ClipboardEvent) => e.preventDefault();
    const blockDrag = (e: DragEvent)      => e.preventDefault();
    document.addEventListener('copy',      blockCopy);
    document.addEventListener('cut',       blockCopy);
    document.addEventListener('dragstart', blockDrag);

    const devToolsCheck = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const elapsed = performance.now() - start;
      if (elapsed > 100) { setDevToolsOpen(true); return; }
      setDevToolsOpen(
        window.outerWidth - window.innerWidth > 160 ||
        window.outerHeight - window.innerHeight > 160
      );
    };
    const devToolsInterval = setInterval(devToolsCheck, 1000);

    const blockPrint   = () => { document.body.style.display = 'none'; };
    const restorePrint = () => { document.body.style.display = '';     };
    window.addEventListener('beforeprint', blockPrint);
    window.addEventListener('afterprint',  restorePrint);

    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown',     blockKeys, true);
      document.removeEventListener('copy',        blockCopy);
      document.removeEventListener('cut',         blockCopy);
      document.removeEventListener('dragstart',   blockDrag);
      window.removeEventListener('beforeprint',   blockPrint);
      window.removeEventListener('afterprint',    restorePrint);
      clearInterval(devToolsInterval);
      document.getElementById('anti-piracy-styles')?.remove();
    };
  }, []);

  return { devToolsOpen };
}

// ─── Fullscreen utilities ─────────────────────────────────────────────────────

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

// ─── Watermarked Video Player ─────────────────────────────────────────────────

function VideoPlayer({ url, userName, userEmail }: { url: string; userName: string; userEmail: string }) {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  const ytId = ytMatch?.[1];

  const [wmPos, setWmPos] = useState({ top: '20%', left: '15%' });
  const [showWm, setShowWm] = useState(true);

  useEffect(() => {
    const randomize = () => {
      setShowWm(false);
      setTimeout(() => {
        setWmPos({ top: `${10 + Math.random() * 70}%`, left: `${5 + Math.random() * 60}%` });
        setShowWm(true);
      }, 200);
    };
    const interval = setInterval(randomize, 8000);
    return () => clearInterval(interval);
  }, []);

  const timestamp = new Date().toLocaleString();

  return (
    <div
      className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl protected-content"
      onContextMenu={e => e.preventDefault()}
    >
      {ytId ? (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
          className="w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-fullscreen"
        />
      ) : (
        <video
          src={url}
          controls
          className="w-full h-full"
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onContextMenu={e => e.preventDefault()}
        />
      )}
      <div className="absolute inset-0 z-10 pointer-events-none" />
      <div
        className="absolute z-20 pointer-events-none select-none transition-opacity duration-300"
        style={{ top: wmPos.top, left: wmPos.left, opacity: showWm ? 1 : 0 }}
      >
        <div style={{ transform: 'rotate(-18deg)' }}>
          <p className="text-white/20 text-[11px] font-bold tracking-widest leading-tight"
             style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{userEmail}</p>
          <p className="text-white/12 text-[9px] font-semibold tracking-wider mt-0.5"
             style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{timestamp}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Dev Tools Warning ────────────────────────────────────────────────────────

function DevToolsWarning() {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center">
      <i className="fa-solid fa-shield-halved text-5xl text-red-400 mb-4" />
      <h2 className="text-white text-xl font-black mb-2">Access Restricted</h2>
      <p className="text-slate-400 text-sm text-center max-w-xs">
        Developer tools are not permitted while viewing course content. Please close them to continue.
      </p>
    </div>
  );
}

// ─── Curriculum Item Row ──────────────────────────────────────────────────────

function CurriculumItemRow({ item, index, isActive, isCompleted, isEnrolled, onClick }: {
  item: CurriculumItem;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isEnrolled: boolean;
  onClick: () => void;
}) {
  const isLesson     = item.type === 'lesson';
  const isQuiz       = item.type === 'quiz';
  const isAssignment = item.type === 'assignment';
  const locked       = isLesson && !isEnrolled && !item.isFree;

  const typeConfig = {
    lesson: {
      icon: item.videoUrl ? 'fa-play' : 'fa-video-slash',
      activeBg: 'bg-blue-700',
      activeText: 'text-white',
      badgeBg: 'bg-blue-50',
      badgeText: 'text-blue-700',
      label: 'Lesson',
    },
    quiz: {
      icon: 'fa-circle-question',
      activeBg: 'bg-purple-700',
      activeText: 'text-white',
      badgeBg: 'bg-purple-50',
      badgeText: 'text-purple-700',
      label: 'Quiz',
    },
    assignment: {
      icon: 'fa-clipboard-list',
      activeBg: 'bg-amber-600',
      activeText: 'text-white',
      badgeBg: 'bg-amber-50',
      badgeText: 'text-amber-700',
      label: 'Assignment',
    },
  }[item.type];

  const baseClasses = `w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all group`;
  let stateClasses = '';
  if (isActive) {
    stateClasses = `${typeConfig.activeBg} ${typeConfig.activeText} shadow-sm`;
  } else if (locked) {
    stateClasses = 'opacity-50 cursor-not-allowed';
  } else {
    stateClasses = 'hover:bg-slate-100 text-slate-700 cursor-pointer';
  }

  return (
    <button
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={`${baseClasses} ${stateClasses}`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
        isActive
          ? 'bg-white/20 text-white'
          : isCompleted && isLesson
            ? 'bg-emerald-100 text-emerald-700'
            : isLesson
              ? 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
              : `${typeConfig.badgeBg} ${typeConfig.badgeText}`
      }`}>
        {isCompleted && isLesson && !isActive
          ? <i className="fa-solid fa-check text-[10px]" />
          : <i className={`fa-solid ${typeConfig.icon} text-[10px]`} />
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-slate-800'}`}>
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
            isActive ? 'bg-white/20 text-white' : `${typeConfig.badgeBg} ${typeConfig.badgeText}`
          }`}>
            {typeConfig.label}
          </span>
          {isLesson && item.duration != null && item.duration > 0 && (
            <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
              {item.duration} min
            </span>
          )}
          {isLesson && item.isFree && !isEnrolled && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Free</span>
          )}
          {isQuiz && item.totalQuestions != null && (
            <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
              {item.totalQuestions} Qs
            </span>
          )}
          {isQuiz && item.duration != null && item.duration > 0 && (
            <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
              {item.duration}m
            </span>
          )}
          {isAssignment && item.maxPoints != null && (
            <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
              {item.maxPoints} pts
            </span>
          )}
          {isAssignment && item.dueDate && (
            <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
              Due {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {locked && <i className="fa-solid fa-lock text-[10px] text-slate-400 shrink-0" />}
    </button>
  );
}

// ─── Assignment Info Panel ────────────────────────────────────────────────────

function AssignmentInfoPanel({ item, isEnrolled }: { item: CurriculumItem; isEnrolled: boolean }) {
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const now = new Date();
  const diffDays = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const dueMeta = diffDays === null ? null
    : diffDays < 0  ? { label: `${Math.abs(diffDays)} days overdue`, color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    : diffDays === 0 ? { label: 'Due today', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' }
    : { label: `Due in ${diffDays} days`, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };

  return (
    <div className="p-5 lg:p-8 max-w-2xl mx-auto w-full space-y-5">
      <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #78350f 0%, #b45309 100%)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-clipboard-list text-white text-xl" />
            </div>
            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-widest">Assignment</span>
          </div>
          <h1 className="text-white text-xl font-black tracking-tight">{item.title}</h1>
          {item.description && <p className="text-amber-200 text-sm mt-1.5">{item.description}</p>}
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            {dueDate && (
              <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl ${dueMeta?.bg ?? 'bg-slate-50 border-slate-200'}`}>
                <i className={`fa-solid fa-calendar-days text-sm ${dueMeta?.color ?? 'text-slate-500'}`} />
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Due Date</div>
                  <div className={`text-[13px] font-bold ${dueMeta?.color ?? 'text-slate-800'}`}>
                    {dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {dueMeta && <span className="ml-2 text-[11px] font-medium opacity-75">{dueMeta.label}</span>}
                  </div>
                </div>
              </div>
            )}
            {item.maxPoints != null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                <i className="fa-solid fa-award text-amber-500 text-sm" />
                <div>
                  <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-widest">Points</div>
                  <div className="text-[13px] font-bold text-amber-800">{item.maxPoints}</div>
                </div>
              </div>
            )}
          </div>
          {item.description && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Instructions</div>
              <p className="text-slate-700 text-[14px] leading-relaxed whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
          {isEnrolled ? (
            <a href="/assignment"
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-xl text-white shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #78350f, #b45309)' }}>
              <i className="fa-solid fa-paper-plane text-base" />
              Go to Assignments
            </a>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500">
              <i className="fa-solid fa-lock mr-2 text-slate-400" />
              Enroll to submit this assignment
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`fixed bottom-6 right-6 z-[400] flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <i className={`fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
      {msg}
    </div>
  );
}

// ─── Enroll Gate ──────────────────────────────────────────────────────────────

type EnrollStatus = 'enrolled' | 'pending' | 'rejected' | 'none';

function EnrollGate({
  course,
  enrollStatus,
  onEnroll,
  onCancel,
  enrolling,
}: {
  course: Course;
  enrollStatus: EnrollStatus;
  onEnroll: () => void;
  onCancel: () => void;
  enrolling: boolean;
}) {
  if (enrollStatus === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
          <i className="fa-solid fa-clock text-2xl text-amber-500" />
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-2">Enrollment Request Pending</h3>
        <p className="text-slate-500 text-sm max-w-sm mb-6">
          Your request to join this course has been submitted and is currently awaiting administrator review.
        </p>
        <button
          onClick={onCancel}
          disabled={enrolling}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
        >
          {enrolling ? (
            <span className="w-4 h-4 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" />
          ) : (
            <i className="fa-solid fa-times text-sm" />
          )}
          Cancel Request
        </button>
      </div>
    );
  }

  if (enrollStatus === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mb-5">
          <i className="fa-solid fa-times-circle text-2xl text-red-500" />
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-2">Enrollment Request Rejected</h3>
        <p className="text-slate-500 text-sm max-w-sm mb-6">
          Your previous enrollment request was not approved. You can submit another request if needed.
        </p>
        <button
          onClick={onEnroll}
          disabled={enrolling}
          className="flex items-center gap-2 px-6 py-3 bg-blue-700 text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-60"
        >
          {enrolling ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <i className="fa-solid fa-rotate-right text-sm" />
          )}
          Request Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-5">
        <i className="fa-solid fa-lock text-2xl text-blue-400" />
      </div>
      <h3 className="text-lg font-black text-slate-800 mb-2">Enroll to access this course</h3>
      <p className="text-slate-400 text-sm max-w-xs mb-6">
        You need to be enrolled to watch lessons, take quizzes, and submit assignments.
      </p>
      <button
        onClick={onEnroll}
        disabled={enrolling}
        className="flex items-center gap-2 px-6 py-3 bg-blue-700 text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-colors shadow-sm disabled:opacity-60"
      >
        {enrolling ? (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <i className="fa-solid fa-graduation-cap text-sm" />
        )}
        Enroll Now - It's Free
      </button>
    </div>
  );
}

// ─── No Content Panel (enrolled, but course has nothing published yet) ────────

function NoContentPanel({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5">
        <i className="fa-solid fa-circle-check text-2xl text-emerald-500" />
      </div>
      <h3 className="text-lg font-black text-slate-800 mb-2">You're enrolled in this course</h3>
      <p className="text-slate-400 text-sm max-w-sm mb-6">
        Your teacher hasn't published any lessons, quizzes, or assignments yet. Check back soon —
        content will appear here as soon as it's added.
      </p>
      <button onClick={onRefresh} disabled={refreshing}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-60">
        {refreshing
          ? <span className="w-4 h-4 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />
          : <i className="fa-solid fa-rotate-right text-sm" />}
        {refreshing ? 'Checking...' : 'Refresh'}
      </button>
    </div>
  );
}

// ─── Helper: build unified curriculum items from module ───────────────────────

function buildCurriculumItems(module: Module): CurriculumItem[] {
  const lessons: CurriculumItem[] = (module.lessons ?? []).map(l => ({
    id: l.id, type: 'lesson' as CurriculumItemType, title: l.title, order: l.order ?? 0,
    content: l.content, videoUrl: l.videoUrl, duration: l.duration, isFree: l.isFree, isPublished: l.isPublished,
  }));
  const quizzes: CurriculumItem[] = (module.quizzes ?? []).map((q, qi) => ({
    id: q.id, type: 'quiz' as CurriculumItemType, title: q.title, order: q.order ?? (lessons.length + qi),
    description: q.description, duration: q.duration, maxAttempts: q.maxAttempts,
    passingScore: q.passingScore, totalQuestions: q.totalQuestions ?? q._count?.questions,
  }));
  const assignments: CurriculumItem[] = (module.assignments ?? []).map((a, ai) => ({
    id: a.id, type: 'assignment' as CurriculumItemType, title: a.title,
    order: a.order ?? (lessons.length + quizzes.length + ai),
    description: a.description, dueDate: a.dueDate, maxPoints: a.maxPoints ?? a.maxScore,
  }));
  return [...lessons, ...quizzes, ...assignments].sort((a, b) => a.order - b.order);
}

function attachCourseItems(
  builtModules: Array<Module & { items: CurriculumItem[] }>,
  courseData: Course,
): Array<Module & { items: CurriculumItem[] }> {
  const courseQuizzes: CurriculumItem[] = (courseData.quizzes ?? []).map((q, i) => ({
    id: q.id, type: 'quiz' as CurriculumItemType, title: q.title, order: 9000 + i,
    description: q.description, duration: q.duration, maxAttempts: q.maxAttempts,
    passingScore: q.passingScore, totalQuestions: q.totalQuestions ?? q._count?.questions,
  }));
  const courseAssignments: CurriculumItem[] = (courseData.assignments ?? []).map((a, i) => ({
    id: a.id, type: 'assignment' as CurriculumItemType, title: a.title, order: 9500 + i,
    description: a.description, dueDate: a.dueDate, maxPoints: a.maxPoints ?? a.maxScore,
  }));
  if (!courseQuizzes.length && !courseAssignments.length) return builtModules;
  if (!builtModules.length) return builtModules;
  const result = [...builtModules];
  const last = { ...result[result.length - 1] };
  last.items = [...last.items, ...courseQuizzes, ...courseAssignments].sort((a, b) => a.order - b.order);
  result[result.length - 1] = last;
  return result;
}

function isEnrolledInCourse(enrollments: any[], courseId: string): boolean {
  if (!Array.isArray(enrollments) || !courseId) return false;
  const id = String(courseId);
  return enrollments.some((e: any) => {
    // Check every plausible field that could hold the course ID
    // Deliberately exclude e?.id (that's the enrollment record ID, not the course ID)
    const candidates = [
      e?.course?.id,
      e?.courseId,
      e?.course_id,
      e?.course?.courseId,
    ];
    return candidates.some(c => c !== undefined && c !== null && String(c) === id);
  });
}

// Also detect enrollment from the raw course API response itself
function isCourseEnrolledFromRaw(raw: any, userId: string): boolean {
  // Some APIs return isEnrolled boolean directly
  if (raw?.isEnrolled === true) return true;
  if (raw?.course?.isEnrolled === true) return true;
  // Some return an enrollments array on the course object
  const courseEnrollments: any[] = raw?.enrollments ?? raw?.course?.enrollments ?? [];
  if (Array.isArray(courseEnrollments) && courseEnrollments.length > 0) {
    const uid = String(userId);
    return courseEnrollments.some((e: any) =>
      [e?.userId, e?.user_id, e?.user?.id, e?.studentId].some(u => u !== undefined && String(u) === uid)
    );
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── EMBEDDED QUIZ COMPONENTS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ pct, size = 56 }: { pct: number; size?: number }) {
  const r = size / 2 - 5, circ = 2 * Math.PI * r;
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

// ─── Fullscreen Prompt ────────────────────────────────────────────────────────

function FullscreenPrompt({ quizTitle, onEnter, onCancel }: {
  quizTitle: string; onEnter: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(15,32,64,0.95)', backdropFilter: 'blur(8px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-expand text-blue-600 text-2xl" />
        </div>
        <h2 className="text-base font-black text-slate-800 mb-1">Enter Full-Screen</h2>
        <p className="text-sm text-slate-500 mb-1 font-semibold">{quizTitle}</p>
        <p className="text-sm text-slate-400 mb-5">
          This quiz requires full-screen mode. Exiting full-screen at any point counts as a violation.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={onEnter}
            className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors"
            style={{ background: 'linear-gradient(135deg,#0F2040,#2563EB)' }}>
            <i className="fa-solid fa-expand mr-2 text-xs" />Start Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Warning Overlay ──────────────────────────────────────────────────────────

function WarningOverlay({ count, onDismiss, onSubmit }: {
  count: number; onDismiss: () => void; onSubmit: () => void;
}) {
  const remaining = MAX_WARNINGS - count;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
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

// ─── Answer Feedback Overlay ──────────────────────────────────────────────────

function AnswerFeedback({ isCorrect, correctLetter, onNext, isLast }: {
  isCorrect: boolean; correctLetter: string; onNext: () => void; isLast: boolean;
}) {
  useEffect(() => {
    const t = setTimeout(onNext, 1500);
    return () => clearTimeout(t);
  }, [onNext]);

  return (
    <div className="fixed inset-0 z-[280] flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto rounded-2xl shadow-2xl px-10 py-8 text-center flex flex-col items-center gap-3 max-w-xs w-full mx-4"
        style={{
          background: isCorrect
            ? 'linear-gradient(135deg,#052e16,#0F766E)'
            : 'linear-gradient(135deg,#450a0a,#DC2626)',
          animation: 'quizPopIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
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
        <button onClick={onNext}
          className="mt-1 px-6 py-2 rounded-lg text-[13px] font-semibold bg-white/20 hover:bg-white/30 text-white transition-all">
          {isLast ? 'Submit Quiz' : 'Next Question'} →
        </button>
      </div>
    </div>
  );
}

// ─── Quiz Results Screen (inline) ────────────────────────────────────────────

function QuizResultsScreen({ quizTitle, result, onClose }: {
  quizTitle: string; result: QuizResult; onClose: () => void;
}) {
  const pass    = result.passed ?? result.percentage >= 50;
  const timeFmt = result.timeTaken < 3600
    ? `${Math.floor(result.timeTaken / 60)}m ${result.timeTaken % 60}s`
    : `${Math.floor(result.timeTaken / 3600)}h ${Math.floor((result.timeTaken % 3600) / 60)}m`;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-7 rounded-t-2xl text-center relative overflow-hidden"
          style={{ background: pass ? 'linear-gradient(135deg,#0F2040,#0F766E)' : 'linear-gradient(135deg,#0F2040,#DC2626)' }}>
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="relative z-10">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${pass ? 'bg-teal-500/20' : 'bg-red-500/20'}`}>
              <i className={`fa-solid ${pass ? 'fa-trophy text-yellow-300' : 'fa-circle-xmark text-red-300'} text-2xl`} />
            </div>
            <div className="text-blue-300 text-[10px] font-bold uppercase tracking-widest mb-1">{quizTitle}</div>
            <div className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${pass ? 'text-teal-300' : 'text-red-300'}`}>
              {pass ? 'Passed' : 'Failed'}
            </div>
            <h2 className="text-white font-black text-2xl">{Math.round(result.percentage)}%</h2>
            <p className="text-white/60 text-[12px] mt-1">{result.score} / {result.totalMarks} marks</p>
          </div>
        </div>

        {/* Body */}
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
                <i className="fa-solid fa-clock text-[11px]" /> Time:
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
            <i className="fa-solid fa-arrow-left text-xs" /> Back to Course
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Embedded Quiz Taker ──────────────────────────────────────────────────────
// Renders as a full-screen overlay on top of the course page

function EmbeddedQuizTaker({ quizItem, questions, onSubmit, onCancel }: {
  quizItem: CurriculumItem;
  questions: QuizQuestion[];
  onSubmit: (answers: Record<string, number>) => void;
  onCancel: () => void;
}) {
  const total = questions.length;
  const duration = quizItem.duration ?? 30;

  const [current, setCurrent]           = useState(0);
  const [answers, setAnswers]           = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft]         = useState(duration * 60);
  const [flagged, setFlagged]           = useState<Set<string>>(new Set());
  const [showNav, setShowNav]           = useState(false);
  const [warnings, setWarnings]         = useState(0);
  const [showWarning, setShowWarning]   = useState(false);
  const [showFSPrompt, setShowFSPrompt] = useState(true);
  const [isInFullscreen, setIsInFullscreen] = useState(false);
  const [feedback, setFeedback]         = useState<{ visible: boolean; isCorrect: boolean; correctLetter: string }>({
    visible: false, isCorrect: false, correctLetter: ''
  });

  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef      = useRef(answers);
  const warningsRef     = useRef(warnings);
  const showFSPromptRef = useRef(true);
  const violationLock   = useRef(false);
  const submitCalled    = useRef(false);

  answersRef.current      = answers;
  warningsRef.current     = warnings;
  showFSPromptRef.current = showFSPrompt;

  // ── Fullscreen entry ──
  const enterFullscreen = useCallback(async () => {
    try { await requestFullscreen(); } catch (_) {}
    setIsInFullscreen(true);
    setShowFSPrompt(false);
  }, []);

  const forceFullscreen = useCallback(() => {
    setTimeout(async () => { try { await requestFullscreen(); } catch (_) {} }, 200);
  }, []);

  // ── Submit ──
  const handleSubmit = useCallback((_auto = false) => {
    if (submitCalled.current) return;
    submitCalled.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (isFullscreenActive()) exitFullscreen().catch(() => {});
    onSubmit(answersRef.current);
  }, [onSubmit]);

  // ── Cancel (back to course) ──
  const handleCancel = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isFullscreenActive()) exitFullscreen().catch(() => {});
    onCancel();
  }, [onCancel]);

  // ── Violation ──
  const handleViolation = useCallback(() => {
    if (showFSPromptRef.current) return;
    if (violationLock.current) return;
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

  // ── Fullscreen change ──
  useEffect(() => {
    const onFSChange = () => {
      const inFS = isFullscreenActive();
      setIsInFullscreen(inFS);
      if (!inFS && !showFSPromptRef.current) { handleViolation(); forceFullscreen(); }
    };
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev =>
      document.addEventListener(ev, onFSChange)
    );
    return () => {
      ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(ev =>
        document.removeEventListener(ev, onFSChange)
      );
    };
  }, [handleViolation, forceFullscreen]);

  // ── Tab visibility ──
  useEffect(() => {
    const onVis = () => { if (document.hidden && !showFSPromptRef.current) handleViolation(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [handleViolation]);

  // ── Key blocking ──
  useEffect(() => {
    const keyBlock = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); return false; }
      const blocked = [
        e.ctrlKey && ['a','c','v','x','p','s','u'].includes(e.key.toLowerCase()),
        e.metaKey && ['a','c','v','x','p','s','u'].includes(e.key.toLowerCase()),
        e.key === 'F12',
        e.ctrlKey && e.shiftKey && ['i','j','c'].includes(e.key.toLowerCase()),
      ];
      if (blocked.some(Boolean)) e.preventDefault();
    };
    document.addEventListener('keydown', keyBlock, true);
    return () => document.removeEventListener('keydown', keyBlock, true);
  }, []);

  // ── Block copy/paste/context ──
  useEffect(() => {
    const noop = (e: Event) => e.preventDefault();
    ['copy','cut','paste','contextmenu'].forEach(ev => document.addEventListener(ev, noop));
    return () => ['copy','cut','paste','contextmenu'].forEach(ev => document.removeEventListener(ev, noop));
  }, []);

  // ── User select ──
  useEffect(() => {
    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    return () => {
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
    };
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (isFullscreenActive()) exitFullscreen().catch(() => {});
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
    };
  }, []);

  // ── Timer ──
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); handleSubmit(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current!); };
  }, []); // eslint-disable-line

  // ── Select answer ──
  const selectAnswer = useCallback((questionId: string, optionIndex: number) => {
    if (feedback.visible) return;
    const q = questions.find(q => q.id === questionId);
    if (!q) return;
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
    const isCorrect    = q.correctOption !== undefined ? optionIndex === q.correctOption : false;
    const correctLetter = q.correctOption !== undefined ? (QUIZ_LETTERS[q.correctOption] ?? 'A') : '';
    setFeedback({ visible: true, isCorrect, correctLetter });
  }, [questions, feedback.visible]);

  const handleFeedbackNext = useCallback(() => {
    setFeedback({ visible: false, isCorrect: false, correctLetter: '' });
    if (current < total - 1) { setCurrent(c => c + 1); }
    else { handleSubmit(false); }
  }, [current, total, handleSubmit]);

  const dismissWarning = useCallback(() => { setShowWarning(false); forceFullscreen(); }, [forceFullscreen]);

  // ─ Show FullscreenPrompt ─
  if (showFSPrompt) {
    return (
      <FullscreenPrompt
        quizTitle={quizItem.title}
        onEnter={enterFullscreen}
        onCancel={handleCancel}
      />
    );
  }

  const q           = questions[current];
  const answered    = Object.keys(answers).length;
  const progress    = Math.round((answered / total) * 100);
  const timeWarn    = timeLeft < 120;
  const selectedOpt = answers[q.id];
  const hasFeedback = feedback.visible;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-50 overflow-hidden"
      style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

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

      {/* Question navigator overlay */}
      {showNav && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center"
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
                const isAns = answers[question.id] !== undefined;
                const isFlag = flagged.has(question.id);
                const isCurrent = idx === current;
                return (
                  <button key={question.id}
                    onClick={() => { if (!hasFeedback) { setCurrent(idx); setShowNav(false); } }}
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
            <div className="text-slate-900 font-bold text-[13px] leading-none truncate">{quizItem.title}</div>
            <div className="text-slate-400 text-[10px] mt-0.5">Quiz</div>
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
            {fmtTime(timeLeft)}
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
                  const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n;
                })}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[12px] ${
                  flagged.has(q.id) ? 'text-amber-600 bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'
                }`}>
                <i className="fa-solid fa-flag" />
              </button>
            </div>

            {/* Question body */}
            <div className="px-6 py-5">
              <p className="text-slate-800 font-semibold text-[15px] leading-relaxed mb-5 select-none">{q.text}</p>
              {q.imageUrl && (
                <img src={q.imageUrl} alt="" draggable={false}
                  className="mb-5 max-h-48 rounded-xl object-contain border border-slate-200 pointer-events-none" />
              )}
              <div className="space-y-2.5">
                {q.options.map((opt, oi) => {
                  const chosen  = selectedOpt === oi;
                  const isCorrectOpt  = q.correctOption !== undefined && q.correctOption === oi;
                  const isWrongChosen = hasFeedback && chosen && !isCorrectOpt;
                  const isCorrectHL   = hasFeedback && isCorrectOpt;

                  let borderColor = 'border-slate-200', bgColor = 'bg-white', textColor = 'text-slate-700';
                  let badgeBg = 'bg-slate-100', badgeText = 'text-slate-500';

                  if (!hasFeedback && chosen) {
                    borderColor = 'border-blue-500'; bgColor = 'bg-blue-50'; textColor = 'text-blue-800';
                    badgeBg = 'bg-blue-600'; badgeText = 'text-white';
                  } else if (hasFeedback && isCorrectHL && q.correctOption !== undefined) {
                    borderColor = 'border-green-500'; bgColor = 'bg-green-50'; textColor = 'text-green-800';
                    badgeBg = 'bg-green-500'; badgeText = 'text-white';
                  } else if (hasFeedback && isWrongChosen) {
                    borderColor = 'border-red-400'; bgColor = 'bg-red-50'; textColor = 'text-red-700';
                    badgeBg = 'bg-red-500'; badgeText = 'text-white';
                  }

                  return (
                    <button key={opt.id ?? oi}
                      onClick={() => !hasFeedback && selectAnswer(q.id, oi)}
                      disabled={hasFeedback}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all select-none ${borderColor} ${bgColor}`}>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${badgeBg} ${badgeText}`}>
                        {QUIZ_LETTERS[oi]}
                      </span>
                      <span className={`text-[13px] font-medium flex-1 ${textColor}`}>{opt.text}</span>
                      {opt.imageUrl && (
                        <img src={opt.imageUrl} alt="" draggable={false}
                          className="h-10 rounded-lg object-cover border border-slate-200 pointer-events-none" />
                      )}
                      {!hasFeedback && chosen && <i className="fa-solid fa-circle-check text-blue-500 ml-auto text-sm shrink-0" />}
                      {hasFeedback && isCorrectHL && q.correctOption !== undefined && <i className="fa-solid fa-circle-check text-green-500 ml-auto text-sm shrink-0" />}
                      {hasFeedback && isWrongChosen && <i className="fa-solid fa-circle-xmark text-red-500 ml-auto text-sm shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {selectedOpt === undefined && !hasFeedback && (
                <p className="text-center text-slate-400 text-[11px] font-medium mt-4">Select an answer to continue</p>
              )}
            </div>

            {/* Footer nav */}
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
                        absIdx === current ? 'bg-blue-600 w-5'
                        : answers[questions[absIdx]?.id] !== undefined ? 'bg-blue-300 w-2'
                        : 'bg-slate-200 w-2'
                      }`} />
                  );
                })}
              </div>

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

// ─── Quiz Info Panel (pre-start) ──────────────────────────────────────────────

function QuizInfoPanel({ item, isEnrolled, onStart }: {
  item: CurriculumItem; isEnrolled: boolean; onStart: () => void;
}) {
  return (
    <div className="p-5 lg:p-8 max-w-2xl mx-auto w-full space-y-5">
      <div className="bg-white rounded-xl border border-purple-200 overflow-hidden shadow-sm">
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #3b0764 0%, #6d28d9 100%)' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-circle-question text-white text-xl" />
            </div>
            <span className="text-[10px] font-bold text-purple-200 uppercase tracking-widest">Quiz</span>
          </div>
          <h1 className="text-white text-xl font-black tracking-tight">{item.title}</h1>
          {item.description && <p className="text-purple-200 text-sm mt-1.5">{item.description}</p>}
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            {item.totalQuestions != null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
                <i className="fa-solid fa-circle-question text-purple-500 text-sm" />
                <div>
                  <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Questions</div>
                  <div className="text-[13px] font-bold text-purple-800">{item.totalQuestions}</div>
                </div>
              </div>
            )}
            {item.duration != null && item.duration > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
                <i className="fa-solid fa-clock text-purple-500 text-sm" />
                <div>
                  <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Duration</div>
                  <div className="text-[13px] font-bold text-purple-800">{item.duration} min</div>
                </div>
              </div>
            )}
            {item.maxAttempts != null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
                <i className="fa-solid fa-rotate-right text-purple-500 text-sm" />
                <div>
                  <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Attempts</div>
                  <div className="text-[13px] font-bold text-purple-800">{item.maxAttempts}</div>
                </div>
              </div>
            )}
            {item.passingScore != null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
                <i className="fa-solid fa-trophy text-purple-500 text-sm" />
                <div>
                  <div className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Pass Mark</div>
                  <div className="text-[13px] font-bold text-purple-800">{item.passingScore}%</div>
                </div>
              </div>
            )}
          </div>

          {/* Security notice */}
          <div className="rounded-xl bg-purple-50 border border-purple-200 p-4">
            <div className="text-purple-700 font-bold text-[12px] mb-2 flex items-center gap-1.5">
              <i className="fa-solid fa-shield-halved text-[11px]" /> Secure Test Mode
            </div>
            <ul className="space-y-1">
              {[
                'The quiz will enter full-screen mode.',
                `Switching tabs or exiting full-screen counts as a violation (${MAX_WARNINGS} = auto-submit).`,
                'Copy, paste, and right-click are disabled.',
                'Each question shows instant feedback before moving on.',
              ].map(t => (
                <li key={t} className="text-purple-600 text-[11px] flex items-start gap-1.5">
                  <i className="fa-solid fa-circle text-[5px] mt-1.5 shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>

          {isEnrolled ? (
            <button onClick={onStart}
              className="flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-xl text-white shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #3b0764, #6d28d9)' }}>
              <i className="fa-solid fa-circle-play text-base" />
              Start Quiz
            </button>
          ) : (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-500">
              <i className="fa-solid fa-lock mr-2 text-slate-400" />
              Enroll to take this quiz
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

type QuizScreen = 'info' | 'taking' | 'results';

export default function StudentCoursePage() {
  useFontAwesome();
  const { devToolsOpen } = useAntiPiracy();

  const { user, loading: authLoading } = useAuth();
  const router   = useRouter();
  const params   = useParams();
  const courseId = params?.id as string;

  const [mounted, setMounted]           = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [course, setCourse]             = useState<Course | null>(null);
  const [modules, setModules]           = useState<Array<Module & { items: CurriculumItem[] }>>([]);
  const [isEnrolled, setIsEnrolled]     = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>('none');
  const [progress, setProgress]         = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [enrolling, setEnrolling]       = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [togglingLesson, setTogglingLesson] = useState<string | null>(null);
  const [activeItem, setActiveItem]     = useState<CurriculumItem | null>(null);
  const [sidebarOpen, setSidebarOpen]   = useState(true);

  // ── Quiz state (embedded) ──────────────────────────────────────────────────
  const [quizScreen, setQuizScreen]       = useState<QuizScreen>('info');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizResult, setQuizResult]       = useState<QuizResult | null>(null);
  const [loadingQuiz, setLoadingQuiz]     = useState(false);
  const quizStartTime                     = useRef<number>(0);

  const showToast = useCallback((msg: string, ok: boolean) => setToast({ msg, ok }), []);

  const allItems: CurriculumItem[]   = modules.flatMap(m => m.items);
  const allLessons: CurriculumItem[] = allItems.filter(i => i.type === 'lesson');

  // ── When active item changes, reset quiz state ─────────────────────────────
  useEffect(() => {
    if (activeItem?.type === 'quiz') {
      setQuizScreen('info');
      setQuizQuestions([]);
      setQuizResult(null);
    }
  }, [activeItem?.id]);

  // ── Core fetch ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (opts: { setActive?: boolean; background?: boolean } = {}) => {
    if (!courseId || !user?.id) return;

    const cKey = courseDetailCacheKey(courseId);
    const eKey = enrollmentsCacheKey(user.id);
    const pKey = progressCacheKey(user.id, courseId);

    const cachedCourse   = cache.get<Course>(cKey);
    const cachedEnroll   = cache.get<string[]>(eKey);
    const cachedProgress = cache.get<string[]>(pKey);

    if (cachedCourse) {
      setCourse(cachedCourse);
      // Check enrollment: prefer the course's own enrollments list, fall back to cached IDs
      const enrolledFromCourse = isCourseEnrolledFromRaw(cachedCourse, user!.id);
      const enrolledFromCache  = cachedEnroll ? cachedEnroll.map(String).includes(String(courseId)) : false;
      const enrolled = enrolledFromCourse || enrolledFromCache;
      setIsEnrolled(enrolled);
      setEnrollStatus(enrolled ? 'enrolled' : 'none');
      if (cachedProgress) setProgress(new Set(cachedProgress));

      const builtModules = attachCourseItems(
        (cachedCourse.modules ?? []).map(m => ({ ...m, items: buildCurriculumItems(m) })),
        cachedCourse,
      );
      setModules(builtModules);

      if (opts.setActive && builtModules.length && !activeItem) {
        const firstItem = builtModules.flatMap(m => m.items).find(i => i.type !== 'lesson' || i.isFree || enrolled);
        if (firstItem) setActiveItem(firstItem);
      }

      const allFresh =
        !cache.isStale(cKey) &&
        (!cachedEnroll || !cache.isStale(eKey)) &&
        (!cachedProgress || !cache.isStale(pKey));

      if (allFresh) { setLoading(false); return; }
      setRevalidating(true);
    } else {
      if (!opts.background) setLoading(true);
    }

    setError(null);

    try {
      const needsEnrollFetch = !cachedEnroll || cache.isStale(eKey);
      const [courseRes, meRes, requestsRes] = await Promise.all([
        api.getCourseById(courseId),
        needsEnrollFetch ? api.me() : Promise.resolve(null),
        api.getMyEnrollmentRequests().catch(() => null),
      ]);

      const raw = (courseRes as any).data;
      const courseData: Course = raw?.course ?? raw?.data?.course ?? raw;
      setCourse(courseData);
      cache.set(cKey, courseData, TTL.COURSES);

      const builtModules = attachCourseItems(
        (courseData.modules ?? []).map(m => ({ ...m, items: buildCurriculumItems(m) })),
        courseData,
      );
      setModules(builtModules);

      let enrolled = false;

      // ── First: check if the course data itself says we're enrolled ──
      // courseData.enrollments is [{user:{id,name,avatar}}] from getCourseById
      if (isCourseEnrolledFromRaw(courseData, user!.id)) {
        enrolled = true;
      }

      if (meRes) {
        const meData = (meRes as any).data;
        const enrollments: any[] =
          meData?.user?.enrollments ??
          meData?.data?.user?.enrollments ??
          meData?.enrollments ?? [];
        // Extract course IDs robustly — try every plausible field
        const ids = enrollments
          .map((e: any) =>
            e?.course?.id ?? e?.courseId ?? e?.course_id ?? e?.course?.courseId
          )
          .filter((v: any) => v !== undefined && v !== null)
          .map(String);
        cache.set(eKey, ids, TTL.PROFILE);
        if (!enrolled) enrolled = isEnrolledInCourse(enrollments, courseId);
      } else if (cachedEnroll) {
        if (!enrolled) enrolled = cachedEnroll.map(String).includes(String(courseId));
      }
      setIsEnrolled(enrolled);

      // Check request status if not directly enrolled
      if (enrolled) {
        setEnrollStatus('enrolled');
      } else {
        const reqData = (requestsRes as any)?.data;
        const reqList: any[] =
          Array.isArray(reqData?.data?.requests) ? reqData.data.requests :
          Array.isArray(reqData?.requests) ? reqData.requests :
          Array.isArray(reqData?.data) ? reqData.data :
          Array.isArray(reqData) ? reqData : [];
        const match = reqList.find((r: any) => String(r.courseId || r.course?.id) === String(courseId));
        if (match?.status === 'PENDING') {
          setEnrollStatus('pending');
        } else if (match?.status === 'REJECTED') {
          setEnrollStatus('rejected');
        } else {
          setEnrollStatus('none');
        }
      }

      if (opts.setActive && builtModules.length && !activeItem) {
        const firstItem = builtModules.flatMap(m => m.items).find(i => i.type !== 'lesson' || i.isFree || enrolled);
        if (firstItem) setActiveItem(firstItem);
      }

      if (enrolled) {
        const freshProg = cache.get<string[]>(pKey);
        if (freshProg && !cache.isStale(pKey)) {
          setProgress(new Set(freshProg));
        } else {
          try {
            const progressRes = await api.getProgress(`?courseId=${courseId}`);
            const records: ProgressRecord[] =
              (progressRes as any).data?.progress ??
              (progressRes as any).data?.data?.progress ??
              (progressRes as any).data ?? [];
            const completedIds = records.filter((r: ProgressRecord) => r.completed).map((r: ProgressRecord) => r.lessonId);
            cache.set(pKey, completedIds, TTL.PROGRESS);
            setProgress(new Set(completedIds));
          } catch { /* non-blocking */ }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load course');
    } finally {
      setLoading(false);
      setRevalidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, user?.id]);

  const initialized = useRef(false);
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (initialized.current) return;
    initialized.current = true;
    fetchData({ setActive: true });
  }, [authLoading, user, router, fetchData]);

  // ── Enroll ─────────────────────────────────────────────────────────────────

  const handleEnroll = async () => {
    if (!user) return;
    setEnrolling(true);
    try {
      await api.enrollCourse(courseId);
      setEnrollStatus('pending');
      showToast('Enrollment request sent! Awaiting admin approval.', true);
      if (user?.id) invalidateCourseData(user.id);
      fetchData({ background: true });
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.toLowerCase().includes('already enrolled')) {
        setIsEnrolled(true);
        setEnrollStatus('enrolled');
        showToast('You are already enrolled in this course.', true);
        fetchData({ setActive: true, background: true });
      } else if (msg.toLowerCase().includes('pending') || (e as any)?.status === 409) {
        setEnrollStatus('pending');
        showToast('Your enrollment request is pending approval.', true);
      } else {
        showToast(msg || 'Enrollment request failed', false);
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (!user) return;
    setEnrolling(true);
    const prevStatus = enrollStatus;
    try {
      await api.unenrollCourse(courseId);
      setIsEnrolled(false);
      setEnrollStatus('none');
      setProgress(new Set());
      if (user?.id) invalidateCourseData(user.id);
      showToast(prevStatus === 'enrolled' ? 'Unenrolled from course.' : 'Request cancelled.', true);
      fetchData({ background: true });
    } catch (e: any) {
      showToast(e.message || 'Failed', false);
    } finally {
      setEnrolling(false);
    }
  };

  // ── Toggle lesson complete ──────────────────────────────────────────────────

  const toggleComplete = async (lessonId: string) => {
    if (!isEnrolled) return;
    setTogglingLesson(lessonId);
    const wasCompleted = progress.has(lessonId);
    setProgress(prev => { const s = new Set(prev); wasCompleted ? s.delete(lessonId) : s.add(lessonId); return s; });
    try {
      if (wasCompleted) { await api.unmarkLessonComplete(lessonId); }
      else { await api.markLessonComplete(lessonId); showToast('Lesson marked as complete!', true); }
      if (user?.id) {
        invalidateProgress(user.id, courseId);
        const pKey = progressCacheKey(user.id, courseId);
        const current = cache.get<string[]>(pKey) ?? [];
        cache.set(pKey, wasCompleted ? current.filter(id => id !== lessonId) : [...current, lessonId], TTL.PROGRESS);
      }
    } catch (e: any) {
      setProgress(prev => { const s = new Set(prev); wasCompleted ? s.add(lessonId) : s.delete(lessonId); return s; });
      showToast(e.message || 'Failed to update progress', false);
    } finally {
      setTogglingLesson(null);
    }
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goNext = () => {
    if (!activeItem) return;
    const idx = allItems.findIndex(i => i.id === activeItem.id);
    if (idx < allItems.length - 1) setActiveItem(allItems[idx + 1]);
  };
  const goPrev = () => {
    if (!activeItem) return;
    const idx = allItems.findIndex(i => i.id === activeItem.id);
    if (idx > 0) setActiveItem(allItems[idx - 1]);
  };

  // ── Quiz handlers ──────────────────────────────────────────────────────────

  const startQuiz = async () => {
    if (!activeItem || activeItem.type !== 'quiz') return;
    setLoadingQuiz(true);
    try {
      const res: any = await (api as any).getStudentQuestions(activeItem.id);
      const rawQs: any[] = res?.data?.data?.questions ?? res?.data?.questions ?? res?.data ?? [];
      const shaped: QuizQuestion[] = rawQs.map((q: any, idx: number) => ({
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
      setQuizQuestions(shaped);
      quizStartTime.current = Date.now();
      setQuizScreen('taking');
    } catch (err: any) {
      showToast(err.message || 'Failed to load questions', false);
    } finally {
      setLoadingQuiz(false);
    }
  };

  const submitQuiz = async (answers: Record<string, number>) => {
    if (!activeItem || activeItem.type !== 'quiz') return;
    const timeTaken    = Math.round((Date.now() - quizStartTime.current) / 1000);
    const answersArray = Object.entries(answers).map(([questionId, selectedOption]) => ({ questionId, selectedOption }));

    try {
      const res: any = await (api as any).submitQuiz(activeItem.id, answersArray);
      const raw       = res?.data?.data ?? res?.data ?? {};
      const attempt   = raw?.attempt ?? raw;
      const scorePercent = raw?.score ?? attempt?.score ?? 0;
      const totalPoints  = quizQuestions.reduce((s, q) => s + q.points, 0);
      const scoreRaw     = Math.round((scorePercent / 100) * totalPoints);
      const skippedCount = quizQuestions.length - answersArray.length;
      const correctCount = Math.round((scorePercent / 100) * answersArray.length);

      const result: QuizResult = {
        score:      scoreRaw,
        totalMarks: totalPoints,
        percentage: typeof scorePercent === 'number' ? scorePercent : parseFloat(scorePercent) || 0,
        correct:    correctCount,
        wrong:      answersArray.length - correctCount,
        skipped:    skippedCount,
        timeTaken,
        passed:     raw?.passed ?? attempt?.passed ?? scorePercent >= 50,
      };

      setQuizResult(result);
      setQuizScreen('results');
      showToast('Quiz submitted!', true);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit quiz', false);
      setQuizScreen('info');
    }
  };

  const closeQuizResults = () => {
    setQuizScreen('info');
    setQuizResult(null);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalLessons     = allLessons.length;
  const completedCount   = Array.from(progress).filter(id => allLessons.some(l => l.id === id)).length;
  const pct              = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const activeIdx        = activeItem ? allItems.findIndex(i => i.id === activeItem.id) : -1;
  const totalItems       = allItems.length;
  const totalQuizzes     = allItems.filter(i => i.type === 'quiz').length;
  const totalAssignments = allItems.filter(i => i.type === 'assignment').length;

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (!mounted) return null;

  if (authLoading || (loading && !course)) {
    return (
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Courses" />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
        </main>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Courses" />
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <i className="fa-solid fa-circle-exclamation text-red-400 text-3xl" />
          <p className="text-slate-600 text-sm">{error ?? 'Course not found'}</p>
          <button onClick={() => fetchData({ setActive: true })} className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg">Retry</button>
        </main>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex min-h-screen bg-slate-50 protected-content"
      style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      {devToolsOpen && <DevToolsWarning />}
      <Sidebar activeItem="Courses" />
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDone={() => setToast(null)} />}

      {/* Loading quiz questions overlay */}
      {loadingQuiz && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(15,32,64,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-2xl">
            <div className="w-10 h-10 rounded-full border-[3px] border-purple-200 border-t-purple-700 animate-spin" />
            <p className="text-slate-700 font-semibold text-[13px]">Loading questions…</p>
          </div>
        </div>
      )}

      {/* ── Embedded Quiz Taker (full-screen overlay) ── */}
      {activeItem?.type === 'quiz' && quizScreen === 'taking' && quizQuestions.length > 0 && (
        <EmbeddedQuizTaker
          quizItem={activeItem}
          questions={quizQuestions}
          onSubmit={submitQuiz}
          onCancel={() => { setQuizScreen('info'); setQuizQuestions([]); }}
        />
      )}

      {/* ── Quiz Results overlay ── */}
      {activeItem?.type === 'quiz' && quizScreen === 'results' && quizResult && (
        <QuizResultsScreen
          quizTitle={activeItem.title}
          result={quizResult}
          onClose={closeQuizResults}
        />
      )}

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm px-5 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push('/courses')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0">
            <i className="fa-solid fa-arrow-left text-sm" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-slate-800 font-bold text-sm truncate">
              {course.title}
              {revalidating && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse ml-2 align-middle" />
              )}
            </p>
            <p className="text-slate-400 text-[10px]">by {course.teacher?.name}</p>
          </div>
          {isEnrolled && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-semibold text-slate-500">{pct}%</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0">
            <i className={`fa-solid ${sidebarOpen ? 'fa-sidebar-flip' : 'fa-sidebar'} text-sm`} />
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">

          {/* ── Main Content ── */}
          <div className="flex-1 overflow-y-auto">
            {!isEnrolled && !activeItem ? (
              <EnrollGate
                course={course}
                enrollStatus={enrollStatus}
                onEnroll={handleEnroll}
                onCancel={handleCancelEnrollment}
                enrolling={enrolling}
              />
            ) : activeItem ? (
              <>
                {/* ── Lesson ── */}
                {activeItem.type === 'lesson' && (
                  <div className="p-5 lg:p-8 max-w-4xl mx-auto w-full space-y-5">
                    {activeItem.videoUrl ? (
                      <VideoPlayer
                        url={activeItem.videoUrl}
                        userName={user?.name ?? user?.email ?? 'Student'}
                        userEmail={user?.email ?? 'unknown'}
                      />
                    ) : (
                      <div className="w-full aspect-video bg-slate-100 rounded-xl flex flex-col items-center justify-center border border-slate-200">
                        <i className="fa-solid fa-video-slash text-3xl text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No video for this lesson</p>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wide">Lesson</span>
                          {activeItem.duration != null && activeItem.duration > 0 && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <i className="fa-solid fa-clock text-[9px]" />{activeItem.duration} min
                            </span>
                          )}
                        </div>
                        <h1 className="text-xl font-black text-slate-800 lesson-text">{activeItem.title}</h1>
                      </div>
                      {isEnrolled && (
                        <button
                          onClick={() => toggleComplete(activeItem.id)}
                          disabled={togglingLesson === activeItem.id}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0 disabled:opacity-60 ${
                            progress.has(activeItem.id)
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}>
                          {togglingLesson === activeItem.id
                            ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                            : <i className={`fa-solid ${progress.has(activeItem.id) ? 'fa-circle-check' : 'fa-circle'} text-sm`} />
                          }
                          {progress.has(activeItem.id) ? 'Completed' : 'Mark Complete'}
                        </button>
                      )}
                    </div>

                    {activeItem.content && (
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Lesson Notes</h2>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap lesson-text">{activeItem.content}</p>
                      </div>
                    )}

                    {!isEnrolled && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-blue-900">You're watching a free preview</p>
                          <p className="text-xs text-blue-700 mt-0.5">
                            {enrollStatus === 'pending'
                              ? 'Your enrollment request is pending admin approval.'
                              : `Enroll to unlock all ${totalItems} items and track your progress.`}
                          </p>
                        </div>
                        {enrollStatus === 'pending' ? (
                          <button
                            onClick={handleCancelEnrollment}
                            disabled={enrolling}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-700 text-sm font-bold rounded-lg hover:bg-amber-50 transition-colors shrink-0 disabled:opacity-60"
                          >
                            <i className="fa-solid fa-clock text-xs" />
                            Pending Approval
                          </button>
                        ) : (
                          <button
                            onClick={handleEnroll}
                            disabled={enrolling}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-bold rounded-lg hover:bg-blue-800 transition-colors shrink-0 disabled:opacity-60"
                          >
                            {enrolling ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <i className="fa-solid fa-graduation-cap text-xs" />
                            )}
                            {enrollStatus === 'rejected' ? 'Request Again' : 'Enroll Free'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Prev / Next */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button onClick={goPrev} disabled={activeIdx <= 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        <i className="fa-solid fa-chevron-left text-xs" />Previous
                      </button>
                      {isEnrolled && !progress.has(activeItem.id) && (
                        <button onClick={() => { toggleComplete(activeItem.id); setTimeout(goNext, 300); }}
                          disabled={!!togglingLesson}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-60">
                          Complete & Next <i className="fa-solid fa-chevron-right text-xs" />
                        </button>
                      )}
                      <button onClick={goNext} disabled={activeIdx >= totalItems - 1}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        Next <i className="fa-solid fa-chevron-right text-xs" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Quiz (info panel or handled via overlay) ── */}
                {activeItem.type === 'quiz' && quizScreen === 'info' && (
                  <QuizInfoPanel
                    item={activeItem}
                    isEnrolled={isEnrolled}
                    onStart={startQuiz}
                  />
                )}

                {/* ── Assignment ── */}
                {activeItem.type === 'assignment' && (
                  <AssignmentInfoPanel item={activeItem} isEnrolled={isEnrolled} />
                )}
              </>
            ) : isEnrolled ? (
              <NoContentPanel
                onRefresh={() => fetchData({ setActive: true, background: false })}
                refreshing={loading || revalidating}
              />
            ) : (
              <EnrollGate
                course={course}
                enrollStatus={enrollStatus}
                onEnroll={handleEnroll}
                onCancel={handleCancelEnrollment}
                enrolling={enrolling}
              />
            )}
          </div>

          {/* ── Curriculum Sidebar ── */}
          {sidebarOpen && (
            <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto flex flex-col">
              <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                <h2 className="text-sm font-black text-slate-800">Course Content</h2>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                  {totalLessons > 0 && <span>{totalLessons} lesson{totalLessons !== 1 ? 's' : ''}</span>}
                  {totalQuizzes > 0 && <span>{totalQuizzes} quiz{totalQuizzes !== 1 ? 'zes' : ''}</span>}
                  {totalAssignments > 0 && <span>{totalAssignments} assignment{totalAssignments !== 1 ? 's' : ''}</span>}
                  {isEnrolled && completedCount > 0 && <span>· {completedCount} completed</span>}
                </div>
                {isEnrolled && totalLessons > 0 && (
                  <div className="mt-2.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              <div className="flex-1 px-3 py-3 space-y-4">
                {modules.map((mod, mIdx) => (
                  <div key={mod.id}>
                    <div className="flex items-center gap-2 px-2 mb-1.5">
                      <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white text-[9px] font-black shrink-0">
                        {mIdx + 1}
                      </div>
                      <p className="text-xs font-bold text-slate-700 truncate">{mod.title}</p>
                    </div>
                    <div className="space-y-0.5">
                      {mod.items.map(item => (
                        <CurriculumItemRow
                          key={item.id}
                          item={item}
                          index={allItems.findIndex(i => i.id === item.id) + 1}
                          isActive={activeItem?.id === item.id}
                          isCompleted={item.type === 'lesson' ? progress.has(item.id) : false}
                          isEnrolled={isEnrolled}
                          onClick={() => setActiveItem(item)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {modules.length === 0 && (
                  <div className="text-center py-10">
                    <i className="fa-solid fa-layer-group text-2xl text-slate-200 mb-2 block" />
                    <p className="text-xs text-slate-400">No content yet</p>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <i className="fa-solid fa-users text-[11px] text-slate-400" />
                  {course._count?.enrollments ?? 0} students enrolled
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <i className="fa-solid fa-chalkboard-user text-[11px] text-slate-400" />
                  {course.teacher?.name}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <i className="fa-solid fa-play text-blue-500 text-[9px]" />Lesson
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <i className="fa-solid fa-circle-question text-purple-500 text-[9px]" />Quiz
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <i className="fa-solid fa-clipboard-list text-amber-500 text-[9px]" />Assignment
                  </span>
                </div>
                {isEnrolled && (
                  <button
                    onClick={async () => {
                      try {
                        await api.unenrollCourse(courseId);
                        setIsEnrolled(false);
                        setProgress(new Set());
                        if (user?.id) invalidateCourseData(user.id);
                        showToast('Unenrolled from course.', true);
                      } catch (e: any) {
                        showToast(e.message || 'Failed', false);
                      }
                    }}
                    className="w-full mt-1 py-2 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                    Unenroll from course
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      <style>{`
        @keyframes quizPopIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}