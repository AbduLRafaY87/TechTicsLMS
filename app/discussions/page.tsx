'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/AuthProvider';
import Sidebar from '../components/Sidebar';
import { api } from '../../lib/api';
import { getSocket, joinThread, leaveThread, disconnectSocket } from '../../lib/socket';

// ─── Types ────────────────────────────────────────────────────────────────────

type ThreadStatus = 'pending' | 'answered' | 'locked';
type ThreadTag    = 'question' | 'resource' | 'general';

interface Reply {
  id: string;
  content: string;
  imageUrl?: string | null;
  voiceNoteUrl?: string | null;
  author: { id: string; name: string; role: string };
  createdAt: string;
  isAccepted?: boolean;
  likes: number;
  likedByMe?: boolean;
}

interface Thread {
  id: string;
  title: string;
  content: string;
  status: ThreadStatus;
  tag: ThreadTag;
  isVisible: boolean;
  isLocked: boolean;
  isAnswered: boolean;
  course: { id: string; title: string };
  author: { id: string; name: string; role: string };
  createdAt: string;
  updatedAt: string;
  replies: Reply[];
  replyCount: number;
  views: number;
  isPinned?: boolean;
}

interface DiscussionSummary {
  total: number; pending: number; answered: number; locked: number; myThreads: number; totalReplies: number;
}

interface DiscussionData {
  summary: DiscussionSummary;
  threads: Thread[];
}

interface ThreadFormState {
  title: string; content: string; tag: ThreadTag; courseId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_COLORS = ['#1E3A5F','#2563EB','#0F766E','#6D28D9','#B45309','#DC2626','#0369A1','#4338CA'];

const STATUS_META: Record<ThreadStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'Awaiting answer', color: '#D97706', bg: '#FFFBEB', icon: 'fa-hourglass-half' },
  answered: { label: 'Answered',        color: '#0F766E', bg: '#F0FDF4', icon: 'fa-circle-check'   },
  locked:   { label: 'Locked',          color: '#64748B', bg: '#F1F5F9', icon: 'fa-lock'            },
};

