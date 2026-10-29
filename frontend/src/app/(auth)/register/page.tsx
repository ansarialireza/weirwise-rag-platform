"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
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

      // 2. Immediate auto-login
      const loginRes = await api.login({ email, password });
      const user = await api.getMe();
      login(loginRes.access_token, user);

      // 3. Ensure a primary workspace exists for instant onboarding
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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 transition-colors">
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
            Create your account
          </h1>
          <p className="text-xs text-muted-foreground">
            Deploy secure AI assistants grounded in business data
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
            hint="Use 8 or more characters with a mix of letters, numbers & symbols."
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full"
          >
            Create Account & Launch <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        {/* Sign in Link */}
        <div className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline underline-offset-4 focus:outline-none focus:ring-1 focus:ring-primary rounded"
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <span>Enterprise Data Isolation & Strict Multi-Tenancy</span>
      </div>
    </div>
  );
}
