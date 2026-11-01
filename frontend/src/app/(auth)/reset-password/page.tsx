"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, Shield, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { IntelligentFlowGraphic } from "@/components/auth/intelligent-flow-graphic";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const initialToken = searchParams.get("token") || "";

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters in length.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword({
        email: email.trim() || undefined,
        token: token.trim(),
        new_password: newPassword,
      });
      setSuccess(res.message || "Password successfully reset!");
      toast({ message: "Password updated successfully. Please sign in.", type: "success" });
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(email.trim())}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Invalid or expired reset code. Please request a new one.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          <LockKeyhole className="h-3 w-3" /> Step 2: Choose New Password
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Set new password
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Enter the reset code sent to your email and select your new strong password.
        </p>
      </div>

      {error && (
        <Alert
          type="destructive"
          title="Reset Error"
          message={error}
        />
      )}

      {success && (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-foreground animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">{success} Redirecting to sign in...</span>
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
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
            Reset Code / Token
          </label>
          <input
            type="text"
            required
            autoComplete="one-time-code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter reset code"
            className="w-full tracking-[0.2em] font-mono text-center text-sm font-bold rounded-lg border border-border bg-input px-3 py-2 text-foreground placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-sans focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
          />
        </div>

        <Input
          label="New Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimum 8 characters"
        />

        <Input
          label="Confirm New Password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm minimum 8 characters"
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={loading}
          disabled={loading || !!success}
          className="w-full"
        >
          Update Password <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <Link
          href="/forgot-password"
          className="text-foreground hover:text-primary transition-colors underline underline-offset-2"
        >
          Request new code
        </Link>

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

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column */}
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
        <Suspense fallback={<div className="my-auto py-8 text-center text-xs text-muted-foreground">Loading password reset...</div>}>
          <ResetPasswordForm />
        </Suspense>

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
