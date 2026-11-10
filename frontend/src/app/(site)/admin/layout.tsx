"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  CreditCard,
  Cpu,
  History,
  LayoutDashboard,
  LogOut,
  Users,
  SlidersHorizontal,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { PreferenceControls } from "@/components/ui/preference-controls";
import { api } from "@/lib/api";
import { WeirwiseWordmark } from "@/components/ui/weirwise-wordmark";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
      <CommandPalette />
    </ToastProvider>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Trap escape key for mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      drawerRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  if (authLoading || accessLoading || !user || !adminRole) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <BrutalistLoader label="AUTHENTICATING ADMIN" />
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
      ? [{ name: "Platform settings", href: "/admin/operations", icon: SlidersHorizontal }]
      : []),
    ...(["super_admin", "platform_admin", "finance_admin"].includes(adminRole)
      ? [
          { name: "Financial Center", href: "/admin/financial", icon: CreditCard },
          { name: "Token FinOps", href: "/admin/finops", icon: SlidersHorizontal },
        ]
      : []),
    {
      name: "Activity log",
      href: "/admin/audit",
      icon: History,
    },
  ];

  const currentPage = navItems.find((item) => item.href === pathname)?.name || "Admin Panel";

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        {/* Header Bar */}
        <div className="px-4 py-3.5 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WeirwiseWordmark />
            <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-muted/60 border border-border/80 text-muted-foreground font-mono">
              Admin
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Link
              href="/"
              onClick={() => isMobile && setMobileMenuOpen(false)}
              className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Return to App"
            >
              <span>App</span>
              <ExternalLink className="h-3 w-3" />
            </Link>

            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Section */}
        <div className="p-3">
          <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 font-mono">
            Administration
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => isMobile && setMobileMenuOpen(false)}
                  className={`relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
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
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground font-medium">Appearance</span>
          <PreferenceControls />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card p-2 text-xs">
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground antialiased font-sans">
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex h-full w-60 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-md">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin Navigation"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          <div
            className="absolute inset-0 bg-onyx/50 backdrop-blur-[2px] animate-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            tabIndex={-1}
            className="relative z-10 flex h-full w-[86vw] max-w-[280px] flex-col border-r border-border bg-card shadow-2xl outline-none animate-in"
          >
            {renderSidebarContent(true)}
          </div>
        </div>
      )}

      {/* Right Canvas: Header + Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted transition-colors"
              aria-label="Open Navigation Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-foreground truncate">
              {currentPage}
            </span>
          </div>

          <Link
            href="/"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>App</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </header>

        {/* Main Administrative Work Canvas */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
