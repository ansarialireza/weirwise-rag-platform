"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { Workspace, WorkspaceBillingStatus } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Globe,
  Key,
  Laptop,
  Moon,
  Palette,
  Shield,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { useTheme, type Theme } from "@/lib/theme-context";
import { locales, getSpec, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user } = useAuth();
  const { dict, locale, setLocale, spec } = useI18n();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [billing, setBilling] = useState<WorkspaceBillingStatus | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .getWorkspaces()
      .then(async (list) => {
        if (!active) return;
        const activeId = api.getWorkspaceId();
        const ws = list.find((w) => w.id === activeId) || list[0];
        if (ws) {
          setWorkspace(ws);
          setWorkspaceName(ws.name);
          try {
            const b = await api.getWorkspaceBilling(ws.id);
            if (active) setBilling(b);
          } catch {
            // billing optional
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !workspaceName.trim()) return;
    setSaving(true);
    try {
      await api.updateWorkspace(workspace.id, { name: workspaceName.trim() });
      setWorkspace({ ...workspace, name: workspaceName.trim() });
      toast({ message: "Workspace name updated.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to update workspace.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={dict.common.settings} />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        title={dict.common.settings}
        description="Manage your workspace preferences, membership, and billing details."
      />

      {/* Workspace General Settings */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border">
          <Building2 className="h-5 w-5 text-signal" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {dict.common.workspace}
          </h2>
        </div>

        <form onSubmit={handleUpdateWorkspace} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Workspace Name</label>
            <Input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              required
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      {/* Billing & Plan details */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-5 w-5 text-signal" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Plan & Quota
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/billing"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Billing history
            </Link>
            <Link
              href="/pricing"
              className="text-xs font-semibold text-primary hover:underline"
            >
              {dict.common.upgrade}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Current Plan
            </span>
            <div className="text-base font-bold text-foreground">
              {(billing?.plan_name || workspace?.plan_tier || "Free").toUpperCase()}
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Queries / Month
            </span>
            <div className="text-base font-bold text-foreground">
              {billing?.chat_turns_used ?? 0} / {billing?.chat_turns_limit ?? 100}
            </div>
          </div>
        </div>
      </section>

      {/* Appearance Settings */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border">
          <Palette className="h-5 w-5 text-signal" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {dict.common.appearance}
          </h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Customize how Weirwise looks on your device. Choose light, dark, or sync with your system preference.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {[
            { id: "light" as Theme, label: dict.common.lightTheme, icon: Sun, desc: "Clean high-contrast daytime view" },
            { id: "dark" as Theme, label: dict.common.darkTheme, icon: Moon, desc: "Refined onyx low-light aesthetic" },
            { id: "system" as Theme, label: dict.common.systemTheme, icon: Laptop, desc: "Automatically match OS schedule" },
          ].map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  toast({ message: `Theme changed to ${opt.label}.`, type: "success" });
                }}
                className={cn(
                  "flex flex-col items-start p-3.5 rounded-lg border text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/80 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-semibold text-foreground">{opt.label}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Language & Regional Settings */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border">
          <Globe className="h-5 w-5 text-signal" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {dict.common.language}
          </h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Select your preferred workspace language and reading direction. Changes take effect across the entire application immediately.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {locales.map((code: Locale) => {
            const lSpec = getSpec(code);
            const isSelected = locale === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setLocale(code);
                  toast({ message: `Language updated to ${lSpec.endonym}.`, type: "success" });
                }}
                className={cn(
                  "flex items-center justify-between p-3.5 rounded-lg border text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/80 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <div>
                  <div className="text-xs font-semibold text-foreground">{lSpec.endonym}</div>
                  <div className="text-[11px] text-muted-foreground">{lSpec.englishName} ({lSpec.direction.toUpperCase()})</div>
                </div>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Account Info */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 pb-2 border-b border-border">
          <User className="h-5 w-5 text-signal" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {dict.common.account}
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="flex justify-between py-1 border-b border-border/50">
            <span className="text-muted-foreground">Full Name</span>
            <span className="font-medium text-foreground">{user?.full_name || "—"}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/50">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">{user?.email}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium text-foreground">{user?.is_superuser ? "Super Admin" : "Member"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
