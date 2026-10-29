"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Shield, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login({ email, password });
      const user = await api.getMe();
      login(res.access_token, user);

      // Redirect to user's first workspace or default route
      const workspaces = await api.getWorkspaces();
      if (workspaces.length > 0) {
        router.push(`/workspaces/${workspaces[0].id}`);
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please verify your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 transition-colors">
      {/* Top right theme switcher */}
      <div className="absolute right-6 top-6">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-glow transition-all">
        {/* Brand Header */}
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xl shadow-md">
            W
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sign in to Weirwise
          </h1>
          <p className="text-xs text-muted-foreground">
            Production AI assistant platform grounded in your business data
          </p>
        </div>

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

          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full"
          >
            Continue to Workspace <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        {/* Demo Credentials Helper Pill */}
        <div className="rounded-lg border border-border/80 bg-secondary/50 p-3.5 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Verified Local Demo: </span>
          <span className="font-mono text-xs">admin@weirwise.local</span> /{" "}
          <span className="font-mono text-xs">SecretPassword123!</span>
        </div>

        {/* Sign up Link */}
        <div className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account yet?{" "}
          <Link
            href="/register"
            className="font-semibold text-primary hover:underline underline-offset-4 focus:outline-none focus:ring-1 focus:ring-primary rounded"
          >
            Create an account
          </Link>
        </div>
      </div>

      {/* Footer reassurance */}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <span>Enterprise Data Isolation & Strict Multi-Tenancy</span>
      </div>
    </div>
  );
}
