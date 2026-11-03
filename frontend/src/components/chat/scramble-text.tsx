"use client";

import React, { useEffect, useState, useRef } from "react";

const CHARS = "01_X#$<>[]{}*+=~^-/\\ABCDEF0123456789";

interface ScrambleTextProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}

/**
 * ScrambleText:
 * High-performance text decryption effect.
 * Each character rapidly cycles through raw code / cryptographic glyphs
 * before locking into its verified ground-truth symbol.
 */
export function ScrambleText({
  text,
  speed = 18,
  className = "",
  onComplete,
}: ScrambleTextProps) {
  const [displayText, setDisplayText] = useState("");
  const iterationRef = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    let animId: number;
    iterationRef.current = 0;
    const target = textRef.current;
    const targetLength = target.length;

    const update = () => {
      iterationRef.current += 1.2;
      const progress = iterationRef.current;

      const scrambled = target
        .split("")
        .map((char, index) => {
          if (char === " " || char === "\n") return char;
          if (index < progress) {
            return char;
          }
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join("");

      setDisplayText(scrambled);

      if (progress < targetLength + 2) {
        animId = requestAnimationFrame(update);
      } else {
        setDisplayText(target);
        onComplete?.();
      }
    };

    animId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [text, speed, onComplete]);

  return <span className={className}>{displayText}</span>;
}
