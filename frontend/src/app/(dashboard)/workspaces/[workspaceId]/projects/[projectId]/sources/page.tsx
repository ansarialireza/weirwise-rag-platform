"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";
import { cn } from "@/lib/utils";

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

  // Mobile Drawer swipe-to-dismiss gesture handling
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [drawerTranslateY, setDrawerTranslateY] = useState(0);

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

  // Lock body scroll when modal/drawer is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
      setDrawerTranslateY(0);
    } else {
      document.body.style.overflow = "";
      setDrawerTranslateY(0);
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

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

  // Helper for consistent badge formatting (e.g. "ready" -> "Ready")
  const formatStatus = (status: string) => {
    if (!status) return "Ready";
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  // Touch handlers for drawer swipe-down
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const deltaY = e.touches[0].clientY - touchStartY;
    if (deltaY > 0) {
      setDrawerTranslateY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (drawerTranslateY > 100) {
      setShowModal(false);
    } else {
      setDrawerTranslateY(0);
    }
    setTouchStartY(null);
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const hasSources = sources.length > 0;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Top Header: Clean, Typographic, Minimalist */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Knowledge Base
            </h1>
            {hasSources && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {sources.length}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage reference documents and data sources for grounded semantic retrieval.
          </p>
        </div>

        {hasSources && (
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="sm"
            className="rounded-2xl h-9 px-4 text-xs font-semibold gap-2 shrink-0 self-start sm:self-center shadow-xs"
          >
            <Plus className="h-4 w-4" /> Add Knowledge Source
          </Button>
        )}
      </div>

      {uploadError && (
        <Alert
          type="destructive"
          title="Upload Problem"
          message={uploadError}
        />
      )}

      {!hasSources ? (
        /* Minimalist Zero-State: Beautiful centered hero with soft bg-muted/30, no dotted borders */
        <div className="rounded-3xl bg-muted/30 p-8 sm:p-14 text-center flex flex-col items-center justify-center space-y-5 animate-in fade-in duration-150">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
            <Database className="h-7 w-7" />
          </div>

          <div className="max-w-md space-y-1.5">
            <h2 className="text-lg sm:text-xl font-bold text-foreground">
              No knowledge sources yet
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Upload documents (PDF, TXT, Markdown) or crawl websites to build your vector knowledge base.
            </p>
          </div>

          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="lg"
            className="rounded-2xl px-6 font-semibold gap-2 shadow-xs text-xs sm:text-sm h-10"
          >
            <Plus className="h-4 w-4" /> Add Knowledge Source
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Clean Dataset List */}
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
                        isSelected ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
                      }`}>
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-foreground truncate">
                          {src.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {src.source_type === "file_upload" ? "Files" : "Web Crawl"} &middot; {src.document_count ?? 0} docs
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {formatStatus(src.status)}
                      </span>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground/40 transition-transform ${isSelected ? "text-foreground" : ""}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Seamless Integrated Document View */}
          <div className="md:col-span-2 space-y-5">
            {selectedSource ? (
              <div className="space-y-5">
                {/* Clean Top Action Bar for Selected Dataset */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pb-2 border-b border-border/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-bold text-foreground truncate">{selectedSource.name}</h2>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground uppercase">
                        {selectedSource.source_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {formatStatus(selectedSource.status)} &middot; 1536-dim vector embeddings
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
                    <span className="font-mono text-[11px]">PDF, TXT, MD</span>
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-3xl bg-muted/20 p-8 text-center space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground mx-auto">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-semibold text-foreground">No documents uploaded yet</p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          Upload files to chunk and index them for assistant retrieval.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30 rounded-2xl bg-card overflow-hidden">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3.5 sm:p-4 hover:bg-muted/30 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-foreground shrink-0">
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
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 font-mono">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {formatStatus(doc.status)}
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

      {/* 
        Responsive Creation Component:
        - Mobile (< md): Native Bottom Drawer with swipe-down dismissal
        - Desktop (>= md): Floating Dialog Modal centered on screen
      */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-150 p-0 md:p-4"
          onClick={() => setShowModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add Knowledge Source"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: drawerTranslateY > 0 ? `translateY(${drawerTranslateY}px)` : undefined,
              transition: touchStartY === null ? "transform 0.15s ease-out" : "none",
            }}
            className={cn(
              "w-full bg-card text-card-foreground border-border/40 shadow-2xl overflow-hidden flex flex-col relative",
              // Mobile (< md): Slides up from bottom as Drawer
              "mt-auto md:mt-0 rounded-t-3xl md:rounded-3xl border-t md:border border-x-0 md:border-x max-h-[90vh] md:max-h-[85vh] md:max-w-md animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-150"
            )}
          >
            {/* Mobile Swipe-Down Handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
            </div>

            {/* Header with Title and 'X' Button */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-foreground shrink-0">
                  <Database className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Add Knowledge Source</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95 transition-all"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateSource} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Knowledge Source Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Employee Handbook, Technical Specs"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    className="w-full rounded-xl bg-muted/50 border border-transparent px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-muted/80 transition-colors"
                  />
                </div>

                {/* Custom Select with Bottom-Sheet behavior on mobile */}
                <CustomSelect
                  label="Source Type"
                  value={sourceType}
                  onChange={(val) => setSourceType(val as any)}
                  triggerClassName="bg-muted/50 border-transparent focus:ring-2 focus:ring-primary/20"
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Target URL</label>
                    <input
                      type="url"
                      required
                      placeholder="https://docs.example.com"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      className="w-full rounded-xl bg-muted/50 border border-transparent px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-muted/80 transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="p-4 sm:p-5 border-t border-border/40 bg-card/60 flex items-center justify-end gap-2.5 shrink-0">
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
                  className="rounded-xl text-xs font-semibold px-5 h-9 shadow-xs"
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
