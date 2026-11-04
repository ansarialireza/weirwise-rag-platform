"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { ArrowRight } from "lucide-react";

export function HeroActions() {
  const { user, loading } = useAuth();

  return (
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mx-auto">
      <Link
        href={user ? "/overview" : "/register"}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 active:scale-[0.98] transition-all"
      >
        <span>{user ? "Open Studio" : "Start Free Trial"}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>

      <Link
        href="/login"
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-md border border-border-strong bg-transparent px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98] transition-all"
      >
        Sign In
      </Link>
    </div>
  );
}
