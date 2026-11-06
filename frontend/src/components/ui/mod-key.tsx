"use client";

import { useEffect, useState } from "react";

/**
 * Renders the platform's palette shortcut. Resolved after mount so the
 * server markup stays identical for every visitor and never hydrates
 * with the wrong key on Windows or Linux.
 */
export function ModKey() {
  const [label, setLabel] = useState("⌘K");

  useEffect(() => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(
      navigator.platform || navigator.userAgent
    );
    setLabel(isApple ? "⌘K" : "Ctrl K");
  }, []);

  return <>{label}</>;
}
