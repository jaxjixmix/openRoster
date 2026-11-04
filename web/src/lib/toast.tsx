"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(message: string, tone?: Tone, action?: { label: string; run: () => void }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Tone = "success", action?: { label: string; run: () => void }) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone, action }]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rise-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-[#f4f1e8] shadow-xl"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#9fd3b4]" />
            ) : t.tone === "error" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ec9a8a]" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-[#c9c1ac]" />
            )}
            <span className="flex-1 leading-snug">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.run();
                  setToasts((list) => list.filter((x) => x.id !== t.id));
                }}
                className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-[#9fd3b4] underline-offset-2 transition hover:underline"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              className="text-[#a7a18f] transition hover:text-white"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
