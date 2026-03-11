"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

export function useSessionActions() {
  const router = useRouter();

  const redirectToLogin = useCallback(() => {
    router.push("/login");
    router.refresh();
  }, [router]);

  const redirectHome = useCallback(() => {
    router.push("/");
    router.refresh();
  }, [router]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    redirectToLogin();
  }, [redirectToLogin]);

  return {
    logout,
    redirectHome,
    redirectToLogin,
  };
}