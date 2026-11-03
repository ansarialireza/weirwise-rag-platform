"use client";

import React, { useEffect, useState, useRef } from "react";
import { useStoryStage } from "@/lib/story-stage-context";

/**
 * ContinuousThreadStage:
 * The persistent architectural background canvas that morphs horizontally
 * across route transitions without unmounting, perfectly tracking RAG stages:
 *
 * 1. Landing: Abstract & fluid waves morphing into geometric peaks
 * 2. Auth: Frozen encrypted biometric grid locking out chaos
 * 3. Knowledge Base: 8px rigid matrix with data chunks falling into slots
 * 4. Assistant Tuning: Vector connectivity with faint dynamic relational lines
 * 5. Playground/Chat: Absolute silent darkness, zero visual noise
 *
 * Constraint: Brutalist-Tech watermark ambient opacity (max 10-15%).
 */
export function ContinuousThreadStage() {
  const { stage, chunkDropTrigger, isSilentDarkness } = useStoryStage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallingBlocks, setFallingBlocks] = useState<
    Array<{ id: number; col: number; startY: number; targetY: number; progress: number; size: number }>
  >([]);

  // Trigger falling blocks micro-interaction on chunkDropTrigger
  useEffect(() => {
    if (chunkDropTrigger > 0 && stage === "knowledge") {
      const newBlocks = Array.from({ length: 7 }).map((_, i) => ({
        id: Date.now() + i,
        col: Math.floor(Math.random() * 20) + 2,
        startY: -20 - Math.random() * 100,
        targetY: 120 + (i * 32) + Math.floor(Math.random() * 8) * 8,
        progress: 0,
        size: 16 + (i % 2) * 8,
      }));
      setFallingBlocks((prev) => [...prev, ...newBlocks]);
    }
  }, [chunkDropTrigger, stage]);

  // Clean up completed blocks
  useEffect(() => {
    if (fallingBlocks.length === 0) return;
    const interval = setInterval(() => {
      setFallingBlocks((prev) =>
        prev
          .map((b) => ({ ...b, progress: Math.min(1, b.progress + 0.08) }))
          .filter((b) => b.progress < 1)
      );
    }, 30);
    return () => clearInterval(interval);
  }, [fallingBlocks]);

  // Dynamic canvas for Stage 4 (Vector Synapses) and Stage 1 (Fluid Waves)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Node definitions for Assistant Tuning (Stage 4)
    const nodes: Array<{ x: number; y: number; vx: number; vy: number; radius: number; color: string }> = [];
    const nodeCount = 28;
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() > 0.7 ? 3 : 2,
        color: i % 3 === 0 ? "#CCFF00" : "#2563FF",
      });
    }

    let time = 0;

    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      // STAGE 5: Chat / Output -> Absolute Silent Darkness
      if (stage === "clarity") {
        return; // Complete pure darkness
      }

      // STAGE 1: Landing -> Chaotic waves morphing to structural peaks
      if (stage === "landing") {
        ctx.save();
        ctx.lineWidth = 1;
        // Draw 3 layered horizontal wave streams
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.strokeStyle = j === 0 ? "rgba(204, 255, 0, 0.09)" : "rgba(37, 99, 255, 0.08)";
          for (let x = 0; x <= width; x += 20) {
            const yOffset =
              Math.sin(x * 0.003 + time * (1 + j * 0.3)) * 45 +
              Math.cos(x * 0.007 - time * 0.8) * 25 +
              height * (0.35 + j * 0.18);
            if (x === 0) ctx.moveTo(x, yOffset);
            else ctx.lineTo(x, yOffset);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // STAGE 4: Assistant Configuration -> Vector Connectivity Lines
      if (stage === "tuning") {
        ctx.save();
        // Update and draw vector nodes
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;

          // Subtle watermark node dots
          ctx.fillStyle = n.color === "#CCFF00" ? "rgba(204, 255, 0, 0.25)" : "rgba(37, 99, 255, 0.25)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fill();

          // Connect nearby vector nodes with faint synaptic lines
          for (let k = i + 1; k < nodes.length; k++) {
            const n2 = nodes[k];
            const dx = n.x - n2.x;
            const dy = n.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 180) {
              const alpha = (1 - dist / 180) * 0.12; // Max 12% opacity watermark
              ctx.strokeStyle =
                n.color === "#CCFF00" || n2.color === "#CCFF00"
                  ? `rgba(204, 255, 0, ${alpha})`
                  : `rgba(37, 99, 255, ${alpha})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(n2.x, n2.y);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, [stage]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden transition-colors duration-700 ease-out select-none"
      style={{
        backgroundColor: isSilentDarkness ? "rgba(5, 6, 8, 0.98)" : "transparent",
      }}
    >
      {/* Dynamic Animated Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* STAGE 2: Auth / Login -> Frozen Strict Biometric Grid */}
      {stage === "auth" && (
        <div className="absolute inset-0 transition-opacity duration-500 ease-out animate-in fade-in">
          {/* Strict mathematical coordinate lattice */}
          <div
            className="absolute inset-0 opacity-[0.09] dark:opacity-[0.12]"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(204, 255, 0, 0.3) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(37, 99, 255, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: "32px 32px",
            }}
          />
          {/* Encrypted crosshair watermark anchors */}
          <div className="absolute top-12 left-12 w-4 h-4 border-t border-l border-[#CCFF00]/40 font-mono text-[9px] text-[#CCFF00]/50 pt-1 pl-1">
            01.GATE
          </div>
          <div className="absolute top-12 right-12 w-4 h-4 border-t border-r border-[#2563FF]/40 font-mono text-[9px] text-[#2563FF]/50 pt-1 pr-1 text-right">
            AUTH.256
          </div>
          <div className="absolute bottom-12 left-12 w-4 h-4 border-b border-l border-[#2563FF]/40 font-mono text-[9px] text-[#2563FF]/50 pb-1 pl-1">
            SEC.STABLE
          </div>
          <div className="absolute bottom-12 right-12 w-4 h-4 border-b border-r border-[#CCFF00]/40 font-mono text-[9px] text-[#CCFF00]/50 pb-1 pr-1 text-right">
            GRID.LOCK
          </div>
        </div>
      )}

      {/* STAGE 3: Knowledge Base Page -> 8px Rigid Grid & Falling Ingestion Blocks */}
      {stage === "knowledge" && (
        <div className="absolute inset-0 transition-opacity duration-500 ease-out animate-in fade-in">
          {/* Subtle 8px rigid grid representing matrixized chunk space */}
          <div
            className="absolute inset-0 opacity-[0.08] dark:opacity-[0.11]"
            style={{
              backgroundImage: `
                linear-gradient(to right, currentColor 1px, transparent 1px),
                linear-gradient(to bottom, currentColor 1px, transparent 1px)
              `,
              backgroundSize: "8px 8px",
              color: "hsl(var(--muted-foreground))",
            }}
          />

          {/* Micro-interaction: Animated chunks/embeddings snapping into matrix slots */}
          {fallingBlocks.map((b) => {
            const currentY = b.startY + (b.targetY - b.startY) * b.progress;
            return (
              <div
                key={b.id}
                className="absolute border border-[#CCFF00]/60 bg-[#CCFF00]/20 rounded-xs transition-transform duration-75 shadow-[0_0_8px_rgba(204,255,0,0.3)]"
                style={{
                  left: `${(b.col * 8 * 4) % (typeof window !== "undefined" ? window.innerWidth - 60 : 800)}px`,
                  top: `${currentY}px`,
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  opacity: 1 - b.progress * 0.3,
                }}
              >
                <div className="w-1.5 h-1.5 bg-[#CCFF00] absolute top-0.5 left-0.5" />
              </div>
            );
          })}
        </div>
      )}

      {/* Horizontal Story Tracker: Subtle Watermark Status (Top-Right or Bottom-Right) */}
      <div className="absolute bottom-3 right-4 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/40 pointer-events-none tracking-widest uppercase">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor:
              stage === "clarity"
                ? "#46C7D6"
                : stage === "tuning"
                ? "#2563FF"
                : stage === "knowledge"
                ? "#CCFF00"
                : stage === "auth"
                ? "#2563FF"
                : "#CCFF00",
          }}
        />
        <span>RAG STAGE: {stage}</span>
      </div>
    </div>
  );
}
