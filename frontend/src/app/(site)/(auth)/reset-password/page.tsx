"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
      setSuccess(res.message || "Password updated.");
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
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Set new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the code from your email and choose a new password.
        </p>
      </div>

      {error && <Alert type="destructive" title="Reset failed" message={error} />}

      {success && (
        <Alert
          type="success"
          message={`${success} Redirecting to sign in…`}
        />
      )}

      <form onSubmit={handleReset} className="space-y-4">
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
          label="Reset code"
          type="text"
          required
          autoComplete="one-time-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456"
          className="text-center font-mono text-base tracking-[0.25em]"
        />

        <Input
          label="New password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimum 8 characters"
        />

        <Input
          label="Confirm new password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your password"
        />

        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          isLoading={loading}
          disabled={!!success}
        >
          Update password
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <Link href="/forgot-password" className="hover:text-foreground hover:underline">
          Request new code
        </Link>
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
