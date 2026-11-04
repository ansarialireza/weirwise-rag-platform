"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {dict.auth.signInTitle}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{dict.auth.signInSubtitle}</p>
      </div>

      {error && (
        <Alert type="destructive" title={dict.auth.authError} message={error} />
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
            <label htmlFor="password" className="block text-[13px] font-medium text-foreground">
              {dict.auth.password}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {dict.auth.forgot}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <Button type="submit" size="lg" className="mt-2 w-full" isLoading={loading}>
          {dict.auth.signInTitle}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.noAccount}{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          {dict.auth.createAccount}
        </Link>
      </p>
    </div>
  );
}
