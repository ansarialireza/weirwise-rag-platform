"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, CheckCircle2, LockKeyhole, ArrowLeft } from "lucide-react";
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
    <Card className="border border-border/80 shadow-lg bg-card/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all animate-in fade-in duration-300">
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-mono text-primary font-semibold">
            <LockKeyhole className="h-3 w-3" />
            <span>Step 2 &bull; New Password</span>
          </div>
          <span className="text-xs text-muted-foreground font-medium">Account Security</span>
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Choose new password
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Enter the verification code sent to your email and select your new strong password.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {error && (
          <Alert
            type="destructive"
            title="Reset Error"
            message={error}
          />
        )}

        {success && (
          <div className="flex items-center gap-2.5 rounded-xl border border-primary/40 bg-primary/10 p-3.5 text-xs text-foreground animate-in fade-in">
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

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground block">
              Reset Code / Token
            </label>
            <input
              type="text"
              required
              autoComplete="one-time-code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="e.g. 123456"
              className="w-full tracking-[0.25em] font-mono text-center text-lg font-bold rounded-xl border-2 border-border bg-input/80 px-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 placeholder:tracking-normal placeholder:font-sans focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 shadow-inner transition-all"
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
            size="lg"
            isLoading={loading}
            disabled={loading || !!success}
            className="w-full mt-2 font-semibold shadow-md hover:shadow-lg transition-all"
          >
            Update Password &amp; Sign In <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <Link
          href="/forgot-password"
          className="text-foreground hover:text-primary transition-colors underline underline-offset-2"
        >
          Request new code
        </Link>

        <Link
          href="/login"
          className="font-semibold text-primary hover:underline underline-offset-4 inline-flex items-center gap-1 transition-colors"
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