const TAG_META: Record<ThreadTag, { label: string; color: string; bg: string; icon: string }> = {
  question: { label: 'Question', color: '#B45309', bg: '#FEF3C7', icon: 'fa-circle-question' },
  resource: { label: 'Resource', color: '#0369A1', bg: '#EFF6FF', icon: 'fa-book-open'       },
  general:  { label: 'General',  color: '#0F766E', bg: '#F0FDF4', icon: 'fa-comments'        },
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EMPTY_FORM: ThreadFormState = { title: '', content: '', tag: 'question', courseId: '' };
const WEB_SEARCH_URL = 'https://search-engines-cevcvmdrmhv4bnmustgrjh.streamlit.app/';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function AvatarInitials({ name, color, size = 8 }: { name: string; color: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0`}
      style={{ background: color }}>{initials}</div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,32,64,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-slate-900 font-bold text-[15px]">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Thread Form ──────────────────────────────────────────────────────────────

function ThreadForm({ form, setForm, courses, onSubmit, onCancel, submitting, submitLabel }: {
  form: ThreadFormState; setForm: (f: ThreadFormState) => void;
  courses: { id: string; title: string }[];
  onSubmit: () => void; onCancel: () => void; submitting: boolean; submitLabel: string;
}) {
  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-slate-300";
  const field = (label: string, content: React.ReactNode) => (
    <div className="mb-4">
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</label>
      {content}
    </div>
  );
  return (
    <div>
      <div className="flex items-start gap-2 px-3 py-2.5 mb-4 rounded-lg bg-amber-50 border border-amber-200">
        <i className="fa-solid fa-eye-slash text-amber-500 text-xs mt-0.5 shrink-0" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          Your question stays private — only you and your teacher can see it until they answer and choose to publish it for the whole class.
        </p>
      </div>
      {field('Title', <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Question about Chapter 5 derivation" className={inputCls} />)}
      {field('Details', <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="Describe your question in detail…" rows={4} className={`${inputCls} resize-none`} />)}
      {field('Course',
        <select value={form.courseId} onChange={e => setForm({ ...form, courseId: e.target.value })} className={inputCls}>
          <option value="">Select a course</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      )}
      {field('Type',
        <select value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value as ThreadTag })} className={inputCls}>
          <option value="question">Question</option>
          <option value="resource">Resource request</option>
          <option value="general">General</option>
        </select>
      )}
      <div className="flex gap-2 mt-6">
        <button onClick={onCancel} className="flex-1 px-4 py-2 text-[13px] font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all">Cancel</button>
        <button onClick={onSubmit} disabled={submitting || !form.title.trim() || !form.courseId || !form.content.trim()}
          className="flex-1 px-4 py-2 text-[13px] font-semibold rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
          {submitting ? <span className="flex items-center justify-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</span> : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ thread, onConfirm, onCancel, deleting }: {
  thread: Thread; onConfirm: () => void; onCancel: () => void; deleting: boolean;
}) {
  return (
    <Modal title="Delete Question" onClose={onCancel}>
      <div className="text-center py-2">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-trash text-red-500 text-xl" />
        </div>
        <p className="text-slate-700 font-semibold text-[14px] mb-1">Delete "{thread.title}"?</p>
        <p className="text-slate-400 text-[12px] mb-6">This action cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-[13px] font-semibold border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-all">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="flex-1 px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all disabled:opacity-50">
            {deleting ? <span className="flex items-center justify-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</span> : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Thread List Item ─────────────────────────────────────────────────────────

function ThreadListItem({ thread, idx, active, isMine, onClick }: {
  thread: Thread; idx: number; active: boolean; isMine: boolean; onClick: () => void;
}) {
  const statusMeta = STATUS_META[thread.status];
  const tagMeta    = TAG_META[thread.tag];
  const color      = ACCENT_COLORS[idx % ACCENT_COLORS.length];
  const lastDate   = thread.replies.length ? thread.replies[thread.replies.length - 1].createdAt : thread.createdAt;
  const lastReply  = thread.replies[thread.replies.length - 1];
  const preview    = lastReply
    ? (lastReply.imageUrl ? '📷 Image' : lastReply.voiceNoteUrl ? '🎤 Voice note' : lastReply.content)
    : thread.content;

  return (
    <button onClick={onClick} className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-l-2 ${active ? 'bg-blue-50/70 border-l-blue-600' : 'border-l-transparent hover:bg-slate-50'}`}>
      <AvatarInitials name={thread.author.name} color={color} size={8} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isMine && !thread.isVisible && <i className="fa-solid fa-eye-slash text-amber-400 text-[10px] shrink-0" title="Only visible to you" />}
          {thread.isVisible && <i className="fa-solid fa-eye text-teal-400 text-[10px] shrink-0" title="Published for everyone" />}
          <span className={`text-[13px] font-semibold truncate ${active ? 'text-blue-800' : 'text-slate-800'}`}>{thread.title}</span>
          <span className="ml-auto text-[10px] text-slate-400 shrink-0">{formatShortDate(lastDate)}</span>
        </div>
        <p className="text-slate-400 text-[11px] truncate mt-0.5">{preview}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ color: statusMeta.color, background: statusMeta.bg }}>
            <i className={`fa-solid ${statusMeta.icon} text-[8px]`} />{statusMeta.label}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ color: tagMeta.color, background: tagMeta.bg }}>
            <i className={`fa-solid ${tagMeta.icon} text-[8px]`} />{tagMeta.label}
          </span>
          {isMine && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Yours</span>
          )}
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 ml-auto">
            <i className="fa-regular fa-comment text-[9px]" />{thread.replyCount}
          </span>
        </div>
      </div>
    </button>
  );
}

function ThreadListSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-3/4" />
        <div className="h-3 bg-slate-100 rounded w-full" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
      </div>
    </div>
  );
}

// ─── Voice Note Player ──────────────────────────────────────────────────────────

