"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [authMethod, setAuthMethod] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const { login } = useAuth();
  const { dict } = useI18n();
  const router = useRouter();

  // Auto-focus email input on mount
  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  // Focus OTP input once code is sent
  useEffect(() => {
    if (otpSent) {
      otpInputRef.current?.focus();
    }
  }, [otpSent]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await api.login({ email: email.trim(), password });
      const user = await api.getMe();
      login(res.access_token, user);
      router.push(user.is_superuser ? "/admin" : "/overview");
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);

    try {
      await api.sendLoginOtp({ email: email.trim() });
      setOtpSent(true);
      setInfoMessage(dict.auth.codeSent);
    } catch (err: any) {
      setError(err.message || "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const res = await api.loginWithOtp({ email: email.trim(), otp: otp.trim() });
      const user = await api.getMe();
      login(res.access_token, user);
      router.push(user.is_superuser ? "/admin" : "/overview");
    } catch (err: any) {
      setError(err.message || dict.auth.invalidOtp);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {dict.auth.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{dict.auth.signInSubtitle}</p>
      </div>

      {/* Minimal Tab Switcher */}
      <div role="tablist" aria-label="Sign-in methods" className="grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={authMethod === "password"}
          onClick={() => {
            setAuthMethod("password");
            setError(null);
            setInfoMessage(null);
          }}
          className={cn(
            "rounded-md py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            authMethod === "password"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {dict.auth.signInWithPassword}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMethod === "otp"}
          onClick={() => {
            setAuthMethod("otp");
            setError(null);
            setInfoMessage(null);
          }}
          className={cn(
            "rounded-md py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            authMethod === "otp"
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {dict.auth.signInWithOtp}
        </button>
      </div>

      {error && (
        <Alert type="destructive" title={dict.auth.authError} message={error} />
      )}

      {infoMessage && (
        <Alert type="info" message={infoMessage} />
      )}

      {authMethod === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            ref={emailInputRef}
            label={dict.auth.workEmail}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
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
              placeholder="Password"
            />
          </div>

          <Button type="submit" size="lg" className="mt-2 w-full" isLoading={loading}>
            {dict.auth.signInTitle}
          </Button>
        </form>
      ) : (
        <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-4">
          <Input
            ref={emailInputRef}
            label={dict.auth.workEmail}
            type="email"
            required
            autoComplete="email"
            disabled={otpSent}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          {otpSent && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="otp" className="block text-[13px] font-medium text-foreground">
                  {dict.auth.enterOtp}
                </label>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {dict.auth.resend}
                </button>
              </div>
              <Input
                ref={otpInputRef}
                id="otp"
                type="text"
                required
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                className="text-center font-mono tracking-[0.5em] text-xl font-bold"
              />
            </div>
          )}

          <Button type="submit" size="lg" className="mt-2 w-full" isLoading={loading}>
            {otpSent ? dict.auth.signInTitle : dict.auth.sendCode}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {dict.auth.noAccount}{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          {dict.auth.createAccount}
        </Link>
      </p>
    </div>
  );
}
