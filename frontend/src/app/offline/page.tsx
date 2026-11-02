"use client";

import { useEffect, useState } from "react";
import { WifiOff, RefreshCw, ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
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
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between p-6 bg-background text-foreground select-none">
      {/* Top Header */}
      <header className="w-full max-w-md flex items-center justify-between pt-4">
        <div className="flex items-center gap-2">
          <WeirwiseSymbol className="h-6 w-6" />
          <span className="font-bold tracking-tight text-sm">Weirwise</span>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono bg-red-500/10 text-red-400 border border-red-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Offline Mode
        </span>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-sm flex flex-col items-center text-center space-y-6 my-auto">
        <div className="relative">
          <div className="h-20 w-20 rounded-3xl bg-muted/30 border border-border flex items-center justify-center text-muted-foreground shadow-inner">
            <WifiOff className="h-9 w-9 text-muted-foreground/80" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-card border border-border flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-red-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            No Internet Connection
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Weirwise requires an active network connection to authenticate sessions and perform vector inference with the AI cluster.
          </p>
        </div>

        {isOnline ? (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs w-full flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Connection restored. Tap retry to reconnect.
          </div>
        ) : null}

        <div className="flex flex-col w-full gap-3 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-xl h-11 text-xs font-semibold gap-2 shadow-xs"
          >
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Checking Network..." : "Retry Connection"}
          </Button>

          <Button
            variant="outline"
            size="md"
            onClick={() => window.history.back()}
            className="w-full rounded-xl h-11 text-xs font-medium text-muted-foreground hover:text-foreground border-border bg-card/60"
          >
            Go Back
          </Button>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-md pb-6 text-center text-[11px] font-mono text-muted-foreground/60">
        Weirwise Native PWA &middot; Autonomous Enterprise Core
      </footer>
    </div>
  );
}
