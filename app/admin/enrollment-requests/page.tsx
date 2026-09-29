"use client";

import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "@/app/components/Sidebar";
import { api, EnrollmentRequest, User } from "@/lib/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faCheck,
  faTimes,
  faSpinner,
  faExclamationTriangle,
  faClipboardList,
  faChevronLeft,
  faChevronRight,
  faFilter,
  faEye,
  faGraduationCap,
  faBook,
  faCheckCircle,
  faTimesCircle,
  faClock,
  faInfoCircle,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

interface EnrichedRequest extends EnrollmentRequest {
  user?: Pick<User, "id" | "name" | "email" | "avatar">;
  course?: {
    id: string;
    title: string;
    thumbnail?: string;
    teacher?: Pick<User, "id" | "name">;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });
}

function resolveAvatar(avatar?: string | null) {
  if (!avatar) return undefined;
  if (avatar.startsWith("http")) return avatar;
  return `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? ""}${avatar}`;
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    PENDING:  { icon: faClock,       cls: "bg-amber-100 text-amber-700 border-amber-200",   label: "Pending"  },
    APPROVED: { icon: faCheckCircle, cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Approved" },
    REJECTED: { icon: faTimesCircle, cls: "bg-red-100 text-red-600 border-red-200",         label: "Rejected" },
  };
  const cfg = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      <FontAwesomeIcon icon={cfg.icon} className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ name = "", avatar, size = 36 }: { name?: string; avatar?: string | null; size?: number }) {
  const src = resolveAvatar(avatar);
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      <img src={src} alt={name} onError={() => setErr(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35,
        background: "linear-gradient(135deg, #3B82F6, #1D4ED8)" }}>
      {initials(name)}
    </div>
  );
}

// ─── Note Modal ───────────────────────────────────────────────────────────────

