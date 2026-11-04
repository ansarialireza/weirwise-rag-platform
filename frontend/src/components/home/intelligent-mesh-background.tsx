import React from "react";

export function IntelligentMeshBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 max-w-full select-none overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.25] dark:opacity-[0.2]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          color: "hsl(var(--muted-foreground))",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background/90" />
    </div>
  );
}
