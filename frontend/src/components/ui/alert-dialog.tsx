"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
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
          "relative w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-2xl z-10 space-y-5 animate-in zoom-in-95 duration-200"
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              variant === "destructive"
                ? "bg-red-500/10 text-red-500 border border-red-500/20"
                : "bg-primary/10 text-primary border border-primary/20"
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <h2
              id="alert-dialog-title"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              {title}
            </h2>
            <div
              id="alert-dialog-description"
              className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
            >
              {description}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={onClose}
            className="rounded-xl px-4 h-9 text-xs font-medium"
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isLoading}
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 h-9 text-xs font-semibold gap-2 transition-all shadow-xs",
              variant === "destructive"
                ? "bg-red-600 hover:bg-red-700 text-white active:bg-red-800"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
          >
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{isLoading ? "Deleting..." : confirmText}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
