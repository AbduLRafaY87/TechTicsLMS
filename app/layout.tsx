import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import Footer from "./components/Footer";
import { ReactNode } from "react";

export const metadata = {
  title: "TechTics Club LMS",
  description: "Learning Management System",
  icons: {
    icon: "/fav.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <AuthProvider>
          <main className="flex-1">
            {children}
          </main>

          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}