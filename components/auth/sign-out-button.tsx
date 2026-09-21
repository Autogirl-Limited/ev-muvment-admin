"use client";

import { useState, useTransition, type ReactNode } from "react";
import { signOut as nextAuthSignOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/modal";
import { AUTH_CHANNEL, LOGIN_PATH } from "@/lib/auth/constants";

export function SignOutButton({
  children,
  variant = "menu",
}: {
  children: ReactNode;
  variant?: "menu" | "link";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      try {
        await nextAuthSignOut({ redirect: false });
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
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className={
          variant === "link"
            ? "font-medium text-brand hover:underline disabled:opacity-60"
            : "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-subtle hover:text-foreground disabled:opacity-60"
        }
      >
        {pending ? "Signing out…" : children}
      </button>

      <Modal
        open={confirming}
        onClose={() => {
          if (!pending) setConfirming(false);
        }}
        title="Sign out?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Are you sure you want to sign out of your account?
          </p>
          <ModalActions>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={pending} onClick={signOut}>
              Sign out
            </Button>
          </ModalActions>
        </div>
      </Modal>
    </>
  );
}
