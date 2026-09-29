"use client";

import { useEffect, useRef, useState } from "react";
import {
  faFileLines,
  faUserCheck,
  faGraduationCap,
  faShieldHalved,
  faBan,
  faCreditCard,
  faCopyright,
  faTriangleExclamation,
  faHandshake,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type SectionId =
  | "introduction"
  | "eligibility"
  | "accounts"
  | "academic-conduct"
  | "acceptable-use"
  | "payments"
  | "intellectual-property"
  | "disclaimers"
  | "termination"
  | "changes";

const SECTIONS: { id: SectionId; label: string; icon: typeof faFileLines }[] = [
  { id: "introduction", label: "Introduction", icon: faFileLines },
  { id: "eligibility", label: "Eligibility", icon: faUserCheck },
  { id: "accounts", label: "Accounts & Roles", icon: faGraduationCap },
  { id: "academic-conduct", label: "Academic Conduct", icon: faShieldHalved },
  { id: "acceptable-use", label: "Acceptable Use", icon: faBan },
  { id: "payments", label: "Payments & Fees", icon: faCreditCard },
  { id: "intellectual-property", label: "Intellectual Property", icon: faCopyright },
  { id: "disclaimers", label: "Disclaimers & Liability", icon: faTriangleExclamation },
  { id: "termination", label: "Termination", icon: faRightFromBracket },
  { id: "changes", label: "Changes to Terms", icon: faHandshake },
];

export default function TermsOfServicePage() {
  const [active, setActive] = useState<SectionId>("introduction");
  const isClickScrolling = useRef(false);
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollTo = (id: SectionId) => {
    isClickScrolling.current = true;
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (clickTimeout.current) clearTimeout(clickTimeout.current);
    clickTimeout.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 700);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;

        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const id = visible[0].target.id as SectionId;
          setActive(id);
        }
      },
      {
        root: null,
        rootMargin: "-15% 0px -65% 0px",
        threshold: 0,
      }
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 px-6 py-10 sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
          TechTics LMS
        </p>
        <h1 className="mt-1 text-3xl font-bold text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100">
          The rules and guidelines that govern your use of the TechTics
          learning platform.
        </p>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
        {/* Sidebar TOC */}
        <aside className="lg:w-72 lg:flex-shrink-0">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <h2 className="mb-4 text-base font-bold text-gray-900">
              Table of Contents
            </h2>
            <nav className="flex flex-col gap-1">
              {SECTIONS.map((s) => {
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      isActive
                        ? "border-l-4 border-blue-600 bg-blue-50 text-blue-700"
                        : "border-l-4 border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={s.icon}
                      className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-gray-400"}`}
                    />
                    {s.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 space-y-8">
          <section
            id="introduction"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">Introduction</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              These Terms of Service ("Terms") govern your access to and use
              of TechTics LMS. By creating an account or using the platform
              as a student, teacher, or admin, you agree to be bound by these
              Terms.
            </p>
          </section>

          <section
            id="eligibility"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">Eligibility</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              TechTics is intended for use by students, teachers, and
              administrators affiliated with an enrolling institution.
              Student accounts for users under 18 must be created and managed
              under institutional authorization.
            </p>
          </section>

          <section
            id="accounts"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Accounts & Roles
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Every account is assigned one of the following roles, which
              determines what you can access on the platform:
            </p>
            <div className="mt-6 rounded-xl bg-blue-50 p-5">
              <h3 className="text-sm font-bold text-blue-700">
                Account Roles
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>
                  <span className="font-semibold">Admin:</span> Full access
                  to manage courses, users, and platform settings
                </li>
                <li>
                  <span className="font-semibold">Teacher:</span> Manage
                  assigned courses, grade submissions, mark attendance
                </li>
                <li>
                  <span className="font-semibold">Student:</span> Enroll in
                  courses, submit assignments, participate in discussions
                </li>
              </ul>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              You are responsible for maintaining the confidentiality of your
              login credentials and for all activity that occurs under your
              account.
            </p>
          </section>

          <section
            id="academic-conduct"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Academic Conduct
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Users must submit original work and may not engage in
              plagiarism, cheating, or impersonation of another user.
              Teachers and admins may review submissions and discussion
              activity to enforce academic integrity policies.
            </p>
          </section>

          <section
            id="acceptable-use"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Acceptable Use
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              When using TechTics, you agree not to:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Upload harmful, abusive, or illegal content
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Attempt to access accounts, courses, or data without
                authorization
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Interfere with or disrupt the platform's normal operation
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Use the platform for any purpose unrelated to teaching or
                learning
              </li>
            </ul>
          </section>

          <section
            id="payments"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Payments & Fees
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Some courses or platform features may require payment of fees
              by your institution. All billing details are handled according
              to the agreement between TechTics and your institution.
            </p>
          </section>

          <section
            id="intellectual-property"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Intellectual Property
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Course materials, branding, and platform software are the
              property of TechTics or its licensors. Student and teacher
              submissions remain the property of their respective authors,
              who grant TechTics a limited license to host and display that
              content for educational purposes.
            </p>
          </section>

          <section
            id="disclaimers"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Disclaimers & Liability
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              TechTics is provided "as is" without warranties of any kind. We
              are not liable for indirect, incidental, or consequential
              damages arising from your use of the platform, to the extent
              permitted by law.
            </p>
          </section>

          <section
            id="termination"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">Termination</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We may suspend or terminate accounts that violate these Terms,
              including academic conduct or acceptable use policies. You may
              also request account deactivation through your institution
              administrator.
            </p>
          </section>

          <section
            id="changes"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Changes to Terms
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We may update these Terms from time to time. Continued use of
              TechTics after changes take effect constitutes acceptance of
              the revised Terms.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}