"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";

export type StoryStage = 
  | "landing"    // The Promise: Vertical Story (Chaotic waves -> Structural peaks)
  | "auth"       // The Gateway: Frozen strict biometric / mathematical grid
  | "knowledge"  // The Weir / Ingestion: Chunking, 8px rigid matrixization & falling blocks
  | "tuning"     // The Tuning / Engine Room: Vector connectivity & dynamic neural relational lines
  | "clarity";   // The Wise / Total Clarity: Crystalline Peak, silent darkness, glowing crystal cursor

interface StoryStageContextValue {
  stage: StoryStage;
  setStageOverride: (stage: StoryStage | null) => void;
  stageName: string;
  stageSubtext: string;
  gridOpacity: number;
  matrixActive: boolean;
  vectorLinesActive: boolean;
  isSilentDarkness: boolean;
  triggerChunkDrop: () => void;
  chunkDropTrigger: number;
}

const StoryStageContext = createContext<StoryStageContextValue | null>(null);

export function getStoryStageFromPath(pathname: string): StoryStage {
  if (!pathname || pathname === "/") {
    return "landing";
  }
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/verify-email")
  ) {
    return "auth";
  }
  if (
    pathname.includes("/sources") ||
    pathname.includes("/documents") ||
    pathname.includes("/data")
  ) {
    return "knowledge";
  }
  if (
    pathname.includes("/assistants") ||
    pathname.includes("/tuning") ||
    pathname.includes("/settings") ||
    pathname.includes("/overview")
  ) {
    return "tuning";
  }
  if (
    pathname.includes("/playground") ||
    pathname.includes("/chat") ||
    pathname.startsWith("/embed")
  ) {
    return "clarity";
  }

  // Default dashboard fallback
  if (pathname.startsWith("/workspaces") || pathname.startsWith("/admin")) {
    return "knowledge";
  }

  return "landing";
}

export function StoryStageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stageOverride, setStageOverride] = useState<StoryStage | null>(null);
  const [chunkDropTrigger, setChunkDropTrigger] = useState(0);

  const stage = useMemo(() => {
    return stageOverride || getStoryStageFromPath(pathname || "/");
  }, [stageOverride, pathname]);

  const triggerChunkDrop = () => {
    setChunkDropTrigger((prev) => prev + 1);
  };

  const metadata = useMemo(() => {
    switch (stage) {
      case "landing":
        return {
          stageName: "THE PROMISE (VERTICAL SWELL)",
          stageSubtext: "Chaotic Ingestion to Structural Synthesis",
          gridOpacity: 0.08,
          matrixActive: false,
          vectorLinesActive: false,
          isSilentDarkness: false,
        };
      case "auth":
        return {
          stageName: "THE GATEWAY (FROZEN RESTRAINT)",
          stageSubtext: "Cryptographic Locking • Strict Biometric Grid",
          gridOpacity: 0.12,
          matrixActive: true,
          vectorLinesActive: false,
          isSilentDarkness: false,
        };
      case "knowledge":
        return {
          stageName: "THE WEIR (INGESTION & MATRIXIZATION)",
          stageSubtext: "Deterministic Chunking • 8px Rigid Ingestion Lattice",
          gridOpacity: 0.14,
          matrixActive: true,
          vectorLinesActive: false,
          isSilentDarkness: false,
        };
      case "tuning":
        return {
          stageName: "THE TUNING (ENGINE ROOM)",
          stageSubtext: "Vector Graph Space • Dynamic Relational Synapses",
          gridOpacity: 0.10,
          matrixActive: true,
          vectorLinesActive: true,
          isSilentDarkness: false,
        };
      case "clarity":
        return {
          stageName: "THE WISE (TOTAL CLARITY)",
          stageSubtext: "Crystalline Peak • Zero Noise • Attributed Ground Truth",
          gridOpacity: 0.0,
          matrixActive: false,
          vectorLinesActive: false,
          isSilentDarkness: true,
        };
    }
  }, [stage]);

  return (
    <StoryStageContext.Provider
      value={{
        stage,
        setStageOverride,
        ...metadata,
        triggerChunkDrop,
        chunkDropTrigger,
      }}
    >
      {children}
    </StoryStageContext.Provider>
  );
}

export function useStoryStage() {
  const ctx = useContext(StoryStageContext);
  if (!ctx) {
    throw new Error("useStoryStage must be used within a StoryStageProvider");
  }
  return ctx;
}
