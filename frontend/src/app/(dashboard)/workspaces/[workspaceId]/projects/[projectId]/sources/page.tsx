"use client";

import { useEffect, useState } from "react";
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
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";

export default function SourcesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // New source modal state
  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<"file_upload" | "website_crawl">("file_upload");
  const [targetUrl, setTargetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSources = async () => {
    try {
      const list = await api.getSources(projectId);
      setSources(list);
      if (list.length > 0 && !selectedSource) {
        setSelectedSource(list[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadSources();
    }
  }, [projectId]);

  const loadDocuments = async () => {
    if (selectedSource) {
      setRefreshing(true);
      try {
        const docs = await api.getDocuments(selectedSource.id);
        setDocuments(docs);
      } finally {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [selectedSource]);

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
    const filesArray = Array.from(e.target.files);
    setUploading(true);

    try {
      const resp = await api.uploadDocuments(selectedSource.id, filesArray);
      setDocuments([...resp.uploaded_documents, ...documents]);
    } catch (err: any) {
      alert(err.message || "Upload failed. Please ensure file is PDF/DOCX/TXT/MD under 50MB.");
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
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Knowledge Grounding Sources
            </h1>
            <Badge variant="primary">RAG Engine</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upload enterprise documents to index vector embeddings for assistant retrieval
          </p>
        </div>

        <Button
          onClick={() => setShowModal(true)}
          variant="primary"
          size="sm"
        >
          <Plus className="h-4 w-4" /> New Knowledge Source
        </Button>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No Knowledge Sources Configured"
          description="Create your first knowledge collection to upload documentation, policies, or guides."
          actionLabel="Create Knowledge Source"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Sources List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Knowledge Collections
              </span>
              <Badge variant="outline">{sources.length}</Badge>
            </div>

            <div className="space-y-2">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSource(s)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    selectedSource?.id === s.id
                      ? "border-primary bg-secondary/80 shadow-sm"
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <Database className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                        {s.name}
                      </span>
                    </div>
                    <Badge variant={s.status === "ready" ? "success" : "outline"}>
                      {s.status || "active"}
                    </Badge>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                    Type: {s.source_type}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Two Columns: Upload & Documents List */}
          <div className="md:col-span-2 space-y-6">
            {selectedSource ? (
              <>
                {/* Upload Action Box */}
                <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center transition-all hover:border-primary/60">
                  <Upload className="mx-auto h-8 w-8 text-primary mb-3" />
                  <h3 className="text-sm font-bold text-foreground">
                    Upload Documents to &quot;{selectedSource.name}&quot;
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Supports PDF, DOCX, TXT, and Markdown files up to 50 MB with automatic SHA-256 deduplication
                  </p>

                  <div className="mt-4">
                    <label className="cursor-pointer">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={uploading}
                        isLoading={uploading}
                        className="pointer-events-none"
                      >
                        <Plus className="h-4 w-4" /> Select Files to Ingest
                      </Button>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.txt,.md"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                </div>

                {/* Ingested Documents Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Ingested Documents ({documents.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadDocuments}
                      isLoading={refreshing}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </Button>
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                      No documents uploaded to this source yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-4 text-xs transition-colors hover:bg-secondary/30"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                            <div className="truncate">
                              <span className="font-semibold text-foreground truncate block">
                                {doc.filename}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                                <span>{formatBytes(doc.file_size_bytes)}</span>
                                <span>•</span>
                                <span className="uppercase">{doc.mime_type.split("/")[1]}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Badge variant={doc.status === "ready" ? "success" : "outline"}>
                              {doc.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-xs text-muted-foreground">
                Select a knowledge source to inspect and upload documents.
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Source Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">New Knowledge Source</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSource} className="space-y-4">
              <Input
                label="Source Collection Name"
                required
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Employee Handbook 2026"
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Source Ingestion Type
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="file_upload">File Upload Collection (PDF/DOCX/TXT/MD)</option>
                  <option value="website_crawl">Web Crawler URL</option>
                </select>
              </div>

              {sourceType === "website_crawl" && (
                <Input
                  label="Target Website URL"
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://docs.example.com"
                />
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
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
                >
                  Create Knowledge Source
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
