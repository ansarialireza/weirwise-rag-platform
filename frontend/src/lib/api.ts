import {
  User,
  Workspace,
  WorkspaceBillingStatus,
  BillingPlanInfo,
  CheckoutResult,
  CheckoutStatusInfo,
  InvoiceItem,
  Project,
  KnowledgeSource,
  DocumentItem,
  Assistant,
  ChatMessage,
  Deployment,
  ApiCredential,
  DirectSearchResponse,
  ConversationItem,
  ConversationMessage,
  KnowledgeGapAnalytics,
} from "@/types";
import { friendlyErrorMessage } from "@/lib/errors";

const WORKSPACE_STORAGE_KEY = "wwp_workspace_id";
const PROJECT_STORAGE_KEY = "wwp_project_id";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

class ApiError extends Error {
  status: number;
  data: any;
  technicalDetail?: string;

  constructor(message: string, status: number, data?: any, technicalDetail?: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.technicalDetail = technicalDetail;
  }
}

class ApiClient {
  private token: string | null = null;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;
  private workspaceId: string | null = null;
  private projectId: string | null = null;
  private tenancyPromise: Promise<{ workspaceId: string; projectId: string }> | null = null;
  private tenancyVerified = false;

  constructor() {
    if (typeof window !== "undefined") {
      // Access tokens stay in memory only. Persistent auth is delivered through
      // HttpOnly cookies set by the API, which scripts cannot read.
      localStorage.removeItem("wwp_token");
      this.workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      this.projectId = localStorage.getItem(PROJECT_STORAGE_KEY);
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (!token && typeof window !== "undefined") {
      this.clearTenancy();
    }
  }

  private clearTenancy() {
    this.workspaceId = null;
    this.projectId = null;
    this.tenancyPromise = null;
    this.tenancyVerified = false;
    if (typeof window !== "undefined") {
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
      localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  }

  /**
   * Resolve the workspace/project the dashboard operates in.
   * The backend requires project-scoped routes, so the active context is
   * discovered once per session (and created on first login).
   */
  async getTenancy(): Promise<{ workspaceId: string; projectId: string }> {
    // The persisted pair is a preference, not a fact: it survives an account switch
    // in the same browser, and a project belonging to the previous account 404s for
    // everyone. It is only trusted after the server has agreed it still exists here.
    if (this.tenancyVerified && this.workspaceId && this.projectId) {
      return { workspaceId: this.workspaceId, projectId: this.projectId };
    }
    if (!this.tenancyPromise) {
      this.tenancyPromise = this.resolveTenancy()
        .then((tenancy) => {
          this.tenancyVerified = true;
          return tenancy;
        })
        .finally(() => {
          this.tenancyPromise = null;
        });
    }
    return this.tenancyPromise;
  }

  private async resolveTenancy(): Promise<{ workspaceId: string; projectId: string }> {
    const workspaces = await this.request<Workspace[]>("/workspaces");
    let workspace = workspaces.find((w) => w.id === this.workspaceId) || workspaces[0];
    if (!workspace) {
      workspace = await this.request<Workspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "My Workspace" }),
      });
    }

    const projects = await this.request<Project[]>(`/workspaces/${workspace.id}/projects`);
    let project = projects.find((p) => p.id === this.projectId) || projects[0];
    if (!project) {
      project = await this.request<Project>(`/workspaces/${workspace.id}/projects`, {
        method: "POST",
        body: JSON.stringify({ name: "Default Project" }),
      });
    }

    this.workspaceId = workspace.id;
    this.projectId = project.id;
    if (typeof window !== "undefined") {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id);
      localStorage.setItem(PROJECT_STORAGE_KEY, project.id);
    }
    return { workspaceId: workspace.id, projectId: project.id };
  }

  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  setWorkspaceId(workspaceId: string): void {
    this.workspaceId = workspaceId;
    this.projectId = null;
    this.tenancyVerified = false;
    this.tenancyPromise = null;
    if (typeof window !== "undefined") {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
      localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  }

  getProjectId(): string | null {
    return this.projectId;
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
      const rawDetail = errorData?.detail;
      throw new ApiError(
        friendlyErrorMessage(rawDetail, response.status),
        response.status,
        errorData,
        typeof rawDetail === "string" ? rawDetail : undefined
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Auth Endpoints
  async register(data: { email: string; password: string; full_name?: string }): Promise<{ message: string; verification_otp?: string }> {
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

  async sendLoginOtp(data: { email: string }): Promise<{ message: string; verification_otp?: string }> {
    return this.request<{ message: string; verification_otp?: string }>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async loginWithOtp(data: { email: string; otp: string }): Promise<{ access_token: string; refresh_token: string }> {
    const res = await this.request<{ access_token: string; refresh_token: string }>("/auth/login-otp", {
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

  // Workspace & Project Endpoints
  async getWorkspaces(): Promise<Workspace[]> {
    return this.request<Workspace[]>("/workspaces");
  }

  async createWorkspace(name: string): Promise<Workspace> {
    return this.request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async updateWorkspace(workspaceId: string, data: { name?: string; settings?: Record<string, any> }): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getWorkspaceBilling(workspaceId: string): Promise<WorkspaceBillingStatus> {
    return this.request<WorkspaceBillingStatus>(`/workspaces/${workspaceId}/billing`);
  }

  async getPublicPlans(): Promise<BillingPlanInfo[]> {
    return this.request<BillingPlanInfo[]>("/plans");
  }

  async initiateCheckout(
    workspaceId: string,
    data: { plan_code: string; billing_cycle?: string; customer_email?: string }
  ): Promise<CheckoutResult> {
    return this.request<CheckoutResult>(`/workspaces/${workspaceId}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCheckoutStatus(workspaceId: string, orderId: string): Promise<CheckoutStatusInfo> {
    return this.request<CheckoutStatusInfo>(`/workspaces/${workspaceId}/billing/orders/${orderId}/status`);
  }

  async getWorkspaceInvoices(workspaceId: string): Promise<InvoiceItem[]> {
    return this.request<InvoiceItem[]>(`/workspaces/${workspaceId}/billing/invoices`);
  }

  async downloadInvoice(workspaceId: string, invoiceNumber: string): Promise<any> {
    return this.request<any>(`/workspaces/${workspaceId}/billing/invoices/${invoiceNumber}/download`);
  }

  async changeWorkspacePlan(workspaceId: string, targetTier: string): Promise<WorkspaceBillingStatus> {
    return this.request<WorkspaceBillingStatus>(`/workspaces/${workspaceId}/billing/change-plan`, {
      method: "POST",
      body: JSON.stringify({ target_tier: targetTier }),
    });
  }

  // Admin Financial Center APIs
  async getAdminFinancialAnalytics(): Promise<any> {
    return this.request<any>("/admin/financial/analytics");
  }

  async getAdminPlans(): Promise<BillingPlanInfo[]> {
    return this.request<BillingPlanInfo[]>("/admin/financial/plans");
  }

  async createAdminPlan(data: Partial<BillingPlanInfo>): Promise<BillingPlanInfo> {
    return this.request<BillingPlanInfo>("/admin/financial/plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAdminPlan(planId: string, data: Partial<BillingPlanInfo>): Promise<BillingPlanInfo> {
    return this.request<BillingPlanInfo>(`/admin/financial/plans/${planId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getAdminSubscriptions(limit = 50, offset = 0): Promise<any[]> {
    return this.request<any[]>(`/admin/financial/subscriptions?limit=${limit}&offset=${offset}`);
  }

  async adjustAdminSubscription(subscriptionId: string, data: { target_plan_code: string; extend_days?: number; reason: string }): Promise<any> {
    return this.request<any>(`/admin/financial/subscriptions/${subscriptionId}/adjust`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAdminTransactions(limit = 50, offset = 0, statusFilter?: string): Promise<any[]> {
    const query = statusFilter ? `&status_filter=${encodeURIComponent(statusFilter)}` : "";
    return this.request<any[]>(`/admin/financial/transactions?limit=${limit}&offset=${offset}${query}`);
  }

  async reviewAdminTransaction(paymentId: string, data: { action: "approve" | "reject"; notes: string }): Promise<any> {
    return this.request<any>(`/admin/financial/transactions/${paymentId}/review`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAdminRampexSettings(): Promise<any> {
    return this.request<any>("/admin/financial/providers/rampex");
  }

  async testAdminRampexConnection(): Promise<any> {
    return this.request<any>("/admin/financial/providers/rampex/test-connection", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  async getProjects(workspaceId: string): Promise<Project[]> {
    return this.request<Project[]>(`/workspaces/${workspaceId}/projects`);
  }

  // Knowledge Sources Endpoints (Project-scoped)
  async getSources(): Promise<KnowledgeSource[]> {
    const { projectId } = await this.getTenancy();
    return this.request<KnowledgeSource[]>(`/projects/${projectId}/sources`);
  }

  async createSource(data: { name: string; source_type: string; target_url?: string; settings?: Record<string, any> }): Promise<KnowledgeSource> {
    const { projectId } = await this.getTenancy();
    return this.request<KnowledgeSource>(`/projects/${projectId}/sources`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSource(sourceId: string): Promise<KnowledgeSource> {
    const sources = await this.getSources();
    const source = sources.find((s) => s.id === sourceId);
    if (!source) throw new ApiError("Knowledge source not found.", 404);
    return source;
  }

  async getDocuments(sourceId: string): Promise<DocumentItem[]> {
    return this.request<DocumentItem[]>(`/sources/${sourceId}/documents`);
  }

  async uploadDocuments(sourceId: string, files: File[]): Promise<{ source_id: string; uploaded_count: number; documents: DocumentItem[] }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    const res = await this.request<{ source_id: string; uploaded_documents: DocumentItem[] }>(
      `/sources/${sourceId}/documents/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    return {
      source_id: res.source_id,
      uploaded_count: res.uploaded_documents.length,
      documents: res.uploaded_documents,
    };
  }

  async pasteTextDocument(sourceId: string, title: string, content: string): Promise<DocumentItem> {
    return this.request<DocumentItem>(`/sources/${sourceId}/documents/paste-text`, {
      method: "POST",
      body: JSON.stringify({ title, content }),
    });
  }

  async deleteDocument(documentId: string): Promise<void> {
    return this.request<void>(`/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  async retryDocument(documentId: string): Promise<DocumentItem> {
    return this.request<DocumentItem>(`/documents/${documentId}/retry`, {
      method: "POST",
    });
  }

  async deleteSource(sourceId: string): Promise<void> {
    return this.request<void>(`/sources/${sourceId}`, {
      method: "DELETE",
    });
  }

  async updateSource(sourceId: string, data: { name?: string; settings?: Record<string, any> }): Promise<KnowledgeSource> {
    return this.request<KnowledgeSource>(`/sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Assistant Endpoints (Project-scoped)
  async getAssistants(): Promise<Assistant[]> {
    const { projectId } = await this.getTenancy();
    return this.request<Assistant[]>(`/projects/${projectId}/assistants`);
  }

  async getAssistant(id: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}`);
  }

  async createAssistant(data: Partial<Assistant>): Promise<Assistant> {
    const { projectId } = await this.getTenancy();
    return this.request<Assistant>(`/projects/${projectId}/assistants`, {
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

  async deleteAssistant(id: string): Promise<void> {
    await this.request<void>(`/assistants/${id}`, {
      method: "DELETE",
    });
  }

  async duplicateAssistant(id: string): Promise<Assistant> {
    return this.request<Assistant>(`/assistants/${id}/duplicate`, {
      method: "POST",
    });
  }

  async directSearch(query: string, sourceIds?: string[], topK: number = 5): Promise<DirectSearchResponse> {
    const { projectId } = await this.getTenancy();
    return this.request<DirectSearchResponse>(`/projects/${projectId}/knowledge/search`, {
      method: "POST",
      body: JSON.stringify({ query, source_ids: sourceIds, top_k: topK }),
    });
  }

  async getAssistantConversations(assistantId: string, limit: number = 50, offset: number = 0): Promise<ConversationItem[]> {
    return this.request<ConversationItem[]>(`/assistants/${assistantId}/conversations?limit=${limit}&offset=${offset}`);
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    return this.request<ConversationMessage[]>(`/conversations/${conversationId}/messages`);
  }

  async getAssistantKnowledgeGaps(assistantId: string): Promise<KnowledgeGapAnalytics> {
    return this.request<KnowledgeGapAnalytics>(`/assistants/${assistantId}/analytics/knowledge-gaps`);
  }

  async requestHumanHandoff(conversationId: string, data: { customer_email?: string; customer_name?: string; reason: string }): Promise<any> {
    return this.request(`/public/conversations/${conversationId}/handoff`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async checkPublishReadiness(
    id: string
  ): Promise<{ ready: boolean; errors: string[]; warnings: string[] }> {
    const res = await this.request<{
      is_ready: boolean;
      issues: string[];
      knowledge_sources_count: number;
      indexed_documents_count: number;
    }>(`/assistants/${id}/publish-readiness`);
    return { ready: res.is_ready, errors: res.issues, warnings: [] };
  }

  async chatWithAssistant(
    assistantId: string,
    message: string,
    conversationId?: string
  ): Promise<{
    conversation_id: string;
    message_id: string;
    content: string;
    sources: any[];
    latency_ms: number;
    is_grounded: boolean;
  }> {
    return this.request(`/assistants/${assistantId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
  }

  /**
   * Streams a grounded answer over SSE. Resolves once the stream finishes or
   * the caller aborts; partial text is still reported through ``onDelta``.
   */
  async streamAssistantChat(
    assistantId: string,
    message: string,
    options: {
      conversationId?: string;
      signal?: AbortSignal;
      onMeta?: (meta: Record<string, any>) => void;
      onDelta?: (text: string) => void;
      onDone?: (done: Record<string, any>) => void;
      onError?: (detail: string) => void;
    } = {}
  ): Promise<{
    content: string;
    conversationId?: string;
    messageId?: string;
    sources: any[];
    done?: Record<string, any>;
    error?: string;
  }> {
    const send = async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      return fetch(`${API_BASE}/assistants/${assistantId}/chat/stream`, {
        method: "POST",
        headers,
        credentials: "include",
        signal: options.signal,
        body: JSON.stringify({ message, conversation_id: options.conversationId }),
      });
    };

    let response = await send();
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) response = await send();
    }

    if (!response.ok) {
      let detail = "The assistant couldn't respond just now.";
      let rawDetail: string | undefined;
      try {
        const data = await response.json();
        rawDetail = typeof data.detail === "string" ? data.detail : undefined;
        detail = friendlyErrorMessage(data.detail, response.status, detail);
      } catch {
        // Ignore non-JSON error bodies
      }
      throw new ApiError(detail, response.status, undefined, rawDetail);
    }
    if (!response.body) {
      throw new ApiError("Streaming is not supported in this browser.", 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let donePayload: Record<string, any> | undefined;
    let streamError: string | undefined;

    const handleEvent = (event: Record<string, any>) => {
      if (event.type === "delta" && typeof event.text === "string") {
        content += event.text;
        options.onDelta?.(event.text);
      } else if (event.type === "meta") {
        options.onMeta?.(event);
      } else if (event.type === "error") {
        const detail: string = event.message || "The assistant could not finish this response.";
        streamError = detail;
        options.onError?.(detail);
      } else if (event.type === "done") {
        donePayload = event;
        if (typeof event.content === "string" && event.content) content = event.content;
        options.onDone?.(event);
      }
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) {
            try {
              handleEvent(JSON.parse(data));
            } catch {
              // Ignore malformed frames rather than killing the stream
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Reader may already be closed
      }
    }

    return {
      content,
      conversationId: donePayload?.conversation_id,
      messageId: donePayload?.message_id,
      sources: donePayload?.sources || [],
      done: donePayload,
      error: streamError,
    };
  }

  async getDeployments(assistantId: string): Promise<Deployment[]> {
    return this.request<Deployment[]>(`/assistants/${assistantId}/deployments`);
  }

  // Public widget runtime (no dashboard auth required)
  async getPublicAssistantConfig(assistantId: string, widgetKey?: string): Promise<any> {
    const headers: Record<string, string> = {};
    if (widgetKey) headers["X-Widget-Key"] = widgetKey;
    return this.request(`/public/assistants/${assistantId}/config`, { headers });
  }

  async publicChat(
    assistantId: string,
    message: string,
    options: { widgetKey?: string; conversationId?: string; sessionToken?: string } = {}
  ): Promise<{
    conversation_id: string;
    message_id: string;
    content: string;
    sources: any[];
    is_grounded: boolean;
    session_token?: string;
  }> {
    const headers: Record<string, string> = {};
    if (options.widgetKey) headers["X-Widget-Key"] = options.widgetKey;
    if (options.sessionToken) headers["X-Session-Token"] = options.sessionToken;
    return this.request(`/public/assistants/${assistantId}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        conversation_id: options.conversationId,
        session_token: options.sessionToken,
      }),
    });
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

  async updateDeployment(
    assistantId: string,
    deploymentId: string,
    data: { name?: string; allowed_domains?: string[]; theme_config?: Record<string, any>; is_active?: boolean }
  ): Promise<Deployment> {
    return this.request<Deployment>(`/assistants/${assistantId}/deployments/${deploymentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async createApiCredential(data: { name: string; scopes: string[] }): Promise<ApiCredential> {
    const { workspaceId } = await this.getTenancy();
    return this.request<ApiCredential>(`/workspaces/${workspaceId}/api-credentials`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listApiCredentials(): Promise<ApiCredential[]> {
    const { workspaceId } = await this.getTenancy();
    return this.request<ApiCredential[]>(`/workspaces/${workspaceId}/api-credentials`);
  }

  async revokeApiCredential(credentialId: string): Promise<void> {
    const { workspaceId } = await this.getTenancy();
    await this.request<void>(`/workspaces/${workspaceId}/api-credentials/${credentialId}`, {
      method: "DELETE",
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
    account_rate_limit_rpm?: number;
    account_rate_limit_tpm?: number;
    account_max_concurrency?: number;
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
      account_rate_limit_rpm?: number;
      account_rate_limit_tpm?: number;
      account_max_concurrency?: number;
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

  async updateAdminCredentialStatus(credentialId: string, isActive: boolean): Promise<AdminCredential> {
    return this.request<AdminCredential>(`/admin/credentials/${credentialId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async updateAdminCredential(
    credentialId: string,
    data: {
      label?: string;
      priority?: number;
      routing_weight?: number;
      models_allowed?: string[];
      monthly_budget_usd?: number;
      warning_threshold_pct?: number;
      rate_limit_rpm?: number;
      rate_limit_tpm?: number;
      max_concurrency?: number;
    }
  ): Promise<AdminCredential> {
    return this.request<AdminCredential>(`/admin/credentials/${credentialId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getAdminCredentialUsage(credentialId: string, days = 30): Promise<AdminCredentialUsage> {
    return this.request<AdminCredentialUsage>(`/admin/credentials/${credentialId}/usage?days=${days}`);
  }

  async getAdminRoutingEvents(params: {
    provider_name?: string;
    credential_id?: string;
    outcome?: string;
    failures_only?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<AdminRoutingEvent[]> {
    const search = new URLSearchParams();
    if (params.provider_name) search.set("provider_name", params.provider_name);
    if (params.credential_id) search.set("credential_id", params.credential_id);
    if (params.outcome) search.set("outcome", params.outcome);
    if (params.failures_only) search.set("failures_only", "true");
    search.set("limit", String(params.limit ?? 50));
    search.set("offset", String(params.offset ?? 0));
    return this.request<AdminRoutingEvent[]>(`/admin/routing/events?${search.toString()}`);
  }

  async explainAdminRouting(providerName: string, modelName?: string): Promise<AdminRoutingExplanation> {
    const search = new URLSearchParams({ provider_name: providerName });
    if (modelName) search.set("model_name", modelName);
    return this.request<AdminRoutingExplanation>(`/admin/routing/explain?${search.toString()}`);
  }

  async getAdminRoutingOverview(windowHours = 24): Promise<AdminRoutingOverview> {
    return this.request<AdminRoutingOverview>(`/admin/routing/overview?window_hours=${windowHours}`);
  }

  async healthCheckAdminProvider(providerId: string): Promise<{
    provider_name: string;
    results: Array<{
      credential_id: string;
      label: string;
      key_prefix: string;
      status: "healthy" | "disabled" | "rate_limited" | "degraded" | "unknown" | "skipped";
      error: string | null;
    }>;
  }> {
    return this.request(`/admin/providers/${providerId}/health-check`, { method: "POST" });
  }

  async getFinOpsSummary(): Promise<any> {
    return this.request<any>("/admin/finops/summary");
  }

  async getAdminAuditLogs(limit: number = 50, offset: number = 0, query: string = ""): Promise<any[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query.trim()) params.set("q", query.trim());
    return this.request<any[]>(`/admin/audit-logs?${params.toString()}`);
  }

  // Voice (Deepgram). Audio is relayed by the API so the key never reaches the browser.
  async getVoiceStatus(): Promise<{ available: boolean }> {
    return this.request<{ available: boolean }>("/voice/status");
  }

  getVoiceStreamUrl(language?: string): string {
    const root = API_BASE.startsWith("http")
      ? API_BASE.replace(/^http/, "ws")
      : `${
          typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws"
        }://${typeof window !== "undefined" ? window.location.host : "localhost"}${API_BASE}`;
    const url = new URL(`${root}/voice/stream`);
    if (language) url.searchParams.set("language", language.slice(0, 2).toLowerCase());
    return url.toString();
  }

  getAccessToken(): string | null {
    return this.token;
  }

  async synthesizeSpeech(text: string, voice?: string): Promise<Blob> {
    const makeRequest = async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
      return fetch(`${API_BASE}/voice/speak`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ text, voice }),
      });
    };

    let response = await makeRequest();
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) response = await makeRequest();
    }

    if (!response.ok) {
      let detail = "Could not read that answer aloud. Please try again.";
      let rawDetail: string | undefined;
      try {
        const data = await response.json();
        rawDetail = typeof data.detail === "string" ? data.detail : undefined;
        detail = friendlyErrorMessage(data.detail, response.status, detail);
      } catch {
        // Ignore non-JSON error bodies
      }
      throw new ApiError(detail, response.status, undefined, rawDetail);
    }

    return response.blob();
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
  account_rate_limit_rpm: number;
  account_rate_limit_tpm: number;
  account_max_concurrency: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCredential {
  id: string;
  provider_id: string;
  label: string;
  key_prefix: string;
  is_active: boolean;
  health_status: string;
  remaining_balance: string | null;
  priority: number;
  routing_weight: number;
  models_allowed: string[];
  monthly_budget_usd: number;
  current_month_spend_usd: number;
  warning_threshold_pct: number;
  rate_limit_rpm: number;
  rate_limit_tpm: number;
  max_concurrency: number;
  total_requests_served: number;
  total_tokens_served: number;
  consecutive_failures: number;
  last_error_reason: string | null;
  last_used_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_health_check_at: string | null;
  cooling_down_until: string | null;
  created_at: string;
}

export interface AdminRoutingEvent {
  id: string;
  routing_id: string;
  workspace_id: string | null;
  provider_name: string;
  model_name: string | null;
  credential_id: string | null;
  credential_label: string | null;
  key_prefix: string | null;
  routing_mode: string;
  strategy: string;
  decision_reason: string | null;
  attempt_number: number;
  is_failover: boolean;
  outcome: string;
  error_category: string | null;
  error_message: string | null;
  retry_after_seconds: number | null;
  latency_ms: number;
  created_at: string;
}

export interface AdminCredentialUsage {
  credential_id: string;
  window_days: number;
  request_count: number;
  success_count: number;
  failure_count: number;
  success_rate_pct: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  estimated_cost_usd: number;
  provider_billed_cost_usd: number;
  avg_latency_ms: number;
  monthly_budget_usd: number;
  monthly_spend_usd: number;
  budget_used_pct: number;
  cost_by_model: Record<string, number>;
  daily_cost_usd: Record<string, number>;
  recent_events: AdminRoutingEvent[];
}

export interface AdminRoutingExplanation {
  available: boolean;
  reason?: string;
  mode?: string;
  strategy?: string;
  credential_id?: string;
  credential_label?: string;
  key_prefix?: string;
  health_status?: string;
  eligible_count?: number;
}

export interface AdminRoutingOverviewProvider {
  provider_name: string;
  requests: number;
  successes: number;
  failures: number;
  no_credential_events: number;
  rate_limit_events: number;
  failovers: number;
  success_rate_pct: number;
  avg_latency_ms: number;
  total_tokens: number;
  cost_usd: number;
}

export interface AdminRoutingOverviewCredential {
  credential_id: string;
  label: string;
  key_prefix: string;
  provider_name: string;
  is_active: boolean;
  health_status: string;
  cooling_down_until: string | null;
  requests: number;
  successes: number;
  failures: number;
  rate_limit_events: number;
  success_rate_pct: number;
  avg_latency_ms: number;
  total_tokens: number;
  cost_usd: number;
  monthly_spend_usd: number;
  monthly_budget_usd: number;
  remaining_quota_tokens: number | null;
  in_flight: number;
  max_concurrency: number;
  rpm_used: number;
  rpm_limit: number;
  rpm_utilization_pct: number;
  tpm_used: number;
  tpm_limit: number;
  tpm_utilization_pct: number;
}

export interface AdminRoutingOverview {
  window_hours: number;
  generated_at: string;
  totals: {
    requests: number;
    successes: number;
    failures: number;
    no_credential_events: number;
    rate_limit_events: number;
    failovers: number;
    success_rate_pct: number;
    total_tokens: number;
    cost_usd: number;
  };
  providers: AdminRoutingOverviewProvider[];
  credentials: AdminRoutingOverviewCredential[];
  account_utilization: Record<
    string,
    {
      in_flight: number;
      account_rpm_used: number;
      account_rpm_limit: number;
      account_tpm_used: number;
      account_tpm_limit: number;
      account_max_concurrency: number;
    }
  >;
}
