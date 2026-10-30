import React from "react";

export function IntelligentMeshBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0 max-w-full">
      {/* 1. Ambient Glow Nodes */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[650px] h-[350px] bg-primary/[0.04] dark:bg-primary/[0.06] rounded-full blur-[120px] transition-all pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[60vw] max-w-[400px] h-[250px] bg-emerald-500/[0.02] dark:bg-emerald-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

      {/* 2. Micro Dot Grid Texture */}
      <div
        className="absolute inset-0 opacity-[0.25] dark:opacity-[0.2]"
        style={{
          backgroundImage: `radial-gradient(currentColor 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          color: "hsl(var(--muted-foreground))",
        }}
      />

      {/* 3. Subtle Gradient Vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background/90" />
    </div>
  );
}
