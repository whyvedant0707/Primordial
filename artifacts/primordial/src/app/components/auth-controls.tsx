"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { useAppAuth } from "./auth-provider";

export default function AuthControls() {
  const auth = useAppAuth();
  if (!auth.available) return null;
  if (!auth.loaded || !auth.signedIn) {
    return (
      <div className="flex items-center gap-1">
        {!auth.loaded && <span className="px-2 text-xs text-ink-3" aria-live="polite">Checking account…</span>}
        <SignInButton mode="modal">
          <button type="button" className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-canvas hover:text-ink" data-testid="button-sign-in">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark" data-testid="button-sign-up">Create account</button>
        </SignUpButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-xs text-ink-2 sm:inline" title={auth.userLabel ?? undefined}>{auth.userLabel}</span>
      <button type="button" onClick={() => void auth.signOut()} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink" data-testid="button-sign-out">Sign out</button>
    </div>
  );
}
