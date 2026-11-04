import {
  User,
  KnowledgeSource,
  DocumentItem,
  Assistant,
  ChatMessage,
  Deployment,
  ApiCredential,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;

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

  async refreshToken(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          this.setToken(null);
          return null;
        }

        const data = await response.json();
        if (data.access_token) {
          this.setToken(data.access_token);
          return data.access_token;
        }
        return null;
      } catch {
        this.setToken(null);
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
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

    let response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: "include",
    });

    // If 401 Unauthorized and not already refreshing or calling /auth endpoints, attempt transparent refresh via 30-day persistent cookie
    if (response.status === 401 && !endpoint.startsWith("/auth/login") && !endpoint.startsWith("/auth/refresh")) {
      const newToken = await this.refreshToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        response = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
          credentials: "include",
        });
      } else if (typeof window !== "undefined") {
        this.setToken(null);
      }
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
  async register(data: { email: string; password: string; full_name: string }): Promise<{ message: string; verification_otp?: string }> {
    return this.request<{ message: string; verification_otp?: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(data: { email: string; otp: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resendVerification(data: { email: string }): Promise<{ message: string; verification_otp?: string }> {
    return this.request<{ message: string; verification_otp?: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async forgotPassword(data: { email: string }): Promise<{ message: string; reset_token?: string }> {
    return this.request<{ message: string; reset_token?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async resetPassword(data: { email?: string; token: string; new_password: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>("/auth/reset-password", {
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

  // Knowledge Sources Endpoints (Flat & Reparented to User)
  async getSources(): Promise<KnowledgeSource[]> {
    return this.request<KnowledgeSource[]>("/sources");
  }

  async createSource(data: { name: string; source_type: string; target_url?: string; settings?: Record<string, any> }): Promise<KnowledgeSource> {
    return this.request<KnowledgeSource>("/sources", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSource(sourceId: string): Promise<KnowledgeSource> {
    return this.request<KnowledgeSource>(`/sources/${sourceId}`);
  }

  async getDocuments(sourceId: string): Promise<DocumentItem[]> {
    return this.request<DocumentItem[]>(`/sources/${sourceId}/documents`);
  }

  async uploadDocuments(sourceId: string, files: File[]): Promise<{ source_id: string; uploaded_count: number; documents: DocumentItem[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    return this.request<{ source_id: string; uploaded_count: number; documents: DocumentItem[] }>(
      `/sources/${sourceId}/documents`,
      {
        method: "POST",
        body: formData,
      }
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    return this.request<void>(`/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  // Assistant Endpoints (Flat & Reparented to User)
  async getAssistants(): Promise<Assistant[]> {
    return this.request<Assistant[]>("/assistants");
  }

  async getAssistant(id: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}`);
  }

  async createAssistant(data: Partial<Assistant>): Promise<Assistant> {
    return this.request<Assistant>("/assistants", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAssistant(id: string, data: Partial<Assistant>): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async publishAssistant(id: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}/publish`, {
      method: "POST",
    });
  }

  async unpublishAssistant(id: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}/unpublish`, {
      method: "POST",
    });
  }

  async checkPublishReadiness(id: string): Promise<{ ready: boolean; errors: string[]; warnings: string[] }> {
    return this.request<{ ready: boolean; errors: string[]; warnings: string[] }>(`/assistants/${id}/publish-readiness`);
  }

  async chatWithAssistant(
    assistantId: string,
    query: string,
    conversationId?: string
  ): Promise<{
    conversation_id: string;
    message_id: string;
    answer: string;
    citations: any[];
    latency_ms: number;
    is_grounded: boolean;
  }> {
    return this.request(`/assistants/${assistantId}/chat`, {
      method: "POST",
      body: JSON.stringify({ query, conversation_id: conversationId }),
    });
  }

  async getDeployments(assistantId: string): Promise<Deployment[]> {
    return this.request<Deployment[]>(`/assistants/${assistantId}/deployments`);
  }

  async createDeployment(
    assistantId: string,
    data: { name: string; deployment_type: string; allowed_domains: string[]; theme_config?: Record<string, any> }
  ): Promise<Deployment> {
    return this.request<Deployment>(`/assistants/${assistantId}/deployments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createApiCredential(data: { name: string; scopes: string[] }): Promise<ApiCredential> {
    return this.request<ApiCredential>("/api-credentials", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Admin Endpoints
  async getAdminAccess(): Promise<{ is_admin: boolean; role: string }> {
    return this.request<{ is_admin: boolean; role: string }>("/admin/access");
  }

  async getAdminControlSettings(): Promise<AdminControlSettings> {
    return this.request<AdminControlSettings>("/admin/operations/settings");
  }

  async updateAdminControlSettings(
    settings: Partial<Omit<AdminControlSettings, "id" | "updated_by" | "updated_at">>
  ): Promise<AdminControlSettings> {
    return this.request<AdminControlSettings>("/admin/operations/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  }

  async getAdminStats(): Promise<{
    active_users: number;
    total_users: number;
    total_documents_vectorized: number;
    total_storage_bytes: number;
    total_tokens_burned: number;
    total_ai_spend_usd: number;
    total_queries_answered: number;
  }> {
    return this.request<any>("/admin/stats");
  }

  async getAdminUsers(limit = 100, offset = 0, query = ""): Promise<any[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query.trim()) params.set("q", query.trim());
    return this.request<any[]>(`/admin/users?${params.toString()}`);
  }

  async toggleAdminUserStatus(userId: string, isActive: boolean): Promise<any> {
    return this.request<any>(`/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async getAdminActivityLedger(limit = 50): Promise<any[]> {
    return this.request<any[]>(`/admin/activity?limit=${limit}`);
  }

  async getAdminProviders(): Promise<AdminProviderAccount[]> {
    return this.request<AdminProviderAccount[]>("/admin/providers");
  }

  async createAdminProvider(data: {
    provider_name: string;
    display_name: string;
    is_enabled?: boolean;
    default_routing_strategy?: string;
    global_monthly_budget_usd?: number;
    supported_models?: string[];
  }): Promise<AdminProviderAccount> {
    return this.request<AdminProviderAccount>("/admin/providers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAdminProvider(
    providerId: string,
    data: {
      display_name?: string;
      is_enabled?: boolean;
      default_routing_strategy?: string;
      global_monthly_budget_usd?: number;
      supported_models?: string[];
    }
  ): Promise<AdminProviderAccount> {
    return this.request<AdminProviderAccount>(`/admin/providers/${providerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getAdminCredentials(providerId: string): Promise<any[]> {
    return this.request<any[]>(`/admin/providers/${providerId}/credentials`);
  }

  async validateProviderToken(token: string, provider: string): Promise<any> {
    return this.request<any>("/admin/providers/validate", {
      method: "POST",
      body: JSON.stringify({ token, provider }),
    });
  }

  async saveProviderTokens(
    provider_name: string,
    tokens_raw: string
  ): Promise<{ status: string; tokens: Array<{ id: string; status: "active" | "error"; error?: string }> }> {
    return this.request("/admin/providers/save-tokens", {
      method: "POST",
      body: JSON.stringify({ provider_name, tokens_raw }),
    });
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

  async updateAdminCredentialStatus(credentialId: string, isActive: boolean): Promise<any> {
    return this.request<any>(`/admin/credentials/${credentialId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async getFinOpsSummary(): Promise<any> {
    return this.request<any>("/admin/finops/summary");
  }

  async getAdminAuditLogs(limit: number = 50, offset: number = 0, query: string = ""): Promise<any[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query.trim()) params.set("q", query.trim());
    return this.request<any[]>(`/admin/audit-logs?${params.toString()}`);
  }
}

export const api = new ApiClient();
export { ApiError };

export interface AdminControlSettings {
  id: number;
  management_mode: "manual" | "automatic";
  emergency_stop: boolean;
  automatic_failover: boolean;
  auto_disable_unhealthy: boolean;
  auto_recover_credentials: boolean;
  rate_limit_cooldown_seconds: number;
  circuit_breaker_failure_threshold: number;
  circuit_breaker_cooldown_seconds: number;
  updated_by: string | null;
  updated_at: string;
}

export interface AdminProviderAccount {
  id: string;
  provider_name: string;
  display_name: string;
  is_enabled: boolean;
  default_routing_strategy: string;
  global_monthly_budget_usd: number;
  current_month_spend_usd: number;
  supported_models: string[];
  created_at: string;
  updated_at: string;
}
