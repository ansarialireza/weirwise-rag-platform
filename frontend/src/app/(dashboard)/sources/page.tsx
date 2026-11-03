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
  Trash2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { CustomSelect } from "@/components/ui/custom-select";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useWorkflow, useTelemetry } from "@/lib/telemetry";
import { useStoryStage } from "@/lib/story-stage-context";
import { BrutalistLoader } from "@/components/ui/brutalist-loader";

export default function SourcesKnowledgePage() {
  const params = useParams();
  
  const { toast } = useToast();
  const uploadWorkflow = useWorkflow("wf_upload_documents");
  const createSourceWorkflow = useWorkflow("wf_create_source");
  const { trackAction, trackFriction } = useTelemetry();
  const { triggerChunkDrop } = useStoryStage();

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docFilter, setDocFilter] = useState("");
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<{ id: string; filename: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
      const list = await api.getSources();
      setSources(list);
      if (list.length > 0 && !selectedSource) {
        setSelectedSource(list[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSource]);

  useEffect(() => {
    if (true) {
      loadSources();
    }
  }, [loadSources]);

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
      const created = await api.createSource( {
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

    const fileCount = files.length;
    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    const extensions = Array.from(new Set(files.map((f) => f.name.split(".").pop()?.toLowerCase() || "unknown")));

    uploadWorkflow.start("files_selected", {
      file_count: fileCount,
      total_bytes: totalBytes,
      extensions,
      source_id: selectedSource.id,
    });

    setUploading(true);
    setUploadError(null);
    triggerChunkDrop(fileCount);

    try {
      await api.uploadDocuments(selectedSource.id, files);
      uploadWorkflow.complete({
        file_count: fileCount,
        total_bytes: totalBytes,
      });
      await loadDocuments();
      await loadSources();
    } catch (err: any) {
      uploadWorkflow.stepFailed("UPLOAD_ERROR", {
        status: err.status,
      });
      setUploadError(err.message || "Upload processing failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    setDeletingDocId(docToDelete.id);
    try {
      await api.deleteDocument(docToDelete.id);
      setDocuments(documents.filter((d) => d.id !== docToDelete.id));
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
        <BrutalistLoader label="INDEXING KNOWLEDGE SOURCES" />
      </div>
    );
  }

  const hasSources = sources.length > 0;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Top Header: Clean, Typographic, Precision-Engineered Brutalist-Tech */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Knowledge Base
          </h1>
          {hasSources && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm border border-zinc-800 bg-zinc-900/50 text-zinc-400">
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </span>
          )}
        </div>

        {hasSources && (
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="sm"
            className="gap-2 shrink-0 self-start sm:self-center"
          >
            <Plus className="h-4 w-4" /> Add Source
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
        /* Minimalist Zero-State: Transparent/subtle fill with ultra-thin delicate border */
        <div className="rounded-md border border-zinc-800 bg-zinc-950/20 py-20 px-8 text-center flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-150">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-[#46C7D6]">
            <Database className="h-5 w-5 stroke-[1.5]" />
          </div>

          <div>
            <h2 className="text-base sm:text-lg font-medium text-foreground tracking-tight">
              No knowledge sources
            </h2>
          </div>

          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            size="sm"
            className="gap-2 mt-2"
          >
            <Plus className="h-4 w-4" /> Add Source
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Clean Datasets List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
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
                    className={`w-full text-left p-3.5 rounded-lg border transition-all duration-150 flex items-center justify-between gap-3 ${
                      isSelected
                        ? "border-zinc-700 bg-zinc-900/50 text-foreground"
                        : "border-zinc-850 border-zinc-800/60 bg-transparent hover:border-zinc-700 hover:bg-zinc-900/30 text-zinc-400 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-md border shrink-0 ${
                        isSelected
                          ? "border-zinc-700 bg-zinc-800/80 text-foreground"
                          : "border-zinc-800 bg-zinc-900/40 text-zinc-500"
                      }`}>
                        <FolderOpen className="h-4 w-4 stroke-[1.5]" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs sm:text-sm font-medium text-foreground truncate">
                          {src.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.2 rounded border border-zinc-800 bg-zinc-950/60 text-zinc-400 uppercase">
                            {src.source_type === "file_upload" ? "Files" : "Web Crawl"}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            {src.document_count ?? 0} docs
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {formatStatus(src.status)}
                      </span>
                      <ChevronRight className={`h-4 w-4 transition-transform ${isSelected ? "text-foreground" : "text-zinc-600"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Seamless Integrated Document View */}
          <div className="lg:col-span-8 space-y-6">
            {selectedSource ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/20 p-6 sm:p-7 space-y-6">
                {/* Clean Top Action Bar for Selected Dataset */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/60">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight truncate">
                        {selectedSource.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 text-[10px] font-mono text-zinc-400 uppercase">
                        {selectedSource.source_type}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 flex items-center gap-2 font-mono">
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {formatStatus(selectedSource.status)}
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span>1536-dim vector embeddings</span>
                      {selectedSource.target_url && (
                        <>
                          <span className="text-zinc-600">•</span>
                          <span className="truncate max-w-xs">{selectedSource.target_url}</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadDocuments}
                      isLoading={refreshing}
                      className="gap-1.5"
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
                        className="pointer-events-none gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" /> Upload Files
                      </Button>
                    </label>
                  </div>
                </div>

                {/* Documents List & Mass Management */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400 px-0.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-foreground font-medium">Indexed Documents ({documents.length})</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/40 text-zinc-400">
                        PDF, TXT, MD, CSV
                      </span>
                    </div>

                    {documents.length > 5 && (
                      <div className="relative w-full sm:w-60">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Filter documents..."
                          value={docFilter}
                          onChange={(e) => setDocFilter(e.target.value)}
                          className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-zinc-800 bg-zinc-950/40 text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-white/20"
                        />
                      </div>
                    )}
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-lg border border-zinc-850 border-zinc-800/60 bg-transparent py-14 px-4 text-center space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-400 mx-auto">
                        <Upload className="h-4 w-4 stroke-[1.5]" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm font-medium text-foreground">No documents uploaded yet</p>
                        <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                          Upload files to chunk, calculate embeddings, and index them for assistant retrieval.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800/80 overflow-hidden bg-transparent">
                      {documents
                        .filter((d) => d.filename.toLowerCase().includes(docFilter.toLowerCase()))
                        .map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-3.5 hover:bg-zinc-900/30 transition-colors gap-3"
                          >
                            <div className="flex items-center gap-3 truncate min-w-0">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/40 text-zinc-400 shrink-0">
                                <FileText className="h-4 w-4 stroke-[1.5]" />
                              </div>
                              <div className="truncate min-w-0">
                                <div className="text-xs sm:text-sm font-medium text-foreground truncate">
                                  {doc.filename}
                                </div>
                                <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                  {formatBytes(doc.file_size_bytes)} &middot; {doc.mime_type || "text/plain"}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                {formatStatus(doc.status)}
                              </span>

                              <button
                                type="button"
                                disabled={deletingDocId === doc.id}
                                onClick={() => setDocToDelete({ id: doc.id, filename: doc.filename })}
                                className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:bg-red-950/30 hover:text-red-400 transition-colors disabled:opacity-50"
                                title="Delete document"
                                aria-label="Delete document"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/20 py-16 text-center text-xs text-zinc-400">
                Select a dataset from the left column to view its documents and indexed vectors.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Document Premium Alert Dialog */}
      <AlertDialog
        isOpen={Boolean(docToDelete)}
        onClose={() => {
          if (!isDeleting) setDocToDelete(null);
        }}
        onConfirm={handleDeleteDocument}
        title="Delete Document"
        description={
          <>
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground font-mono">
              {docToDelete?.filename}
            </span>
            ? This will remove the file and instantly wipe all associated vector embeddings from the database. This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        variant="destructive"
      />

      {/* 
        Responsive Creation Component:
        - Mobile (< md): Native Bottom Drawer with swipe-down dismissal
        - Desktop (>= md): Floating Dialog Modal centered on screen
      */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-150 p-0 md:p-6"
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
              "w-full bg-[#0c0d10] text-foreground border-zinc-800 shadow-2xl flex flex-col relative",
              // Mobile (< md): Slides up from bottom as Drawer
              "mt-auto md:mt-0 rounded-t-md md:rounded-md border-t md:border border-x-0 md:border-x max-h-[90vh] md:max-h-[85vh] md:max-w-lg animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-150"
            )}
          >
            {/* Mobile Swipe-Down Handle */}
            <div className="flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing">
              <div className="h-1 w-12 rounded-sm bg-zinc-700" />
            </div>

            {/* Header with Title and 'X' Button */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-zinc-800/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900/60 text-[#46C7D6] shrink-0">
                  <Database className="h-4 w-4 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight">Add Knowledge Source</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-8 w-8 flex items-center justify-center rounded-sm border border-transparent hover:border-zinc-800 text-zinc-400 hover:text-foreground hover:bg-zinc-800/60 active:scale-95 transition-all"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateSource} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono font-medium text-zinc-300">
                    Source Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Employee Handbook"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950/40 px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-white/20 transition-all"
                  />
                </div>

                {/* Custom Select */}
                <div className="space-y-1.5">
                  <CustomSelect
                    label="Source Type"
                    value={sourceType}
                    onChange={(val) => setSourceType(val as any)}
                    triggerClassName="border-zinc-800 bg-zinc-950/40 text-foreground focus:ring-1 focus:ring-white/20 focus:border-zinc-500 rounded-md"
                    options={[
                      {
                        value: "file_upload",
                        label: "File Upload (PDF, TXT, Markdown, CSV)",
                        description: "Upload local files to chunk and generate 1536-dim vector embeddings",
                        icon: <Upload className="h-4 w-4 stroke-[1.5]" />,
                      },
                      {
                        value: "website_crawl",
                        label: "Website URL Crawl",
                        description: "Extract, clean, and vectorize live documentation or web domains",
                        icon: <ExternalLink className="h-4 w-4 stroke-[1.5]" />,
                      },
                    ]}
                  />
                </div>

                {sourceType === "website_crawl" && (
                  <div className="space-y-1.5 animate-in fade-in duration-150">
                    <label className="text-xs font-mono font-medium text-zinc-300">Target URL</label>
                    <input
                      type="url"
                      required
                      placeholder="https://docs.example.com"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950/40 px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-white/20 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="px-6 sm:px-8 py-4 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end gap-3 shrink-0">
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
                  className="px-5"
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
