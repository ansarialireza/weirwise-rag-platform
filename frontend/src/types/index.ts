export interface User {
  id: string;
  email: string;
  full_name?: string | null;
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

export interface WorkspaceBillingStatus {
  user_id?: string;
  plan_code?: string;
  plan_tier?: string;
  plan_name: string;
  monthly_price?: number;
  monthly_price_usd?: number;
  yearly_price?: number;
  currency?: string;
  billing_cycle?: string;
  status?: string;
  billing_status?: string;
  period_start?: string | null;
  period_end?: string | null;
  cancel_at_period_end?: boolean;
  chat_turns_used: number;
  chat_turns_limit: number;
  documents_indexed: number;
  documents_limit: number;
  assistants_limit?: number;
  storage_mb_limit?: number;
  allowed_models?: string[];
  features?: string[];
}

export interface BillingPlanInfo {
  id: string;
  code: string;
  name: string;
  description?: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  is_active: boolean;
  is_public?: boolean;
  is_recommended: boolean;
  sort_order: number;
  max_assistants: number;
  max_documents: number;
  max_chat_turns_monthly: number;
  max_storage_mb: number;
  max_file_size_mb: number;
  allowed_models: string[];
  features: string[];
  allow_custom_branding: boolean;
  allow_api_access: boolean;
}

export interface CheckoutResult {
  order_id: string;
  order_number: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  payment_method?: string;
  payment_url?: string;
  payment_address?: string;
  qr_code_svg?: string;
  expires_at?: string;
}

export interface CheckoutStatusInfo {
  order_id: string;
  order_number: string;
  plan_name?: string;
  status: string;
  amount: number;
  currency: string;
  payment_method?: string;
  received_amount?: number;
  received_currency?: string;
  blockchain_txid?: string;
  payment_url?: string;
  payment_address?: string;
  qr_code_svg?: string;
  expires_at?: string;
  is_subscription_active: boolean;
}

export interface InvoiceItem {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  billing_period_start: string;
  billing_period_end: string;
  paid_at?: string;
  line_items: Array<{ description: string; amount: number; currency: string }>;
  created_at: string;
}

export interface Project {
  id: string;
  user_id?: string;
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
  user_id?: string;
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
  user_id?: string;
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
  user_id?: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  raw_api_key?: string;
}

export interface DirectSearchResult {
  document_id: string | null;
  document_name: string | null;
  source_id: string | null;
  source_name: string | null;
  chunk_index: number | null;
  text: string;
  score: number;
}

export interface DirectSearchResponse {
  query: string;
  total_results: number;
  results: DirectSearchResult[];
}

export interface ConversationItem {
  id: string;
  assistant_id: string;
  title: string | null;
  is_escalated: boolean;
  escalation_reason: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  citations: any[];
  created_at: string;
}

export interface KnowledgeGapItem {
  id: string;
  query: string;
  reason: string;
  date: string;
}

export interface KnowledgeGapAnalytics {
  total_unanswered: number;
  top_unanswered_questions: KnowledgeGapItem[];
  weak_coverage_topics: string[];
  positive_feedback_count: number;
  negative_feedback_count: number;
  satisfaction_rate_pct: number;
}

