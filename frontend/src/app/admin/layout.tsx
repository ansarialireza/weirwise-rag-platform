"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ShieldAlert,
  DollarSign,
  Cpu,
  History,
  ArrowLeft,
  Activity,
  LogOut,
  Users,
  SlidersHorizontal,
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
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const navItems = [
    {
      name: "Command Center",
      href: "/admin",
      icon: Activity,
    },
    ...(adminRole === "super_admin"
      ? [{ name: "User Management", href: "/admin/users", icon: Users }]
      : []),
    ...(["super_admin", "platform_admin"].includes(adminRole)
      ? [{ name: "System AI Providers", href: "/admin/providers", icon: Cpu }]
      : []),
    ...(adminRole === "super_admin"
      ? [{ name: "Operations", href: "/admin/operations", icon: SlidersHorizontal }]
      : []),
    ...(["super_admin", "platform_admin", "finance_admin"].includes(adminRole)
      ? [{ name: "FinOps & Costs", href: "/admin/finops", icon: DollarSign }]
      : []),
    {
      name: "Security & Audit Trail",
      href: "/admin/audit",
      icon: History,
    },
  ];

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground antialiased md:flex-row">
      {/* Super Admin High-Security Sidebar */}
      <aside className="flex w-full shrink-0 flex-col justify-between border-b border-border bg-card md:h-full md:w-64 md:border-b-0 md:border-r">
        <div>
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <WeirwiseWordmark className="w-20" />
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <span className="font-bold text-xs tracking-tight text-foreground block">
                  {adminRole.replaceAll("_", " ").toUpperCase()}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Control Center
                </span>
              </div>
            </div>
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground text-xs transition-colors"
              title="Exit to customer application"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-1 md:p-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-w-max items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20 font-semibold"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer: Security context and admin user */}
        <div
          className="flex flex-col items-stretch gap-2 border-t border-border bg-secondary/20 p-2 md:block md:space-y-2.5 md:p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Theme Control
            </span>
            <CompactThemeMenu />
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-xs flex items-center justify-between">
            <div className="truncate">
              <span className="font-semibold block text-[11px] text-foreground truncate">
                {user?.full_name || "Platform Admin"}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono truncate block">
                {user?.email || "staff@weirwise.com"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Administrative Work Canvas */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-background/50">
        {children}
      </main>
    </div>
  );
}
