"use client";

import React from "react";
import { usePathname } from "next/navigation";

/**
 * Route Transition Template (Horizontal Progressive Disclosure):
 * Provides layoutId-like progressive morphing without unmounting
 * the persistent ContinuousThread ambient layer.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="w-full min-h-screen transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-1"
    >
      {children}
    </div>
  );
}
