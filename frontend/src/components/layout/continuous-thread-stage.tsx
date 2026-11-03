"use client";

import React, { useEffect, useState, useRef } from "react";
import { useStoryStage } from "@/lib/story-stage-context";

/**
 * ContinuousThreadStage:
 * The persistent architectural background canvas that morphs horizontally
 * across route transitions without unmounting, perfectly tracking RAG stages:
 *
 * 1. Landing: Abstract & fluid waves flowing left-to-right, snapping to geometric
 *    grids at the center, reacting dynamically with magnetic physics to the cursor.
 * 2. Auth: Frozen encrypted biometric grid locking out chaos.
 * 3. Knowledge Base: 8px rigid matrix with exactly N data blocks falling on document upload.
 * 4. Assistant Tuning: Vector connectivity with faint dynamic relational lines (synapses).
 * 5. Playground/Chat: Absolute silent darkness, zero visual noise.
 *
 * Constraint: Brutalist-Tech watermark ambient opacity (max 10-15%).
 */
export function ContinuousThreadStage() {
  const { stage, chunkDropCount, isSilentDarkness } = useStoryStage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallingBlocks, setFallingBlocks] = useState<
    Array<{ id: number; col: number; startY: number; targetY: number; progress: number; size: number }>
  >([]);

  // Mouse cursor coordinate tracking for magnetic physics
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  // Trigger exactly N falling blocks micro-interaction on chunkDropCount
  useEffect(() => {
    if (chunkDropCount > 0 && stage === "knowledge") {
      const count = Math.min(chunkDropCount, 24); // Cap max spawned blocks
      const newBlocks = Array.from({ length: count }).map((_, i) => ({
        id: Date.now() + i + Math.random(),
        col: Math.floor(Math.random() * 24) + 2,
        startY: -20 - (i * 15),
        targetY: 100 + (i * 24) + Math.floor(Math.random() * 8) * 8,
        progress: 0,
        size: 16 + (i % 2) * 8,
      }));
      setFallingBlocks((prev) => [...prev, ...newBlocks]);
    }
  }, [chunkDropCount, stage]);

  // Clean up completed blocks
  useEffect(() => {
    if (fallingBlocks.length === 0) return;
    const interval = setInterval(() => {
      setFallingBlocks((prev) =>
        prev
          .map((b) => ({ ...b, progress: Math.min(1, b.progress + 0.07) }))
          .filter((b) => b.progress < 1)
      );
    }, 25);
    return () => clearInterval(interval);
  }, [fallingBlocks]);

  // Dynamic canvas for Stage 1 (Magnetic Fluid Waves -> Sharp Grid) and Stage 4 (Vector Synapses)
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

    // Vector nodes for Stage 4 (Assistant Tuning)
    const nodes: Array<{ x: number; y: number; vx: number; vy: number; radius: number; color: string }> = [];
    const nodeCount = 26;
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() > 0.7 ? 2.5 : 1.8,
        color: i % 2 === 0 ? "#46C7D6" : "#2563FF",
      });
    }

    let time = 0;

    const render = () => {
      time += 0.012;
      ctx.clearRect(0, 0, width, height);

      // STAGE 5: Chat / Output -> Absolute Silent Darkness
      if (stage === "clarity") {
        return;
      }

      // STAGE 1: Landing -> Chaotic waves on left snapping to geometric grid on right + magnetic cursor pull
      if (stage === "landing") {
        ctx.save();
        ctx.lineWidth = 1;

        const waveStreams = [
          { stroke: "rgba(70, 199, 214, 0.12)", yBase: 0.35, freq: 0.003, speed: 1.0 },
          { stroke: "rgba(37, 99, 255, 0.10)", yBase: 0.50, freq: 0.004, speed: 0.8 },
          { stroke: "rgba(70, 199, 214, 0.09)", yBase: 0.65, freq: 0.0025, speed: 1.2 },
        ];

        waveStreams.forEach((stream) => {
          ctx.beginPath();
          ctx.strokeStyle = stream.stroke;

          for (let x = 0; x <= width; x += 16) {
            // Organic chaotic wave offset on the left half
            let rawY =
              Math.sin(x * stream.freq + time * stream.speed) * 40 +
              Math.cos(x * 0.006 - time * 0.7) * 20 +
              height * stream.yBase;

            // Across the center (x > width * 0.45), progressively snap into rigid grid coordinates
            const snapRatio = Math.max(0, Math.min(1, (x - width * 0.45) / (width * 0.3)));
            const rigidY = Math.round(rawY / 32) * 32;
            let targetY = rawY * (1 - snapRatio) + rigidY * snapRatio;

            // Magnetic physics: cursor exerts structuring attraction when hovering near
            if (mouseRef.current.active) {
              const dx = x - mouseRef.current.x;
              const dy = targetY - mouseRef.current.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const magneticRadius = 160;

              if (dist < magneticRadius) {
                const force = (1 - dist / magneticRadius) * 28;
                // Cursor aligns the point into strict horizontal tension
                const alignedY = mouseRef.current.y;
                targetY = targetY * (1 - force / 28) + alignedY * (force / 28);
              }
            }

            if (x === 0) ctx.moveTo(x, targetY);
            else ctx.lineTo(x, targetY);
          }
          ctx.stroke();
        });

        ctx.restore();
      }

      // STAGE 4: Assistant Configuration -> Vector Synaptic Graph
      if (stage === "tuning") {
        ctx.save();
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;

          // Watermark node dot
          ctx.fillStyle = n.color === "#46C7D6" ? "rgba(70, 199, 214, 0.22)" : "rgba(37, 99, 255, 0.22)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fill();

          // Relational synapses
          for (let k = i + 1; k < nodes.length; k++) {
            const n2 = nodes[k];
            const dx = n.x - n2.x;
            const dy = n.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 180) {
              const alpha = (1 - dist / 180) * 0.12; // Max 12% opacity
              ctx.strokeStyle = `rgba(70, 199, 214, ${alpha})`;
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
          <div
            className="absolute inset-0 opacity-[0.09] dark:opacity-[0.11]"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(70, 199, 214, 0.3) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(37, 99, 255, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute top-10 left-10 w-4 h-4 border-t border-l border-[#46C7D6]/40 font-mono text-[9px] text-[#46C7D6]/50 pt-1 pl-1">
            01.GATE
          </div>
          <div className="absolute top-10 right-10 w-4 h-4 border-t border-r border-[#2563FF]/40 font-mono text-[9px] text-[#2563FF]/50 pt-1 pr-1 text-right">
            AUTH.256
          </div>
          <div className="absolute bottom-10 left-10 w-4 h-4 border-b border-l border-[#2563FF]/40 font-mono text-[9px] text-[#2563FF]/50 pb-1 pl-1">
            SEC.STABLE
          </div>
          <div className="absolute bottom-10 right-10 w-4 h-4 border-b border-r border-[#46C7D6]/40 font-mono text-[9px] text-[#46C7D6]/50 pb-1 pr-1 text-right">
            GRID.LOCK
          </div>
        </div>
      )}

      {/* STAGE 3: Knowledge Base Page -> 8px Rigid Grid & Falling Ingestion Blocks */}
      {stage === "knowledge" && (
        <div className="absolute inset-0 transition-opacity duration-500 ease-out animate-in fade-in">
          <div
            className="absolute inset-0 opacity-[0.08] dark:opacity-[0.10]"
            style={{
              backgroundImage: `
                linear-gradient(to right, currentColor 1px, transparent 1px),
                linear-gradient(to bottom, currentColor 1px, transparent 1px)
              `,
              backgroundSize: "8px 8px",
              color: "hsl(var(--muted-foreground))",
            }}
          />

          {/* Micro-interaction: Exact N animated chunks/embeddings falling into matrix slots */}
          {fallingBlocks.map((b) => {
            const currentY = b.startY + (b.targetY - b.startY) * b.progress;
            return (
              <div
                key={b.id}
                className="absolute border border-[#46C7D6]/70 bg-[#46C7D6]/15 rounded-xs transition-transform duration-75 shadow-[0_0_8px_rgba(70,199,214,0.3)]"
                style={{
                  left: `${(b.col * 8 * 4) % (typeof window !== "undefined" ? window.innerWidth - 60 : 800)}px`,
                  top: `${currentY}px`,
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  opacity: 1 - b.progress * 0.25,
                }}
              >
                <div className="w-1.5 h-1.5 bg-[#46C7D6] absolute top-0.5 left-0.5" />
              </div>
            );
          })}
        </div>
      )}

      {/* Subdued Minimalist Stage Indicator */}
      <div className="absolute bottom-3 right-4 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/30 pointer-events-none tracking-widest uppercase">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: stage === "clarity" ? "#46C7D6" : stage === "tuning" ? "#2563FF" : "#46C7D6",
          }}
        />
        <span>{stage}</span>
      </div>
    </div>
  );
}