function NoteModal({
  title,
  label,
  placeholder,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string; label: string; placeholder: string;
  confirmLabel: string; confirmClass: string;
  onConfirm: (note: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-slate-900 font-bold text-base">{title}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
            {label} <span className="text-slate-400 font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder={placeholder}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition resize-none" />
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Cancel
          </button>
          <button onClick={() => onConfirm(note)} disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${confirmClass}`}>
            {loading
              ? <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ req, onClose }: { req: EnrichedRequest; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center justify-between">
          <span className="text-white font-bold text-base">Enrollment Request</span>
          <button onClick={onClose} className="text-white/70 hover:text-white transition">
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Student */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <UserAvatar name={req.user?.name} avatar={req.user?.avatar} size={44} />
            <div>
              <div className="text-slate-900 font-bold text-sm">{req.user?.name ?? "Unknown"}</div>
              <div className="text-slate-500 text-xs">{req.user?.email}</div>
              <div className="mt-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">STUDENT</span>
              </div>
            </div>
          </div>

          {/* Course */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden">
              {req.course?.thumbnail
                ? <img src={req.course.thumbnail} alt={req.course.title} className="w-full h-full object-cover" />
                : <FontAwesomeIcon icon={faBook} className="w-5 h-5 text-blue-600" />}
            </div>
            <div>
              <div className="text-slate-900 font-bold text-sm">{req.course?.title ?? "Unknown Course"}</div>
              {req.course?.teacher && (
                <div className="text-slate-500 text-xs">by {req.course.teacher.name}</div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 font-medium mb-1">Status</div>
              <StatusBadge status={req.status} />
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 font-medium mb-1">Requested</div>
              <div className="text-sm font-semibold text-slate-700">{formatDate(req.createdAt)}</div>
              <div className="text-xs text-slate-400">{formatTime(req.createdAt)}</div>
            </div>
          </div>

          {/* Admin note */}
          {req.adminNote && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <div className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1">
                <FontAwesomeIcon icon={faInfoCircle} className="w-3 h-3" />
                Admin Note
              </div>
              <div className="text-sm text-slate-700">{req.adminNote}</div>
            </div>
          )}
        </div>
        <div className="px-6 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ requests }: { requests: EnrichedRequest[] }) {
  const pending  = requests.filter(r => r.status === "PENDING").length;
  const approved = requests.filter(r => r.status === "APPROVED").length;
  const rejected = requests.filter(r => r.status === "REJECTED").length;

  const cards = [
    { label: "Total",    value: requests.length, cls: "bg-blue-50 text-blue-700 border-blue-100"     },
    { label: "Pending",  value: pending,          cls: "bg-amber-50 text-amber-700 border-amber-100"  },
    { label: "Approved", value: approved,         cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    { label: "Rejected", value: rejected,         cls: "bg-red-50 text-red-600 border-red-100"        },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border px-4 py-3 flex flex-col gap-0.5 ${c.cls}`}>
          <div className="text-2xl font-black">{c.value}</div>
          <div className="text-xs font-bold uppercase tracking-wide opacity-70">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

export default function AdminEnrollmentRequestsPage() {
  const [requests, setRequests]       = useState<EnrichedRequest[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [page, setPage]               = useState(1);

  // Action modals
  const [approveTarget, setApproveTarget] = useState<EnrichedRequest | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<EnrichedRequest | null>(null);
  const [detailTarget, setDetailTarget]   = useState<EnrichedRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelected(new Set());
    try {
      const res = await api.admin.getEnrollmentRequests();
      const raw: any = res.data;
      const list: EnrichedRequest[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.requests)
        ? raw.requests
        : [];
      setRequests(list);
    } catch (e: any) {
      setError(e.message || "Failed to load enrollment requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = requests.filter(r => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.user?.name?.toLowerCase().includes(q) ||
        r.user?.email?.toLowerCase().includes(q) ||
        r.course?.title?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Approve ────────────────────────────────────────────────────────────────
  const handleApprove = async (note: string) => {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await api.admin.approveEnrollmentRequest(approveTarget.id, note || undefined);
      setRequests(prev =>
        prev.map(r => r.id === approveTarget.id ? { ...r, status: "APPROVED", adminNote: note || undefined } : r)
      );
      setApproveTarget(null);
      showToast("Request approved — student enrolled.", true);
    } catch (e: any) {
      showToast(e.message || "Failed to approve request.", false);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async (note: string) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await api.admin.rejectEnrollmentRequest(rejectTarget.id, note || undefined);
      setRequests(prev =>
        prev.map(r => r.id === rejectTarget.id ? { ...r, status: "REJECTED", adminNote: note || undefined } : r)
      );
      setRejectTarget(null);
      showToast("Request rejected.", true);
    } catch (e: any) {
      showToast(e.message || "Failed to reject request.", false);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Bulk approve ───────────────────────────────────────────────────────────
  const handleBulkApprove = async () => {
    if (!selected.size) return;
    setActionLoading(true);
    let ok = 0;
    for (const id of selected) {
      try {
        await api.admin.approveEnrollmentRequest(id);
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "APPROVED" } : r));
        ok++;
      } catch { /* continue */ }
    }
    setSelected(new Set());
    showToast(`${ok}/${selected.size} requests approved.`, true);
    setActionLoading(false);
  };

  // ── Bulk reject ────────────────────────────────────────────────────────────
  const handleBulkReject = async () => {
    if (!selected.size) return;
    setActionLoading(true);
    let ok = 0;
    for (const id of selected) {
      try {
        await api.admin.rejectEnrollmentRequest(id);
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "REJECTED" } : r));
        ok++;
      } catch { /* continue */ }
    }
    setSelected(new Set());
    showToast(`${ok}/${selected.size} requests rejected.`, false);
    setActionLoading(false);
  };

  // ── Select ─────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allPendingOnPage = paginated.filter(r => r.status === "PENDING");
  const allSelectedOnPage = allPendingOnPage.length > 0 && allPendingOnPage.every(r => selected.has(r.id));

  const toggleSelectAllOnPage = () => {
    if (allSelectedOnPage) {
      setSelected(prev => {
        const next = new Set(prev);
        allPendingOnPage.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allPendingOnPage.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const STATUS_TABS: { label: string; value: StatusFilter }[] = [
    { label: "Pending",  value: "PENDING"  },
    { label: "Approved", value: "APPROVED" },
    { label: "Rejected", value: "REJECTED" },
    { label: "All",      value: "ALL"      },
  ];

  const pendingCount = requests.filter(r => r.status === "PENDING").length;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <Sidebar activeItem="Enrollment Requests" />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Enrollment Requests</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {loading ? "Loading…" : `${pendingCount} pending · ${requests.length} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <span className="text-sm text-slate-500 font-medium">{selected.size} selected</span>
                <button onClick={handleBulkApprove} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
                  {actionLoading
                    ? <FontAwesomeIcon icon={faSpinner} className="w-3.5 h-3.5 animate-spin" />
                    : <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5" />}
                  Approve All
                </button>
                <button onClick={handleBulkReject} disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                  Reject All
                </button>
              </>
            )}
            <button onClick={fetchRequests}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
              <FontAwesomeIcon icon={faRefresh} className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Stats */}
          {!loading && <StatsBar requests={requests} />}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <FontAwesomeIcon icon={faSearch}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
              <input
                type="text" placeholder="Search student, email or course…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition" />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
              {STATUS_TABS.map(t => (
                <button key={t.value} onClick={() => setStatusFilter(t.value)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === t.value
                      ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                      : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {t.label}
                  {t.value === "PENDING" && pendingCount > 0 && (
                    <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* States */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faSpinner} className="w-8 h-8 animate-spin mb-3 text-blue-500" />
              <span className="text-sm">Loading requests…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-24">
              <FontAwesomeIcon icon={faExclamationTriangle} className="w-8 h-8 mb-3 text-red-400" />
              <p className="text-sm text-red-500 mb-4">{error}</p>
              <button onClick={fetchRequests}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FontAwesomeIcon icon={faClipboardList} className="w-10 h-10 mb-3 text-slate-300" />
              <p className="text-sm font-medium">
                {search ? "No requests match your search." : `No ${statusFilter.toLowerCase()} requests.`}
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && paginated.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {/* Checkbox — only show when on pending tab */}
                      {statusFilter === "PENDING" && (
                        <th className="px-4 py-3.5 w-10">
                          <input type="checkbox"
                            checked={allSelectedOnPage}
                            onChange={toggleSelectAllOnPage}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                        </th>
                      )}
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">Student</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden md:table-cell">Course</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider hidden lg:table-cell">Requested</th>
                      <th className="text-left px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3.5 text-slate-400 font-bold text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((req, i) => {
                      const isPending = req.status === "PENDING";
                      const isSelected = selected.has(req.id);
                      return (
                        <tr key={req.id}
                          className={`border-b border-slate-50 transition-colors ${
                            i === paginated.length - 1 ? "border-b-0" : ""
                          } ${isSelected ? "bg-blue-50/40" : "hover:bg-slate-50/50"}`}>

                          {/* Checkbox */}
                          {statusFilter === "PENDING" && (
                            <td className="px-4 py-4">
                              {isPending && (
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => toggleSelect(req.id)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                              )}
                            </td>
                          )}

                          {/* Student */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <UserAvatar name={req.user?.name} avatar={req.user?.avatar} size={36} />
                              <div>
                                <div className="text-slate-900 font-semibold">{req.user?.name ?? "Unknown"}</div>
                                <div className="text-slate-400 text-xs">{req.user?.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Course */}
                          <td className="px-5 py-4 hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 overflow-hidden">
                                {req.course?.thumbnail
                                  ? <img src={req.course.thumbnail} alt="" className="w-full h-full object-cover" />
                                  : <FontAwesomeIcon icon={faBook} className="w-3.5 h-3.5 text-blue-500" />}
                              </div>
                              <div>
                                <div className="text-slate-800 font-medium truncate max-w-[180px]">
                                  {req.course?.title ?? "Unknown"}
                                </div>
                                {req.course?.teacher && (
                                  <div className="text-slate-400 text-xs">{req.course.teacher.name}</div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-5 py-4 text-slate-400 text-xs hidden lg:table-cell">
                            <div>{formatDate(req.createdAt)}</div>
                            <div>{formatTime(req.createdAt)}</div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-4">
                            <StatusBadge status={req.status} />
                            {req.adminNote && (
                              <div className="text-[10px] text-slate-400 mt-0.5 max-w-[100px] truncate" title={req.adminNote}>
                                "{req.adminNote}"
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setDetailTarget(req)} title="View details"
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition flex items-center justify-center">
                                <FontAwesomeIcon icon={faEye} className="w-3.5 h-3.5" />
                              </button>
                              {isPending && (
                                <>
                                  <button onClick={() => setApproveTarget(req)} title="Approve"
                                    className="w-8 h-8 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition flex items-center justify-center">
                                    <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setRejectTarget(req)} title="Reject"
                                    className="w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition flex items-center justify-center">
                                    <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {req.status === "APPROVED" && (
                                <button onClick={() => setRejectTarget(req)} title="Revoke approval"
                                  className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 text-xs font-semibold transition">
                                  Revoke
                                </button>
                              )}
                              {req.status === "REJECTED" && (
                                <button onClick={() => setApproveTarget(req)} title="Re-approve"
                                  className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-semibold transition">
                                  Approve
                                </button>
                              )}
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
                    Page {page} of {totalPages} · {filtered.length} requests
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 transition flex items-center justify-center">
                      <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`e${i}`} className="text-slate-300 px-1 text-xs">…</span>
                        ) : (
                          <button key={p} onClick={() => setPage(p as number)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                              page === p
                                ? "bg-blue-600 text-white border border-blue-600"
                                : "border border-slate-200 text-slate-500 hover:bg-white"
                            }`}>
                            {p}
                          </button>
                        )
                      )}
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 transition flex items-center justify-center">
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
      {approveTarget && (
        <NoteModal
          title={`Approve — ${approveTarget.user?.name}`}
          label="Approval Note"
          placeholder="e.g. Welcome to the course! You're all set."
          confirmLabel="Approve & Enroll"
          confirmClass="bg-emerald-600 hover:bg-emerald-700"
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
          loading={actionLoading}
        />
      )}
      {rejectTarget && (
        <NoteModal
          title={`Reject — ${rejectTarget.user?.name}`}
          label="Rejection Reason"
          placeholder="e.g. Course is full. Please try again next semester."
          confirmLabel="Reject Request"
          confirmClass="bg-red-500 hover:bg-red-600"
          onConfirm={handleReject}
          onCancel={() => setRejectTarget(null)}
          loading={actionLoading}
        />
      )}
      {detailTarget && (
        <DetailModal req={detailTarget} onClose={() => setDetailTarget(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 ${toast.ok ? "bg-emerald-600" : "bg-red-500"}`}>
          <FontAwesomeIcon icon={toast.ok ? faCheckCircle : faTimesCircle} className="w-4 h-4" />
          {toast.msg}
          <button onClick={() => setToast(null)} className="text-white/60 hover:text-white transition ml-1">
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}