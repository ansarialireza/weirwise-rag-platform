import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "signal" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary:
        "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95",
      signal:
        "bg-signal text-signal-foreground shadow-sm hover:brightness-[0.96] active:brightness-90",
      secondary:
        "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-transparent",
      outline:
        "border border-border bg-card text-foreground hover:bg-muted/70 hover:border-border",
      ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
      destructive:
        "border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15",
      link: "text-accent underline-offset-4 hover:underline",
    };

    const sizes = {
      sm: "h-9 px-3.5 text-[13px] rounded-lg gap-1.5",
      md: "h-10 px-4 text-sm rounded-lg gap-2",
      lg: "h-11 px-5 text-sm rounded-xl gap-2",
      icon: "h-9 w-9 rounded-lg",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
