"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

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
      setError("Passwords do not match. Please re-enter identical passwords.");
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
    <Card className="border border-zinc-800 bg-zinc-950/40 rounded-md overflow-hidden transition-all">
      <CardHeader className="space-y-1 pb-3 border-b border-zinc-800/80">
        <CardTitle className="text-xl font-semibold tracking-tight text-white">
          Choose new password
        </CardTitle>
        <CardDescription className="text-xs text-zinc-400">
          Enter the verification code and set your new password.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {error && (
          <Alert
            type="destructive"
            title="Reset Error"
            message={error}
          />
        )}

        {success && (
          <div className="flex items-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-900/30 p-3.5 text-xs text-zinc-300 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 text-[#46C7D6] shrink-0" />
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

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300 block">
              Reset Code / Token
            </label>
            <input
              type="text"
              required
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full tracking-[0.25em] font-mono text-center text-lg font-bold rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-zinc-600 transition-all"
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

          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full mt-2 inline-flex items-center justify-center font-medium text-sm rounded-md h-9 px-4 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse mr-2" aria-hidden="true" />
            ) : null}
            Update Password
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <Link
          href="/forgot-password"
          className="text-foreground hover:underline transition-colors underline underline-offset-2"
        >
          Request new code
        </Link>

        <Link
          href="/login"
          className="font-semibold text-foreground hover:underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground font-mono">Loading password reset...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
