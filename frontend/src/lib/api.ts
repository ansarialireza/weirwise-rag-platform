import {
  User,
  Workspace,
  Membership,
  Project,
  KnowledgeSource,
  DocumentItem,
  Assistant,
  ChatMessage,
  Deployment,
  ApiCredential,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";

class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("wwp_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("wwp_token", token);
      } else {
        localStorage.removeItem("wwp_token");
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: "include", // Supports secure HttpOnly cookies
    });

    if (response.status === 401 && typeof window !== "undefined") {
      // Clear token on 401
      this.setToken(null);
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: response.statusText };
      }
      throw new ApiError(errorData.detail || "An error occurred", response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Auth Endpoints
  async register(data: { email: string; password: string; full_name: string }): Promise<User> {
    return this.request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }): Promise<{ access_token: string; refresh_token: string }> {
    const res = await this.request<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    this.setToken(res.access_token);
    return res;
  }

  async logout(): Promise<void> {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } finally {
      this.setToken(null);
    }
  }

  async getMe(): Promise<User> {
    return this.request<User>("/auth/me");
  }

  // Workspace Endpoints
  async getWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>("/workspaces");
  }

  async createWorkspace(data: { name: string; slug?: string }): Promise<Workspace> {
    return this.request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getWorkspace(id: string): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${id}`);
  }

  async updateWorkspace(id: string, data: { name?: string; settings?: Record<string, any> }): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getMembers(workspaceId: string): Promise<Membership[]> {
    return this.request<Membership[]>(`/workspaces/${workspaceId}/members`);
  }

  async inviteMember(workspaceId: string, data: { email: string; role: string }): Promise<Membership> {
    return this.request<Membership>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Project Endpoints
  async getProjects(workspaceId: string): Promise<Project[]> {
    return this.request<Project[]>(`/workspaces/${workspaceId}/projects`);
  }

  async createProject(workspaceId: string, data: { name: string; description?: string }): Promise<Project> {
    return this.request<Project>(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request<Project>(`/projects/${projectId}`);
  }

  // Knowledge Sources & Documents
  async getSources(projectId: string): Promise<KnowledgeSource[]> {
    return this.request<KnowledgeSource[]>(`/projects/${projectId}/sources`);
  }

  async createSource(projectId: string, data: { name: string; source_type: string; target_url?: string }): Promise<KnowledgeSource> {
    return this.request<KnowledgeSource>(`/projects/${projectId}/sources`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getDocuments(sourceId: string): Promise<DocumentItem[]> {
    return this.request<DocumentItem[]>(`/sources/${sourceId}/documents`);
  }

  async uploadDocuments(sourceId: string, files: File[]): Promise<{ uploaded_documents: DocumentItem[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    return this.request<{ uploaded_documents: DocumentItem[] }>(`/sources/${sourceId}/documents/upload`, {
      method: "POST",
      body: formData,
    });
  }

  // Assistants
  async getAssistants(projectId: string): Promise<Assistant[]> {
    return this.request<Assistant[]>(`/projects/${projectId}/assistants`);
  }

  async getAssistant(assistantId: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${assistantId}`);
  }

  async updateAssistant(assistantId: string, data: Partial<Assistant>): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async createAssistant(projectId: string, data: Partial<Assistant>): Promise<Assistant> {
    return this.request<Assistant>(`/projects/${projectId}/assistants`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async publishAssistant(assistantId: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${assistantId}/publish`, {
      method: "POST",
    });
  }

  async chatWithAssistant(assistantId: string, message: string, conversationId?: string): Promise<{
    conversation_id: string;
    message_id: string;
    role: "assistant";
    content: string;
    sources: any[];
    latency_ms: number;
  }> {
    return this.request(`/assistants/${assistantId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
  }

  // Deployments & API Credentials
  async createDeployment(assistantId: string, data: { name: string; deployment_type: string; allowed_domains: string[] }): Promise<Deployment> {
    return this.request<Deployment>(`/assistants/${assistantId}/deployments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createApiCredential(workspaceId: string, name: string): Promise<ApiCredential> {
    return this.request<ApiCredential>(`/workspaces/${workspaceId}/api-credentials`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  // Billing & Plans
  async getPlans(): Promise<any[]> {
    return this.request<any[]>("/plans");
  }

  async getBillingStatus(workspaceId: string): Promise<any> {
    return this.request<any>(`/workspaces/${workspaceId}/billing`);
  }

  async changePlan(workspaceId: string, targetTier: string): Promise<any> {
    return this.request<any>(`/workspaces/${workspaceId}/billing/change-plan`, {
      method: "POST",
      body: JSON.stringify({ target_tier: targetTier }),
    });
  }

  // Super Admin Control Center APIs
  async getAdminMetrics(): Promise<any> {
    return this.request<any>("/admin/metrics");
  }

  async getAdminProviders(): Promise<any[]> {
    return this.request<any[]>("/admin/providers");
  }

  async createAdminProvider(data: {
    provider_name: string;
    display_name: string;
    default_routing_strategy?: string;
    global_monthly_budget_usd?: number;
    supported_models?: string[];
  }): Promise<any> {
    return this.request<any>("/admin/providers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAdminCredentials(providerId: string): Promise<any[]> {
    return this.request<any[]>(`/admin/providers/${providerId}/credentials`);
  }

  async createAdminCredential(
    providerId: string,
    data: {
      label: string;
      secret: string;
      priority?: number;
      routing_weight?: number;
      monthly_budget_usd?: number;
    }
  ): Promise<any> {
    return this.request<any>(`/admin/providers/${providerId}/credentials`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deleteAdminCredential(credentialId: string): Promise<void> {
    return this.request<void>(`/admin/credentials/${credentialId}`, {
      method: "DELETE",
    });
  }

  async getFinOpsSummary(): Promise<any> {
    return this.request<any>("/admin/finops/summary");
  }

  async getAdminAuditLogs(limit: number = 50): Promise<any[]> {
    return this.request<any[]>(`/admin/audit-logs?limit=${limit}`);
  }
}

export const api = new ApiClient();
export { ApiError };
