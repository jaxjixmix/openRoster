"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { translate, resolveLanguage, type Language } from "@/lib/i18n";

interface I18nValue {
  lang: Language;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { company } = useAuth();
  const lang = resolveLanguage(company?.ui_language as string | undefined, company?.locale);
  const value: I18nValue = { lang, t: (key, vars) => translate(lang, key, vars) };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    const fallback: I18nValue = { lang: "en", t: (key, vars) => translate("en", key, vars) };
    return fallback;
  }
  return value;
}
