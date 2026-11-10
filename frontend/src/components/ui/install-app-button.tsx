"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const HINT_DISMISSED_KEY = "weirwise:install-hint-dismissed";

function isRunningInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface InstallAppButtonProps {
  variant?: "pill" | "row";
  className?: string;
}

export function InstallAppButton({ variant = "row", className }: InstallAppButtonProps) {
  const { dict } = useI18n();
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [client, setClient] = useState<{ apple: boolean; macos: boolean } | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const macos = /Macintosh/.test(ua) && navigator.maxTouchPoints <= 1;
    setClient({ apple: /iPad|iPhone|iPod/.test(ua) || /Macintosh/.test(ua), macos });

    if (isRunningInstalled()) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setHintOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!hintOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHintOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hintOpen]);

  if (installed || !client) return null;
  if (!promptEvent && !client.apple) return null;

  const openHint = () => {
    try {
      if (window.localStorage.getItem(HINT_DISMISSED_KEY) === "1") return;
    } catch {
      /* Private mode: show the hint rather than lose the install path. */
    }
    setHintOpen(true);
  };

  const activate = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    openHint();
  };

  return (
    <>
      <button
        type="button"
        onClick={activate}
        className={cn(
          "text-muted-foreground transition-colors hover:text-foreground",
          variant === "row"
            ? "flex min-h-11 w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm"
            : "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px]",
          className
        )}
      >
        <Download className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        {dict.common.installApp}
      </button>

      {hintOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0 z-[75] bg-onyx/60 backdrop-blur-[2px] animate-in-opacity"
            onClick={() => setHintOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ww-install-hint-title"
            className="fixed inset-x-0 bottom-0 z-[75] mx-auto max-w-md rounded-t-2xl border-t border-border bg-card px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.5rem))] pt-5 shadow-lift animate-in"
          >
            <div className="flex items-start justify-between gap-3">
              <p
                id="ww-install-hint-title"
                className="font-display text-[15px] font-semibold tracking-tight text-foreground"
              >
                {dict.common.installApp}
              </p>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setHintOpen(false)}
                aria-label={dict.common.closeNavigation}
                className="-me-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {client.macos ? dict.common.installHintMac : dict.common.installHintIos}
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem(HINT_DISMISSED_KEY, "1");
                } catch {
                  /* Ignore; the hint simply stays available. */
                }
                setHintOpen(false);
              }}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 touch-manipulation"
            >
              {dict.common.gotIt}
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
