"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Globe,
  Laptop,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Shield,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { useTheme, type Theme } from "@/lib/theme-context";
import { locales, getSpec, type Locale } from "@/lib/i18n";
import { AccountBillingStatus } from "@/types";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function getInitials(user: { full_name?: string | null; email?: string | null } | null): string {
  if (user?.full_name?.trim()) {
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (user?.email) {
    const namePart = user.email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
    return (namePart.slice(0, 2) || "U").toUpperCase();
  }
  return "U";
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { dict, locale, setLocale, spec } = useI18n();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [billing, setBilling] = useState<AccountBillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getAccountBilling()
      .then((b) => {
        if (active) setBilling(b);
      })
      .catch(() => {
        // billing data optional
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const initials = getInitials(user);
  const planName = (billing?.plan_name || billing?.plan_tier || "Free Trial").toUpperCase();
  const chatTurnsUsed = billing?.chat_turns_used ?? 0;
  const chatTurnsLimit = billing?.chat_turns_limit ?? 100;
  const usagePercentage = Math.min(
    100,
    Math.round((chatTurnsUsed / Math.max(1, chatTurnsLimit)) * 100)
  );

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      router.push("/login");
    } catch {
      toast({ message: "Failed to log out. Please try again.", type: "error" });
      setIsLoggingOut(false);
      setLogoutModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-2">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      {/* 1. Profile and Subscription Hero Card */}
      <section
        aria-label="Account and Subscription"
        className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Identity */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-onyx text-sm font-bold text-white shadow-sm ring-1 ring-border">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-foreground">
                  {user?.full_name || user?.email?.split("@")[0] || dict.common.user}
                </span>
                <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">
                  {planName}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground font-mono">
                {user?.email}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 pt-1 sm:pt-0">
            <Link
              href="/pricing"
              className="inline-flex h-9 items-center justify-center rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground shadow-sm transition-all hover:bg-accent/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles className="me-1.5 h-3.5 w-3.5" />
              {dict.common.upgrade}
            </Link>
            <Link
              href="/settings/billing"
              className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-background/50 px-3.5 text-xs font-medium text-foreground transition-all hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CreditCard className="me-1.5 h-3.5 w-3.5 text-muted-foreground" />
              Billing
            </Link>
          </div>
        </div>

        {/* Subscription Usage Meter */}
        <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Monthly Queries</span>
            <span className="font-semibold text-foreground">
              {chatTurnsUsed.toLocaleString()} / {chatTurnsLimit.toLocaleString()} ({usagePercentage}%)
            </span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={chatTurnsUsed}
            aria-valuemin={0}
            aria-valuemax={chatTurnsLimit}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                usagePercentage > 90 ? "bg-destructive" : "bg-accent"
              )}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
        </div>
      </section>

      {/* 2. Appearance: Segmented Control */}
      <section
        aria-label="Appearance Settings"
        className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm space-y-3"
      >
        <div className="px-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {dict.common.appearance}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose your interface style or sync with your system preference.
          </p>
        </div>

        {/* MD3 / Linear Segmented Pill Control */}
        <div
          role="radiogroup"
          aria-label={dict.common.appearance}
          className="grid grid-cols-3 gap-1 rounded-xl border border-border/80 bg-muted/40 p-1"
        >
          {(
            [
              { id: "light" as Theme, label: dict.common.lightTheme, icon: Sun },
              { id: "dark" as Theme, label: dict.common.darkTheme, icon: Moon },
              { id: "system" as Theme, label: dict.common.systemTheme, icon: Laptop },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isSelected = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setTheme(item.id);
                  toast({ message: `Theme set to ${item.label}.`, type: "success" });
                }}
                className={cn(
                  "relative flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all duration-150 select-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                  isSelected
                    ? "bg-card text-foreground shadow-sm font-semibold border border-border/60"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isSelected ? "text-accent stroke-[2.2]" : "text-muted-foreground stroke-[1.8]"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. General Preferences: Native List Tiles */}
      <section
        aria-label="Preferences"
        className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Preferences & Security
          </h2>
        </div>

        <div className="divide-y divide-border/60">
          {/* Language Selection Row */}
          <button
            type="button"
            onClick={() => setLanguageSheetOpen(true)}
            className="flex min-h-[56px] w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground block">
                  {dict.common.language}
                </span>
                <span className="text-xs text-muted-foreground">
                  {spec.endonym} ({spec.direction.toUpperCase()})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{spec.endonym}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            </div>
          </button>

          {/* Account Security Info Row */}
          <div className="flex min-h-[56px] items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <span className="text-sm font-medium text-foreground block">
                  Account Status
                </span>
                <span className="text-xs text-muted-foreground">
                  Verified with email credentials
                </span>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
              Active
            </span>
          </div>
        </div>
      </section>

      {/* 4. Account Actions & Destructive Logout */}
      <section aria-label="Account Actions" className="pt-2">
        <button
          type="button"
          onClick={() => setLogoutModalOpen(true)}
          className="flex min-h-[50px] w-full items-center justify-between rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-3 text-destructive transition-all hover:bg-destructive/15 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/20 text-destructive">
              <LogOut className="h-4 w-4 rtl:rotate-180" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              {dict.common.signOut}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-destructive/70 rtl:rotate-180" />
        </button>
      </section>

      {/* Language Bottom Sheet */}
      <BottomSheet
        open={languageSheetOpen}
        onClose={() => setLanguageSheetOpen(false)}
        title={dict.common.language}
        description="Choose your preferred language and reading direction."
      >
        <div className="space-y-2 py-1">
          {locales.map((code: Locale) => {
            const lSpec = getSpec(code);
            const isSelected = locale === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLocale(code);
                  setLanguageSheetOpen(false);
                  toast({
                    message: `Language updated to ${lSpec.endonym}.`,
                    type: "success",
                  });
                }}
                className={cn(
                  "flex min-h-[52px] w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-all active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "bg-accent/15 border border-accent/40 font-semibold text-foreground shadow-sm"
                    : "border border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div>
                  <div className="text-sm font-medium text-foreground">{lSpec.endonym}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {lSpec.englishName} • {lSpec.direction.toUpperCase()}
                  </div>
                </div>
                {isSelected && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Logout Confirmation Bottom Sheet / Dialog */}
      <BottomSheet
        open={logoutModalOpen}
        onClose={() => {
          if (!isLoggingOut) setLogoutModalOpen(false);
        }}
        title="Sign out of Weirwise?"
        description="You will need to enter your email and password to access your dashboard again."
      >
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your active session will be ended securely. All unsaved changes in playground chats may be reset.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-2">
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={() => setLogoutModalOpen(false)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoggingOut}
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-destructive px-5 text-xs font-semibold text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 active:scale-95 disabled:opacity-50"
            >
              {isLoggingOut ? "Signing out..." : "Yes, sign out"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
