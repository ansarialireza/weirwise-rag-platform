"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { dict } = useI18n();
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
      await api.register({ full_name: fullName.trim(), email: email.trim(), password });
      router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (err: any) {
      setError(err.message || "Failed to create account. Please check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-zinc-800 bg-zinc-950/20 rounded-md overflow-hidden transition-all text-start">
      <CardHeader className="pb-3 border-b border-zinc-800/80">
        <CardTitle className="text-xl font-semibold tracking-tight text-white">
          {dict.auth.registerTitle}
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
            label={dict.auth.fullName}
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />

          <Input
            label={dict.auth.workEmail}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />

          <Input
            label={dict.auth.password}
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center font-medium text-sm rounded-md h-9 px-4 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="inline-block h-3.5 w-1.5 bg-[#46C7D6] animate-pulse me-2" aria-hidden="true" />
            ) : null}
            {dict.auth.registerTitle}
          </button>
        </form>
      </CardContent>

      <CardFooter className="flex items-center justify-between pt-3 pb-4 border-t border-zinc-800/80 text-xs text-zinc-500 font-mono">
        <span>{dict.auth.haveAccount}</span>
        <Link
          href="/login"
          className="text-white hover:underline transition-colors font-medium"
        >
          {dict.auth.signInTitle}
        </Link>
      </CardFooter>
    </Card>
  );
}
