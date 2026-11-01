"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters in length.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create account & dispatch OTP
      await api.register({ full_name: fullName.trim(), email: email.trim(), password });

      // 2. Redirect to verify-email step with email query param
      router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-border/80 shadow-lg bg-card/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all animate-in fade-in duration-300">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Create platform account
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Build truthful AI assistants grounded in your business knowledge. No credit card required.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {error && (
          <Alert
            type="destructive"
            title="Registration Error"
            message={error}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />

          <Input
            label="Work Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />

          <Input
            label="Password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            hint="8+ characters with a mix of letters, numbers, and symbols."
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center font-semibold text-sm rounded-xl h-11 px-6 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-current mr-2" />
            ) : null}
            Create Account &amp; Continue <ArrowRight className="h-4 w-4 ml-1.5" />
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <span>Already have an account?</span>
        <Link
          href="/login"
          className="font-semibold text-foreground hover:underline underline-offset-4 transition-colors"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
