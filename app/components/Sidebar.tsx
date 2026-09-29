"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTachometerAlt,
  faBook,
  faChartLine,
  faCalendar,
  faComments,
  faCog,
  faSignOutAlt,
  faBars,
  faTimes,
  faUsers,
  faLayerGroup,
  faChalkboardTeacher,
  faUserShield,
  faClipboardList,
  faBell,
  faGraduationCap,
  faShieldAlt,
} from "@fortawesome/free-solid-svg-icons";
import logoImage from "@/public/logo.png";

type NavItem = { icon: any; label: string; href: string };

// ── Student Nav ───────────────────────────────────────────────────────────────

const STUDENT_MAIN_NAV: NavItem[] = [
  { icon: faTachometerAlt, label: "Dashboard",   href: "/dashboard"   },
  { icon: faBook,          label: "Courses",     href: "/courses"     },
  { icon: faChartLine,     label: "Progress",    href: "/progress"    },
  { icon: faCalendar,      label: "Attendance",  href: "/attendance"  },
  { icon: faComments,      label: "Discussions", href: "/discussions" },
];

// ── Teacher Nav ───────────────────────────────────────────────────────────────

const TEACHER_MAIN_NAV: NavItem[] = [
  { icon: faTachometerAlt,    label: "Dashboard",   href: "/teacher/dashboard"   },
  { icon: faBook,             label: "Courses",     href: "/teacher/courses"     },
  { icon: faUsers,            label: "Students",    href: "/teacher/students"    },
  { icon: faCalendar,         label: "Attendance",  href: "/teacher/attendance"  },
  { icon: faComments,         label: "Discussions", href: "/teacher/discussions" },
];

// ── Admin Nav ─────────────────────────────────────────────────────────────────

const ADMIN_MAIN_NAV: NavItem[] = [
  { icon: faTachometerAlt, label: "Dashboard",   href: "/admin/dashboard"     },
  { icon: faBook,          label: "Courses",     href: "/teacher/courses"     },
  { icon: faCalendar,      label: "Attendance",  href: "/teacher/attendance"  },
  { icon: faComments,      label: "Discussions", href: "/teacher/discussions" },
];

const ADMIN_MANAGEMENT_NAV: NavItem[] = [
  { icon: faGraduationCap,     label: "Students",            href: "/admin/students"            },
  { icon: faChalkboardTeacher, label: "Teachers",            href: "/admin/teachers"            },
  { icon: faBook,              label: "Courses",             href: "/admin/courses"             },
  { icon: faClipboardList,     label: "Enrollment Requests", href: "/admin/enrollment-requests" },
];

// ── System Nav ────────────────────────────────────────────────────────────────

const SYSTEM_NAV: NavItem[] = [
  { icon: faCog, label: "Settings", href: "/settings" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  admin:   "bg-purple-100 text-purple-700",
  teacher: "bg-blue-100   text-blue-700",
  student: "bg-green-100  text-green-700",
};

function resolveAvatarUrl(avatar?: string | null): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "";
  return `${base}${avatar}`;
}

