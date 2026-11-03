"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AdminControlSettings, api } from "@/lib/api";

const initialSettings: AdminControlSettings = {
  id: 1,
  management_mode: "manual",
  emergency_stop: false,
  automatic_failover: true,
  auto_disable_unhealthy: true,
  auto_recover_credentials: true,
  rate_limit_cooldown_seconds: 60,
  circuit_breaker_failure_threshold: 3,
  circuit_breaker_cooldown_seconds: 300,
  updated_by: null,
  updated_at: "",
};

export default function AdminOperationsPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setSettings(await api.getAdminControlSettings());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load persisted operations settings.";
      setLoadError(message);
      toast({ message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      setSettings(await api.updateAdminControlSettings({
        management_mode: settings.management_mode,
        emergency_stop: settings.emergency_stop,
        automatic_failover: settings.automatic_failover,
        auto_disable_unhealthy: settings.auto_disable_unhealthy,
        auto_recover_credentials: settings.auto_recover_credentials,
        rate_limit_cooldown_seconds: settings.rate_limit_cooldown_seconds,
        circuit_breaker_failure_threshold: settings.circuit_breaker_failure_threshold,
        circuit_breaker_cooldown_seconds: settings.circuit_breaker_cooldown_seconds,
      }));
      toast({ message: "Operations policy saved and recorded in the admin audit log.", type: "success" });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "Could not save operations settings.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleEmergencyStop = () => {
    const next = !settings.emergency_stop;
    if (next && !window.confirm("Emergency stop will stop new AI credential selection. Continue?")) return;
    setSettings((current) => ({ ...current, emergency_stop: next }));
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading persisted operations policy…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="space-y-2 border-b border-border pb-6">
        <div className="flex items-center gap-2 text-brand-secondary">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">System operations</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Operating mode &amp; recovery policy</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Settings are persisted by the backend. Emergency stop blocks new provider credential selection. Changes are
          restricted to super administrators and written to the audit trail.
        </p>
        <p className="max-w-3xl rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          The current assistant chat endpoint uses retrieval/fallback responses and does not invoke the provider routing
          engine; these controls apply when that engine is called, not to current chat generation.
        </p>
      </header>

      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{loadError}</span>
        </div>
      )}

      <form onSubmit={saveSettings} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold">Management mode</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["manual", "Manual", "Monitoring only. Operators decide when credentials or policies change."],
              ["automatic", "Automatic", "Apply the explicitly enabled failover, cooldown, and recovery policies below."],
            ] as const).map(([mode, label, description]) => (
              <label
                key={mode}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  settings.management_mode === mode
                    ? "border-brand-secondary bg-brand-secondary/10"
                    : "border-border bg-card hover:border-muted-foreground/50"
                }`}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="management_mode"
                    value={mode}
                    checked={settings.management_mode === mode}
                    onChange={() => setSettings((current) => ({ ...current, management_mode: mode }))}
                    className="accent-brand-secondary"
                  />
                  {label}
                </span>
                <span className="mt-2 block pl-6 text-sm text-muted-foreground">{description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="policy-heading">
          <h2 id="policy-heading" className="text-sm font-semibold">Automatic-mode policies</h2>
          <p className="text-xs text-muted-foreground">
            These options are persisted but only applied when Automatic mode is active.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["automatic_failover", "Fail over eligible requests"],
              ["auto_disable_unhealthy", "Temporarily quarantine unhealthy credentials"],
              ["auto_recover_credentials", "Recover credentials after cooldown"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4 accent-brand-secondary"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              Rate-limit cooldown (seconds)
              <input
                type="number"
                min={10}
                max={3600}
                required
                value={settings.rate_limit_cooldown_seconds}
                onChange={(event) => setSettings((current) => ({ ...current, rate_limit_cooldown_seconds: Number(event.target.value) }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Failures before circuit break
              <input
                type="number"
                min={1}
                max={20}
                required
                value={settings.circuit_breaker_failure_threshold}
                onChange={(event) => setSettings((current) => ({ ...current, circuit_breaker_failure_threshold: Number(event.target.value) }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Circuit-breaker cooldown (seconds)
              <input
                type="number"
                min={30}
                max={86400}
                required
                value={settings.circuit_breaker_cooldown_seconds}
                onChange={(event) => setSettings((current) => ({ ...current, circuit_breaker_cooldown_seconds: Number(event.target.value) }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h2 className="text-sm font-semibold">Emergency stop</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {settings.emergency_stop
                  ? "Enabled — routing will refuse new provider credentials."
                  : "Disabled — the configured management mode remains in effect."}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.emergency_stop}
            onClick={toggleEmergencyStop}
            className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium ${
              settings.emergency_stop
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-border bg-card text-foreground"
            }`}
          >
            {settings.emergency_stop ? "Stop enabled" : "Enable stop"}
          </button>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {settings.updated_at ? `Last saved ${new Date(settings.updated_at).toLocaleString()}` : "Not saved yet"}
          </p>
          <Button type="submit" disabled={saving || Boolean(loadError)} isLoading={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save operating policy
          </Button>
        </div>
      </form>

      {settings.management_mode === "manual" && !settings.emergency_stop && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-brand-secondary" />
          Manual mode is active; automated recovery policies are not applied.
        </p>
      )}
    </div>
  );
}
