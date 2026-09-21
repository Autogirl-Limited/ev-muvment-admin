"use client";

import { useTransition, type ReactNode } from "react";

import { logout } from "@/lib/auth/actions";
import { AUTH_CHANNEL, LOGIN_PATH } from "@/lib/auth/constants";

export function SignOutButton({
  children,
  variant = "menu",
}: {
  children: ReactNode;
  variant?: "menu" | "link";
}) {
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      try {
        await logout();
      } catch {
        // Nothing more to do; the redirect below still leaves the app.
      }
      // Only now are the cookies gone. Telling other tabs sooner would send
      // them to /login while still signed in, and the proxy would bounce them back.
      try {
        const channel = new BroadcastChannel(AUTH_CHANNEL);
        channel.postMessage("logout");
        channel.close();
      } catch {}
      // Full navigation, so no signed-in page stays in the client router cache.
      window.location.assign(LOGIN_PATH);
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={
        variant === "link"
          ? "font-medium text-brand hover:underline disabled:opacity-60"
          : "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-background hover:text-foreground disabled:opacity-60"
      }
    >
      {pending ? "Signing out…" : children}
    </button>
  );
}
