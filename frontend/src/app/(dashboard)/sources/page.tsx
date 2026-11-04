"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { KnowledgeSource, DocumentItem } from "@/types";
import { formatBytes } from "@/lib/utils";
import {
  AlertCircle,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
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
import { useStoryStage } from "@/lib/story-stage-context";

const ACCEPTED_EXTENSIONS = [".txt", ".pdf", ".md", ".csv"];

function describeProcessingError(raw?: string | null): string {
  const text = (raw || "").toLowerCase();
  if (text.includes("too large") || text.includes("size limit")) {
    return "This file is too large to prepare. Try a smaller copy.";
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
  const uploadWorkflow = useWorkflow("wf_upload_documents");
  const createSourceWorkflow = useWorkflow("wf_create_source");
  const { trackFriction } = useTelemetry();
  const { triggerChunkDrop } = useStoryStage();

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

  const loadSources = useCallback(async () => {
    try {
      const list = await api.getSources();
      setSources(list);
      setSelectedSource((prev) => {
        if (!prev) return list[0] || null;
        return list.find((s) => s.id === prev.id) || list[0] || null;
      });
    } catch (err: any) {
      setPageError(err.message || "Could not load your knowledge sources.");
    } finally {
      setLoading(false);
    }
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
      setPageError(err.message || "Could not load documents for this source.");
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
      } catch {
        // Background refresh failure is non-critical
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [documents, selectedSource]);

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
      toast({ type: "error", message: err.message || "Failed to create knowledge source" });
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
      setUploadError("Choose PDF, TXT, Markdown, or CSV files.");
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
    triggerChunkDrop(valid.length);

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
      toast({ type: "error", message: err.message || "Failed to delete document" });
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
      toast({ type: "error", message: err.message || "Failed to retry document" });
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
      toast({ type: "error", message: err.message || "Failed to delete knowledge source" });
    } finally {
      setIsDeletingSource(false);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(docFilter.toLowerCase())
  );

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
            <Button onClick={() => setShowModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add source
            </Button>
          ) : undefined
        }
      />

      {pageError && <Alert type="destructive" title="Something went wrong" message={pageError} />}

      {!hasSources ? (
        <EmptyState
          icon={Database}
          title="Bring in your first documents"
          description="Create a source for a topic — like “Product docs” or “Policies” — then upload the files inside it."
          actionLabel="Create a source"
          onAction={() => setShowModal(true)}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Source list */}
          <aside className="lg:col-span-4">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sources
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
                          {source.source_type === "file_upload" ? "Files" : "Website"}
                        </span>
                      </span>
                    </span>
                    <StatusPill status={source.status} />
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
              Add another source
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
                        <StatusPill status={selectedSource.status} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{selectedSource.source_type === "file_upload" ? "File upload" : "Website"}</span>
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
                      "mt-5 rounded-xl border border-dashed p-6 text-center transition-colors",
                      isDragging
                        ? "border-accent bg-accent-soft"
                        : "border-border bg-background/60"
                    )}
                  >
                    {uploading ? (
                      <div className="space-y-2">
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
                    ) : (
                      <div className="space-y-2">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Upload className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          Drop files here, or choose from your device
                        </p>
                        <p className="text-xs text-muted-foreground">PDF, TXT, Markdown, or CSV · multiple files welcome</p>
                        <label className="mt-1 inline-flex cursor-pointer">
                          <input
                            type="file"
                            multiple
                            className="sr-only"
                            accept={ACCEPTED_EXTENSIONS.join(",")}
                            onChange={handleFileInput}
                            disabled={uploading}
                          />
                          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/70">
                            <Plus className="h-3.5 w-3.5" />
                            Choose files
                          </span>
                        </label>
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
                      <div className="relative w-full sm:w-56">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Filter documents…"
                          value={docFilter}
                          onChange={(e) => setDocFilter(e.target.value)}
                          className="h-9 w-full rounded-lg border border-border bg-input ps-9 pe-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                    )}
                  </div>

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
                    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No documents match “{docFilter}”.
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
                              {formatBytes(doc.file_size_bytes)}
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
                                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
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
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
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
                Select a source to view its documents.
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
        title="Delete source"
        description={
          <>
            <span className="font-medium text-foreground">{sourceToDelete?.name}</span> and every
            document inside it will be removed from the assistants that use it. This cannot be
            undone.
          </>
        }
        confirmText="Delete source"
        cancelText="Cancel"
        isLoading={isDeletingSource}
        variant="destructive"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add a knowledge source"
        description="A source groups related documents, like a topic or a team."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSource} className="space-y-5">
          <Input
            label="Name"
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
              Create source
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
