"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
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
  const [confirmEmergencyStop, setConfirmEmergencyStop] = useState(false);
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
      const updated = await api.updateAdminControlSettings({
        management_mode: settings.management_mode,
        emergency_stop: settings.emergency_stop,
        automatic_failover: settings.automatic_failover,
        auto_disable_unhealthy: settings.auto_disable_unhealthy,
        auto_recover_credentials: settings.auto_recover_credentials,
        rate_limit_cooldown_seconds: settings.rate_limit_cooldown_seconds,
        circuit_breaker_failure_threshold: settings.circuit_breaker_failure_threshold,
        circuit_breaker_cooldown_seconds: settings.circuit_breaker_cooldown_seconds,
      });
      setSettings(updated);
      toast({ message: "Operations policy saved and recorded in the security audit log.", type: "success" });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "Could not save operations settings.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyStopToggle = () => {
    if (!settings.emergency_stop) {
      // Prompt confirmation before enabling emergency stop
      setConfirmEmergencyStop(true);
    } else {
      // Disabling emergency stop directly
      setSettings((current) => ({ ...current, emergency_stop: false }));
    }
  };

  const confirmEnableStop = () => {
    setSettings((current) => ({ ...current, emergency_stop: true }));
    setConfirmEmergencyStop(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-xs text-muted-foreground" aria-live="polite">
        <span className="inline-block h-3.5 w-1.5 bg-accent animate-pulse mr-2" aria-hidden="true" /> Loading operations policy...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 pb-5 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Operations & Recovery Policy
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border/70 text-muted-foreground uppercase font-semibold">
              Super Admin
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Routing, circuit breakers and emergency overrides.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSettings}
            disabled={loading || saving}
            className="h-8 text-xs font-medium border-border/80 hover:bg-accent"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <form onSubmit={saveSettings} className="space-y-6">
        {/* Management Mode Selection */}
        <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70">
            <h2 className="text-xs font-semibold text-foreground">Management Mode</h2>
          </div>
          <div className="p-4 grid gap-3 sm:grid-cols-2">
            {([
              ["manual", "Manual", "You review and switch credential states yourself."],
              ["automatic", "Automatic", "The system enforces failover, cooldowns and recovery."],
            ] as const).map(([mode, label, description]) => (
              <label
                key={mode}
                className={`cursor-pointer rounded-md border p-3.5 transition-colors ${
                  settings.management_mode === mode
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border/70 bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="management_mode"
                    value={mode}
                    checked={settings.management_mode === mode}
                    onChange={() => setSettings((current) => ({ ...current, management_mode: mode }))}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span className="font-semibold text-xs text-foreground">{label}</span>
                </div>
                <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground leading-relaxed">{description}</p>
              </label>
            ))}
          </div>
        </div>

        {/* Automatic Recovery Policy Rules */}
        <div className="rounded-md border border-border/70 bg-card shadow-xs overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b border-border/70">
            <h2 className="text-xs font-semibold text-foreground">Failover & Recovery Parameters</h2>
            <p className="text-[11px] text-muted-foreground">Thresholds applied when Automatic Mode is active.</p>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["automatic_failover", "Fail over eligible requests automatically"],
                ["auto_disable_unhealthy", "Quarantine unhealthy credentials"],
                ["auto_recover_credentials", "Auto-recover credentials after cooldown"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
                    className="h-3.5 w-3.5 accent-primary rounded border-border"
                  />
                  <span className="text-[11px] font-medium">{label}</span>
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-border/60">
              <label className="space-y-1.5 text-xs text-foreground">
                <span className="text-[11px] text-muted-foreground block font-mono">Rate-limit cooldown (seconds)</span>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  required
                  value={settings.rate_limit_cooldown_seconds}
                  onChange={(event) => setSettings((current) => ({ ...current, rate_limit_cooldown_seconds: Number(event.target.value) }))}
                  className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 text-xs text-foreground">
                <span className="text-[11px] text-muted-foreground block font-mono">Circuit break failure count</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={settings.circuit_breaker_failure_threshold}
                  onChange={(event) => setSettings((current) => ({ ...current, circuit_breaker_failure_threshold: Number(event.target.value) }))}
                  className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
              <label className="space-y-1.5 text-xs text-foreground">
                <span className="text-[11px] text-muted-foreground block font-mono">Circuit breaker cooldown (seconds)</span>
                <input
                  type="number"
                  min={30}
                  max={86400}
                  required
                  value={settings.circuit_breaker_cooldown_seconds}
                  onChange={(event) => setSettings((current) => ({ ...current, circuit_breaker_cooldown_seconds: Number(event.target.value) }))}
                  className="w-full rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Emergency Stop Banner */}
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            <div>
              <h2 className="text-xs font-semibold text-foreground">Emergency Stop Override</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {settings.emergency_stop
                  ? "Active — every provider credential is blocked."
                  : "Off — routing follows the policies above."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEmergencyStopToggle}
            className={`h-8 px-3 text-xs font-medium shrink-0 ${
              settings.emergency_stop
                ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "border-destructive/40 text-destructive hover:bg-destructive/10"
            }`}
          >
            {settings.emergency_stop ? "Disable Emergency Stop" : "Trigger Emergency Stop"}
          </Button>
        </div>

        {/* Submit & Status Bar */}
        <div className="bg-muted/30 px-4 py-3 rounded-md border border-border/70 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-mono text-muted-foreground">
            {settings.updated_at ? `Last policy update: ${new Date(settings.updated_at).toLocaleString()}` : "No policy timestamp"}
          </span>

          <Button
            type="submit"
            size="sm"
            disabled={saving || Boolean(loadError)}
            className="h-8 text-xs font-medium"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save Operating Policy
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Confirmation Dialog for Emergency Stop */}
      <AlertDialog
        isOpen={confirmEmergencyStop}
        onClose={() => setConfirmEmergencyStop(false)}
        onConfirm={confirmEnableStop}
        title="Activate Emergency Stop?"
        description="Enabling emergency stop will instruct the provider routing engine to immediately refuse all new provider credential requests across the entire platform. Are you sure you wish to proceed?"
        confirmText="Enable Emergency Stop"
        variant="destructive"
      />
    </div>
  );
}
