"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Workspace, Membership, ApiCredential } from "@/types";
import { Shield, Key, Users, Copy, Check, Plus } from "lucide-react";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  // Invitation State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  // API Credential State
  const [credName, setCredName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      Promise.all([
        api.getWorkspace(workspaceId),
        api.getMembers(workspaceId),
      ]).then(([ws, mList]) => {
        setWorkspace(ws);
        setMembers(mList);
      }).finally(() => {
        setLoading(false);
      });
    }
  }, [workspaceId]);

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
    if (!credName) return;
    try {
      const cred = await api.createApiCredential(workspaceId, credName);
      if (cred.raw_api_key) {
        setCreatedKey(cred.raw_api_key);
      }
      setCredName("");
    } catch (err: any) {
      alert(err.message || "Failed to create API key");
    }
  };

  if (loading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Workspace Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage organizational members, roles, and programmatic credentials
        </p>
      </div>

      {/* General Settings */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Organization Details
        </h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Workspace Name:</span>
            <div className="font-medium text-foreground mt-0.5">{workspace.name}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Slug Identifier:</span>
            <div className="font-mono text-foreground mt-0.5">{workspace.slug}</div>
          </div>
        </div>
      </div>

      {/* Members & RBAC */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Team Members & Roles
          </h2>
        </div>

        <form onSubmit={handleInvite} className="flex gap-2 text-xs">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@enterprise.com"
            className="flex-1 rounded-md border border-border bg-input px-3 py-1.5 text-foreground focus:border-primary focus:outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-md border border-border bg-input px-3 py-1.5 text-foreground focus:border-primary focus:outline-none"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-secondary hover:bg-border px-3 py-1.5 font-medium text-foreground disabled:opacity-50"
          >
            {inviting ? "Inviting..." : "Invite"}
          </button>
        </form>

        <div className="divide-y divide-border border border-border rounded-md">
          {members.map((m) => (
            <div key={m.id} className="p-3 flex items-center justify-between text-xs">
              <div>
                <div className="font-medium text-foreground">{m.user_name || "Registered User"}</div>
                <div className="text-[10px] text-muted-foreground">{m.user_email}</div>
              </div>
              <span className="font-mono text-[10px] uppercase font-semibold text-primary">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* API Credentials */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" /> API Credentials
        </h2>
        <p className="text-xs text-muted-foreground">
          Programmatic access keys scoped to this workspace. Secret keys are only shown once upon generation.
        </p>

        {createdKey && (
          <div className="rounded-md border border-primary/30 bg-primary/10 p-4 space-y-2">
            <span className="text-[11px] font-semibold text-primary">Generated API Secret</span>
            <div className="flex items-center justify-between bg-input p-2 rounded text-xs font-mono text-foreground">
              <span className="truncate">{createdKey}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-primary hover:opacity-80 ml-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Store this key safely now. It will not be shown again.
            </p>
          </div>
        )}

        <form onSubmit={handleCreateApiKey} className="flex gap-2 text-xs">
          <input
            type="text"
            required
            value={credName}
            onChange={(e) => setCredName(e.target.value)}
            placeholder="Key Name (e.g. CI Automation)"
            className="flex-1 rounded-md border border-border bg-input px-3 py-1.5 text-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" /> Issue Key
          </button>
        </form>
      </div>
    </div>
  );
}
