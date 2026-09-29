import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

const LINKS = [
  { label: "Privacy Policy", href: "/legals/privacy" },
  { label: "Terms of Service", href: "/legals/terms" }
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <FontAwesomeIcon icon={faGraduationCap} className="h-4 w-4 text-blue-600" />
          <span>© {year} TechTics LMS</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-xs font-medium text-gray-500 transition-colors hover:text-blue-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}