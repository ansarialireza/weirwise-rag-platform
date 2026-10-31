"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Sparkles,
  Bot,
  Mic,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Key,
  Volume2,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function AdminCopilotPage() {
  const [config, setConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form State
  const [isEnabled, setIsEnabled] = useState(true);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.2);
  const [topK, setTopK] = useState(4);
  const [scoreThreshold, setScoreThreshold] = useState(0.3);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [sttModel, setSttModel] = useState("nova-3");
  const [ttsModel, setTtsModel] = useState("aura-2-andromeda-en");
  const [deepgramApiKey, setDeepgramApiKey] = useState("");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCopilotAdminConfig();
      setConfig(data);
      setIsEnabled(data.is_enabled);
      setProvider(data.provider);
      setModel(data.model);
      setTemperature(data.temperature);
      setTopK(data.top_k);
      setScoreThreshold(data.score_threshold);
      setVoiceEnabled(data.voice_enabled);
      setSttModel(data.deepgram_stt_model);
      setTtsModel(data.deepgram_tts_model);
    } catch (err: any) {
      toast({ message: err.message || "Failed to load Copilot config.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        is_enabled: isEnabled,
        provider,
        model,
        temperature: Number(temperature),
        top_k: Number(topK),
        score_threshold: Number(scoreThreshold),
        voice_enabled: voiceEnabled,
        deepgram_stt_model: sttModel,
        deepgram_tts_model: ttsModel,
      };

      if (deepgramApiKey.trim()) {
        payload.deepgram_api_key = deepgramApiKey.trim();
      }

      const updated = await api.updateCopilotAdminConfig(payload);
      setConfig(updated);
      setDeepgramApiKey("");
      toast({ message: "Weirwise Copilot configuration updated securely.", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to save configuration.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Weirwise Copilot &amp; Voice Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Centrally manage the first-party official product guide, LLM provider routing, model parameters, and Deepgram voice credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isEnabled
                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}
          >
            {isEnabled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {isEnabled ? "Copilot Active" : "Copilot Disabled"}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card 1: Core Copilot Status & Runtime Parameters */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-5">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> Assistant Runtime &amp; Intelligence
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Enable Copilot Globally
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">LLM Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="openrouter">OpenRouter (Unified Multi-Model Pool)</option>
                <option value="openai">OpenAI Global Pool</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Model Identifier</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Temperature ({temperature})</label>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-8"
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Top-K Chunks ({topK})</label>
              <input
                type="number"
                min={1}
                max={10}
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Similarity Threshold ({scoreThreshold})</label>
              <input
                type="number"
                min={0.1}
                max={0.9}
                step={0.05}
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(parseFloat(e.target.value))}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
          </div>
        </div>

        {/* Card 2: Deepgram Voice Settings & Secret Vault */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-5">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" /> Deepgram Voice Integration (STT &amp; TTS)
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              Enable Voice Conversations
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">STT Model (Speech-to-Text)</label>
              <select
                value={sttModel}
                onChange={(e) => setSttModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="nova-3">Deepgram Nova-3 (Multilingual &amp; High Accuracy)</option>
                <option value="nova-2">Deepgram Nova-2 (Fast &amp; Optimized)</option>
                <option value="whisper">Whisper Architecture</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">TTS Voice (Text-to-Speech)</label>
              <select
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="aura-2-andromeda-en">Aura-2 Andromeda (English Female Natural)</option>
                <option value="aura-2-apollo-en">Aura-2 Apollo (English Male Professional)</option>
                <option value="aura-2-arcas-en">Aura-2 Arcas (English Deep Narrative)</option>
                <option value="aura-asteria-en">Aura Asteria (Warm &amp; Conversational)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">
                Deepgram API Key {config?.has_deepgram_key && <span className="text-emerald-500 font-mono">(Configured)</span>}
              </label>
              <input
                type="password"
                placeholder={config?.has_deepgram_key ? "•••••••••••••••• (Leave blank to keep current)" : "Enter Deepgram API Key"}
                value={deepgramApiKey}
                onChange={(e) => setDeepgramApiKey(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/80 bg-secondary/30 text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Credentials are encrypted at rest with Fernet and never sent to client browsers.
            </span>
            <span className="font-mono text-[10px]">
              {config?.deepgram_key_prefix ? `Prefix: ${config.deepgram_key_prefix}` : "No key prefix"}
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" size="md" isLoading={saving} className="gap-2">
            <Save className="h-4 w-4" /> Save Copilot Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
