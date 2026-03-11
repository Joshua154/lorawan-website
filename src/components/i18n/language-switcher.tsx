"use client";

import { type ChangeEvent } from "react";

import { type Locale } from "@/i18n";
import { useTranslation } from "@/i18n/useTranslation";

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setLocale(event.target.value as Locale);
  };

  return (
    <div className="language-switcher">
      <select aria-label="Language" onChange={handleChange} value={locale}>
        <option value="de">DE</option>
        <option value="en">EN</option>
      </select>
    </div>
  );
}