function VoiceNotePlayer({ src, isOwn }: { src: string; isOwn: boolean }) {
  const audioRef  = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError]       = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setError(false);
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => setError(true));
      setPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || isNaN(audio.duration)) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio || isNaN(audio.duration)) return;
    setDuration(audio.duration);
  };

  const handleEnded = () => {
    setPlaying(false);
    setProgress(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio * 100);
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[180px] ${isOwn ? 'bg-blue-700/30' : 'bg-slate-100'}`}>
        <i className={`fa-solid fa-microphone-slash text-sm ${isOwn ? 'text-white/60' : 'text-slate-400'}`} />
        <span className={`text-[11px] ${isOwn ? 'text-white/60' : 'text-slate-400'}`}>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl min-w-[180px] ${isOwn ? 'bg-blue-700/30' : 'bg-slate-100'}`}>
      <audio
        key={src}
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={() => setError(true)}
      />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'}`}
      >
        <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'} text-[11px]`} />
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`h-1.5 rounded-full cursor-pointer ${isOwn ? 'bg-white/20' : 'bg-slate-300'}`}
          onClick={handleSeek}
        >
          <div
            className={`h-1.5 rounded-full transition-all ${isOwn ? 'bg-white' : 'bg-blue-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`text-[10px] mt-1 ${isOwn ? 'text-white/70' : 'text-slate-400'}`}>{fmt(duration)}</div>
      </div>
      <i className={`fa-solid fa-microphone text-[11px] ${isOwn ? 'text-white/60' : 'text-slate-400'}`} />
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ authorName, authorRole, content, imageUrl, voiceNoteUrl, createdAt, color, isOwn, isAccepted, likes, likedByMe, onLike, isOriginal }: {
  authorName: string; authorRole: string; content: string;
  imageUrl?: string | null; voiceNoteUrl?: string | null;
  createdAt: string; color: string; isOwn: boolean;
  isAccepted?: boolean; likes?: number; likedByMe?: boolean;
  onLike?: () => void; isOriginal?: boolean;
}) {
  const [imgExpanded, setImgExpanded] = useState(false);
  const [imgError, setImgError]       = useState(false);

  useEffect(() => { setImgError(false); }, [imageUrl]);

  return (
    <div className={`flex items-start gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <AvatarInitials name={authorName} color={color} size={8} />
      <div className={`flex-1 min-w-0 flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[12px] font-bold text-slate-800">{authorName}</span>
          {authorRole !== 'STUDENT' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded uppercase tracking-wide">Instructor</span>
          )}
          {isOriginal && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-wide">Question</span>
          )}
          {isAccepted && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded uppercase tracking-wide flex items-center gap-1">
              <i className="fa-solid fa-check text-[8px]" />Answer
            </span>
          )}
          <span className="text-[10px] text-slate-400">{formatDate(createdAt)}</span>
        </div>

        {voiceNoteUrl && (
          <div className="mb-1">
            <VoiceNotePlayer src={voiceNoteUrl} isOwn={isOwn} />
          </div>
        )}

        {imageUrl && !imgError && (
          <div className="mb-1">
            <img
              src={imageUrl}
              alt="attachment"
              onClick={() => setImgExpanded(true)}
              onError={() => setImgError(true)}
              className="max-w-[240px] max-h-[200px] rounded-xl object-cover cursor-zoom-in border border-slate-200 hover:opacity-90 transition-opacity"
            />
          </div>
        )}
        {imageUrl && imgError && (
          <div className="mb-1 flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl text-slate-400 text-[12px]">
            <i className="fa-solid fa-image text-sm" />
            <span>Image unavailable</span>
          </div>
        )}

        {imgExpanded && imageUrl && !imgError && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setImgExpanded(false)}
          >
            <img
              src={imageUrl}
              alt="full"
              className="max-w-full max-h-full rounded-xl object-contain"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); setImgExpanded(false); }}
              className="absolute top-4 right-4 w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {content && (
          <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
            isOwn
              ? 'text-white rounded-tr-sm'
              : isAccepted
                ? 'bg-teal-50 text-slate-700 border border-teal-200 rounded-tl-sm'
                : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm'
          }`} style={isOwn ? { background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' } : undefined}>
            {content}
          </div>
        )}

        {onLike && (
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold transition-all ${likedByMe ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
          >
            <i className={`fa-${likedByMe ? 'solid' : 'regular'} fa-heart text-[10px]`} />
            {likes} {likes === 1 ? 'like' : 'likes'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Chat Composer ────────────────────────────────────────────────────────────

function ChatComposer({ onSend, disabled, disabledReason, placeholder }: {
  onSend: (content: string, file?: File | null) => Promise<void>;
  disabled: boolean; disabledReason: string; placeholder: string;
}) {
  const [value, setValue]         = useState('');
  const [posting, setPosting]     = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef    = useRef<BlobPart[]>([]);

  const clearAttachment = () => {
    setImageFile(null);
    setImagePreview(null);
    setAudioBlob(null);
    setAudioMimeType('audio/webm');
    setRecordSeconds(0);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioBlob(null);
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

      const mr = new MediaRecorder(stream, options);
      const actualMime = mr.mimeType || mimeType || 'audio/webm';
      setAudioMimeType(actualMime);

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setAudioBlob(blob);
        setImageFile(null);
        setImagePreview(null);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      alert('Microphone access denied or not available on this device.');
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleSend = async () => {
    if ((!value.trim() && !imageFile && !audioBlob) || posting || disabled) return;
    setPosting(true);
    let fileToSend: File | null = null;
    if (imageFile) {
      fileToSend = imageFile;
    } else if (audioBlob) {
      const ext = audioMimeType.includes('ogg') ? 'ogg'
                : audioMimeType.includes('mp4') ? 'mp4'
                : 'webm';
      fileToSend = new File([audioBlob], `voice-${Date.now()}.${ext}`, { type: audioMimeType });
    }
    await onSend(value, fileToSend);
    setValue('');
    clearAttachment();
    setPosting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="border-t border-slate-200 bg-white px-4 sm:px-6 py-3">
      {disabled ? (
        <div className="flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-400 bg-slate-50 rounded-xl py-3">
          <i className="fa-solid fa-lock text-[11px]" />{disabledReason}
        </div>
      ) : (
        <>
          {imagePreview && (
            <div className="relative inline-block mb-2">
              <img src={imagePreview} alt="preview" className="h-20 rounded-lg object-cover border border-slate-200" />
              <button onClick={clearAttachment} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          {audioBlob && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
              <i className="fa-solid fa-microphone text-blue-600 text-sm" />
              <span className="text-[12px] text-blue-700 font-semibold">Voice note ready ({fmt(recordSeconds)})</span>
              <button onClick={clearAttachment} className="ml-auto text-slate-400 hover:text-red-500 text-[11px]">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          {recording && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[12px] text-red-700 font-semibold">Recording… {fmt(recordSeconds)}</span>
              <button onClick={stopRecording} className="ml-auto px-3 py-1 text-[11px] font-bold bg-red-500 text-white rounded-lg hover:bg-red-600">
                Stop
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all shrink-0"
              title="Attach image"
            >
              <i className="fa-solid fa-image text-sm" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />

            {!recording ? (
              <button
                onClick={startRecording}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                title="Record voice note"
              >
                <i className="fa-solid fa-microphone text-sm" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 bg-red-50 shrink-0 animate-pulse"
                title="Stop recording"
              >
                <i className="fa-solid fa-stop text-sm" />
              </button>
            )}

            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none text-[13px] text-slate-700 placeholder-slate-400 py-1.5 max-h-32"
            />

            <button
              onClick={handleSend}
              disabled={posting || (!value.trim() && !imageFile && !audioBlob)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}
            >
              {posting
                ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <i className="fa-solid fa-paper-plane text-xs" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-300 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
        </>
      )}
    </div>
  );
}

// ─── Empty Chat State ─────────────────────────────────────────────────────────

function EmptyChatState({ summary, hasThreads, onNewThread }: { summary?: DiscussionSummary; hasThreads: boolean; onNewThread: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
        <i className="fa-solid fa-comments text-white text-2xl" />
      </div>
      <h2 className="text-slate-900 font-black text-lg mb-1.5">{hasThreads ? 'Pick a conversation to get started' : 'No questions yet'}</h2>
      <p className="text-slate-400 text-[13px] max-w-sm mb-6">
        {hasThreads ? 'Select a thread on the left to read the conversation, or ask something new.' : 'Ask your first question — it stays private until your teacher answers it.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        <button onClick={onNewThread} className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg text-white transition-all hover:opacity-90 shadow-sm" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
          <i className="fa-solid fa-plus text-xs" />Ask a Question
        </button>
        <a href={WEB_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
          <i className="fa-solid fa-magnifying-glass text-xs" />Search the Web
        </a>
      </div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-md">
          {[
            { label: 'Total',     value: summary.total,     color: '#1E3A5F' },
            { label: 'Awaiting',  value: summary.pending,   color: '#D97706' },
            { label: 'Answered',  value: summary.answered,  color: '#0F766E' },
            { label: 'Yours',     value: summary.myThreads, color: '#6D28D9' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl py-3">
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscussionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [discussionData, setDiscussionData] = useState<DiscussionData | null>(null);
  const [loadingData, setLoadingData]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const fetchedForUserId                    = useRef<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | ThreadStatus>('all');
  const [activeTag, setActiveTag]       = useState<'all' | ThreadTag>('all');
  const [activeCourse, setActiveCourse] = useState<string>('all');
  const [scopeFilter, setScopeFilter]   = useState<'all' | 'mine'>('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  type ModalMode = 'none' | 'create' | 'edit' | 'delete';
  const [modalMode, setModalMode]   = useState<ModalMode>('none');
  const [form, setForm]             = useState<ThreadFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [enrolledCourses, setEnrolledCourses] = useState<{ id: string; title: string }[]>([]);

  const joinedThreadRef = useRef<string | null>(null);
  const messagesEndRef  = useRef<HTMLDivElement>(null);

  // ── Data fetch ──
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'TEACHER' || user.role === 'ADMIN') { router.replace('/teacher/dashboard'); return; }
    if (fetchedForUserId.current === user.id) return;
    fetchedForUserId.current = user.id;

    (async () => {
      setLoadingData(true); setError(null);
      try {
        const [res, coursesRes] = await Promise.all([api.getDiscussions(''), api.getMyCourses()]);
        const data: DiscussionData | null = (res.data as any)?.data ?? res.data ?? null;
        setDiscussionData(data);
        if (data?.threads?.length) setSelectedThreadId(data.threads[0].id);
        const rawCourses: any[] = (coursesRes as any).data?.data?.courses ?? (coursesRes as any).data?.courses ?? [];
        setEnrolledCourses(rawCourses);
      } catch (err: any) {
        setError(err.message || 'Failed to load discussions');
        fetchedForUserId.current = null;
      } finally { setLoadingData(false); }
    })();
  }, [user, authLoading, router]);

  // ── Socket setup ──
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    socket.connect();

    socket.on('new_reply', ({ threadId, reply, statusChange }: { threadId: string; reply: Reply; statusChange?: { isAnswered: boolean; status: ThreadStatus } | null }) => {
      if (!reply?.id || !reply?.author) return;

      setDiscussionData(prev => {
        if (!prev) return prev;
        const thread = prev.threads.find(t => t.id === threadId);
        if (!thread) return prev;
        if (thread.replies.some(r => r.id === reply.id)) return prev;
        return {
          ...prev,
          threads: prev.threads.map(t => t.id === threadId
            ? {
                ...t,
                replies: [...t.replies, reply],
                replyCount: t.replyCount + 1,
                ...(statusChange ? { isAnswered: statusChange.isAnswered, status: statusChange.status } : {}),
              }
            : t),
        };
      });
    });

    return () => {
      socket.off('new_reply');
      disconnectSocket();
    };
  }, [user]);

  // ── Join/leave thread rooms ──
  useEffect(() => {
    if (joinedThreadRef.current) {
      leaveThread(joinedThreadRef.current);
    }
    if (selectedThreadId) {
      joinThread(selectedThreadId);
      joinedThreadRef.current = selectedThreadId;
    } else {
      joinedThreadRef.current = null;
    }
  }, [selectedThreadId]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [discussionData, selectedThreadId]);

  if (!mounted || authLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-8 h-8 rounded-full border-[3px] border-blue-200 border-t-blue-700 animate-spin" />
    </div>
  );
  if (!user || user.role === 'TEACHER' || user.role === 'ADMIN') return null;

  const summary = discussionData?.summary;
  const threads = discussionData?.threads ?? [];

  const courseSet = new Map<string, string>();
  threads.forEach(t => courseSet.set(t.course.id, t.course.title));
  const courseOptions = [{ id: 'all', title: 'All Courses' }, ...Array.from(courseSet, ([id, title]) => ({ id, title }))];

  const filteredThreads = threads.filter(t => {
    const statusOk = activeFilter === 'all' || t.status === activeFilter;
    const tagOk    = activeTag    === 'all' || t.tag    === activeTag;
    const courseOk = activeCourse === 'all' || t.course.id === activeCourse;
    const scopeOk  = scopeFilter  === 'all' || t.author.id === user.id;
    const searchOk = !searchQuery
      || t.title.toLowerCase().includes(searchQuery.toLowerCase())
      || t.course.title.toLowerCase().includes(searchQuery.toLowerCase());
    return statusOk && tagOk && courseOk && scopeOk && searchOk;
  });

  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? null;
  const isMine = (t: Thread) => t.author.id === user.id;
  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = (user?.name || '').split(' ')[0] || 'there';

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); };

  const openCreate = () => { setForm(EMPTY_FORM); setModalMode('create'); };
  const openEdit   = (t: Thread) => { setForm({ title: t.title, content: t.content, tag: t.tag, courseId: t.course.id }); setModalMode('edit'); };
  const openDelete = () => setModalMode('delete');
  const closeModal = () => setModalMode('none');

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const res: any = await (api as any).createThread(form);
      const newT: Thread = (res.data as any)?.data?.discussion ?? (res.data as any)?.discussion ?? res.data;
      setDiscussionData(prev => prev ? {
        ...prev,
        summary: { ...prev.summary, total: prev.summary.total + 1, pending: prev.summary.pending + 1, myThreads: prev.summary.myThreads + 1 },
        threads: [newT, ...prev.threads],
      } : prev);
      setSelectedThreadId(newT.id);
      flash('Question submitted. Your teacher will be notified.');
      closeModal();
    } catch (err: any) { setError(err.message || 'Failed to submit question'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!selectedThread) return;
    setSubmitting(true);
    try {
      const res: any = await (api as any).updateThread(selectedThread.id, form);
      const updated: Thread = (res.data as any)?.data?.discussion ?? (res.data as any)?.discussion ?? res.data;
      setDiscussionData(prev => prev ? {
        ...prev,
        threads: prev.threads.map(t => t.id === updated.id ? { ...t, ...updated } : t),
      } : prev);
      flash('Question updated.');
      closeModal();
    } catch (err: any) { setError(err.message || 'Failed to update question'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selectedThread) return;
    setDeleting(true);
    try {
      await (api as any).deleteThread(selectedThread.id);
      setDiscussionData(prev => prev ? {
        ...prev,
        summary: { ...prev.summary, total: prev.summary.total - 1 },
        threads: prev.threads.filter(t => t.id !== selectedThread.id),
      } : prev);
      const remaining = threads.filter(t => t.id !== selectedThread.id);
      setSelectedThreadId(remaining.length ? remaining[0].id : null);
      flash('Question deleted.');
      closeModal();
    } catch (err: any) { setError(err.message || 'Failed to delete question'); }
    finally { setDeleting(false); }
  };

  const handleReply = async (content: string, file?: File | null) => {
    if (!selectedThread) return;
    try {
      const formData = new FormData();
      if (content) formData.append('content', content);
      if (file)    formData.append('attachment', file);

      const token = localStorage.getItem('token');
      const BASE  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:2001/api';
      const res   = await fetch(`${BASE}/discussions/${selectedThread.id}/replies`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to post reply');

      setDiscussionData(prev => prev ? {
        ...prev,
        summary: { ...prev.summary, totalReplies: prev.summary.totalReplies + 1 },
      } : prev);
    } catch (err: any) { setError(err.message || 'Failed to post reply'); }
  };

  const handleLike = async (replyId: string) => {
    if (!selectedThread) return;
    try {
      await (api as any).likeReply(selectedThread.id, replyId);
      setDiscussionData(prev => prev ? {
        ...prev,
        threads: prev.threads.map(t => t.id !== selectedThread.id ? t : {
          ...t,
          replies: t.replies.map(r => r.id === replyId
            ? { ...r, likes: r.likedByMe ? r.likes - 1 : r.likes + 1, likedByMe: !r.likedByMe }
            : r),
        }),
      } : prev);
    } catch { /* silent */ }
  };

  const statusFilters: Array<'all' | ThreadStatus> = ['all', 'pending', 'answered', 'locked'];

  const composerState = !selectedThread ? null : selectedThread.isLocked
    ? { disabled: true, reason: 'This thread is locked.' }
    : !isMine(selectedThread)
      ? { disabled: true, reason: 'This is a published answer — only the original asker can reply.' }
      : { disabled: false, reason: '' };

  return (
    <>
      <FontAwesomeLoader />

      {modalMode === 'create' && (
        <Modal title="Ask a Question" onClose={closeModal}>
          <ThreadForm form={form} setForm={setForm} courses={enrolledCourses} onSubmit={handleCreate} onCancel={closeModal} submitting={submitting} submitLabel="Submit Question" />
        </Modal>
      )}
      {modalMode === 'edit' && selectedThread && (
        <Modal title="Edit Question" onClose={closeModal}>
          <ThreadForm form={form} setForm={setForm} courses={courseOptions.filter(c => c.id !== 'all')} onSubmit={handleEdit} onCancel={closeModal} submitting={submitting} submitLabel="Save Changes" />
        </Modal>
      )}
      {modalMode === 'delete' && selectedThread && (
        <DeleteConfirm thread={selectedThread} onConfirm={handleDelete} onCancel={closeModal} deleting={deleting} />
      )}

      <div className="flex h-screen bg-slate-50" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sidebar activeItem="Discussions" />

        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between shrink-0 shadow-sm">
            <div className="min-w-0">
              <div className="text-slate-900 font-bold text-[15px] truncate">{greeting}, {displayName}</div>
              <div className="text-slate-400 text-[11px] mt-0.5 tracking-wide truncate">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {summary && <span className="hidden sm:inline"> · {summary.pending} awaiting · {summary.total} total</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={WEB_SEARCH_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                <i className="fa-solid fa-magnifying-glass text-xs" /><span className="hidden sm:inline">Search the Web</span>
              </a>
              <button onClick={openCreate} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 text-[13px] font-semibold rounded-lg text-white transition-all hover:opacity-90 shadow-sm" style={{ background: 'linear-gradient(135deg,#1E3A5F,#2563EB)' }}>
                <i className="fa-solid fa-plus text-xs" /><span className="hidden sm:inline">Ask a Question</span>
              </button>
              <a href="/dashboard" className="hidden md:flex items-center gap-1.5 text-slate-500 text-[13px] font-semibold hover:text-blue-700 transition-colors px-2">
                <i className="fa-solid fa-arrow-left text-xs" />Dashboard
              </a>
            </div>
          </header>

          {error && (
            <div className="mx-4 sm:mx-6 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2 shrink-0">
              <i className="fa-solid fa-circle-exclamation" />{error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          )}

          {successMsg && (
            <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-white border border-green-200 rounded-xl shadow-lg text-green-700 text-[13px] font-semibold" style={{ animation: 'fadeSlideUp 0.3s ease' }}>
              <i className="fa-solid fa-circle-check text-green-500" />{successMsg}
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* Left pane */}
            <div className={`${selectedThreadId ? 'hidden lg:flex' : 'flex'} lg:w-[360px] xl:w-[400px] w-full flex-col border-r border-slate-200 bg-white shrink-0`}>
              <div className="p-3 border-b border-slate-100 space-y-2">
                <div className="relative">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[11px]" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search questions…"
                    className="w-full pl-8 pr-3 py-2 text-[12px] border border-slate-200 rounded-lg text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div className="flex gap-1.5">
                  {(['all', 'mine'] as const).map(s => (
                    <button key={s} onClick={() => setScopeFilter(s)}
                      className={`flex-1 px-3 py-1.5 text-[11px] font-semibold rounded transition-all ${scopeFilter === s ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                      {s === 'all' ? 'Everyone' : 'Just mine'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {statusFilters.map(f => (
                    <button key={f} onClick={() => setActiveFilter(f)}
                      className={`px-3 py-1 text-[11px] font-semibold rounded capitalize transition-all whitespace-nowrap ${activeFilter === f ? 'bg-blue-700 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-blue-700 hover:text-white hover:border-blue-700'}`}>
                      {f === 'all' ? 'All' : STATUS_META[f].label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={activeTag} onChange={e => setActiveTag(e.target.value as 'all' | ThreadTag)} className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                    <option value="all">All Types</option>
                    <option value="question">Question</option>
                    <option value="resource">Resource</option>
                    <option value="general">General</option>
                  </select>
                  <select value={activeCourse} onChange={e => setActiveCourse(e.target.value)} className="flex-1 text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
                    {courseOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {loadingData
                  ? [0,1,2,3,4].map(i => <ThreadListSkeleton key={i} />)
                  : filteredThreads.length === 0
                    ? (
                      <div className="px-6 py-14 text-center">
                        <i className="fa-solid fa-comments-slash text-3xl text-slate-200 mb-3 block" />
                        <p className="text-slate-400 text-sm">{searchQuery ? 'No questions match your search.' : 'No questions match your filters.'}</p>
                      </div>
                    )
                    : filteredThreads.map((t, i) => (
                      <ThreadListItem key={t.id} thread={t} idx={i} active={t.id === selectedThreadId} isMine={isMine(t)} onClick={() => setSelectedThreadId(t.id)} />
                    ))
                }
              </div>
            </div>

            {/* Right pane */}
            <div className={`${selectedThreadId ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0 bg-slate-50`}>
              {selectedThread ? (
                <>
                  {/* Chat header */}
                  <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
                    <button onClick={() => setSelectedThreadId(null)} className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all shrink-0">
                      <i className="fa-solid fa-arrow-left text-xs" />
                    </button>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0" style={{ background: '#1E3A5F' }}>
                      {selectedThread.course.title.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isMine(selectedThread) && !selectedThread.isVisible && <i className="fa-solid fa-eye-slash text-amber-400 text-[10px] shrink-0" title="Only visible to you" />}
                        {selectedThread.isVisible && <i className="fa-solid fa-eye text-teal-400 text-[10px] shrink-0" title="Published for everyone" />}
                        <h2 className="text-slate-900 font-bold text-[14px] truncate">{selectedThread.title}</h2>
                      </div>
                      <div className="text-slate-400 text-[11px] truncate">
                        {selectedThread.course.title} · {selectedThread.replyCount} {selectedThread.replyCount === 1 ? 'reply' : 'replies'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: STATUS_META[selectedThread.status].color, background: STATUS_META[selectedThread.status].bg }}>
                        <i className={`fa-solid ${STATUS_META[selectedThread.status].icon} text-[10px]`} />{STATUS_META[selectedThread.status].label}
                      </span>
                      {isMine(selectedThread) && !selectedThread.isAnswered && (
                        <>
                          <button onClick={() => openEdit(selectedThread)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-all" title="Edit question">
                            <i className="fa-solid fa-pen-to-square text-xs" />
                          </button>
                          <button onClick={openDelete} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all" title="Delete question">
                            <i className="fa-solid fa-trash text-xs" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {!isMine(selectedThread) && selectedThread.isVisible && (
                    <div className="px-4 sm:px-6 pt-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-[11px] font-semibold">
                        <i className="fa-solid fa-circle-info text-[10px]" />
                        Published FAQ entry from another student — read only.
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
                    <MessageBubble
                      authorName={selectedThread.author.name}
                      authorRole={selectedThread.author.role}
                      content={selectedThread.content}
                      createdAt={selectedThread.createdAt}
                      color={ACCENT_COLORS[0]}
                      isOwn={selectedThread.author.id === user.id}
                      isOriginal
                    />
                    {selectedThread.replies.map((r, idx) => {
                      if (!r?.author) return null;
                      return (
                        <MessageBubble
                          key={r.id}
                          authorName={r.author.name}
                          authorRole={r.author.role}
                          content={r.content}
                          imageUrl={r.imageUrl}
                          voiceNoteUrl={r.voiceNoteUrl}
                          createdAt={r.createdAt}
                          color={ACCENT_COLORS[(idx + 1) % ACCENT_COLORS.length]}
                          isOwn={r.author.id === user.id}
                          isAccepted={r.isAccepted}
                          likes={r.likes}
                          likedByMe={r.likedByMe}
                          onLike={() => handleLike(r.id)}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <ChatComposer
                    onSend={handleReply}
                    disabled={!!composerState?.disabled}
                    disabledReason={composerState?.reason || ''}
                    placeholder="Write your reply… (Enter to send)"
                  />
                </>
              ) : (
                <EmptyChatState summary={summary} hasThreads={threads.length > 0} onNewThread={openCreate} />
              )}
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}