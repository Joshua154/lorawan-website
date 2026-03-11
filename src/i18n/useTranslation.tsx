"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Locale, normalizeLocale, t as translate } from "./index";

const STORAGE_KEY = "lorawan.locale";

type TranslationValue = {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  setLocale: (next: Locale) => void;
};

const TranslationContext = createContext<TranslationValue | null>(null);

function readInitialLocale(fallback?: Locale): Locale {
  if (fallback) {
    return fallback;
  }

  if (typeof window === "undefined") {
    return "en";
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normalizeLocale(stored);
    }
  } catch {
    // ignore storage errors
  }

  return typeof navigator !== "undefined" ? normalizeLocale(navigator.language) : "en";
}

export function TranslationProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => readInitialLocale(initialLocale));

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(normalizeLocale(next));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }

    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      if (!event.newValue) {
        return;
      }

      setLocaleState(normalizeLocale(event.newValue));
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, locale, vars),
    [locale],
  );

  const value = useMemo<TranslationValue>(() => ({ t, locale, setLocale }), [locale, setLocale, t]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation(initial?: Locale) {
  const context = useContext(TranslationContext);
  const [fallbackLocale, setFallbackLocale] = useState<Locale>(() => readInitialLocale(initial));

  const fallbackSetLocale = useCallback((next: Locale) => {
    setFallbackLocale(normalizeLocale(next));
  }, []);

  useEffect(() => {
    if (context) {
      return;
    }

    document.documentElement.lang = fallbackLocale;
  }, [context, fallbackLocale]);

  const fallbackT = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(key, fallbackLocale, vars),
    [fallbackLocale],
  );

  if (context) {
    return context;
  }

  return { t: fallbackT, locale: fallbackLocale, setLocale: fallbackSetLocale } as const;
}
