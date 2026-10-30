"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ShieldAlert,
  Server,
  DollarSign,
  Cpu,
  History,
  ArrowLeft,
  Activity,
  LogOut,
  Users,
} from "lucide-react";
import { CompactThemeMenu } from "@/components/ui/compact-theme-menu";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (!user.is_superuser) {
        router.push("/");
      }
    }
  }, [user, authLoading, router]);

  if (authLoading || !user || !user.is_superuser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const navItems = [
    {
      name: "Executive Overview",
      href: "/admin",
      icon: Activity,
    },
    {
      name: "AI Provider Vault & Routing",
      href: "/admin/providers",
      icon: Cpu,
    },
    {
      name: "FinOps & Cost Intelligence",
      href: "/admin/finops",
      icon: DollarSign,
    },
    {
      name: "Security & Audit Trail",
      href: "/admin/audit",
      icon: History,
    },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground antialiased overflow-hidden">
      {/* Super Admin High-Security Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between shrink-0">
        <div>
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <span className="font-bold text-xs tracking-tight text-foreground block">
                  SUPER ADMIN
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
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
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
        <div className="p-3 border-t border-border space-y-2.5 bg-secondary/20">
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
                {user?.email || "admin@weirwise.local"}
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
      <main className="flex-1 overflow-y-auto bg-background/50">
        {children}
      </main>
    </div>
  );
}
