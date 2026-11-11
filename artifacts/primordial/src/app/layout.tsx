import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "./components/auth-provider";

const description =
  "Scan a public page with Axe-core, locate failing elements on a real screenshot, generate code corrections, verify them in simulation and complete the human review automation cannot do.";

export const metadata: Metadata = {
  title: "Accessibility Copilot — Find, understand and fix WCAG 2.1 AA issues",
  description,
  openGraph: {
    title: "Accessibility Copilot",
    description,
    type: "website",
    siteName: "Accessibility Copilot",
  },
  twitter: { card: "summary", title: "Accessibility Copilot", description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-canvas text-ink">
        <AuthProvider
          publishableKey={process.env.CLERK_PUBLISHABLE_KEY}
          proxyUrl={process.env.VITE_CLERK_PROXY_URL}
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
