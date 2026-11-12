"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { KnowledgeSource, DocumentItem, DirectSearchResult } from "@/types";
import { formatBytes } from "@/lib/i18n/format";
import {
  AlertCircle,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useWorkflow, useTelemetry } from "@/lib/telemetry";
import { useI18n } from "@/lib/i18n/context";
import { DemoIntegrationHub } from "@/components/integrations/demo-integration-hub";

const ACCEPTED_EXTENSIONS = [".txt", ".pdf", ".md", ".csv"];

function sourceTypeLabel(source: KnowledgeSource): string {
  if (source.source_type === "file_upload") return "Files";
  if (source.source_type === "website_crawl") return "Website";
  if (source.source_type === "shopify_catalog") {
    return source.settings.mock_provider === true ? "Shopify catalog · Demo" : "Shopify catalog";
  }
  return source.settings.mock_provider === true ? "Google Drive · Demo" : "Google Drive";
}

function describeProcessingError(raw?: string | null): string {
  const text = (raw || "").toLowerCase();
  if (text.includes("docx") || text.includes("word") || text.includes("xlsx") || text.includes("excel")) {
    return "Word and Excel files are not directly supported yet. Please save or export them as PDF before uploading.";
  }
  if (text.includes("too large") || text.includes("size limit")) {
    return "This file is too large to prepare. Try a smaller copy (under 50MB).";
  }
  if (text.includes("unsupported") || text.includes("file type")) {
    return "This file type isn't supported yet. Try a PDF, TXT, Markdown, or CSV file.";
  }
  if (text.includes("timeout") || text.includes("timed out")) {
    return "Preparing this file took too long. Please try again.";
  }
  return "We couldn't prepare this file. Try again, or upload a different copy.";
}

