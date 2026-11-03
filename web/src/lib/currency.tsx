"use client";

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { money } from "./format";
import { setLocale } from "./dates";

const CurrencyContext = createContext({ currency: "USD", locale: "en-US" });

export function CurrencyProvider({
  currency,
  locale,
  children,
}: {
  currency: string;
  locale: string;
  children: ReactNode;
}) {
  const resolved = { currency: currency || "USD", locale: locale || "en-US" };
  useEffect(() => setLocale(resolved.locale), [resolved.locale]);
  return <CurrencyContext.Provider value={resolved}>{children}</CurrencyContext.Provider>;
}

export function useMoney() {
  const { currency, locale } = useContext(CurrencyContext);
  return useCallback((value: number | undefined) => money(value, currency, locale), [currency, locale]);
}
