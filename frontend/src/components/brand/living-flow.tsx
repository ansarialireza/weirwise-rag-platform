"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createLivingFlow, type LivingFlowHandle } from "@/lib/brand/living-flow-engine";

interface LivingFlowProps {
  className?: string;
  /**
   * The mark is the logo; this is the signature. It is decorative unless a
   * caller gives it a name, in which case it becomes an image for screen
   * readers rather than noise.
   */
  label?: string;
}

/**
 * Mounts the Living Flow engine against a canvas.
 *
 * The WebGL context is created inside an effect, so nothing here runs during
 * server rendering and the page still streams its HTML with the visual absent.
 * If the context cannot be created — no WebGL2, a lost context, a blocked
 * software renderer — the element keeps its box and shows the signature
 * gradient instead, so the layout never jumps.
 */
export function LivingFlow({ className, label }: LivingFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !supported) return;

    let handle: LivingFlowHandle | null = null;
    try {
      handle = createLivingFlow({
        canvas,
        tokenHost: canvas.parentElement ?? undefined,
        reducedMotion,
        onFailed: (reason) => {
          // The gradient fallback hides the failure completely, so say so once.
          console.warn(`[living-flow] falling back to the static signature: ${reason}`);
          setSupported(false);
        },
      });
    } catch {
      setSupported(false);
    }
    return () => handle?.stop();
  }, [supported, reducedMotion]);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {/* Fallback and live layer share this box, so a failed context changes
          the painting and not the geometry around it. */}
      <div
        className={cn(
          "absolute inset-0 bg-flow-signature-soft opacity-70 transition-opacity duration-[var(--dur-enter)]",
          supported && "opacity-0"
        )}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={cn(
          "relative block h-full w-full transition-opacity duration-[var(--dur-enter)]",
          supported ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
