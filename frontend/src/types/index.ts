export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified?: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type KnowledgeSourceType = "file_upload" | "website_crawl";
export type SourceProcessingStatus = "pending" | "processing" | "ready" | "failed" | "deleting";

export interface KnowledgeSource {
  id: string;
  project_id: string;
  core_kb_id?: string;
  name: string;
  source_type: KnowledgeSourceType;
  status: SourceProcessingStatus;
  target_url?: string;
  error_message?: string;
  settings: Record<string, any>;
  document_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id: string;
  knowledge_source_id: string;
  core_doc_id?: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  content_hash: string;
  status: SourceProcessingStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type AssistantStatus = "draft" | "published" | "archived" | "unpublished";
export type EngineMode = "search_only" | "ai_answer";

export interface Assistant {
  id: string;
  project_id: string;
  core_assistant_id?: string;
  name: string;
  description?: string;
  system_instructions?: string;
  model: string;
  engine_mode?: EngineMode;
  /** Only a Search Assistant can show sources; the flag is meaningless for AI answers. */
  show_sources?: boolean;
  temperature: number;
  max_tokens: number;
  score_threshold: number;
  top_k: number;
  language?: string;
  tone?: string;
  fallback_message?: string;
  escalation_email?: string;
  status: AssistantStatus;
  version: number;
  last_published_at?: string;
  knowledge_source_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface CitationItem {
  document_id?: string;
  document_name?: string;
  chunk_id?: string;
  content: string;
  similarity_score: number;
  rank: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: CitationItem[];
  latency_ms?: number;
  created_at?: string;
}

export interface Deployment {
  id: string;
  assistant_id: string;
  deployment_type: "widget" | "public_api" | "shareable_link";
  name: string;
  public_key: string;
  allowed_domains: string[];
  theme_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicAssistantConfig {
  assistant_id: string;
  name: string;
  language: string;
  tone: string;
  engine_mode?: EngineMode;
  show_sources?: boolean;
  welcome_message: string;
  placeholder_text: string;
  primary_color: string;
  position: string;
  show_branding: boolean;
  allowed_domains: string[];
}

export interface ApiCredential {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  raw_api_key?: string;
}
