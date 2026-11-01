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

  const [activeTab, setActiveTab] = useState<"general" | "api_keys" | "members">("general");

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [savingWs, setSavingWs] = useState(false);
  const [wsNotice, setWsNotice] = useState<string | null>(null);

  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

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
      ])
        .then(([ws, mList]) => {
          setWorkspace(ws);
          setWorkspaceName(ws.name);
          setMembers(mList);
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
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
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-medium">
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
                className="w-full rounded-xl bg-background/80 border border-border/40 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <button
              type="submit"
              disabled={savingWs}
              className="inline-flex items-center justify-center rounded-xl h-9 px-4 text-xs font-semibold bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              Save Workspace Name
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: API Keys */}
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
                    {copied ? <Check className="h-3.5 w-3.5 text-foreground" /> : <Copy className="h-3.5 w-3.5" />}
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
                className="flex-1 rounded-xl bg-background/80 border border-border/40 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <button
                type="submit"
                disabled={creatingKey}
                className="inline-flex items-center justify-center rounded-xl h-9 px-4 text-xs font-semibold gap-1.5 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs shrink-0 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="h-3.5 w-3.5" /> Create Key
              </button>
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

            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 max-w-lg items-stretch sm:items-center">
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 rounded-xl bg-background/80 border border-border/40 px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 h-9"
              />
              <div className="w-full sm:w-32 shrink-0">
                <CustomSelect
                  value={inviteRole}
                  onChange={(val) => setInviteRole(val)}
                  triggerClassName="rounded-xl bg-background/80 border border-border/40 px-3 py-2 text-xs text-foreground focus:outline-none h-9"
                  options={[
                    { value: "member", label: "Member", description: "Standard contributor access" },
                    { value: "admin", label: "Admin", description: "Full workspace administrative access" },
                  ]}
                />
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="inline-flex items-center justify-center rounded-xl h-9 px-4 text-xs font-semibold gap-1.5 bg-foreground text-background hover:opacity-90 active:scale-[0.98] shadow-xs shrink-0 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Plus className="h-3.5 w-3.5" /> Invite
              </button>
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
