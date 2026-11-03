import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-white text-black font-medium hover:bg-zinc-200 active:scale-[0.98] shadow-xs dark:bg-white dark:text-black dark:hover:bg-zinc-200",
      secondary: "border border-zinc-800 bg-transparent text-foreground font-medium hover:bg-white/5 hover:border-zinc-700 active:scale-[0.98]",
      outline: "border border-zinc-800 bg-transparent text-foreground font-medium hover:bg-white/5 hover:border-zinc-700 active:scale-[0.98]",
      ghost: "text-zinc-400 hover:text-foreground hover:bg-white/5 active:scale-[0.98]",
      destructive: "border border-red-500/20 bg-red-950/20 text-red-400 font-medium hover:bg-red-900/40 hover:text-red-300 hover:border-red-500/40 active:scale-[0.98]",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs rounded-md gap-1.5",
      md: "h-9 px-4 text-xs sm:text-sm rounded-md gap-2",
      lg: "h-10 px-5 text-sm rounded-md gap-2.5",
      icon: "h-8 w-8 p-0 rounded-md items-center justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse shrink-0" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
