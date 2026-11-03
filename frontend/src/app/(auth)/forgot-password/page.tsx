"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

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
    <Card className="border border-zinc-800 bg-zinc-950/20 rounded-md overflow-hidden transition-all">
      <CardHeader className="pb-3 border-b border-zinc-800/80">
        <CardTitle className="text-xl font-semibold tracking-tight text-white">
          Reset password
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {error && (
          <Alert
            type="destructive"
            title="Request Failed"
            message={error}
          />
        )}

        {success && (
          <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-300 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-foreground shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{success}</p>
            </div>
            <Link
              href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
              className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline pt-1"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center font-medium text-sm rounded-md h-9 px-4 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse mr-2" aria-hidden="true" />
            ) : null}
            Send Code
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-4 border-t border-zinc-800/80 text-xs text-zinc-500 font-mono">
        <Link
          href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          Have code?
        </Link>

        <Link
          href="/login"
          className="text-white hover:underline inline-flex items-center gap-1 transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
