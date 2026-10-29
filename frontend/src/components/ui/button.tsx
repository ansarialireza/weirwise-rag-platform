import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading = false, children, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.98] shadow-sm",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]",
      outline: "border border-border bg-card text-foreground hover:bg-secondary active:scale-[0.98]",
      ghost: "text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-[0.98]",
      destructive: "bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98]",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs rounded-md gap-1.5",
      md: "h-9 px-4 text-sm rounded-md gap-2",
      lg: "h-11 px-6 text-base rounded-lg gap-2.5",
      icon: "h-9 w-9 p-0 rounded-md items-center justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
