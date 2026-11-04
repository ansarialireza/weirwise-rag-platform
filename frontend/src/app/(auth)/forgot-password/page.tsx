"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
      setSuccess(res.message || "We sent a reset code to your email.");
      toast({ message: "Reset code sent. Check your inbox.", type: "info" });
    } catch (err: any) {
      setError(err.message || "We couldn't send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Reset password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your email and we&apos;ll send a 6-digit reset code.
        </p>
      </div>

      {error && <Alert type="destructive" title="We couldn't send that" message={error} />}

      {success && (
        <div className="space-y-3 rounded-xl border border-success/25 bg-success/10 p-4 text-[13px]">
          <p className="font-medium text-foreground">{success}</p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
          >
            Enter reset code
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
        />

        <Button type="submit" size="lg" className="mt-2 w-full" isLoading={loading}>
          Send code
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
