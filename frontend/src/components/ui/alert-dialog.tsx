"use client";

import React, { useEffect } from "react";
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
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-onyx/50 p-0 backdrop-blur-[2px] animate-in sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
    >
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!isLoading) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md space-y-5 rounded-t-2xl border border-border bg-card p-5 shadow-lift animate-in sm:rounded-xl sm:p-6">
        <div className="flex items-start gap-3.5">
          <div
            className={
              variant === "destructive"
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive"
                : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground"
            }
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 id="alert-dialog-title" className="text-[15px] font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <div id="alert-dialog-description" className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={isLoading} onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "primary"}
            size="sm"
            isLoading={isLoading}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
