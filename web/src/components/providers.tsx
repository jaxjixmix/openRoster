"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n-provider";
import { ToastProvider } from "@/lib/toast";
import { A11yLabeler } from "@/components/a11y-labeler";
import { PwaRegister } from "@/components/pwa-register";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <I18nProvider>
          <A11yLabeler />
          <PwaRegister />
          {children}
        </I18nProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
