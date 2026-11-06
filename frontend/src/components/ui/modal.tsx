import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export function Modal({ isOpen, onClose, title, description, children, maxWidth = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    // Focus first autofocus or focusable element, or the modal container if none found
    const timer = setTimeout(() => {
      if (!panelRef.current) return;
      const autoFocusEl = panelRef.current.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      if (autoFocusEl) {
        autoFocusEl.focus();
      } else {
        panelRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-onyx/50 p-0 backdrop-blur-[2px] animate-in sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Dialog"}
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-lift outline-none animate-in sm:rounded-xl",
          maxWidths[maxWidth]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
