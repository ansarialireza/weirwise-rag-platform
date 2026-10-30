"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Workspace, Membership, ApiCredential } from "@/types";
import {
  Shield,
  Key,
  Users,
  Copy,
  Check,
  Plus,
  AlertCircle,
  CreditCard,
  Zap,
  CheckCircle2,
  Lock,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";

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
          if (pList) setPlans(pList);
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200 w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Workspace Settings
            </h1>
            <Badge variant="primary" className="text-xs px-2.5 py-0.5">{workspace?.name || "Workspace"}</Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Manage organization identity, resource limits, developer API keys, and team access.
          </p>
        </div>
      </div>

      {/* Settings Navigation Tabs (Touch-Friendly Horizontal Scroll in bounded container) */}
      <div className="w-full overflow-x-auto no-scrollbar border-b border-border">
        <div className="flex space-x-6 sm:space-x-8 text-xs sm:text-sm font-semibold pb-px min-w-max">
          <button
            onClick={() => setActiveTab("general")}
            className={`pb-3.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "general"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            General &amp; Identity
          </button>
          <button
            onClick={() => setActiveTab("usage")}
            className={`pb-3.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "usage"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Usage &amp; Subscription
          </button>
          <button
            onClick={() => setActiveTab("api_keys")}
            className={`pb-3.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "api_keys"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Developer API Keys
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`pb-3.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "members"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Team Members ({members.length})
          </button>
        </div>
      </div>

      {/* Tab 1: General */}
      {activeTab === "general" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-foreground">Organization Details</h2>
            <p className="text-sm text-muted-foreground">Change the name and primary configuration of this workspace.</p>
          </div>

          {wsNotice && (
            <Alert
              type="info"
              title="Notice"
              message={wsNotice}
            />
          )}

          <form onSubmit={handleUpdateWorkspace} className="max-w-md space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workspace Name</label>
              <Input
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="h-10 text-sm font-semibold"
              />
            </div>

            <Button type="submit" variant="primary" size="sm" isLoading={savingWs} className="h-9 px-4 text-xs font-bold">
              Save Workspace Name
            </Button>
          </form>
        </div>
      )}

      {/* Tab 2: Usage & Subscription */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          {billingNotice && (
            <Alert
              type="info"
              title="Subscription Status"
              message={billingNotice}
            />
          )}

          {billing && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Current Plan &amp; Quotas</h2>
                  <p className="text-xs text-muted-foreground">Server-computed resource usage for current billing cycle</p>
                </div>
                <Badge variant="primary" className="uppercase font-mono">
                  {billing.plan_tier || workspace?.plan_tier || "free"}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="rounded-lg border border-border bg-input/40 p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground">Monthly Chat Turns</span>
                    <span className="font-mono text-primary font-bold">
                      {billing.chat_turns_used} / {billing.chat_turns_limit}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (billing.chat_turns_used / (billing.chat_turns_limit || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-input/40 p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-foreground">Indexed Document Chunks</span>
                    <span className="font-mono text-primary font-bold">
                      {billing.documents_indexed} / {billing.documents_limit}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
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

          {/* Tier Switcher */}
          {plans.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-sm">
              <h2 className="text-sm font-bold text-foreground">Available Subscriptions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const isCurrent = (workspace?.plan_tier || "free") === p.tier;
                  return (
                    <div
                      key={p.tier}
                      className={`flex flex-col justify-between p-4 rounded-xl border ${
                        isCurrent ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold uppercase text-foreground">{p.name}</span>
                          {isCurrent && <Badge variant="success">Current</Badge>}
                        </div>
                        <div className="text-xl font-bold text-foreground">
                          ${p.price_monthly_usd} <span className="text-xs font-normal text-muted-foreground">/mo</span>
                        </div>
                        <ul className="text-[11px] text-muted-foreground space-y-1 pt-2 border-t border-border">
                          <li>• Up to {p.features?.max_assistants || 3} Assistants</li>
                          <li>• {p.features?.monthly_chat_turns?.toLocaleString() || 500} Chat Turns</li>
                          <li>• {p.features?.max_documents?.toLocaleString() || 50} Document Index</li>
                        </ul>
                      </div>

                      <div className="pt-4">
                        <Button
                          variant={isCurrent ? "outline" : "primary"}
                          size="sm"
                          className="w-full"
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
          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-foreground">Developer API Keys</h2>
              <p className="text-xs text-muted-foreground">
                Authenticate programmatic requests to Weirwise Platform inference endpoints.
              </p>
            </div>

            {createdKey && (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Key Generated - Copy Immediately
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This key will not be displayed again for security purposes.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdKey}
                    className="flex-1 rounded-md border border-border bg-input px-3 py-1.5 text-xs font-mono text-foreground"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(createdKey)}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateApiKey} className="flex gap-3 max-w-md">
              <Input
                type="text"
                required
                placeholder="Key label, e.g. Production Backend"
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
              />
              <Button type="submit" variant="primary" size="md" isLoading={creatingKey}>
                <Plus className="h-4 w-4" /> Create Key
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Members */}
      {activeTab === "members" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-foreground">Invite Colleague</h2>
              <p className="text-xs text-muted-foreground">Add team members to collaborate on assistants and datasets.</p>
            </div>

            <form onSubmit={handleInvite} className="flex gap-3 max-w-lg">
              <Input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="submit" variant="primary" size="md" isLoading={inviting}>
                <Plus className="h-4 w-4" /> Invite
              </Button>
            </form>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">Current Members</h2>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3.5 bg-card hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary border border-border text-xs font-bold text-foreground">
                      {m.user_name?.charAt(0) || m.user_email?.charAt(0) || "U"}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        {m.user_name || m.user_email || "User"}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {m.user_email || `User ID: ${m.user_id}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="uppercase font-mono">
                    {m.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
