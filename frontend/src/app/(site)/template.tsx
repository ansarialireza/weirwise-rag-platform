"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="w-full min-h-screen transition-opacity duration-200 ease-out animate-in-opacity"
    >
      {children}
    </div>
  );
}
