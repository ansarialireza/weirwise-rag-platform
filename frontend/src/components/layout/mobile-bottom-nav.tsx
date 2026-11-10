"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Database,
  MessageSquare,
  Settings,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { dict } = useI18n();

  const navItems = [
    {
      id: "overview",
      label: dict.common.overview,
      href: "/overview",
      icon: LayoutDashboard,
      active: pathname === "/overview",
    },
    {
      id: "sources",
      label: dict.common.knowledge,
      href: "/sources",
      icon: Database,
      active: pathname.startsWith("/sources"),
    },
    {
      id: "assistants",
      label: dict.common.assistants,
      href: "/assistants",
      icon: Bot,
      active: pathname.startsWith("/assistants"),
    },
    {
      id: "playground",
      label: dict.common.playground,
      href: "/playground",
      icon: MessageSquare,
      active: pathname.startsWith("/playground"),
    },
    {
      id: "settings",
      label: dict.common.settings,
      href: "/settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed inset-x-0 bottom-0 z-50 block border-t border-border/80 bg-background/95 backdrop-blur-xl md:hidden select-none"
      style={{
        paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="flex h-16 w-full items-center justify-around px-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group relative flex min-w-0 flex-1 flex-col items-center justify-center py-1 transition-all duration-150 active:scale-95",
                isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Material Design 3 Pill Indicator: w-16 h-8 rounded-full */}
              <div className="relative flex items-center justify-center">
                <div
                  className={cn(
                    "flex h-8 w-14 sm:w-16 items-center justify-center rounded-full transition-all duration-200 ease-out",
                    isActive
                      ? "bg-accent/15 text-accent shadow-sm"
                      : "bg-transparent text-muted-foreground group-active:bg-muted/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-transform duration-200",
                      isActive ? "stroke-[2.2] scale-105" : "stroke-[1.8]"
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Navigation Label: Single line, no wrap */}
              <span
                className={cn(
                  "mt-1 w-full truncate text-center text-[10.5px] leading-tight tracking-tight transition-colors px-0.5",
                  isActive ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
