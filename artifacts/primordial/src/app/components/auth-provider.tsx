"use client";

import { createContext, useContext } from "react";
import { ClerkProvider, useClerk, useUser } from "@clerk/nextjs";
import type { ReactNode } from "react";

type AuthState = {
  available: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  userLabel: string | null;
  signOut: () => Promise<void>;
};

const signedOutState: AuthState = {
  available: false,
  loaded: true,
  signedIn: false,
  userId: null,
  userLabel: null,
  signOut: async () => {},
};

const AuthContext = createContext<AuthState>(signedOutState);

function ClerkSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const state: AuthState = {
    available: true,
    loaded: isLoaded,
    signedIn: Boolean(isLoaded && isSignedIn),
    userId: isLoaded && isSignedIn ? user.id : null,
    userLabel: isLoaded && isSignedIn
      ? user.fullName || user.primaryEmailAddress?.emailAddress || "Account"
      : null,
    signOut: () => signOut(),
  };

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function AuthProvider({
  publishableKey,
  proxyUrl,
  children,
}: {
  publishableKey?: string;
  proxyUrl?: string;
  children: ReactNode;
}) {
  if (!publishableKey) {
    return <AuthContext.Provider value={signedOutState}>{children}</AuthContext.Provider>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={proxyUrl || undefined}
      appearance={{
        variables: {
          colorPrimary: "#4f46e5",
          colorBackground: "#fdfdff",
          colorForeground: "#141b3a",
          colorMutedForeground: "#45507a",
          borderRadius: "0.5rem",
          fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
        },
      }}
    >
      <ClerkSession>{children}</ClerkSession>
    </ClerkProvider>
  );
}

export function useAppAuth() {
  return useContext(AuthContext);
}
