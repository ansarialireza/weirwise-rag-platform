"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Toast {
  id: string;
  type?: "success" | "error" | "info";
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = "info", title, message, duration = 4200 }: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev.slice(-3), { id, type, title, message, duration }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-3.5 text-[13px] shadow-lift animate-in",
              t.type === "success" && "border-success/30",
              t.type === "error" && "border-destructive/30",
              t.type === "info" && "border-border"
            )}
          >
            {t.type === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
            {t.type === "error" && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            {t.type === "info" && <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}

            <div className="flex-1 space-y-0.5">
              {t.title && <div className="font-semibold text-foreground">{t.title}</div>}
              <div className="leading-relaxed text-muted-foreground">{t.message}</div>
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
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