export default function SourcesKnowledgePage() {
  const { toast } = useToast();
  const { locale } = useI18n();
  const uploadWorkflow = useWorkflow("wf_upload_documents");
  const createSourceWorkflow = useWorkflow("wf_create_source");
  const { trackFriction } = useTelemetry();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docFilter, setDocFilter] = useState("");
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingSource, setIsDeletingSource] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const [showModal, setShowModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceType, setSourceType] = useState<"file_upload" | "website_crawl">("file_upload");
  const [targetUrl, setTargetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename collection state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Paste text state
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [isPasting, setIsPasting] = useState(false);

  // Direct Semantic Search State
  const [showDirectSearchModal, setShowDirectSearchModal] = useState(false);
  const [directSearchQuery, setDirectSearchQuery] = useState("");
  const [isSearchingDirect, setIsSearchingDirect] = useState(false);
  const [directSearchResults, setDirectSearchResults] = useState<DirectSearchResult[]>([]);
  const [directSearchHasSearched, setDirectSearchHasSearched] = useState(false);

  const handleDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directSearchQuery.trim()) return;
    setIsSearchingDirect(true);
    try {
      const sourceIds = selectedSource ? [selectedSource.id] : undefined;
      const res = await api.directSearch(directSearchQuery, sourceIds, 5);
      setDirectSearchResults(res.results);
      setDirectSearchHasSearched(true);
    } catch (err: any) {
      toast({
        type: "error",
        title: "Search failed",
        message: err.message || "Failed to search knowledge base.",
      });
    } finally {
      setIsSearchingDirect(false);
    }
  };

  const loadSources = useCallback(async () => {
    try {
      const list = await api.getSources();
      setSources(list);
      setSelectedSource((prev) => {
        if (!prev) return list[0] || null;
        return list.find((s) => s.id === prev.id) || list[0] || null;
      });
    } catch (err: any) {
      setPageError(err.message || "We couldn't load your knowledge. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSourceImported = useCallback(async (sourceId: string) => {
    const list = await api.getSources();
    const importedSource = list.find((source) => source.id === sourceId);
    if (!importedSource) {
      throw new Error("The imported knowledge collection is not available yet.");
    }
    setSources(list);
    setSelectedSource(importedSource);
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const loadDocuments = useCallback(async () => {
    if (!selectedSource) {
      setDocuments([]);
      return;
    }
    setLoadingDocs(true);
    setRefreshing(true);
    try {
      const docs = await api.getDocuments(selectedSource.id);
      setDocuments(docs);
    } catch (err: any) {
      setPageError(err.message || "We couldn't load these files. Please try again.");
    } finally {
      setLoadingDocs(false);
      setRefreshing(false);
    }
  }, [selectedSource]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Auto-poll while any document is processing
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === "pending" || d.status === "processing"
    );
    if (!hasPending || !selectedSource) return;

    const interval = setInterval(async () => {
      try {
        const docs = await api.getDocuments(selectedSource.id);
        setDocuments(docs);
        const stillPending = docs.some(
          (d) => d.status === "pending" || d.status === "processing"
        );
        if (!stillPending) {
          clearInterval(interval);
          loadSources();
        }
      } catch {
        // Background refresh failure is non-critical
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [documents, selectedSource, loadSources]);

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim()) return;
    setCreating(true);
    createSourceWorkflow.start("create_source_submitted", { source_type: sourceType });

    try {
      const created = await api.createSource({
        name: sourceName.trim(),
        source_type: sourceType,
        target_url: sourceType === "website_crawl" ? targetUrl.trim() : undefined,
      });
      setSources((prev) => [created, ...prev]);
      setSelectedSource(created);
      setShowModal(false);
      setSourceName("");
      setTargetUrl("");
      createSourceWorkflow.complete({ source_id: created.id });
      toast({ type: "success", message: `“${created.name}” is ready for documents.` });
    } catch (err: any) {
      createSourceWorkflow.stepFailed("CREATE_SOURCE_ERROR", { status: err.status });
      toast({ type: "error", message: err.message || "We couldn't create this collection. Please try again." });
    } finally {
      setCreating(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!selectedSource || files.length === 0) return;

    const valid = files.filter((file) => {
      const dot = file.name.lastIndexOf(".");
      const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
      return ACCEPTED_EXTENSIONS.includes(ext);
    });

    if (valid.length === 0) {
      const hasOffice = files.some((f) => {
        const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
        return [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt"].includes(ext);
      });
      if (hasOffice) {
        setUploadError("Word and Excel documents must be saved as PDF before uploading. We accept PDF, TXT, Markdown, and CSV.");
      } else {
        setUploadError("Please choose PDF, TXT, Markdown, or CSV files (up to 50MB each).");
      }
      return;
    }
    if (valid.length < files.length) {
      setUploadError(`${files.length - valid.length} unsupported file(s) were skipped.`);
    } else {
      setUploadError(null);
    }

    const totalBytes = valid.reduce((acc, f) => acc + f.size, 0);
    const extensions = Array.from(
      new Set(valid.map((f) => f.name.split(".").pop()?.toLowerCase() || "unknown"))
    );

    uploadWorkflow.start("files_selected", {
      file_count: valid.length,
      total_bytes: totalBytes,
      extensions,
      source_id: selectedSource.id,
    });

    setUploading(true);
    setUploadCount(valid.length);

    try {
      await api.uploadDocuments(selectedSource.id, valid);
      uploadWorkflow.complete({ file_count: valid.length, total_bytes: totalBytes });
      await loadDocuments();
      await loadSources();
      toast({
        type: "success",
        message: `${valid.length} file${valid.length === 1 ? "" : "s"} added. Processing now.`,
      });
    } catch (err: any) {
      uploadWorkflow.stepFailed("UPLOAD_ERROR", { status: err.status });
      trackFriction("upload_failed", selectedSource.id, { status: err.status });
      setUploadError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadCount(0);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await uploadFiles(files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files || []);
    await uploadFiles(files);
  };

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    setDeletingDocId(docToDelete.id);
    try {
      await api.deleteDocument(docToDelete.id);
      setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id));
      await loadSources();
      toast({ type: "success", message: `Deleted ${docToDelete.filename}` });
      setDocToDelete(null);
    } catch (err: any) {
      toast({ type: "error", message: err.message || "We couldn't delete that file. Please try again." });
    } finally {
      setIsDeleting(false);
      setDeletingDocId(null);
    }
  };

  const handleRetryDocument = async (docId: string) => {
    setRetryingDocId(docId);
    try {
      await api.retryDocument(docId);
      await loadDocuments();
      toast({ type: "success", message: "Document queued for processing again." });
    } catch (err: any) {
      toast({ type: "error", message: err.message || "We couldn't retry that file. Please try again." });
    } finally {
      setRetryingDocId(null);
    }
  };

  const handleDeleteSource = async () => {
    if (!sourceToDelete) return;
    setIsDeletingSource(true);
    try {
      await api.deleteSource(sourceToDelete.id);
      setDocuments([]);
      setSelectedSource(null);
      await loadSources();
      toast({ type: "success", message: `Deleted ${sourceToDelete.name}` });
      setSourceToDelete(null);
    } catch (err: any) {
      toast({ type: "error", message: err.message || "We couldn't delete that collection. Please try again." });
    } finally {
      setIsDeletingSource(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(docFilter.toLowerCase())
  );

  const totalDocs = documents.length;
  const readyDocs = documents.filter((d) => d.status === "ready").length;
  const failedDocs = documents.filter((d) => d.status === "failed").length;
  const pendingDocs = totalDocs - readyDocs - failedDocs;
  const progressPct = totalDocs ? Math.round(((readyDocs + failedDocs) / totalDocs) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-[420px] lg:col-span-8" />
        </div>
      </div>
    );
  }

  const hasSources = sources.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge"
        description="The documents your assistants can answer from. Group them by topic."
        actions={
          hasSources ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDirectSearchModal(true);
                  setDirectSearchHasSearched(false);
                  setDirectSearchResults([]);
                }}
                className="gap-2 touch-manipulation"
              >
                <Search className="h-4 w-4 text-primary" />
                Search knowledge
              </Button>
              <Button onClick={() => setShowModal(true)} className="gap-2 touch-manipulation">
                <Plus className="h-4 w-4" />
                Add knowledge
              </Button>
            </div>
          ) : undefined
        }
      />

      <DemoIntegrationHub onSourceImported={handleSourceImported} />

      {pageError && <Alert type="destructive" title="Something went wrong" message={pageError} />}

      {!hasSources ? (
        <EmptyState
          icon={Database}
          title="Bring in your first documents"
          description="Create a collection for a topic — like “Product docs” or “Policies” — then add files to it."
          actionLabel="Create a collection"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Source list */}
          <aside className="lg:col-span-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Collections
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">{sources.length}</span>
            </div>

            <div className="max-h-[320px] space-y-1.5 overflow-y-auto pe-1 lg:max-h-[calc(100vh-260px)]">
              {sources.map((source) => {
                const isSelected = selectedSource?.id === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setSelectedSource(source)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors",
                      isSelected
                        ? "border-border bg-card shadow-sm ring-1 ring-border"
                        : "border-transparent bg-transparent hover:bg-card hover:shadow-sm"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        isSelected
                          ? "bg-accent-soft text-accent"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {source.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          {source.document_count ?? 0} document
                          {(source.document_count ?? 0) === 1 ? "" : "s"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {sourceTypeLabel(source)}
                        </span>
                      </span>
                    </span>
                    <StatusPill
                      status={source.document_count ? source.status : "draft"}
                      label={source.document_count ? undefined : "Empty"}
                    />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New collection
            </button>
          </aside>

          {/* Detail */}
          <section className="min-w-0 lg:col-span-8">
            {selectedSource ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                          {selectedSource.name}
                        </h2>
                        <StatusPill
                          status={selectedSource.document_count ? selectedSource.status : "draft"}
                          label={selectedSource.document_count ? undefined : "Empty"}
                        />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{sourceTypeLabel(selectedSource)}</span>
                        {selectedSource.target_url && (
                          <>
                            <span aria-hidden="true">·</span>
                            <a
                              href={selectedSource.target_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-[260px] items-center gap-1 truncate hover:text-foreground hover:underline"
                            >
                              {selectedSource.target_url}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </>
                        )}
                      </p>
                      {selectedSource.error_message && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {describeProcessingError(selectedSource.error_message)}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenameValue(selectedSource.name);
                          setShowRenameModal(true);
                        }}
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Rename ${selectedSource.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Rename</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadDocuments}
                        isLoading={refreshing}
                        className="gap-1.5"
                        aria-label="Refresh documents"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Refresh</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSourceToDelete({ id: selectedSource.id, name: selectedSource.name })
                        }
                        className="gap-1.5 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${selectedSource.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </div>
                  </div>

                  {/* Upload dropzone */}
                  <div
                    onDragEnter={handleDragEnter}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "mt-5 rounded-xl border border-dashed transition-colors",
                      isDragging
                        ? "border-accent bg-accent-soft"
                        : "border-border bg-background/60",
                      documents.length > 0 && !uploading ? "px-4 py-3" : "p-6 text-center"
                    )}
                  >
                    {uploading ? (
                      <div className="space-y-2 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                          <Upload className="h-4 w-4 animate-pulse" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          Uploading {uploadCount} file{uploadCount === 1 ? "" : "s"}…
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Keep this tab open while we prepare them.
                        </p>
                      </div>
                    ) : documents.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                          <Upload className="h-4 w-4" />
                          {isDragging ? "Drop to add these files" : "Add more content to this collection"}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPasteTitle("");
                              setPasteContent("");
                              setShowPasteModal(true);
                            }}
                            className="gap-1.5"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Paste text
                          </Button>
                          <label className="inline-flex cursor-pointer">
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              accept={ACCEPTED_EXTENSIONS.join(",")}
                              onChange={handleFileInput}
                              disabled={uploading}
                              aria-label="Upload files"
                            />
                            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                              <Plus className="h-3.5 w-3.5" />
                              Choose files
                            </span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Upload className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Drop files here, or choose from your device
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            PDF, TXT, Markdown, or CSV up to 50MB · multiple files welcome
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-2.5 pt-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPasteTitle("");
                              setPasteContent("");
                              setShowPasteModal(true);
                            }}
                            className="gap-1.5"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Paste text
                          </Button>
                          <label className="inline-flex cursor-pointer">
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              accept={ACCEPTED_EXTENSIONS.join(",")}
                              onChange={handleFileInput}
                              disabled={uploading}
                              aria-label="Upload files"
                            />
                            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                              <Plus className="h-3.5 w-3.5" />
                              Choose files
                            </span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {uploadError && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>

                {/* Documents */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Documents</h3>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {documents.length}
                      </span>
                    </div>

                    {documents.length > 0 && (
                        <div className="relative w-full sm:w-64">
                          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Filter documents…"
                            value={docFilter}
                            onChange={(e) => setDocFilter(e.target.value)}
                            aria-label="Filter documents"
                            className="h-9 w-full rounded-lg border border-border bg-input ps-9 pe-8 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                          />
                          {docFilter && (
                            <button
                              type="button"
                              onClick={() => setDocFilter("")}
                              aria-label="Clear document filter"
                              className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                    )}
                  </div>

                  {totalDocs > 0 && (pendingDocs > 0 || failedDocs > 0) && (
                    <div className="border-b border-border/70 px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          {pendingDocs > 0
                            ? `Preparing ${pendingDocs} file${pendingDocs === 1 ? "" : "s"}…`
                            : `${failedDocs} file${failedDocs === 1 ? "" : "s"} need${failedDocs === 1 ? "s" : ""} attention.`}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {readyDocs} of {totalDocs} ready
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPct}
                        aria-label="File preparation progress"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700 ease-out",
                            failedDocs > 0 ? "bg-warning" : "bg-accent"
                          )}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      {pendingDocs > 0 && (
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          You can keep working — this updates on its own.
                        </p>
                      )}
                    </div>
                  )}

                  {totalDocs > 0 && pendingDocs === 0 && failedDocs === 0 && (
                    <div className="flex items-center gap-1.5 border-b border-border/70 px-5 py-2.5 text-[11px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                      All {totalDocs} file{totalDocs === 1 ? "" : "s"} ready to answer from.
                    </div>
                  )}

                  {loadingDocs ? (
                    <div className="space-y-2 p-4">
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                      <Skeleton className="h-12" />
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="px-5 py-12 text-center">
                      <FileText className="mx-auto h-5 w-5 text-muted-foreground/70" />
                      <p className="mt-2 text-sm font-medium text-foreground">No documents yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Upload a few files above to get started.
                      </p>
                    </div>
                  ) : filteredDocuments.length === 0 ? (
                    <div className="space-y-2 px-5 py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        No documents match “{docFilter}”.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocFilter("")}
                        className="text-xs text-primary"
                      >
                        Clear filter
                      </Button>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {filteredDocuments.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 sm:px-5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <FileText className="h-4 w-4" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-foreground">
                              {doc.filename}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatBytes(doc.file_size_bytes, locale)}
                            </div>
                            {doc.status === "failed" && doc.error_message && (
                              <div className="mt-0.5 line-clamp-2 text-[11px] text-destructive">
                                {describeProcessingError(doc.error_message)}
                              </div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <StatusPill status={doc.status} />
                            {doc.status === "failed" && (
                              <button
                                type="button"
                                disabled={retryingDocId === doc.id}
                                onClick={() => handleRetryDocument(doc.id)}
                                className="inline-flex h-8 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-warning transition-colors hover:bg-warning/10 disabled:opacity-50 touch-manipulation"
                              >
                                <RefreshCw
                                  className={cn("h-3 w-3", retryingDocId === doc.id && "animate-spin")}
                                />
                                Retry
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={deletingDocId === doc.id}
                              onClick={() => setDocToDelete({ id: doc.id, filename: doc.filename })}
                              className="flex h-8 w-8 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 touch-manipulation"
                              aria-label={`Delete ${doc.filename}`}
                              title="Delete document"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
                Select a collection to view its documents.
              </div>
            )}
          </section>
        </div>
      )}

      <AlertDialog
        isOpen={Boolean(docToDelete)}
        onClose={() => {
          if (!isDeleting) setDocToDelete(null);
        }}
        onConfirm={handleDeleteDocument}
        title="Delete document"
        description={
          <>
            <span className="font-medium text-foreground">{docToDelete?.filename}</span> will be
            removed, along with everything assistants learned from it. This cannot be undone.
          </>
        }
        confirmText="Delete document"
        cancelText="Cancel"
        isLoading={isDeleting}
        variant="destructive"
      />

      <AlertDialog
        isOpen={Boolean(sourceToDelete)}
        onClose={() => {
          if (!isDeletingSource) setSourceToDelete(null);
        }}
        onConfirm={handleDeleteSource}
        title="Delete collection"
        description={
          <>
            <span className="font-medium text-foreground">{sourceToDelete?.name}</span> and every
            document inside it will be removed from the assistants that use it. This cannot be
            undone.
          </>
        }
        confirmText="Delete collection"
        cancelText="Cancel"
        isLoading={isDeletingSource}
        variant="destructive"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="New collection"
        description="Group documents by topic or team."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSource} className="space-y-5">
          <Input
            label="Collection name"
            type="text"
            required
            autoFocus
            placeholder="e.g. Product documentation"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />

          <CustomSelect
            label="Where does it come from?"
            value={sourceType}
            onChange={(value) => setSourceType(value as typeof sourceType)}
            options={[
              {
                value: "file_upload",
                label: "Files from my device",
                description: "PDF, TXT, Markdown, or CSV",
                icon: <Upload className="h-4 w-4" />,
              },
              {
                value: "website_crawl",
                label: "A public web page",
                description: "Import the page content",
                icon: <ExternalLink className="h-4 w-4" />,
              },
            ]}
          />

          {sourceType === "website_crawl" && (
            <Input
              label="Page URL"
              type="url"
              required
              placeholder="https://docs.example.com"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={creating}
              disabled={!sourceName.trim() || (sourceType === "website_crawl" && !targetUrl.trim())}
            >
              Create collection
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rename Collection Modal */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        title="Rename collection"
        description="Change the display name of this collection."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedSource || !renameValue.trim()) return;
            setIsRenaming(true);
            try {
              const updated = await api.updateSource(selectedSource.id, {
                name: renameValue.trim(),
              });
              setSources((prev) =>
                prev.map((s) => (s.id === updated.id ? { ...s, name: updated.name } : s))
              );
              setSelectedSource((prev) =>
                prev && prev.id === updated.id ? { ...prev, name: updated.name } : prev
              );
              toast({
                type: "success",
                message: `Successfully renamed to "${updated.name}".`,
              });
              setShowRenameModal(false);
            } catch (err: any) {
              toast({
                type: "error",
                message: err.message || "Could not rename collection.",
              });
            } finally {
              setIsRenaming(false);
            }
          }}
          className="space-y-4 pt-2"
        >
          <Input
            label="Collection name"
            required
            placeholder="e.g. Employee Handbook"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowRenameModal(false)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isRenaming}
              disabled={!renameValue.trim() || Boolean(selectedSource && renameValue.trim() === selectedSource.name)}
            >
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Paste Text Modal */}
      <Modal
        isOpen={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        title="Paste text or notes"
        description="Add raw text, meeting notes, policies, or snippets directly into this collection."
        maxWidth="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedSource || !pasteTitle.trim() || !pasteContent.trim()) return;
            setIsPasting(true);
            try {
              const doc = await api.pasteTextDocument(
                selectedSource.id,
                pasteTitle.trim(),
                pasteContent.trim()
              );
              setDocuments((prev) => [doc, ...prev]);
              toast({
                type: "success",
                message: `Added "${doc.filename}". Processing started.`,
              });
              setShowPasteModal(false);
              setPasteTitle("");
              setPasteContent("");
            } catch (err: any) {
              toast({
                type: "error",
                message: err.message || "Could not save pasted text.",
              });
            } finally {
              setIsPasting(false);
            }
          }}
          className="space-y-4 pt-2"
        >
          <Input
            label="Document title"
            required
            placeholder="e.g. Q3 SLA Agreement, Remote Work Guidelines"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            autoFocus
          />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Content</label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {pasteContent.length.toLocaleString()} characters ·{" "}
                {pasteContent.trim() ? pasteContent.trim().split(/\s+/).length : 0} words
              </span>
            </div>
            <textarea
              required
              rows={8}
              placeholder="Paste text, notes, guidelines, or markdown content here..."
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPasteModal(false)}
              disabled={isPasting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPasting}
              disabled={!pasteTitle.trim() || !pasteContent.trim()}
            >
              Add to knowledge
            </Button>
          </div>
        </form>
      </Modal>

      {/* Knowledge Search Modal */}
      <Modal
        isOpen={showDirectSearchModal}
        onClose={() => setShowDirectSearchModal(false)}
        title="Search knowledge"
        description={
          selectedSource
            ? `Search across documents in “${selectedSource.name}”.`
            : "Search across all documents in your knowledge base."
        }
      >
        {selectedSource && (!documents || documents.length === 0 || !documents.some(d => d.status === "ready")) ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">No documents ready yet</p>
            <p className="text-xs text-muted-foreground">
              Add at least one document and wait for processing to finish before searching.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleDirectSearch} className="space-y-4 pt-2">
              <div className="flex gap-2">
                <Input
                  required
                  placeholder="Search concepts, policies, product terms..."
                  value={directSearchQuery}
                  onChange={(e) => setDirectSearchQuery(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" isLoading={isSearchingDirect} disabled={!directSearchQuery.trim()}>
                  Search
                </Button>
              </div>
            </form>

            <div className="mt-4 max-h-[400px] overflow-y-auto space-y-3">
              {directSearchHasSearched && directSearchResults.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No matching passages found for “{directSearchQuery}”.
                </div>
              )}

              {directSearchResults.map((res, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px]">
                    <span className="font-semibold text-foreground truncate max-w-[70%]">
                      {res.document_name || res.source_name || "Document excerpt"}
                    </span>
                    <span className="text-accent font-medium">
                      {Math.round(res.score * 100)}% match
                    </span>
                  </div>
                  <p className="text-foreground/90 leading-relaxed font-sans line-clamp-4">
                    {res.text}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
