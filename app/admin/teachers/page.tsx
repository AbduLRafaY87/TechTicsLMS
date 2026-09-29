"use client";

import React, { useEffect, useState, useCallback } from "react";
import Sidebar from "@/app/components/Sidebar";
import { api, User } from "@/lib/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faTrash,
  faEye,
  faEnvelope,
  faCalendar,
  faSpinner,
  faExclamationTriangle,
  faUsers,
  faChevronLeft,
  faChevronRight,
  faTimes,
  faUserCircle,
  faPencilAlt,
  faCheckCircle,
  faTimesCircle,
  faPhone,
  faShieldAlt,
  faSave,
  faChalkboardTeacher,
  faBook,
  faUserGraduate,
  faBriefcase,
} from "@fortawesome/free-solid-svg-icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveAvatarUrl(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "";
  return `${base}${avatar}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  return (name || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isVerified(user: User): boolean {
  return Boolean(user.emailVerified);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user, size = 40 }: { user: User; size?: number }) {
  const src = resolveAvatarUrl(user.avatar);
  const [err, setErr] = useState(false);

  if (src && !err) {
    return (
      <img
        src={src}
        alt={user.name}
        onError={() => setErr(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.35,
        background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
      }}
    >
      {initials(user.name)}
    </div>
  );
}

// ── Verified Badge ────────────────────────────────────────────────────────────

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <FontAwesomeIcon icon={faCheckCircle} className="w-3 h-3" />
      Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      <FontAwesomeIcon icon={faTimesCircle} className="w-3 h-3" />
      Unverified
    </span>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

function DeleteModal({
  user,
  onConfirm,
  onCancel,
  loading,
}: {
  user: User;
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
            <h3 className="text-slate-900 font-bold text-base">Remove Teacher</h3>
            <p className="text-slate-500 text-sm">This action cannot be undone</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-600 transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-5">
          <Avatar user={user} size={40} />
          <div>
            <div className="text-slate-900 font-semibold text-sm">{user.name}</div>
            <div className="text-slate-500 text-xs">{user.email}</div>
          </div>
        </div>
        <p className="text-slate-600 text-sm mb-5">
          Are you sure you want to permanently delete <strong>{user.name}</strong>'s account? All
          their courses and data will be removed.
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
              "Delete Teacher"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Teacher Detail Modal ──────────────────────────────────────────────────────

function TeacherDetailModal({ user, onClose }: { user: User & { _count?: { taughtCourses?: number; enrollments?: number } }; onClose: () => void }) {
  const verified = isVerified(user);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 flex items-center justify-between">
          <span className="text-white font-bold text-base">Teacher Profile</span>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar user={user} size={56} />
            <div>
              <div className="text-slate-900 font-bold text-lg">{user.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                  TEACHER
                </span>
                <VerifiedBadge verified={verified} />
              </div>
            </div>
          </div>

          {/* Stats row */}
          {user._count && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-violet-50 rounded-xl p-3 text-center">
                <div className="text-violet-700 font-black text-2xl">{user._count.taughtCourses ?? 0}</div>
                <div className="text-violet-500 text-xs font-semibold mt-0.5">Courses</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="text-blue-700 font-black text-2xl">{user._count.enrollments ?? 0}</div>
                <div className="text-blue-500 text-xs font-semibold mt-0.5">Students</div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faEnvelope} className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Email</div>
                <div className="text-slate-800 font-medium">{user.email}</div>
              </div>
            </div>
            {user.phone && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faPhone} className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Phone</div>
                  <div className="text-slate-800 font-medium">{user.phone}</div>
                </div>
              </div>
            )}
            {user.bio && (
              <div className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                  <FontAwesomeIcon icon={faBriefcase} className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Bio</div>
                  <div className="text-slate-800 font-medium">{user.bio}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Joined</div>
                <div className="text-slate-800 font-medium">{formatDate(user.createdAt)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <div className="text-slate-400 text-xs">Account Status</div>
                <div className="mt-0.5">
                  <VerifiedBadge verified={verified} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Teacher Modal ────────────────────────────────────────────────────────

interface EditForm {
  name: string;
  email: string;
  phone: string;
  bio: string;
}

function EditTeacherModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: (updated: User) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    bio: user.bio ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await api.updateUser(user.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        bio: form.bio.trim() || undefined,
      } as Partial<User>);
      const updated: User = (res.data as any)?.data ?? (res.data as any)?.user ?? res.data as User;
      onSaved({ ...user, ...updated });
    } catch (err: any) {
      setError(err.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  const verified = isVerified(user);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faPencilAlt} className="w-4 h-4 text-white/80" />
            <span className="text-white font-bold text-base">Edit Teacher</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Avatar + verification status */}
          <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-3">
            <Avatar user={{ ...user, name: form.name || user.name }} size={48} />
            <div>
              <div className="text-slate-700 font-semibold text-sm">{form.name || user.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  TEACHER
                </span>
                <VerifiedBadge verified={verified} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Full Name <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <FontAwesomeIcon
                icon={faUserCircle}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
              />
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Teacher full name"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <FontAwesomeIcon
                icon={faEnvelope}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
              />
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="teacher@example.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Phone
            </label>
            <div className="relative">
              <FontAwesomeIcon
                icon={faPhone}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
              />
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
              Bio
            </label>
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={3}
              placeholder="Short bio about the teacher…"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition resize-none"
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FontAwesomeIcon icon={faShieldAlt} className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Account Status</span>
            </div>
            <VerifiedBadge verified={verified} />
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
            className="flex-1 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
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

// ── Types ─────────────────────────────────────────────────────────────────────

type TeacherUser = User & {
  _count?: {
    taughtCourses?: number;
    enrollments?: number;
  };
};

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export default function AdminTeachersPage() {
  const [teachers, setTeachers]           = useState<TeacherUser[]>([]);
  const [filtered, setFiltered]           = useState<TeacherUser[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");
  const [search, setSearch]               = useState("");
  const [page, setPage]                   = useState(1);
  const [viewUser, setViewUser]           = useState<TeacherUser | null>(null);
  const [deleteUser, setDeleteUser]       = useState<TeacherUser | null>(null);
  const [editUser, setEditUser]           = useState<TeacherUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast]                 = useState("");

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getUsers("?role=TEACHER");
      const raw: any = res.data;
      const list: TeacherUser[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.users)
        ? raw.users
        : [];
      setTeachers(list);
      setFiltered(list);
    } catch (err: any) {
      setError(err.message || "Failed to load teachers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  // ── Search ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? teachers.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.email.toLowerCase().includes(q)
          )
        : teachers
    );
    setPage(1);
  }, [search, teachers]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      await api.deleteUser(deleteUser.id);
      setTeachers((prev) => prev.filter((t) => t.id !== deleteUser.id));
      setDeleteUser(null);
      showToast("Teacher removed successfully.");
    } catch (err: any) {
      showToast(err.message || "Failed to delete teacher.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Edit saved ──────────────────────────────────────────────────────────
  const handleEditSaved = (updated: User) => {
    setTeachers((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    setEditUser(null);
    showToast("Teacher updated successfully.");
  };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  // ── Pagination ──────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Stats ───────────────────────────────────────────────────────────────
  const totalCourses   = teachers.reduce((sum, t) => sum + (t._count?.taughtCourses ?? 0), 0);
  const verifiedCount  = teachers.filter((t) => isVerified(t)).length;

  return (
    <div
      className="flex h-screen bg-slate-50 overflow-hidden"
      style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
    >
      <Sidebar activeItem="Teachers" />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Manage Teachers</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {loading
                ? "Loading…"
                : `${filtered.length} teacher${filtered.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-violet-50 border border-violet-100 px-4 py-2 rounded-full">
            <FontAwesomeIcon icon={faChalkboardTeacher} className="w-4 h-4 text-violet-600" />
            <span className="text-violet-700 text-sm font-bold">{teachers.length} Total</span>
          </div>
        </div>

        <div className="px-8 py-6">

          {/* Stats cards */}
          {!loading && !error && teachers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faChalkboardTeacher} className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{teachers.length}</div>
                  <div className="text-slate-400 text-xs font-semibold">Total Teachers</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faBook} className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{totalCourses}</div>
                  <div className="text-slate-400 text-xs font-semibold">Courses Created</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-900">{verifiedCount}</div>
                  <div className="text-slate-400 text-xs font-semibold">Verified Accounts</div>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="mb-6 relative max-w-md">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition"
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

          {/* States */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 animate-spin mb-3 text-violet-500" />
              <span className="text-sm">Loading teachers…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 mb-3 text-red-400" />
              <span className="text-sm text-red-500">{error}</span>
              <button
                onClick={fetchTeachers}
                className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faChalkboardTeacher} className="w-10 h-10 mb-3 text-slate-300" />
              <span className="text-sm font-medium">
                {search ? "No teachers match your search." : "No teachers registered yet."}
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
                        Teacher
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden md:table-cell">
                        Email
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Courses
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Status
                      </th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">
                        Joined
                      </th>
                      <th className="text-right px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((teacher, i) => {
                      const verified = isVerified(teacher);
                      return (
                        <tr
                          key={teacher.id}
                          className={`border-b border-slate-50 hover:bg-violet-50/30 transition-colors ${
                            i === paginated.length - 1 ? "border-b-0" : ""
                          }`}
                        >
                          {/* Teacher */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar user={teacher} size={38} />
                              <div>
                                <div className="text-slate-900 font-semibold">{teacher.name}</div>
                                <div className="text-slate-400 text-xs md:hidden">{teacher.email}</div>
                                <div className="lg:hidden mt-0.5">
                                  <VerifiedBadge verified={verified} />
                                </div>
                              </div>
                            </div>
                          </td>
                          {/* Email */}
                          <td className="px-5 py-4 text-slate-500 hidden md:table-cell">
                            {teacher.email}
                          </td>
                          {/* Courses count */}
                          <td className="px-5 py-4 hidden lg:table-cell">
                            <div className="flex items-center gap-1.5">
                              <FontAwesomeIcon icon={faBook} className="w-3.5 h-3.5 text-violet-400" />
                              <span className="text-slate-700 font-semibold">
                                {teacher._count?.taughtCourses ?? 0}
                              </span>
                              <span className="text-slate-400 text-xs">courses</span>
                            </div>
                          </td>
                          {/* Status */}
                          <td className="px-5 py-4 hidden lg:table-cell">
                            <VerifiedBadge verified={verified} />
                          </td>
                          {/* Joined */}
                          <td className="px-5 py-4 text-slate-400 hidden lg:table-cell">
                            {formatDate(teacher.createdAt)}
                          </td>
                          {/* Actions */}
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setViewUser(teacher)}
                                title="View profile"
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition flex items-center justify-center"
                              >
                                <FontAwesomeIcon icon={faEye} className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditUser(teacher)}
                                title="Edit teacher"
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition flex items-center justify-center"
                              >
                                <FontAwesomeIcon icon={faPencilAlt} className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteUser(teacher)}
                                title="Delete teacher"
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition flex items-center justify-center"
                              >
                                <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50">
                  <span className="text-slate-400 text-xs">
                    Page {page} of {totalPages} · {filtered.length} teachers
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
                                ? "bg-violet-600 text-white border border-violet-600"
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
      {viewUser && (
        <TeacherDetailModal user={viewUser} onClose={() => setViewUser(null)} />
      )}
      {editUser && (
        <EditTeacherModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={handleEditSaved}
        />
      )}
      {deleteUser && (
        <DeleteModal
          user={deleteUser}
          onConfirm={handleDelete}
          onCancel={() => setDeleteUser(null)}
          loading={deleteLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in">
          {toast}
          <button onClick={() => setToast("")} className="text-white/60 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}