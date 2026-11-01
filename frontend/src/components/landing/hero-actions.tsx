"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ArrowRight } from "lucide-react";

export function HeroActions() {
  const { user, loading } = useAuth();
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      api
        .getWorkspaces()
        .then((workspaces) => {
          if (workspaces.length > 0) {
            setDashboardUrl(`/workspaces/${workspaces[0].id}`);
          }
        })
        .catch(() => {});
    }
  }, [user, loading]);

  return (
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md mx-auto">
      <Link
        href={dashboardUrl || "/register"}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-foreground text-background px-7 py-3.5 text-sm font-semibold shadow-xs hover:opacity-90 active:scale-[0.98] transition-all"
      >
        <span>{dashboardUrl ? "Open Workspace" : "Start Free Trial"}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>

      <Link
        href="/login"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-secondary/80 px-6 py-3.5 text-sm font-semibold text-foreground hover:bg-secondary hover:border-border active:scale-[0.98] transition-all shadow-xs"
      >
        Sign In
      </Link>
    </div>
  );
}
