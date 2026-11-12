"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import { api } from "@/lib/api";

type DemoProvider = "shopify" | "google_drive";

function isDemoProvider(value: string | null): value is DemoProvider {
  return value === "shopify" || value === "google_drive";
}

function DemoAuthorization() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { dict } = useI18n();
  const providerValue = searchParams.get("provider");
  const provider = isDemoProvider(providerValue) ? providerValue : null;
  const state = searchParams.get("state") || "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishAuthorization = async (approved: boolean) => {
    if (!provider || !state || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.completeDemoIntegrationOAuth(provider, state, approved);
      router.replace(approved ? "/sources?demo=connected" : "/sources?demo=cancelled");
    } catch (requestError) {
      const status =
        typeof requestError === "object" &&
        requestError !== null &&
        "status" in requestError &&
        typeof requestError.status === "number"
          ? requestError.status
          : null;
      setError(
        status === 400
          ? dict.integrations.oauthExpired
          : requestError instanceof Error
            ? requestError.message
            : dict.integrations.connectFailed
      );
      setBusy(false);
    }
  };

  const requestIsValid = Boolean(provider && state.length >= 20);
  const providerName = provider === "shopify" ? "Shopify" : "Google Drive";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lift sm:p-8">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <WeirwiseMark className="h-7 w-auto" />
          <span className="text-sm font-semibold text-foreground">{dict.common.brand}</span>
        </Link>

        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-warning">
            {dict.integrations.demoBadge}
          </span>
          <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {dict.integrations.oauthTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {dict.integrations.oauthIntro}
        </p>

        <div className="mt-5 rounded-xl border border-border/70 bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">
            {provider ? providerName : dict.integrations.demoBadge}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {dict.integrations.oauthDataAccess}
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {!requestIsValid && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {dict.integrations.oauthExpired}
          </p>
        )}

        {authLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">{dict.integrations.oauthWorking}</p>
        ) : !user ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">{dict.integrations.oauthRestart}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {dict.common.signIn}
              </Link>
              <Link
                href="/sources"
                className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {dict.common.knowledge}
              </Link>
            </div>
          </div>
        ) : requestIsValid ? (
          <div className="mt-6 space-y-3">
            <Button
              type="button"
              isLoading={busy}
              disabled={busy}
              onClick={() => void finishAuthorization(true)}
              className="w-full"
            >
              {busy ? dict.integrations.oauthWorking : dict.integrations.oauthAuthorize}
              {!busy && <ArrowRight className="ms-2 h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void finishAuthorization(false)}
              className="w-full"
            >
              {dict.integrations.oauthCancel}
            </Button>
          </div>
        ) : (
          <Link
            href="/sources"
            className="mt-6 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.integrations.oauthRestart}
          </Link>
        )}
      </section>
    </main>
  );
}

export default function DemoAuthorizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DemoAuthorization />
    </Suspense>
  );
}
