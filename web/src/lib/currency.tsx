"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { money } from "./format";

const CurrencyContext = createContext("USD");

export function CurrencyProvider({ currency, children }: { currency: string; children: ReactNode }) {
  return <CurrencyContext.Provider value={currency || "USD"}>{children}</CurrencyContext.Provider>;
}

export function useMoney() {
  const currency = useContext(CurrencyContext);
  return useCallback((value: number | undefined) => money(value, currency), [currency]);
}
