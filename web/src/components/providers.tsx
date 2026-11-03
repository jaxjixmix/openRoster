"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { A11yLabeler } from "@/components/a11y-labeler";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <A11yLabeler />
        {children}
      </AuthProvider>
    </ToastProvider>
  );
}
