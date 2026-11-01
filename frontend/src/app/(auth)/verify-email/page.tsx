"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, CheckCircle2, RotateCw, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

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
    <Card className="border border-border/80 shadow-lg bg-card/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all animate-in fade-in duration-300">
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono text-primary font-semibold">
            <MailCheck className="h-3 w-3" />
            <span>Step 2 &bull; Verification</span>
          </div>
          <span className="text-xs text-muted-foreground font-medium">One-Time Password</span>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Verify your email
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          We dispatched a 6-digit verification code to your email. Enter it below to activate your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {error && (
          <Alert
            type="destructive"
            title="Verification Error"
            message={error}
          />
        )}

        {success && (
          <div className="flex items-center gap-2.5 rounded-lg border border-primary/40 bg-primary/10 p-3.5 text-xs text-foreground animate-in fade-in">
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              6-Digit Security Code
            </label>
            <div className="relative">
              <input
                type="text"
                required
                maxLength={6}
                autoComplete="one-time-code"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••••"
                className="w-full tracking-[0.5em] font-mono text-center text-2xl font-extrabold rounded-xl border-2 border-border bg-input/80 px-4 py-3 text-foreground placeholder:text-muted-foreground/40 placeholder:tracking-normal placeholder:font-sans focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 shadow-inner transition-all"
              />
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Code expires in 15 minutes. Check spam or junk folders if delayed.
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={loading || !!success}
            className="w-full mt-2 font-semibold shadow-md hover:shadow-lg transition-all"
          >
            Verify &amp; Activate Account <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !!success}
          className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RotateCw className={`h-3 w-3 ${resending ? "animate-spin text-primary" : ""}`} />
          Resend code
        </button>

        <Link
          href="/login"
          className="font-semibold text-primary hover:underline underline-offset-4 transition-colors"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground font-mono">Loading verification...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
