"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ShieldAlert,
  CreditCard,
  Cpu,
  History,
  ArrowLeft,
  LayoutDashboard,
  LogOut,
  Users,
  SlidersHorizontal,
  ExternalLink,
} from "lucide-react";
import { CompactThemeMenu } from "@/components/ui/compact-theme-menu";
import { api } from "@/lib/api";
import { WeirwiseWordmark } from "@/components/ui/weirwise-wordmark";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      setAccessLoading(false);
      return;
    }

    let active = true;
    api.getAdminAccess()
      .then(({ role }) => {
        if (active) setAdminRole(role);
      })
      .catch(() => {
        if (active) router.replace("/");
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || accessLoading || !user || !adminRole) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const navItems = [
    {
      name: "Overview",
      href: "/admin",
      icon: LayoutDashboard,
    },
    ...(adminRole === "super_admin"
      ? [{ name: "Users", href: "/admin/users", icon: Users }]
      : []),
    ...(["super_admin", "platform_admin"].includes(adminRole)
      ? [{ name: "AI Providers", href: "/admin/providers", icon: Cpu }]
      : []),
    ...(adminRole === "super_admin"
      ? [{ name: "Operations", href: "/admin/operations", icon: SlidersHorizontal }]
      : []),
    ...(["super_admin", "platform_admin", "finance_admin"].includes(adminRole)
      ? [{ name: "FinOps & Billing", href: "/admin/finops", icon: CreditCard }]
      : []),
    {
      name: "Audit Trail",
      href: "/admin/audit",
      icon: History,
    },
  ];

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground antialiased md:flex-row font-sans">
      {/* GitHub-style Clean Sidebar */}
      <aside className="flex w-full shrink-0 flex-col justify-between border-b border-border/80 bg-card/60 backdrop-blur-md md:h-full md:w-60 md:border-b-0 md:border-r">
        <div>
          {/* Header Bar */}
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WeirwiseWordmark className="w-16" />
              <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-muted/60 border border-border/80 text-muted-foreground font-mono">
                Admin
              </span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              title="Return to App"
            >
              <span>App</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {/* Navigation Section */}
          <div className="p-3">
            <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 font-mono">
              Administration
            </div>
            <nav className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex min-w-max items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {isActive && (
                      <span className="hidden md:block absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
                    )}
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer: User Profile & Security Meta */}
        <div
          className="border-t border-border/60 p-3 space-y-2.5 bg-muted/20"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider">
              Theme
            </span>
            <CompactThemeMenu />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/70 bg-card p-2 text-xs">
            <div className="min-w-0 pr-2">
              <span className="font-medium text-[11px] block truncate text-foreground">
                {user?.full_name || "Admin Staff"}
              </span>
              <span className="text-[10px] text-muted-foreground block truncate font-mono">
                {user?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Administrative Work Canvas */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">
        <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
