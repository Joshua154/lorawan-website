"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { apiUrl } from "@/lib/api-url";

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
    await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
    redirectHome();
  }, [redirectHome]);

  return {
    logout,
    redirectHome,
    redirectToLogin,
  };
}