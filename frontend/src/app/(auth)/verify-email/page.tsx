"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, Shield, CheckCircle2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { IntelligentFlowGraphic } from "@/components/auth/intelligent-flow-graphic";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.verifyEmail({ email: email.trim(), otp: cleanOtp });
      setSuccess(res.message || "Email verified successfully!");
      toast({ message: "Account activated! You may now sign in.", type: "success" });
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(email.trim())}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please specify an email address to resend the code.");
      return;
    }
    setError(null);
    setResending(true);
    try {
      const res = await api.resendVerification({ email: email.trim() });
      toast({ message: res.message || "A new verification code was dispatched.", type: "info" });
    } catch (err: any) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          Step 2: Security Verification
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Verify your email
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          We sent a 6-digit verification code to your email. Enter it below to activate your account.
        </p>
      </div>

      {error && (
        <Alert
          type="destructive"
          title="Verification Error"
          message={error}
        />
      )}

      {success && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-foreground animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">{success} Redirecting to sign in...</span>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label="Account Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />

        <div>
          <label className="text-xs font-semibold text-foreground block mb-1.5">
            6-Digit Verification Code
          </label>
          <input
            type="text"
            required
            maxLength={6}
            autoComplete="one-time-code"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="123456"
            className="w-full tracking-[0.3em] font-mono text-center text-lg font-bold rounded-lg border border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-sans focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={loading}
          disabled={loading || !!success}
          className="w-full"
        >
          Verify &amp; Activate Account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !!success}
          className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RotateCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} />
          Resend code
        </button>

        <Link
          href="/login"
          className="font-medium text-primary hover:underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column: Verification Form */}
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

        {/* Form Wrapped in Suspense */}
        <Suspense fallback={<div className="my-auto py-8 text-center text-xs text-muted-foreground">Loading verification...</div>}>
          <VerifyEmailForm />
        </Suspense>

        {/* Bottom Security Note */}
        <div className="flex items-center gap-2 text-xs text-foreground/90 font-medium">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span>Strict Enterprise Tenant Isolation &amp; End-to-End Encryption</span>
        </div>
      </div>

      {/* Right Column: Intelligent Flow Composition */}
      <div className="hidden lg:flex flex-1 relative bg-background/80 border-l border-border/50">
        <IntelligentFlowGraphic />
      </div>
    </div>
  );
}
