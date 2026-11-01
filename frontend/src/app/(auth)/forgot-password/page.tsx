"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, Shield, CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { IntelligentFlowGraphic } from "@/components/auth/intelligent-flow-graphic";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    setLoading(true);
    try {
      const res = await api.forgotPassword({ email: email.trim() });
      setSuccess(res.message || "Password reset instructions dispatched to your email.");
      toast({ message: "Reset code dispatched! Please check your inbox.", type: "info" });
    } catch (err: any) {
      setError(err.message || "Failed to submit password reset request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column: Form Container */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-between p-6 sm:p-10 lg:p-14 border-r border-border bg-card">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 sm:gap-3 group select-none">
            <WeirwiseSymbol className="h-7 sm:h-8 w-auto" priority />
            <span className="font-bold text-base sm:text-lg tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            </span>
          </Link>
          <ThemeSwitcher />
        </div>

        {/* Center Form */}
        <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              <KeyRound className="h-3 w-3" /> Account Recovery
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Reset your password
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Enter your work email and we&apos;ll send you a single-use verification code to reset your password.
            </p>
          </div>

          {error && (
            <Alert
              type="destructive"
              title="Request Failed"
              message={error}
            />
          )}

          {success && (
            <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/10 p-4 text-xs text-foreground animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{success}</p>
              </div>
              <Link
                href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
                className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                Enter reset code now <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={loading}
              className="w-full"
            >
              Send Reset Code <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <Link
              href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
              className="text-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              Already have a code?
            </Link>

            <Link
              href="/login"
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        </div>

        {/* Bottom Security Note */}
        <div className="flex items-center gap-2 text-xs text-foreground/90 font-medium">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span>Strict Enterprise Tenant Isolation &amp; End-to-End Encryption</span>
        </div>
      </div>

      {/* Right Column: Graphic */}
      <div className="hidden lg:flex flex-1 relative bg-background/80 border-l border-border/50">
        <IntelligentFlowGraphic />
      </div>
    </div>
  );
}
