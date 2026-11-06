"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
      setSuccess(res.message || "Email verified.");
      toast({ message: "Account activated. You can sign in now.", type: "success" });
      setTimeout(() => {
        router.push(`/login?email=${encodeURIComponent(email.trim())}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "That code isn't valid anymore. Please ask for a new one.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please enter your email address to resend the code.");
      return;
    }
    setError(null);
    setResending(true);
    try {
      const res = await api.resendVerification({ email: email.trim() });
      toast({ message: res.message || "A new verification code was sent.", type: "info" });
    } catch (err: any) {
      setError(err.message || "We couldn't send a new code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Verify your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the 6-digit code we sent to your inbox.
        </p>
      </div>

      {error && <Alert type="destructive" title="Verification failed" message={error} />}

      {success && <Alert type="success" message={`${success} Redirecting to sign in…`} />}

      <form onSubmit={handleVerify} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />

        <Input
          label="Security code"
          type="text"
          required
          maxLength={6}
          autoComplete="one-time-code"
          inputMode="numeric"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="000000"
          className="text-center font-mono text-lg tracking-[0.4em]"
          hint="The code expires in 15 minutes."
        />

        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          isLoading={loading}
          disabled={!!success}
        >
          Verify account
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !!success}
          className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
          Resend code
        </button>
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
