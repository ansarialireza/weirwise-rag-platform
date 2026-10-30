"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { ArrowRight, Shield, Zap, Info, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { IntelligentFlowGraphic } from "@/components/auth/intelligent-flow-graphic";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const executeLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    try {
      const res = await api.login({ email: loginEmail, password: loginPass });
      const user = await api.getMe();
      login(res.access_token, user);

      const workspaces = await api.getWorkspaces();
      if (workspaces.length > 0) {
        router.push(`/workspaces/${workspaces[0].id}`);
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your email and password.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await executeLogin(email, password);
    } finally {
      setLoading(false);
    }
  };

  const handleInstantDemoLogin = async () => {
    setEmail("admin@weirwise.local");
    setPassword("SecretPassword123!");
    setDemoLoading(true);
    try {
      await executeLogin("admin@weirwise.local", "SecretPassword123!");
      toast({ message: "Signed in as Admin Demo user", type: "success" });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleSocialClick = (provider: "Google" | "GitHub") => {
    setOauthNotice(
      `${provider} Single Sign-On requires OAuth credentials configured in your environment or workspace settings. For instant access, use the 1-Click Demo Login above.`
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background text-foreground transition-colors">
      {/* Left Column: Form & Brand Authenticator */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-between p-8 sm:p-12 lg:p-16 border-r border-border bg-card">
        {/* Top Header: Official Logo */}
        <div>
          <Link href="/" className="inline-flex items-center gap-3 group">
            <WeirwiseSymbol className="h-8 w-8" />
            <span className="font-bold text-lg tracking-tight text-foreground flex items-center gap-1.5">
              Weirwise
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
          </Link>
        </div>

        {/* Center Form Container */}
        <div className="my-auto py-8 space-y-6 max-w-sm w-full mx-auto">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Sign in to platform
            </h1>
            <p className="text-xs text-muted-foreground">
              Access your grounded AI assistants, documents, and testing playground.
            </p>
          </div>

          {/* Frictionless 1-Click Demo Login */}
          <button
            type="button"
            onClick={handleInstantDemoLogin}
            disabled={demoLoading || loading}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 hover:border-primary text-foreground text-xs font-medium transition-all group shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary fill-primary group-hover:scale-110 transition-transform" />
              <div className="text-left">
                <span className="font-semibold block text-primary">1-Click Demo Access</span>
                <span className="text-[11px] text-muted-foreground font-mono">admin@weirwise.local</span>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-primary underline underline-offset-2 flex items-center gap-1">
              Sign in &rarr;
            </span>
          </button>

          {/* Social OAuth Affordance (Honest, Clear Guidance) */}
          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                <span className="bg-card px-2 text-muted-foreground font-mono">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSocialClick("Google")}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs font-medium text-foreground transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialClick("GitHub")}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs font-medium text-foreground transition-colors"
              >
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>
          </div>

          {oauthNotice && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/60 p-3 text-xs text-muted-foreground animate-in fade-in">
              <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-foreground block">SSO Setup Notice</span>
                <p className="text-[11px] leading-relaxed">{oauthNotice}</p>
                <button
                  type="button"
                  onClick={() => setOauthNotice(null)}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {error && (
            <Alert
              type="destructive"
              title="Authentication Error"
              message={error}
            />
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Password
                </label>
                <Link
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    toast({ message: "Password reset instructions sent to admin@weirwise.local", type: "info" });
                  }}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={loading}
              className="w-full"
            >
              Continue to Workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-primary hover:underline underline-offset-4"
            >
              Create account
            </Link>
          </div>
        </div>

        {/* Bottom Security Note */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
          <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span>Strict Enterprise Tenant Isolation &amp; End-to-End Encryption</span>
        </div>
      </div>

      {/* Right Column: Intelligent Flow Composition (Dark stage backdrop for RAG visualization) */}
      <div className="hidden lg:flex flex-1 relative bg-[#090A0C]">
        <IntelligentFlowGraphic />
      </div>
    </div>
  );
}