function initials(name: string): string {
  return (name || "")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SidebarSectionProps {
  label: string;
  items: NavItem[];
  active: string;
  onNav: (href: string) => void;
}

function SidebarSection({ label, items, active, onNav }: SidebarSectionProps): React.ReactElement {
  return (
    <div className="mb-1">
      <p className="text-slate-400 text-[10px] font-bold uppercase px-4 pt-4 pb-2 tracking-widest">
        {label}
      </p>
      {items.map((item) => {
        const isActive = item.label === active;
        return (
          <a
            key={item.label}
            href={item.href}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              onNav(item.href);
            }}
            className={`flex items-center gap-3 mx-2 px-4 py-2.5 rounded-lg text-sm font-semibold mb-0.5 transition-all duration-150 ${
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <FontAwesomeIcon icon={item.icon} className="w-4 h-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white opacity-60 shrink-0" />}
          </a>
        );
      })}
    </div>
  );
}

// ── User Footer (Client-Only) ─────────────────────────────────────────────────

interface UserFooterProps {
  avatarSrc?: string;
  userName: string;
  userRole: string;
  onLogout: () => void;
}

function UserFooter({ avatarSrc, userName, userRole, onLogout }: UserFooterProps): React.ReactElement {
  const roleBadge = ROLE_BADGE[userRole.toLowerCase()] ?? ROLE_BADGE.student;

  return (
    <div className="px-4 pb-4 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 mb-3">
        <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={userName}
              className="w-full h-full object-cover"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white text-xs font-black"
              style={{ background: "linear-gradient(135deg, #3B82F6, #1D4ED8)" }}
            >
              {initials(userName)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-900 text-sm font-semibold truncate">
            {userName}
          </div>
          <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${roleBadge}`}>
            {userRole}
          </span>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-150"
      >
        <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}

// ── SidebarContent ────────────────────────────────────────────────────────────

interface SidebarContentProps {
  activeItem: string;
  onClose: () => void;
  showClose: boolean;
}

function SidebarContent({ activeItem, onClose, showClose }: SidebarContentProps): React.ReactElement {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Ensure client-only rendering to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdmin   = !authLoading && user?.role === "ADMIN";
  const isTeacher = !authLoading && (user?.role === "TEACHER" || user?.role === "ADMIN");
  const mainNav   = isAdmin ? ADMIN_MAIN_NAV : isTeacher ? TEACHER_MAIN_NAV : STUDENT_MAIN_NAV;

  function handleNav(href: string): void {
    onClose();
    router.push(href);
  }

  function handleLogout(): void {
    logout();
    router.replace("/login");
  }

  const avatarSrc = mounted ? resolveAvatarUrl(user?.avatar) : undefined;
  const userName = mounted ? (user?.name ?? "User") : "Loading…";
  const userRole = mounted ? (user?.role ?? "STUDENT") : "STUDENT";

  return (
    <aside
      className="w-64 flex flex-col h-full bg-white border-r border-slate-200"
      style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shrink-0 overflow-hidden">
            <img src={logoImage.src} alt="TechTics" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-slate-900 font-black text-sm">TechTics</div>
            <div className="text-blue-600 text-[10px] font-semibold uppercase tracking-wider">
              {authLoading
                ? "Loading..."
                : isAdmin
                ? "Admin Portal"
                : isTeacher
                ? "Teacher Portal"
                : "LMS Portal"}
            </div>
          </div>
        </div>
        {showClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition rounded-lg p-1.5"
          >
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Role banner */}
      {!authLoading && isTeacher && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 flex items-center gap-2">
          <FontAwesomeIcon
            icon={isAdmin ? faShieldAlt : faLayerGroup}
            className="w-3.5 h-3.5 text-blue-600 shrink-0"
          />
          <span className="text-blue-700 text-xs font-semibold">
            {isAdmin ? "Admin — full access" : "Teacher view"}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav
        className="flex-1 px-1 py-2 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#CBD5E1 transparent" }}
      >
        {authLoading ? (
          <div className="space-y-1 px-2 pt-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 mx-2" />
            ))}
          </div>
        ) : (
          <>
            <SidebarSection label="Main" items={mainNav} active={activeItem} onNav={handleNav} />

            {isAdmin && (
              <>
                <div className="mx-4 my-2 border-t border-slate-100" />
                <SidebarSection
                  label="Management"
                  items={ADMIN_MANAGEMENT_NAV}
                  active={activeItem}
                  onNav={handleNav}
                />
              </>
            )}

            <div className="mx-4 my-2 border-t border-slate-100" />
            <SidebarSection label="System" items={SYSTEM_NAV} active={activeItem} onNav={handleNav} />
          </>
        )}
      </nav>

      {/* User footer — only render on client */}
      {mounted && (
        <UserFooter
          avatarSrc={avatarSrc}
          userName={userName}
          userRole={userRole}
          onLogout={handleLogout}
        />
      )}
    </aside>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  activeItem?: string;
}

export default function Sidebar({ activeItem = "Dashboard" }: SidebarProps): React.ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:flex h-screen sticky top-0 shrink-0">
        <SidebarContent activeItem={activeItem} onClose={() => {}} showClose={false} />
      </div>

      {/* Mobile topbar */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white shadow-sm"
        style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 transition shrink-0"
        >
          <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center overflow-hidden">
            <img src={logoImage.src} alt="TechTics" className="w-full h-full object-cover" />
          </div>
          <span className="text-slate-900 font-black text-sm">TechTics</span>
        </div>
        <span className="ml-auto text-slate-500 text-sm font-semibold">{activeItem}</span>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 z-50 h-full transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent activeItem={activeItem} onClose={() => setOpen(false)} showClose />
      </div>

      <style>{`@media (max-width: 768px) { main { padding-top: 3.5rem; } }`}</style>
    </div>
  );
}