"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Workspace, Membership, ApiCredential } from "@/types";
import { Shield, Key, Users, Copy, Check, Plus, AlertCircle, CreditCard, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  // Billing State
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
          setMembers(mList);
          if (bData) setBilling(bData);
          if (pList) setPlans(pList);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [workspaceId]);

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
      alert(err.message || "Failed to invite member");
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
      }
      setCredName("");
    } catch (err: any) {
      alert(err.message || "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const copyToClipboard = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading || !workspace) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Workspace Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage organizational members, roles, and programmatic API access
        </p>
      </div>

      {/* General Settings */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Organization Details
        </h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Workspace Name:</span>
            <div className="font-semibold text-foreground mt-0.5">{workspace.name}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Active Subscription:</span>
            <div className="font-semibold text-foreground mt-0.5 flex items-center gap-2">
              <Badge variant="primary" className="uppercase font-mono text-[10px]">
                {workspace.plan_tier || "free"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Subscription & Usage Limits */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Subscription & Quota Limits
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Current plan entitlements, billing limits, and usage consumption
            </p>
          </div>
        </div>

        {billingNotice && (
          <Alert type="info" title="Billing Update" message={billingNotice} />
        )}

        {billing && (
          <div className="space-y-4">
            {/* Usage metrics bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Monthly Chat Queries</span>
                  <span className="font-mono text-muted-foreground">
                    {billing.chat_turns_used} / {billing.chat_turns_limit}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        (billing.chat_turns_used / (billing.chat_turns_limit || 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Queries reset on the first of each calendar month.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Document Limit</span>
                  <span className="font-mono text-muted-foreground">
                    {billing.documents_indexed} / {billing.documents_limit} Docs
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Active Tier: <span className="font-semibold text-foreground uppercase">{billing.plan_tier}</span>. Plan: {billing.plan_name}.
                </div>
              </div>
            </div>

            {/* Plan switcher */}
            <div className="pt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Available SaaS Plans
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {plans.map((p) => {
                  const isCurrent = billing.plan_tier === p.tier;
                  return (
                    <div
                      key={p.tier}
                      className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                        isCurrent
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card/50 hover:border-border/80"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-xs font-bold text-foreground">{p.name}</h4>
                          {isCurrent && (
                            <Badge variant="primary" className="text-[9px] uppercase">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="text-lg font-extrabold text-foreground mb-3">
                          ${p.monthly_price_usd}
                          <span className="text-[10px] font-normal text-muted-foreground">/mo</span>
                        </div>
                        <ul className="space-y-1.5 text-[11px] text-muted-foreground mb-4">
                          {p.features.map((f: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        variant={isCurrent ? "outline" : "primary"}
                        size="sm"
                        disabled={isCurrent || changingPlan === p.tier}
                        isLoading={changingPlan === p.tier}
                        onClick={() => handlePlanChange(p.tier)}
                        className="w-full text-xs"
                      >
                        {isCurrent ? "Active Plan" : `Switch to ${p.name}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Programmatic API Keys */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" /> Programmatic API Keys
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Secure keys for querying assistants via backend REST API
            </p>
          </div>
        </div>

        {createdKey && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-2">
            <span className="text-xs font-bold text-foreground">
              New Secret API Key Generated:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdKey}
                className="w-full rounded-lg border border-border bg-input px-3 py-1.5 font-mono text-xs text-foreground"
              />
              <Button variant="primary" size="sm" onClick={copyToClipboard}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Make sure to copy this key now; you will not be able to see it again.
            </p>
          </div>
        )}

        <form onSubmit={handleCreateApiKey} className="flex gap-3">
          <input
            type="text"
            required
            placeholder="Key Description (e.g. Production Ingestion Service)"
            value={credName}
            onChange={(e) => setCredName(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-input px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={creatingKey}
            disabled={!credName.trim()}
          >
            <Plus className="h-4 w-4" /> Generate Key
          </Button>
        </form>
      </div>

      {/* Members & RBAC */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Workspace Members ({members.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage organization members and role-based access permissions
          </p>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-input px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            isLoading={inviting}
            disabled={!inviteEmail.trim()}
          >
            Send Invite
          </Button>
        </form>

        {/* Members List */}
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3.5 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground">
                  {m.user_name?.charAt(0) || m.user_email?.charAt(0) || "U"}
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {m.user_name || m.user_email || "Workspace Member"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{m.user_email || m.user_id}</div>
                </div>
              </div>
              <Badge variant={m.role === "owner" ? "primary" : "outline"}>
                {m.role}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
