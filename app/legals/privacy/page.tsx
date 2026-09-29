"use client";

import { useEffect, useRef, useState } from "react";
import {
  faFileLines,
  faDatabase,
  faUserShield,
  faLock,
  faShieldHalved,
  faCookieBite,
  faUserCheck,
  faHandshake,
  faChild,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type SectionId =
  | "introduction"
  | "info-we-collect"
  | "how-we-use"
  | "info-sharing"
  | "data-security"
  | "cookies"
  | "your-rights"
  | "third-party"
  | "children";

const SECTIONS: { id: SectionId; label: string; icon: typeof faFileLines }[] = [
  { id: "introduction", label: "Introduction", icon: faFileLines },
  { id: "info-we-collect", label: "Information We Collect", icon: faDatabase },
  { id: "how-we-use", label: "How We Use Information", icon: faUserShield },
  { id: "info-sharing", label: "Information Sharing", icon: faLock },
  { id: "data-security", label: "Data Security", icon: faShieldHalved },
  { id: "cookies", label: "Cookies & Tracking", icon: faCookieBite },
  { id: "your-rights", label: "Your Rights", icon: faUserCheck },
  { id: "third-party", label: "Third-Party Services", icon: faHandshake },
  { id: "children", label: "Children's Privacy", icon: faChild },
];

export default function PrivacyPolicyPage() {
  const [active, setActive] = useState<SectionId>("introduction");
  const isClickScrolling = useRef(false);
  const clickTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollTo = (id: SectionId) => {
    isClickScrolling.current = true;
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

    // Re-enable scroll-spy once the smooth scroll has settled
    if (clickTimeout.current) clearTimeout(clickTimeout.current);
    clickTimeout.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 700);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;

        // Pick the entry closest to the top of the viewport that's intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          );

        if (visible.length > 0) {
          const id = visible[0].target.id as SectionId;
          setActive(id);
        }
      },
      {
        root: null,
        // Treat a section as "active" once it's within this band of the viewport
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
          Privacy Policy
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100">
          How we collect, use, and protect your information across the TechTics
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
              TechTics LMS ("we," "our," "us") is committed to protecting the
              privacy of students, teachers, and administrators who use our
              learning management platform. This policy explains what
              information we collect and how we use it.
            </p>
          </section>

          <section
            id="info-we-collect"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Personal Information You Provide
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              We collect personal information that you voluntarily provide to
              us when you:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Create an account or register for a course
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Submit assignments, quizzes, or discussion posts
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Communicate with teachers, admins, or support
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                Mark or review attendance records
              </li>
            </ul>

            <div className="mt-6 rounded-xl bg-blue-50 p-5">
              <h3 className="text-sm font-bold text-blue-700">
                Types of Personal Information
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>
                  <span className="font-semibold">Contact Information:</span>{" "}
                  Name, email address, phone number
                </li>
                <li>
                  <span className="font-semibold">Account Information:</span>{" "}
                  Role (admin, teacher, student), institution
                </li>
                <li>
                  <span className="font-semibold">Academic Information:</span>{" "}
                  Courses, grades, attendance, submissions
                </li>
                <li>
                  <span className="font-semibold">Communications:</span>{" "}
                  Messages, feedback, support requests
                </li>
              </ul>
            </div>
          </section>

          <section
            id="how-we-use"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              How We Use Information
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We use the information we collect to operate, maintain, and
              improve the TechTics platform, including managing courses,
              tracking attendance, grading submissions, and sending important
              notifications to students, teachers, and admins.
            </p>
          </section>

          <section
            id="info-sharing"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Information Sharing
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We do not sell personal information. Data is shared only within
              your institution (between students, teachers, and admins as
              required for course management) or with service providers who
              help us operate the platform.
            </p>
          </section>

          <section
            id="data-security"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">Data Security</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We implement industry-standard safeguards, including encrypted
              connections and role-based access controls, to protect your
              data from unauthorized access.
            </p>
          </section>

          <section
            id="cookies"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Cookies & Tracking
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              TechTics uses cookies to keep you signed in and to remember your
              preferences across sessions.
            </p>
          </section>

          <section
            id="your-rights"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">Your Rights</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              You may request access to, correction of, or deletion of your
              personal data by contacting your institution administrator.
            </p>
          </section>

          <section
            id="third-party"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Third-Party Services
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              We may use trusted third-party services for hosting, analytics,
              and communication. These providers are bound by confidentiality
              obligations.
            </p>
          </section>

          <section
            id="children"
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <h2 className="text-xl font-bold text-gray-900">
              Children's Privacy
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              For student users under 18, account creation and data use are
              managed under the authorization of the enrolling institution.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}