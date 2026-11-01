"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Workspace, Membership } from "@/types";
import {
  Shield,
  Key,
  Users,
  Copy,
  Check,
  Plus,
  CreditCard,
  Zap,
  CheckCircle2,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"general" | "usage" | "api_keys" | "members">("general");

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingWs, setSavingWs] = useState(false);
  const [wsNotice, setWsNotice] = useState<string | null>(null);

  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  // Billing & Usage State
  const [billing, setBilling] = useState<any | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  // Invitation State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // API Credential State
  const [credName, setCredName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      Promise.all([
        api.getWorkspace(workspaceId),
        api.getMembers(workspaceId),
        api.getBillingStatus(workspaceId).catch(() => null),
        api.getPlans().catch(() => []),
      ])
        .then(([ws, mList, bData, pList]) => {
          setWorkspace(ws);
          setWorkspaceName(ws.name);
          setMembers(mList);
          if (bData) setBilling(bData);
          if (pList) {
            // Defensive: deduplicate plans and take max 3 standard pricing tiers (Free, Pro, Enterprise)
            const seenTiers = new Set<string>();
            const uniquePlans = pList.filter((p: any) => {
              const baseTier = (p.tier || p.name || "").toLowerCase().split(" ")[0];
              if (seenTiers.has(baseTier)) return false;
              seenTiers.add(baseTier);
              return true;
            }).slice(0, 3);
            setPlans(uniquePlans);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [workspaceId]);

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    setSavingWs(true);
    setWsNotice(null);
    try {
      const updated = await api.updateWorkspace(workspaceId, { name: workspaceName.trim() });
      setWorkspace(updated);
      setWsNotice("Workspace name updated successfully.");
      setTimeout(() => setWsNotice(null), 3000);
    } catch (err: any) {
      setWsNotice(err.message || "Failed to update workspace.");
    } finally {
      setSavingWs(false);
    }
  };

  const handlePlanChange = async (tier: string) => {
    setChangingPlan(tier);
    setBillingNotice(null);
    try {
      const res = await api.changePlan(workspaceId, tier);
      setBillingNotice(res.message || `Switched to ${tier} tier.`);
      const updatedBilling = await api.getBillingStatus(workspaceId);
      setBilling(updatedBilling);
      if (workspace) {
        setWorkspace({ ...workspace, plan_tier: tier });
      }
    } catch (err: any) {
      setBillingNotice(err.message || "Failed to update subscription.");
    } finally {
      setChangingPlan(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const memb = await api.inviteMember(workspaceId, {
        email: inviteEmail,
        role: inviteRole,
      });
      setMembers([...members, memb]);
      setInviteEmail("");
      toast({ type: "success", message: `Invitation sent to ${inviteEmail}` });
    } catch (err: any) {
      toast({ type: "error", message: err.message || "Failed to invite member" });
    } finally {
      setInviting(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credName.trim()) return;
    setCreatingKey(true);
    try {
      const cred = await api.createApiCredential(workspaceId, credName.trim());
      if (cred.raw_api_key) {
        setCreatedKey(cred.raw_api_key);
        setCredName("");
      }
    } catch (err: any) {
      toast({ type: "error", message: err.message || "Failed to create API key" });
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-150 w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Workspace Settings
            </h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
              {workspace?.name || "Workspace"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage organization identity, resource quotas, API credentials, and member access.
          </p>
        </div>
      </div>

      {/* Settings Navigation Tabs with clean solid underline */}
      <div className="w-full overflow-x-auto no-scrollbar border-b border-border/40">
        <div className="flex space-x-6 sm:space-x-8 text-xs sm:text-sm font-medium pb-px min-w-max">
          <button
            onClick={() => setActiveTab("general")}
            className={`pb-3 transition-colors whitespace-nowrap shrink-0 relative ${
              activeTab === "general"
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            General &amp; Identity
            {activeTab === "general" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("usage")}
            className={`pb-3 transition-colors whitespace-nowrap shrink-0 relative ${
              activeTab === "usage"
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Usage &amp; Subscription
            {activeTab === "usage" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("api_keys")}
            className={`pb-3 transition-colors whitespace-nowrap shrink-0 relative ${
              activeTab === "api_keys"
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Developer API Keys
            {activeTab === "api_keys" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`pb-3 transition-colors whitespace-nowrap shrink-0 relative ${
              activeTab === "members"
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team Members ({members.length})
            {activeTab === "members" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: General */}
      {activeTab === "general" && (
        <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Organization Details</h2>
            <p className="text-xs text-muted-foreground">Change the primary name and identifier of this workspace.</p>
          </div>

          {wsNotice && (
            <div className="rounded-2xl bg-muted p-3 text-xs text-foreground font-medium">
              {wsNotice}
            </div>
          )}

          <form onSubmit={handleUpdateWorkspace} className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Workspace Name</label>
              <input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-xl bg-background/80 border border-border/40 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={savingWs}
              className="rounded-xl h-9 px-4 text-xs font-semibold shadow-xs"
            >
              Save Workspace Name
            </Button>
          </form>
        </div>
      )}

      {/* Tab 2: Usage & Subscription */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          {billingNotice && (
            <div className="rounded-2xl bg-muted p-3.5 text-xs text-foreground font-medium">
              {billingNotice}
            </div>
          )}

          {billing && (
            <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Current Plan &amp; Quotas</h2>
                  <p className="text-xs text-muted-foreground">Resource usage for current billing cycle</p>
                </div>
                <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-muted text-foreground font-semibold">
                  {billing.plan_tier || workspace?.plan_tier || "free"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="rounded-2xl bg-background/80 p-4 space-y-2 border border-border/20">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">Monthly Chat Turns</span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {billing.chat_turns_used} / {billing.chat_turns_limit}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (billing.chat_turns_used / (billing.chat_turns_limit || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-background/80 p-4 space-y-2 border border-border/20">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-foreground">Indexed Document Chunks</span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {billing.documents_indexed} / {billing.documents_limit}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (billing.documents_indexed / (billing.documents_limit || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tier Switcher - Clean, maximum 3 realistic tiers */}
          {plans.length > 0 && (
            <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-6">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Available Subscriptions</h2>
                <p className="text-xs text-muted-foreground">Select a plan matching your scale and team requirements</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const isCurrent = (workspace?.plan_tier || "free") === p.tier;
                  return (
                    <div
                      key={p.tier}
                      className={`flex flex-col justify-between p-5 rounded-2xl transition-all duration-150 ${
                        isCurrent
                          ? "bg-background/90 shadow-xs ring-1 ring-border/60"
                          : "bg-background/50 hover:bg-background/80"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold uppercase text-foreground">{p.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Current
                            </span>
                          )}
                        </div>

                        <div className="text-2xl font-bold tracking-tight text-foreground">
                          ${p.monthly_price_usd ?? p.price_monthly_usd ?? 0}{" "}
                          <span className="text-xs font-normal text-muted-foreground">/mo</span>
                        </div>

                        <ul className="text-xs text-muted-foreground space-y-1.5 pt-2 border-t border-border/30">
                          <li>&middot; Up to {p.max_assistants || p.features?.max_assistants || 3} Assistants</li>
                          <li>&middot; {(p.max_chat_turns_monthly || p.features?.monthly_chat_turns || 500).toLocaleString()} Queries / mo</li>
                          <li>&middot; {(p.max_documents || p.features?.max_documents || 50).toLocaleString()} Documents</li>
                        </ul>
                      </div>

                      <div className="pt-5 mt-2">
                        <Button
                          variant={isCurrent ? "outline" : "primary"}
                          size="sm"
                          className="w-full rounded-xl text-xs font-semibold h-9 shadow-xs"
                          disabled={isCurrent}
                          isLoading={changingPlan === p.tier}
                          onClick={() => handlePlanChange(p.tier)}
                        >
                          {isCurrent ? "Active Plan" : `Switch to ${p.name}`}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: API Keys */}
      {activeTab === "api_keys" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Developer API Keys</h2>
              <p className="text-xs text-muted-foreground">
                Authenticate programmatic requests to Weirwise Platform inference endpoints.
              </p>
            </div>

            {createdKey && (
              <div className="rounded-2xl bg-muted/60 p-4 space-y-2 border border-border/40">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Key Generated - Copy Immediately
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This key will not be displayed again for security purposes.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={createdKey}
                    className="flex-1 rounded-xl bg-background border border-border/40 px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl h-8 px-3 text-xs"
                    onClick={() => handleCopy(createdKey)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateApiKey} className="flex flex-col sm:flex-row gap-3 max-w-md">
              <input
                type="text"
                required
                placeholder="Key label, e.g. Production Backend"
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                className="flex-1 rounded-xl bg-background/80 border border-border/40 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={creatingKey}
                className="rounded-xl h-9 px-4 text-xs font-semibold gap-1.5 shadow-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Create Key
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Members */}
      {activeTab === "members" && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-muted/30 p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Invite Colleague</h2>
              <p className="text-xs text-muted-foreground">Add team members to collaborate on assistants and datasets.</p>
            </div>

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 rounded-xl bg-background/80 border border-border/40 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-xl bg-background/80 border border-border/40 px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={inviting}
                className="rounded-xl h-9 px-4 text-xs font-semibold gap-1.5 shadow-xs shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Invite
              </Button>
            </form>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Current Members ({members.length})</h2>
            <div className="divide-y divide-border/30 rounded-2xl bg-card overflow-hidden">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/30 transition-colors gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground shrink-0">
                      {m.user_name?.charAt(0) || m.user_email?.charAt(0) || "U"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-foreground truncate">
                        {m.user_name || m.user_email || "User"}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {m.user_email || `ID: ${m.user_id}`}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
