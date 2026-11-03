"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

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

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={cn("relative w-full space-y-1.5", className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-foreground">
          {label}
        </label>
      )}

      {/* Custom Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "w-full flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3.5 py-2.5 text-xs sm:text-sm text-foreground transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen && "border-zinc-600 ring-1 ring-white/20",
          triggerClassName
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {selectedOption?.icon && (
            <span className="text-zinc-400 shrink-0">{selectedOption.icon}</span>
          )}
          <span className={cn("truncate font-normal", !selectedOption && "text-zinc-500")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-zinc-500 transition-transform duration-200 shrink-0 ml-2",
            isOpen && "rotate-180 text-foreground"
          )}
        />
      </button>

      {/* Custom Popover / Bottom Sheet Modal on mobile */}
      {isOpen && (
        <>
          {/* Mobile backdrop for bottom-sheet feel */}
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs sm:hidden animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Desktop Dropdown & Mobile Bottom Sheet */}
          <div
            role="listbox"
            className={cn(
              "z-50 bg-[#0c0d10] text-foreground border border-zinc-800 shadow-2xl transition-all duration-150 select-none overflow-hidden",
              // Mobile: Slide-up bottom sheet
              "fixed inset-x-3 bottom-4 sm:inset-x-auto sm:bottom-auto rounded-xl p-2 max-h-[60vh] sm:max-h-60 overflow-y-auto animate-in slide-in-from-bottom-5 duration-200",
              // Desktop: Standard anchored popover
              "sm:absolute sm:top-full sm:left-0 sm:right-0 sm:mt-1.5 sm:rounded-lg sm:p-1 sm:animate-in sm:fade-in-50 sm:zoom-in-95"
            )}
          >
            {/* Mobile Sheet Drag Handle indicator */}
            <div className="flex justify-center pb-2 pt-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-zinc-700" />
            </div>

            {label && (
              <div className="px-3 py-1.5 text-[10px] font-mono tracking-wider text-zinc-400 sm:hidden">
                {label}
              </div>
            )}

            <div className="space-y-1">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                      isSelected
                        ? "bg-zinc-800/80 text-white font-medium"
                        : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {opt.icon && (
                        <span className={cn("shrink-0", isSelected ? "text-white" : "text-zinc-400")}>
                          {opt.icon}
                        </span>
                      )}
                      <div className="flex flex-col truncate">
                        <span className="truncate">{opt.label}</span>
                        {opt.description && (
                          <span className="text-[11px] text-zinc-500 font-normal truncate">
                            {opt.description}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-white shrink-0 ml-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
