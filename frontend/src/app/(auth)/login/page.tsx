"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { dict } = useI18n();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login({ email: email.trim(), password });
      const user = await api.getMe();
      login(res.access_token, user);

      if (user.is_superuser) {
        router.push("/admin");
        return;
      }

      try {
        const adminAccess = await api.getAdminAccess();
        if (adminAccess.is_admin) {
          router.push("/admin");
          return;
        }
      } catch (accessError) {
        if (!(accessError instanceof ApiError) || accessError.status !== 403) {
          throw accessError;
        }
      }

      router.push("/overview");
    } catch (err: any) {
      if (err.status === 403 && err.message?.toLowerCase().includes("not verified")) {
        setError(dict.auth.accountNotVerified);
        setTimeout(() => {
          router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        }, 1500);
      } else {
        setError(err.message || dict.auth.invalidEmailPassword);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-zinc-800 bg-zinc-950/20 rounded-md overflow-hidden transition-all text-start">
      <CardHeader className="pb-3 border-b border-zinc-800/80">
        <CardTitle className="text-xl font-semibold tracking-tight text-white">
          {dict.auth.signInTitle}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {error && (
          <Alert
            type="destructive"
            title={dict.auth.authError}
            message={error}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={dict.auth.workEmail}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-300">
                {dict.auth.password}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                {dict.auth.forgot}
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
            className="w-full mt-2 inline-flex items-center justify-center font-medium text-sm rounded-md h-9 px-4 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse me-2" aria-hidden="true" />
            ) : null}
            {dict.auth.signInTitle}
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-4 border-t border-zinc-800/80 text-xs text-zinc-500 font-mono">
        <span>{dict.auth.noAccount}</span>
        <Link
          href="/register"
          className="text-white hover:underline transition-colors font-medium"
        >
          {dict.auth.createAccount}
        </Link>
      </CardFooter>
    </Card>
  );
}
