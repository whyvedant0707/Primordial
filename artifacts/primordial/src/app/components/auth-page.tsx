"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useAppAuth } from "./auth-provider";

export default function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const auth = useAppAuth();
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <Link href="/" className="text-sm font-semibold text-brand underline underline-offset-4">
        Back to Accessibility Copilot
      </Link>
      <h1 className="text-2xl font-semibold text-ink">
        {mode === "sign-up" ? "Create your account" : "Sign in"}
      </h1>
      {!auth.available ? (
        <p role="alert" className="max-w-md text-center text-sm text-ink-2">
          Authentication is not configured. Ask the app owner to check the authentication setup.
        </p>
      ) : mode === "sign-up" ? (
        <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/" />
      ) : (
        <SignIn routing="hash" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
      )}
    </main>
  );
}
