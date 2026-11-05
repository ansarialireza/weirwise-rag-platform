"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ArrowLeft, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      window.location.reload();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    if (navigator.onLine) {
      window.location.reload();
      return;
    }
    window.setTimeout(() => setRetrying(false), 900);
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
        <WeirwiseSymbol className="mx-auto h-7 w-auto" priority />

        <div className="mx-auto mt-6 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <WifiOff className="h-4 w-4" />
        </div>

        <h1 className="mt-4 text-base font-semibold tracking-tight text-foreground">
          You&apos;re offline
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
          Weirwise needs a connection to reach your workspace. Nothing has been lost — try again when
          you&apos;re back online.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={handleRetry} disabled={retrying} className="h-10 w-full gap-2">
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Checking connection…" : "Try again"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="h-10 w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </Button>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground/80" aria-live="polite">
          {isOnline ? "Connection restored — reconnecting." : "Waiting for a connection."}
        </p>
      </div>
    </div>
  );
}
