"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { KnowledgeSource, DocumentItem } from "@/types";
import { formatBytes } from "@/lib/utils";
import {
  Database,
  Upload,
  FileText,
  Plus,
  X,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";

export default function SourcesKnowledgePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // New source modal state
  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<"file_upload" | "website_crawl">("file_upload");
  const [targetUrl, setTargetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const list = await api.getSources(projectId);
      setSources(list);
      if (list.length > 0 && !selectedSource) {
        setSelectedSource(list[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedSource]);

  useEffect(() => {
    if (projectId) {
      loadSources();
    }
  }, [projectId, loadSources]);

  const loadDocuments = useCallback(async () => {
    if (selectedSource) {
      setRefreshing(true);
      try {
        const docs = await api.getDocuments(selectedSource.id);
        setDocuments(docs);
      } finally {
        setRefreshing(false);
      }
    }
  }, [selectedSource]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Auto-poll document processing status when any document is in non-terminal state
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );
    if (!hasPending || !selectedSource) return;

    const interval = setInterval(async () => {
      try {
        const docs = await api.getDocuments(selectedSource.id);
        setDocuments(docs);
      } catch {
        // Non-critical background polling failure
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [documents, selectedSource]);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim()) return;
    setCreating(true);

    try {
      const created = await api.createSource(projectId, {
        name: sourceName.trim(),
        source_type: sourceType,
        target_url: sourceType === "website_crawl" ? targetUrl.trim() : undefined,
      });
      setSources([created, ...sources]);
      setSelectedSource(created);
      setShowModal(false);
      setSourceName("");
      setTargetUrl("");
      toast({ type: "success", message: `Knowledge source "${created.name}" created.` });
    } catch (err: any) {
      toast({ type: "error", message: err.message || "Failed to create knowledge source" });
    } finally {
      setCreating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedSource) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      await api.uploadDocuments(selectedSource.id, files);
      await loadDocuments();
      await loadSources();
    } catch (err: any) {
      setUploadError(err.message || "Upload processing failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Top Header: Clean, Typographic, Minimalist */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Knowledge Base
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage reference documents and data sources for grounded semantic retrieval.
          </p>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          size="sm"
          className="rounded-2xl h-9 px-4 text-xs font-semibold gap-2 shrink-0 self-start sm:self-center shadow-xs"
        >
          <Plus className="h-4 w-4" /> Add Knowledge Source
        </Button>
      </div>

      {uploadError && (
        <Alert
          type="destructive"
          title="Upload Problem"
          message={uploadError}
        />
      )}

      {sources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No Knowledge Sources"
          description="Create a knowledge source and upload reference documents (PDF, TXT, MD) to enable grounded assistant retrieval."
          actionLabel="Create Source"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Clean Bento-style Dataset List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Datasets ({sources.length})
              </span>
            </div>

            <div className="space-y-2">
              {sources.map((src) => {
                const isSelected = selectedSource?.id === src.id;
                return (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSelectedSource(src)}
                    className={`w-full text-left p-4 rounded-2xl transition-all duration-150 flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-muted text-foreground shadow-xs"
                        : "bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${
                        isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <Database className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {src.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {src.source_type === "file_upload" ? "Files" : "Web Crawl"} &middot; {src.document_count ?? 0} docs
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Ready
                      </span>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground/60 transition-transform ${isSelected ? "text-primary" : ""}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Source & Indexed Documents */}
          <div className="md:col-span-2 space-y-5">
            {selectedSource ? (
              <div className="rounded-3xl bg-muted/20 p-6 sm:p-7 space-y-6">
                {/* Dataset Summary & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border/40">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground truncate">{selectedSource.name}</h2>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground uppercase">
                        {selectedSource.source_type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Vectorized with 1536-dim embeddings &middot; Ready for RAG
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadDocuments}
                      isLoading={refreshing}
                      className="rounded-xl h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </Button>

                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        accept=".txt,.pdf,.md,.csv"
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        isLoading={uploading}
                        className="pointer-events-none rounded-xl h-8 px-3.5 text-xs font-semibold gap-1.5 shadow-xs"
                      >
                        <Upload className="h-3.5 w-3.5" /> Upload Files
                      </Button>
                    </label>
                  </div>
                </div>

                {/* Documents List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-1">
                    <span>Indexed Documents ({documents.length})</span>
                    <span>PDF, TXT, MD</span>
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-3 bg-card/40">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground mx-auto">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">No documents uploaded yet</p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Upload files to chunk and index them for grounding.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40 rounded-2xl bg-card overflow-hidden">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/30 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary shrink-0">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="truncate">
                              <div className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                {doc.filename}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                {formatBytes(doc.file_size_bytes)} &middot; {doc.mime_type || "text/plain"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {doc.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                Select a dataset to view its documents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modern Creation Modal with Custom Select Dropdown / Drawer */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-border/40 bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary">
                  <Database className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Add Knowledge Source</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Knowledge Source Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Employee Handbook, Technical Specs"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="rounded-xl h-10 text-xs"
                />
              </div>

              {/* Custom Select with Bottom-Sheet behavior on mobile */}
              <CustomSelect
                label="Source Type"
                value={sourceType}
                onChange={(val) => setSourceType(val as any)}
                options={[
                  {
                    value: "file_upload",
                    label: "File Upload (PDF, TXT, Markdown)",
                    description: "Upload local documents to generate vector embeddings",
                    icon: <Upload className="h-4 w-4" />,
                  },
                  {
                    value: "website_crawl",
                    label: "Website URL Crawl",
                    description: "Extract and index live web pages or documentation",
                    icon: <ExternalLink className="h-4 w-4" />,
                  },
                ]}
              />

              {sourceType === "website_crawl" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Target URL</label>
                  <Input
                    type="url"
                    required
                    placeholder="https://docs.example.com"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="rounded-xl h-10 text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl text-xs font-medium"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={creating}
                  disabled={!sourceName.trim()}
                  className="rounded-xl text-xs font-semibold px-4 shadow-xs"
                >
                  Create Source
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
