"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ArrowRight, Lock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

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
      const res = await api.login({ email: email.trim(), password });
      const user = await api.getMe();
      login(res.access_token, user);

      const workspaces = await api.getWorkspaces();
      if (workspaces.length > 0) {
        router.push(`/workspaces/${workspaces[0].id}`);
      } else if (user.is_superuser) {
        router.push("/admin");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      if (err.status === 403 && err.message?.toLowerCase().includes("not verified")) {
        setError("Your account is not verified yet. Redirecting to verification...");
        setTimeout(() => {
          router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        }, 1500);
      } else {
        setError(err.message || "Invalid email or password. Please verify your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-border/80 shadow-lg bg-card/95 backdrop-blur-sm rounded-2xl overflow-hidden transition-all animate-in fade-in duration-300">
      <CardHeader className="space-y-1.5 pb-4">
        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground">
          Sign in to manage your grounded AI assistants, documents, and testing playground.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-foreground">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center font-semibold text-sm rounded-xl h-11 px-6 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-current mr-2" />
            ) : null}
            Sign In <ArrowRight className="h-4 w-4 ml-1.5" />
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-5 border-t border-border/50 text-xs text-muted-foreground">
        <span>Don&apos;t have an account yet?</span>
        <Link
          href="/register"
          className="font-semibold text-foreground hover:underline underline-offset-4 transition-colors"
        >
          Create account
        </Link>
      </CardFooter>
    </Card>
  );
}
