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
      // 1. Create account
      await api.register({ full_name: fullName, email, password });

      // 2. Immediate login
      const loginRes = await api.login({ email, password });
      const user = await api.getMe();
      login(loginRes.access_token, user);

      // 3. Ensure primary workspace exists
      let workspaces = await api.getWorkspaces();
      if (workspaces.length === 0) {
        const defaultName = `${fullName.split(" ")[0]}'s Workspace`;
        const newWs = await api.createWorkspace({ name: defaultName });
        workspaces = [newWs];
      }

      router.push(`/workspaces/${workspaces[0].id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column: Register Form */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-r border-border bg-card">
        {/* Top Header: Official Logo & Theme Switcher */}
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <WeirwiseSymbol className="h-8 w-8" />
            <span className="font-bold text-lg tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          </Link>
          <ThemeSwitcher />
        </div>

        {/* Center Form Container */}
        <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Create platform account
            </h1>
            <p className="text-xs text-muted-foreground">
              Deploy secure AI assistants grounded in business data with Jina v4 embeddings.
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
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span>Strict Enterprise Tenant Isolation &amp; End-to-End Encryption</span>
        </div>
      </div>

      {/* Right Column: Intelligent Flow Composition (Theme-aware stage backdrop for RAG visualization) */}
      <div className="hidden lg:flex flex-1 relative bg-background/80 border-l border-border/50">
        <IntelligentFlowGraphic />
      </div>
    </div>
  );
}
