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
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Layers,
  RefreshCw,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

export default function SourcesKnowledgePage() {
  const params = useParams();
  const projectId = params.projectId as string;

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
    } catch (err: any) {
      alert(err.message || "Failed to create knowledge source");
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
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Knowledge Base
            </h1>
            <Badge variant="primary" className="text-xs px-2.5 py-0.5">{sources.length} Datasets</Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Ingest and index company documents for grounded vector similarity search with Jina AI embeddings.
          </p>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          size="sm"
          className="h-9 px-4 text-xs font-bold gap-2 shrink-0 self-start sm:self-center"
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
          {/* Left Column: Sources List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Knowledge Datasets
              </span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-secondary text-foreground">{sources.length}</span>
            </div>

            <div className="space-y-2.5">
              {sources.map((src) => {
                const isSelected = selectedSource?.id === src.id;
                return (
                  <div
                    key={src.id}
                    onClick={() => setSelectedSource(src)}
                    className={`flex items-start justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                        : "border-border bg-card hover:bg-secondary/40 hover:border-border/80"
                    }`}
                  >
                    <div className="space-y-1.5 truncate">
                      <div className="flex items-center gap-2.5">
                        <Database className={`h-4.5 w-4.5 flex-shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-bold text-foreground truncate">{src.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Type: <span className="text-foreground font-medium">{src.source_type}</span>
                      </div>
                    </div>
                    <Badge variant={src.status === "ready" ? "success" : "outline"} className="text-[11px] px-2 py-0.2">
                      {src.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Source Documents & Ingestion Area */}
          <div className="md:col-span-2 space-y-5">
            {selectedSource ? (
              <div className="rounded-xl border border-border bg-card p-6 space-y-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground truncate">{selectedSource.name}</h2>
                      <Badge variant="outline" className="text-xs shrink-0">{selectedSource.source_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      Status: <span className="font-bold text-emerald-500 uppercase font-mono">{selectedSource.status}</span> • Vectorized with Jina v4 1536-dim embeddings
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadDocuments}
                      isLoading={refreshing}
                      className="h-8 px-3 text-xs font-semibold gap-1.5"
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
                        className="pointer-events-none h-8 px-3.5 text-xs font-bold gap-1.5"
                      >
                        <Upload className="h-4 w-4" /> Upload Files
                      </Button>
                    </label>
                  </div>
                </div>

                {/* Upload Status / Documents List */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Indexed Documents ({documents.length})</span>
                    <span className="text-xs text-muted-foreground font-mono">Supported formats: .pdf, .txt, .md</span>
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3 bg-secondary/10">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary mx-auto border border-border">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">No documents uploaded yet</p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Upload reference files above to ingest, chunk, and index for semantic search grounding.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-4 bg-card hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 truncate">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="truncate">
                              <div className="text-sm font-bold text-foreground truncate">
                                {doc.filename}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                {formatBytes(doc.file_size_bytes)} • {doc.mime_type || "text/plain"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant={doc.status === "ready" ? "success" : "outline"} className="text-xs px-2.5 py-0.5">
                              {doc.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Select a knowledge source to view its documents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Add Knowledge Source</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Dataset Name</label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Employee Handbook, Technical Specs"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Source Type</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as any)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="file_upload">File Upload (PDF, TXT, Markdown)</option>
                  <option value="website_crawl">Website URL Crawl</option>
                </select>
              </div>

              {sourceType === "website_crawl" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Target URL</label>
                  <Input
                    type="url"
                    required
                    placeholder="https://docs.example.com"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={creating}
                  disabled={!sourceName.trim()}
                >
                  Create Dataset
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
