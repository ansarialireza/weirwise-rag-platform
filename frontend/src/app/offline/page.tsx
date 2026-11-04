"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

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
    } else {
      setTimeout(() => {
        setRetrying(false);
      }, 800);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-foreground select-none font-mono">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-8 space-y-6 text-center">
        {/* Stark Status Header */}
        <div className="space-y-3">
          <div className="inline-block px-3 py-1 rounded-sm border border-border bg-muted text-[11px] uppercase tracking-widest text-muted-foreground">
            {isOnline ? "[ STATUS: ONLINE. RECONNECTING... ]" : "[ CONNECTION LOST. AWAITING NETWORK... ]"}
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-foreground uppercase">
            Cluster Link Offline
          </h1>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-md h-9 text-xs font-bold gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "POLLING LINK..." : "RETRY CONNECTION"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="w-full rounded-md h-9 text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            RETURN
          </Button>
        </div>

        {/* Minimal Terminal Footer */}
        <div className="pt-4 border-t border-border text-[10px] text-muted-foreground/70 tracking-wider">
          WEIRWISE LOCAL NODE &middot; PWA STANDALONE ACTIVE
        </div>
      </div>
    </div>
  );
}
