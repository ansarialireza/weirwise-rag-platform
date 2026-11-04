"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-7">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {dict.auth.registerTitle}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{dict.auth.registerSubtitle}</p>
      </div>

      {error && (
        <Alert type="destructive" title={dict.auth.authError} message={error} />
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
          hint="At least 8 characters."
        />

        <Button type="submit" size="lg" className="mt-2 w-full" isLoading={loading}>
          {dict.auth.registerTitle}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {dict.auth.signInTitle}
        </Link>
      </p>
    </div>
  );
}
