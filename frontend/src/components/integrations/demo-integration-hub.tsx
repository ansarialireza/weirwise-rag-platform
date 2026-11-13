"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText, FolderOpen, HardDrive, RefreshCw, Store, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { BusinessIntegration, MockDriveItem } from "@/types";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProviderType = "shopify" | "google_drive";
type FolderPathItem = { id: string | null; name: string };

function getStringSetting(integration: BusinessIntegration, key: string): string | null {
  const value = integration.config[key];
  return typeof value === "string" ? value : null;
}

function integrationStatusLabel(integration: BusinessIntegration, dict: ReturnType<typeof useI18n>["dict"]) {
  if (integration.sync_status === "queued") return dict.integrations.statusQueued;
  if (integration.sync_status === "syncing") return dict.integrations.statusSyncing;
  if (integration.sync_status === "failed") return dict.integrations.statusFailed;
  return integration.last_synced_at
    ? dict.integrations.statusCompleted
    : dict.integrations.statusNotSynced;
}

interface DemoIntegrationHubProps {
  onSourceImported: (sourceId: string) => Promise<void>;
}

export function DemoIntegrationHub({ onSourceImported }: DemoIntegrationHubProps) {
  const { dict, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [integrations, setIntegrations] = useState<BusinessIntegration[]>([]);
  const integrationsRef = useRef<BusinessIntegration[]>([]);
  const pollErrorShown = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<ProviderType | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveItems, setDriveItems] = useState<MockDriveItem[]>([]);
  const [driveItemsLoading, setDriveItemsLoading] = useState(false);
  const [driveItemsError, setDriveItemsError] = useState(false);
  const [folderPath, setFolderPath] = useState<FolderPathItem[]>([
    { id: null, name: dict.integrations.rootFolder },
  ]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google_status");
    const demoStatus = params.get("demo");

    if (googleStatus) {
      params.delete("google_status");
      params.delete("account");
      const query = params.toString();
      router.replace(query ? `/sources?${query}` : "/sources");
      if (googleStatus === "connected") {
        toast({ type: "success", message: dict.integrations.connected });
      } else if (googleStatus === "cancelled") {
        toast({ type: "info", message: dict.integrations.oauthCancelled });
      } else {
        toast({ type: "error", message: dict.integrations.connectFailed });
      }
    } else if (demoStatus) {
      params.delete("demo");
      const query = params.toString();
      router.replace(query ? `/sources?${query}` : "/sources");
      toast({
        type: demoStatus === "connected" ? "success" : "info",
        message: demoStatus === "connected" ? dict.integrations.connected : dict.integrations.oauthCancelled,
      });
    }
  }, [dict.integrations, router, toast]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.getMockIntegrationCapabilities().catch(() => ({ enabled: false, providers: [] })),
      api.getIntegrations(),
    ])
      .then(([capabilities, allIntegrations]) => {
        if (!active) return;
        setEnabled(capabilities.enabled);
        integrationsRef.current = allIntegrations;
        setIntegrations(allIntegrations);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeSync = integrations.some((integration) =>
    ["queued", "syncing"].includes(integration.sync_status)
  );

  useEffect(() => {
    if (!activeSync) return;
    let refreshing = false;
    const interval = setInterval(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await api.getIntegrations();
        pollErrorShown.current = false;
        const previous = integrationsRef.current;
        integrationsRef.current = next;
        setIntegrations(next);
        for (const integration of next) {
          const wasActive = previous.some(
            (item) =>
              item.id === integration.id &&
              ["queued", "syncing"].includes(item.sync_status)
          );
          if (!wasActive) continue;
          setSyncingId(null);
          if (integration.sync_status === "completed") {
            toast({ type: "success", message: dict.integrations.syncCompleted });
            const sourceId = getStringSetting(integration, "catalog_source_id");
            if (sourceId) await onSourceImported(sourceId);
          } else if (integration.sync_status === "failed") {
            toast({
              type: "error",
              message: integration.last_error || dict.integrations.syncFailed,
            });
          }
        }
      } catch (error) {
        if (!pollErrorShown.current) {
          pollErrorShown.current = true;
          toast({
            type: "error",
            message: error instanceof Error ? error.message : dict.integrations.loadFailed,
          });
        }
      } finally {
        refreshing = false;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [activeSync, dict.integrations, onSourceImported, toast]);

  const shopifyIntegration = integrations.find((item) => item.provider === "shopify" && item.is_active);
  const driveIntegration = integrations.find((item) => item.provider === "google_drive" && item.is_active);
  const currentFolder = folderPath[folderPath.length - 1];

  useEffect(() => {
    if (!driveModalOpen || !driveIntegration) return;
    let active = true;
    setDriveItemsLoading(true);
    setDriveItemsError(false);
    api
      .getGoogleDriveItems(driveIntegration.id, currentFolder?.id)
      .then((items) => {
        if (active) setDriveItems(items);
      })
      .catch(() => {
        if (active) setDriveItemsError(true);
      })
      .finally(() => {
        if (active) setDriveItemsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentFolder?.id, driveIntegration, driveModalOpen]);

  const startOAuth = async (provider: ProviderType) => {
    setConnectingProvider(provider);
    try {
      if (provider === "google_drive") {
        try {
          const { authorization_url } = await api.startGoogleDriveOAuth();
          window.location.assign(authorization_url);
          return;
        } catch (realError) {
          // Fallback to demo OAuth if real Google credentials are not yet configured on server
          if (enabled) {
            const { authorization_url } = await api.startDemoIntegrationOAuth("google_drive");
            window.location.assign(authorization_url);
            return;
          }
          throw realError;
        }
      } else {
        router.push("/settings");
      }
    } catch (error) {
      toast({
        type: "error",
        message: error instanceof Error ? error.message : dict.integrations.connectFailed,
      });
      setConnectingProvider(null);
    }
  };

  const syncIntegration = async (integration: BusinessIntegration, fileIds?: string[]) => {
    setSyncingId(integration.id);
    try {
      await api.syncIntegration(integration.id, fileIds);
      setIntegrations((current) => {
        const next = current.map((item) =>
          item.id === integration.id ? { ...item, sync_status: "queued", last_error: null } : item
        );
        integrationsRef.current = next;
        return next;
      });
      setDriveModalOpen(false);
      toast({ type: "success", message: dict.integrations.syncStarted });
    } catch (error) {
      setSyncingId(null);
      toast({
        type: "error",
        message: error instanceof Error ? error.message : dict.integrations.syncFailed,
      });
    }
  };

  const disconnectIntegration = async (integration: BusinessIntegration) => {
    if (!window.confirm(dict.integrations.disconnectConfirm)) return;
    try {
      await api.disconnectIntegration(integration.id);
      const next = integrationsRef.current.filter((item) => item.id !== integration.id);
      integrationsRef.current = next;
      setIntegrations(next);
      if (integration.provider === "google_drive") setDriveModalOpen(false);
      toast({ type: "success", message: dict.integrations.disconnectSuccess });
    } catch (error) {
      toast({
        type: "error",
        message: error instanceof Error ? error.message : dict.integrations.syncFailed,
      });
    }
  };

  const openDrivePicker = () => {
    const savedIds = driveIntegration?.config.selected_file_ids;
    setSelectedFileIds(Array.isArray(savedIds) ? savedIds.filter((id): id is string => typeof id === "string") : []);
    setFolderPath([{ id: null, name: dict.integrations.rootFolder }]);
    setDriveModalOpen(true);
  };

  const openFolder = (item: MockDriveItem) => {
    setFolderPath((current) => [...current, { id: item.id, name: item.name }]);
  };

  const toggleFile = (fileId: string, checked: boolean) => {
    setSelectedFileIds((current) =>
      checked ? Array.from(new Set([...current, fileId])) : current.filter((id) => id !== fileId)
    );
  };

  if (loading) return null;

  return (
    <>
      <section
        aria-labelledby="integrations-title"
        className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
              <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <h2 id="integrations-title" className="text-sm font-semibold text-foreground">
                {dict.integrations.title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {dict.integrations.description}
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-primary">
            {dict.integrations.demoBadge}
          </span>
        </div>
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {dict.integrations.simulationNotice}
        </p>
        {loadError && (
          <p role="alert" className="text-xs text-destructive">
            {dict.integrations.loadFailed}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {(["shopify", "google_drive"] as const).map((provider) => {
            const integration = provider === "shopify" ? shopifyIntegration : driveIntegration;
            const isSyncing =
              Boolean(integration && ["queued", "syncing"].includes(integration.sync_status)) ||
              syncingId === integration?.id;
            const isConnecting = connectingProvider === provider;
            const accountName = integration?.display_name || (
              provider === "shopify" ? dict.integrations.storeName : dict.integrations.accountName
            );
            const ProviderIcon = provider === "shopify" ? Store : HardDrive;
            return (
              <article key={provider} className="rounded-xl border border-border/70 bg-muted/10 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <ProviderIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-foreground">
                      {provider === "shopify" ? "Shopify" : "Google Drive"}
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {integration ? accountName : dict.integrations.notConnected}
                    </p>
                  </div>
                  {integration ? (
                    <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                      {dict.integrations.connected}
                    </span>
                  ) : null}
                </div>

                {integration && (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {isSyncing ? dict.integrations.syncing : integrationStatusLabel(integration, dict)}
                      </span>
                      {provider === "google_drive" &&
                        typeof integration.config.synced_file_count === "number" && (
                          <span className="font-medium text-foreground">
                            {dict.integrations.filesCount.replace(
                              "{count}",
                              integration.config.synced_file_count.toLocaleString(locale)
                            )}
                          </span>
                        )}
                      {provider === "shopify" &&
                        typeof integration.config.product_count === "number" && (
                          <span className="font-medium text-foreground">
                            {dict.integrations.productsCount.replace(
                              "{count}",
                              integration.config.product_count.toLocaleString(locale)
                            )}
                          </span>
                        )}
                    </div>
                    {integration.sync_status === "failed" && (
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {integration.last_error || dict.integrations.syncFailed}
                      </p>
                    )}
                    {getStringSetting(integration, "catalog_source_id") && (
                      <Link
                        href="/sources"
                        className="mt-2 inline-flex min-h-8 items-center text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {dict.integrations.viewKnowledge}
                      </Link>
                    )}
                  </>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {!integration && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isConnecting}
                      isLoading={isConnecting}
                      onClick={() => startOAuth(provider)}
                    >
                      {isConnecting
                        ? dict.integrations.connecting
                        : provider === "shopify"
                          ? dict.integrations.connectShopify
                          : dict.integrations.connectDrive}
                    </Button>
                  )}
                  {integration && provider === "shopify" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSyncing}
                      onClick={() => syncIntegration(integration)}
                    >
                      <RefreshCw className={cn("me-1.5 h-3.5 w-3.5", isSyncing && "animate-spin")} aria-hidden="true" />
                      {isSyncing ? dict.integrations.syncing : dict.integrations.syncShopify}
                    </Button>
                  )}
                  {integration && provider === "google_drive" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSyncing}
                      onClick={openDrivePicker}
                    >
                      <FolderOpen className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {dict.integrations.browseDrive}
                    </Button>
                  )}
                  {integration && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isSyncing}
                      onClick={() => disconnectIntegration(integration)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {dict.integrations.disconnect}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Modal
        isOpen={driveModalOpen}
        onClose={() => {
          if (!syncingId) setDriveModalOpen(false);
        }}
        title={dict.integrations.chooseFiles}
        description={dict.integrations.driveSelectionNote}
        maxWidth="lg"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <nav aria-label={dict.integrations.rootFolder} className="flex items-center gap-1 border-b border-border/60 pb-3">
            {folderPath.map((folder, index) => (
              <span key={folder.id ?? "root"} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => setFolderPath((current) => current.slice(0, index + 1))}
                  className={cn(
                    "truncate rounded px-1 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    index === folderPath.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="min-h-40 flex-1 overflow-y-auto py-2">
            {driveItemsLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{dict.integrations.loadingFiles}</p>
            ) : driveItemsError ? (
              <p role="alert" className="py-8 text-center text-xs text-destructive">
                {dict.integrations.loadFailed}
              </p>
            ) : driveItems.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{dict.integrations.noFiles}</p>
            ) : (
              <ul className="space-y-1">
                {driveItems.map((item) => (
                  <li key={item.id}>
                    {item.type === "folder" ? (
                      <button
                        type="button"
                        onClick={() => openFolder(item)}
                        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ) : (
                      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={selectedFileIds.includes(item.id)}
                          onChange={(event) => toggleFile(item.id, event.target.checked)}
                          className="h-4 w-4 rounded border-border accent-accent focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {item.modified_at && (
                          <time className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
                            {new Date(item.modified_at).toLocaleDateString(locale)}
                          </time>
                        )}
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {dict.integrations.selectedCount.replace("{count}", selectedFileIds.length.toLocaleString(locale))}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!driveIntegration || syncingId === driveIntegration.id}
                onClick={() => {
                  if (driveIntegration) void disconnectIntegration(driveIntegration);
                }}
              >
                {dict.integrations.disconnect}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!driveIntegration || Boolean(syncingId)}
                isLoading={Boolean(driveIntegration && syncingId === driveIntegration.id)}
                onClick={() => {
                  if (driveIntegration) void syncIntegration(driveIntegration, selectedFileIds);
                }}
              >
                {dict.integrations.importSelection}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
