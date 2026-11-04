"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

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

  const openSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  };

  if (authLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="w-full max-w-xs space-y-3 px-6">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <div className="hidden shrink-0 md:flex">
        <Sidebar />
      </div>

      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
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
            className="relative z-10 flex h-full w-[86vw] max-w-[300px] flex-col border-r border-border bg-card shadow-lift outline-none animate-in"
          >
            <Sidebar
              onItemClick={() => setMobileMenuOpen(false)}
              onClose={() => setMobileMenuOpen(false)}
              isMobileDrawer
            />
          </div>
        </div>
      )}

      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        aria-hidden={mobileMenuOpen ? true : undefined}
      >
        <AppTopbar
          onOpenMenu={() => {
            setMobileMenuOpen(true);
          }}
          onOpenSearch={openSearch}
        />

        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
