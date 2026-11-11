import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp } from "@clerk/nextjs";
import { AuthProvider } from "../src/app/components/auth-provider";
import SignUpPage from "../src/app/sign-up/[[...sign-up]]/page";
import SignInPage from "../src/app/sign-in/[[...sign-in]]/page";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
  SignUp: vi.fn(() => <div data-testid="clerk-sign-up">Sign-up form</div>),
  SignIn: vi.fn(() => <div data-testid="clerk-sign-in">Sign-in form</div>),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

describe("dedicated authentication routes", () => {
  it("mounts hash-based signup at the reported SSO callback address", () => {
    window.history.replaceState({}, "", "/sign-up#/sso-callback");
    render(<AuthProvider publishableKey="test-only"><SignUpPage /></AuthProvider>);
    expect(screen.getByTestId("clerk-sign-up")).toBeTruthy();
    expect(vi.mocked(SignUp).mock.calls.at(-1)?.[0]).toMatchObject({
      routing: "hash", signInUrl: "/sign-in", fallbackRedirectUrl: "/",
    });
    expect(vi.mocked(ClerkProvider).mock.calls.at(-1)?.[0]).toMatchObject({
      signInUrl: "/sign-in", signUpUrl: "/sign-up",
      signInFallbackRedirectUrl: "/", signUpFallbackRedirectUrl: "/",
    });
  });

  it("mounts signin with a signup link and a home fallback", () => {
    render(<AuthProvider publishableKey="test-only"><SignInPage /></AuthProvider>);
    expect(screen.getByTestId("clerk-sign-in")).toBeTruthy();
    expect(vi.mocked(SignIn).mock.calls.at(-1)?.[0]).toMatchObject({
      routing: "hash", signUpUrl: "/sign-up", fallbackRedirectUrl: "/",
    });
    expect(screen.getByRole("link", { name: "Back to Accessibility Copilot" }).getAttribute("href")).toBe("/");
  });

  it("fails explicitly when authentication is unconfigured", () => {
    render(<AuthProvider><SignUpPage /></AuthProvider>);
    expect(screen.getByRole("alert").textContent).toContain("Authentication is not configured");
    expect(screen.queryByTestId("clerk-sign-up")).toBeNull();
  });
});
