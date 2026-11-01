"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
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
    <Card className="border border-border/80 shadow-lg bg-card/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all animate-in fade-in duration-300">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Reset password
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Enter your registered work email and we&apos;ll send you a single-use verification code to choose a new password.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {error && (
          <Alert
            type="destructive"
            title="Request Failed"
            message={error}
          />
        )}

        {success && (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/40 p-4 text-xs text-foreground animate-in fade-in">
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
            className="w-full mt-2 inline-flex items-center justify-center font-semibold text-sm rounded-xl h-11 px-6 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-current mr-2" />
            ) : null}
            Send Reset Code <ArrowRight className="h-4 w-4 ml-1.5" />
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <Link
          href={`/reset-password?email=${encodeURIComponent(email.trim())}`}
          className="text-foreground hover:underline transition-colors underline underline-offset-2"
        >
          Already have a code?
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
