"use client";

import { useEffect } from "react";

import { AUTH_CHANNEL, LOGIN_PATH } from "@/lib/auth/constants";

/** Signs this tab out when another tab signs out. */
export function AuthSync() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data === "logout") window.location.assign(LOGIN_PATH);
    };
    return () => channel.close();
  }, []);

  return null;
}
