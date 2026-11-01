"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { IntelligentFlowGraphic } from "@/components/auth/intelligent-flow-graphic";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
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
      await api.register({ full_name: fullName, email, password });

      // 2. Redirect to verify-email step with email query param
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column: Register Form */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-between p-6 sm:p-10 lg:p-14 border-r border-border bg-card">
        {/* Top Header: Official Logo & Theme Switcher */}
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 sm:gap-3 group select-none">
            <WeirwiseSymbol className="h-7 sm:h-8 w-auto" priority />
            <span className="font-bold text-base sm:text-lg tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
            </span>
          </Link>
          <ThemeSwitcher />
        </div>

        {/* Center Form Container */}
        <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
              Includes Free Trial with Dynamic Quotas
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Create platform account
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Build truthful AI assistants grounded in your business knowledge. No credit card required.
            </p>
          </div>

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

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={loading}
              className="w-full"
            >
              Create Account &amp; Launch <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Bottom Security Note */}
        <div className="flex items-center gap-2 text-xs text-foreground/90 font-medium">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span>Strict Enterprise Tenant Isolation &amp; End-to-End Encryption</span>
        </div>
      </div>

      {/* Right Column: Intelligent Flow Composition */}
      <div className="hidden lg:flex flex-1 relative bg-background/80 border-l border-border/50">
        <IntelligentFlowGraphic />
      </div>
    </div>
  );
}
