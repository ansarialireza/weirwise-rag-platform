"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { KnowledgeSource, DocumentItem } from "@/types";
import { formatBytes } from "@/lib/utils";
import {
  Database,
  Upload,
  Globe,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react";

export default function SourcesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // New source modal state
  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<"file_upload" | "website_crawl">("file_upload");
  const [targetUrl, setTargetUrl] = useState("");

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

  useEffect(() => {
    if (selectedSource) {
      api.getDocuments(selectedSource.id).then(setDocuments);
    }
  }, [selectedSource]);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName) return;

    try {
      const created = await api.createSource(projectId, {
        name: sourceName,
        source_type: sourceType,
        target_url: sourceType === "website_crawl" ? targetUrl : undefined,
      });
      setSources([created, ...sources]);
      setSelectedSource(created);
      setShowModal(false);
      setSourceName("");
      setTargetUrl("");
    } catch (err: any) {
      alert(err.message || "Failed to create knowledge source");
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
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sources Left Column */}
      <div className="w-80 border-r border-border flex flex-col bg-card/50">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Knowledge Sources</h2>
            <p className="text-[10px] text-muted-foreground">Connected file & web collections</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3 w-3" /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => setSelectedSource(src)}
              className={`w-full text-left rounded-md p-3 transition-colors ${
                selectedSource?.id === src.id
                  ? "bg-secondary border border-border text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                {src.source_type === "website_crawl" ? (
                  <Globe className="h-4 w-4 text-primary" />
                ) : (
                  <Database className="h-4 w-4 text-primary" />
                )}
                <span className="text-xs font-medium truncate flex-1">{src.name}</span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono ${
                    src.status === "ready"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {src.status}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>{src.source_type}</span>
                <span>{src.document_count ?? 0} docs</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Documents Right View */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {selectedSource ? (
          <>
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground">{selectedSource.name}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ID: <span className="font-mono">{selectedSource.id}</span>
                </p>
              </div>

              {selectedSource.source_type === "file_upload" && (
                <label className="flex items-center gap-2 rounded-md bg-secondary hover:bg-border px-3 py-1.5 text-xs font-medium text-foreground cursor-pointer transition-colors">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-primary" />
                  )}
                  {uploading ? "Ingesting..." : "Upload Files"}
                  <input
                    type="file"
                    multiple
                    disabled={uploading}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md"
                  />
                </label>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {documents.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-2">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    No documents ingested into this source yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">{doc.filename}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {formatBytes(doc.file_size_bytes)} • {doc.mime_type}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {doc.status === "ready" && (
                          <span className="flex items-center gap-1 text-[10px] text-primary font-mono">
                            <CheckCircle2 className="h-3.5 w-3.5" /> READY
                          </span>
                        )}
                        {doc.status === "pending" && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> PENDING
                          </span>
                        )}
                        {doc.status === "failed" && (
                          <span className="flex items-center gap-1 text-[10px] text-destructive font-mono">
                            <AlertCircle className="h-3.5 w-3.5" /> FAILED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Select or create a knowledge source.
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground">Add Knowledge Source</h3>
            <form onSubmit={handleCreateSource} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Source Name</label>
                <input
                  type="text"
                  required
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. Employee Handbook"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Source Type</label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as any)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="file_upload">File Upload (PDF, DOCX, TXT, MD)</option>
                  <option value="website_crawl">Website Crawl (Public URL)</option>
                </select>
              </div>

              {sourceType === "website_crawl" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Target URL</label>
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://docs.enterprise.com"
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Create Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
