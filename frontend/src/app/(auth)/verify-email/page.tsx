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
    <Card className="border border-zinc-800 bg-zinc-950/40 rounded-md overflow-hidden transition-all">
      <CardHeader className="space-y-1 pb-3 border-b border-zinc-800/80">
        <CardTitle className="text-xl font-semibold tracking-tight text-white">
          Verify Email
        </CardTitle>
        <CardDescription className="text-xs text-zinc-400">
          Enter the 6-digit code sent to your email address.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {error && (
          <Alert
            type="destructive"
            title="Verification Error"
            message={error}
          />
        )}

        {success && (
          <div className="flex items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900/30 p-3.5 text-xs text-zinc-300 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-[#46C7D6] shrink-0" />
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
            <label className="text-xs font-medium text-zinc-300 block">
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
                className="w-full tracking-[0.5em] font-mono text-center text-xl font-bold rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-zinc-600 transition-all"
              />
            </div>
            <p className="text-[11px] text-zinc-500 text-center font-mono">
              Code expires in 15 minutes.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full mt-2 inline-flex items-center justify-center font-medium text-sm rounded-md h-9 px-4 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse mr-2" aria-hidden="true" />
            ) : null}
            Verify Account
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !!success}
          className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline transition-colors disabled:opacity-50"
        >
          <RotateCw className={`h-3 w-3 ${resending ? "animate-spin text-foreground" : ""}`} />
          Resend code
        </button>

        <Link
          href="/login"
          className="font-semibold text-foreground hover:underline underline-offset-4 transition-colors"
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
