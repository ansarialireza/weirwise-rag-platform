"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: "destructive" | "primary";
}

export function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Continue",
  cancelText = "Cancel",
  isLoading = false,
  variant = "destructive",
}: AlertDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      {/* Backdrop overlay dismiss handler */}
      <div
        className="fixed inset-0"
        onClick={() => {
          if (!isLoading) onClose();
        }}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md rounded-xl border border-zinc-800 bg-[#0c0d10] p-6 sm:p-8 shadow-2xl z-10 space-y-6 animate-in zoom-in-95 duration-200"
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              variant === "destructive"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-zinc-900 text-zinc-300 border-zinc-800"
            )}
          >
            <AlertTriangle className="h-4 w-4 stroke-[1.5]" />
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <h2
              id="alert-dialog-title"
              className="text-sm sm:text-base font-semibold tracking-tight text-foreground"
            >
              {title}
            </h2>
            <div
              id="alert-dialog-description"
              className="text-xs text-zinc-400 leading-relaxed"
            >
              {description}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isLoading}
            onClick={onClose}
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "primary"}
            size="sm"
            disabled={isLoading}
            onClick={onConfirm}
          >
            {isLoading && (
              <span className="inline-block h-3 w-1.5 bg-[#46C7D6] animate-pulse mr-1" aria-hidden="true" />
            )}
            <span>{isLoading ? "Deleting..." : confirmText}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
