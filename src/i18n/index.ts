import en from "./locales/en.json";
import de from "./locales/de.json";

export type Locale = "en" | "de";

const LOCALES: Record<Locale, Record<string, string>> = {
  en,
  de,
};

export function normalizeLocale(locale?: string | null): Locale {
  if (!locale) return "en";
  const lower = locale.toLowerCase();
  if (lower.startsWith("de")) return "de";
  return "en";
}

export function t(key: string, locale: Locale = "en", vars?: Record<string, string | number>): string {
  const dict = LOCALES[locale] ?? LOCALES.en;
  let value = dict[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }

  return value;
}

export function getAllLocales(): Locale[] {
  return Object.keys(LOCALES) as Locale[];
}
