"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  label?: string;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className,
  triggerClassName,
  label,
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className={cn("relative w-full space-y-1.5", className)} ref={containerRef}>
      {label && <label className="block text-[13px] font-medium text-foreground">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-input px-3.5 text-sm text-foreground shadow-sm transition-colors hover:border-muted-foreground/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50",
          isOpen && "border-accent",
          triggerClassName
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {selectedOption?.icon && (
            <span className="shrink-0 text-muted-foreground">{selectedOption.icon}</span>
          )}
          <span className={cn("truncate font-normal", !selectedOption && "text-muted-foreground/70")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "ms-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180 text-foreground"
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[75] bg-onyx/40 animate-in-opacity sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            role="listbox"
            className="fixed inset-x-3 bottom-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] z-[75] max-h-[60vh] select-none overflow-y-auto rounded-xl border border-border bg-popover p-2 text-foreground shadow-lift animate-in sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-1.5 sm:max-h-64 sm:p-1.5"
          >
            <div className="mb-2 flex justify-center pb-1 pt-0.5 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            {label && (
              <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:hidden">
                {label}
              </div>
            )}

            <div className="space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors touch-manipulation sm:py-2",
                      isSelected
                        ? "bg-accent-soft font-medium text-foreground"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {opt.icon && (
                        <span className={cn("shrink-0", isSelected ? "text-accent" : "text-muted-foreground")}>
                          {opt.icon}
                        </span>
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="truncate text-[11px] font-normal text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="ms-2 h-4 w-4 shrink-0 text-accent" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
