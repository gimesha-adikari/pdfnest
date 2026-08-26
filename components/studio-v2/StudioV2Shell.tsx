"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { StudioV2Header } from "./StudioV2Header";
import { StudioV2Workspace } from "./StudioV2Workspace";
import { StudioV2CommandPalette } from "./StudioV2CommandPalette";
import { StudioV2MobileNav } from "./StudioV2MobileNav";
import { StudioV2BottomSheet } from "./StudioV2BottomSheet";
import { StudioV2Entry } from "./StudioV2Entry";
import { useStudioSession } from "@/hooks/studio-v2/useStudioSession";
import {
  DocumentInfo,
  HistoryItem,
  InspectorTab,
  ToolCategory,
} from "./types";
import {
  studioV2Api,
  StudioCommand,
  StudioCompressionLevel,
  StudioMaterializationRequest,
} from "@/lib/studio-v2/api";
import { AlertTriangle, Loader2, RefreshCw, Upload } from "lucide-react";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    return `${Math.floor(diffSec / 3600)} hours ago`;
  } catch {
    return dateStr;
  }
}

export function parseStudioPageSelection(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter at least one page or range to keep.");

  const selected = new Set<number>();
  for (const rawToken of trimmed.split(",")) {
    const token = rawToken.trim();
    if (!token) throw new Error("Page selection contains an empty token.");

    let start: number;
    let end: number;
    if (/^\d+$/.test(token)) {
      start = Number(token);
      end = start;
    } else {
      const range = /^(\d+)-(\d+)$/.exec(token);
      if (!range) throw new Error(`Invalid page selection token: ${token}`);
      start = Number(range[1]);
      end = Number(range[2]);
      if (start > end) throw new Error(`Page range is reversed: ${token}`);
    }

    if (start < 1 || end > pageCount) {
      throw new Error(`Pages must be between 1 and ${pageCount}.`);
    }
    for (let page = start; page <= end; page += 1) {
      if (selected.has(page)) throw new Error(`Page ${page} is selected more than once.`);
      selected.add(page);
    }
  }

  return [...selected].sort((a, b) => a - b);
}

export const StudioV2Shell: React.FC = () => {
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams ? searchParams.get("session_id") : null;

  // Authoritative Backend Session Hook
  const {
    session,
    document,
    activeVersion,
    vdm,
    history: backendHistory,
    syncStatus,
    lifecycle,
    isLoading,
    isSaving,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
    checkout,
    refetch,
    createSessionFromUpload,
    enterStudio,
    executeCommand,
    materialize,
  } = useStudioSession(sessionIdParam);

  // Local Ephemeral UI State
  const [activeTool, setActiveTool] = useState<ToolCategory>("edit");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [materializationError, setMaterializationError] = useState<string | null>(null);
  const [compressionLevel, setCompressionLevel] = useState<StudioCompressionLevel>("medium");

  const selectedPage = useMemo(
    () => vdm?.pages.find((page) => page.page_id === selectedPageId) ?? null,
    [vdm, selectedPageId]
  );
  const selectedPageIndex = useMemo(
    () => (vdm && selectedPageId ? vdm.pages.findIndex((page) => page.page_id === selectedPageId) : -1),
    [vdm, selectedPageId]
  );

  const newIdempotencyKey = useCallback((operation: string) => {
    const suffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `studio-v2-${operation}-${suffix}`;
  }, []);

  const handleRotate = useCallback(
    async (deltaDegrees: 90 | -90) => {
      if (!selectedPage || !activeVersion) return;
      const command: StudioCommand = {
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("rotate-page"),
        operation: "rotate_page",
        parameters: { page_ids: [selectedPage.page_id], delta_degrees: deltaDegrees },
      };
      try {
        await executeCommand(command);
      } catch {
        // The hook exposes the authoritative error state to the shell.
      }
    },
    [selectedPage, activeVersion, newIdempotencyKey, executeCommand]
  );

  const handleDeletePage = useCallback(async () => {
    if (!selectedPage || !activeVersion || !vdm) return;
    const selectedIndex = vdm.pages.findIndex((page) => page.page_id === selectedPage.page_id);
    const plannedNextPage = vdm.pages[selectedIndex + 1] ?? vdm.pages[selectedIndex - 1] ?? null;
    setSelectedPageId(plannedNextPage?.page_id ?? null);
    try {
      const response = await executeCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("delete-page"),
        operation: "delete_pages",
        parameters: { page_ids: [selectedPage.page_id] },
      });
      if (response) {
        const nextPage = response.vdm.pages[selectedIndex] ?? response.vdm.pages[selectedIndex - 1] ?? null;
        setSelectedPageId(nextPage?.page_id ?? null);
      }
    } catch {
      // Keep the existing selection and authoritative VDM on failure.
      setSelectedPageId(selectedPage.page_id);
    }
  }, [selectedPage, activeVersion, vdm, executeCommand, newIdempotencyKey]);

  const handleReorderPage = useCallback(
    async (direction: -1 | 1) => {
      if (!vdm || !selectedPage || !activeVersion) return;
      const targetIndex = selectedPageIndex + direction;
      if (selectedPageIndex < 0 || targetIndex < 0 || targetIndex >= vdm.pages.length) return;
      const pageIds = vdm.pages.map((page) => page.page_id);
      [pageIds[selectedPageIndex], pageIds[targetIndex]] = [pageIds[targetIndex], pageIds[selectedPageIndex]];
      try {
        await executeCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("reorder-pages"),
          operation: "reorder_pages",
          parameters: { page_ids: pageIds },
        });
      } catch {
        // Keep the authoritative order and selected page on failure.
      }
    },
    [vdm, selectedPage, activeVersion, selectedPageIndex, executeCommand, newIdempotencyKey]
  );

  const handleDuplicatePage = useCallback(async () => {
    if (!vdm || !selectedPage || !activeVersion) return;
    const existingPageIds = new Set(vdm.pages.map((page) => page.page_id));
    try {
      const response = await executeCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("duplicate-page"),
        operation: "duplicate_pages",
        parameters: { page_ids: [selectedPage.page_id], copies: 1 },
      });
      const duplicate = response?.vdm.pages.find(
        (page) => !existingPageIds.has(page.page_id) && page.parent_page_id === selectedPage.page_id
      );
      if (duplicate) setSelectedPageId(duplicate.page_id);
    } catch {
      // Keep the source page selected when duplication fails.
    }
  }, [vdm, selectedPage, activeVersion, executeCommand, newIdempotencyKey]);

  const handleAddBlankPage = useCallback(async () => {
    if (!vdm || !activeVersion) return;
    const existingPageIds = new Set(vdm.pages.map((page) => page.page_id));
    const position = selectedPageIndex >= 0 ? selectedPageIndex + 1 : vdm.pages.length;
    try {
      const response = await executeCommand({
        base_version_id: activeVersion.id,
        idempotency_key: newIdempotencyKey("insert-blank-page"),
        operation: "insert_blank_pages",
        parameters: { position, count: 1 },
      });
      const blank = response?.vdm.pages.find(
        (page) => !existingPageIds.has(page.page_id) && page.is_blank
      );
      if (blank) setSelectedPageId(blank.page_id);
    } catch {
      // Keep the existing selection when blank-page insertion fails.
    }
  }, [vdm, activeVersion, selectedPageIndex, executeCommand, newIdempotencyKey]);

  const handleCropPage = useCallback(
    async (cropBox: number[]) => {
      if (!selectedPage || !activeVersion) return;
      try {
        await executeCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("crop-page"),
          operation: "crop_page",
          parameters: { page_ids: [selectedPage.page_id], crop_box: cropBox },
        });
      } catch {
        // Keep the authoritative VDM and let the hook expose the recoverable error.
      }
    },
    [selectedPage, activeVersion, executeCommand, newIdempotencyKey]
  );

  const handleUpdateMetadata = useCallback(
    async (metadata: { title: string; author: string; subject: string; keywords: string }) => {
      if (!activeVersion) return;
      try {
        await executeCommand({
          base_version_id: activeVersion.id,
          idempotency_key: newIdempotencyKey("update-metadata"),
          operation: "update_metadata",
          parameters: metadata,
        });
      } catch {
        // Keep the authoritative VDM and expose the recoverable error via the hook.
      }
    },
    [activeVersion, executeCommand, newIdempotencyKey]
  );

  const handleExport = useCallback(async () => {
    if (!session || !activeVersion || isSaving || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await studioV2Api.finalizeExport(session.id);
      const href = studioV2Api.exportDownloadURL(session.id, result.export.id);
      const anchor = window.document.createElement("a");
      anchor.href = href;
      anchor.download = result.file_name;
      anchor.style.display = "none";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [session, activeVersion, isSaving, isExporting]);

  const handleMaterialize = useCallback(
    async (
      operation: "compress" | "grayscale" | "repair" | "redact" | "merge" | "split",
      options: { redactKeywords?: string[]; sourceAssetIds?: string[]; pageIds?: string[] } = {}
    ) => {
      if (!activeVersion || isSaving || isMaterializing) return;
      const selectedIndexBeforeMaterialization = selectedPageIndex;
      setIsMaterializing(true);
      setMaterializationError(null);
      try {
        const request: StudioMaterializationRequest = operation === "compress"
          ? {
              base_version_id: activeVersion.id,
              idempotency_key: newIdempotencyKey(`materialize-${operation}`),
              operation,
              parameters: { level: compressionLevel },
            }
          : operation === "redact"
            ? {
                base_version_id: activeVersion.id,
                idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                operation,
                parameters: { keywords: options.redactKeywords ?? [], boxes: "[]" },
              }
            : operation === "merge"
              ? {
                  base_version_id: activeVersion.id,
                  idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                  operation,
                  parameters: { source_asset_ids: options.sourceAssetIds ?? [] },
                }
              : operation === "split"
                ? {
                    base_version_id: activeVersion.id,
                    idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                    operation,
                    parameters: { page_ids: options.pageIds ?? [] },
                  }
                : {
                    base_version_id: activeVersion.id,
                    idempotency_key: newIdempotencyKey(`materialize-${operation}`),
                    operation,
                    parameters: {},
                  };
        const response = await materialize(request);
        const replacementPage = response?.vdm.pages[
          Math.min(Math.max(selectedIndexBeforeMaterialization, 0), response.vdm.pages.length - 1)
        ];
        setSelectedPageId(replacementPage?.page_id ?? null);
      } catch (err) {
        setMaterializationError(err instanceof Error ? err.message : "Materialization failed");
      } finally {
        setIsMaterializing(false);
      }
    },
    [activeVersion, compressionLevel, isSaving, isMaterializing, materialize, newIdempotencyKey, selectedPageIndex]
  );

  const handleSplit = useCallback(
    async (pageSelection: string) => {
      if (!vdm) return;
      const pageNumbers = parseStudioPageSelection(pageSelection, vdm.pages.length);
      const pageIds = pageNumbers.map((pageNumber) => vdm.pages[pageNumber - 1]?.page_id);
      if (pageIds.some((pageId) => !pageId)) {
        throw new Error("The selected pages are no longer present in the current Studio document.");
      }
      await handleMaterialize("split", { pageIds });
    },
    [handleMaterialize, vdm]
  );

  useEffect(() => {
    if (!vdm || !selectedPageId || vdm.pages.some((page) => page.page_id === selectedPageId)) return;
    setSelectedPageId(vdm.pages[0]?.page_id ?? null);
  }, [vdm, selectedPageId]);

  // Transform Authoritative State for UI Components
  const docInfo: DocumentInfo = useMemo(() => {
    return {
      id: document?.id || session?.document_id || "doc_init",
      name: document?.original_filename || document?.original_file_name || "untitled.pdf",
      version: activeVersion
        ? `Version ${activeVersion.version_number}`
        : "Version 0",
      pageCount: vdm?.page_count || document?.initial_page_count || 1,
      fileSize: formatBytes(document?.file_size || 0),
      saved: syncStatus === "saved",
      syncStatus: syncStatus,
    };
  }, [document, session, activeVersion, vdm, syncStatus]);

  const historyItems: HistoryItem[] = useMemo(() => {
    if (!backendHistory || backendHistory.length === 0) {
      if (activeVersion) {
        return [
          {
            id: activeVersion.id,
            action: activeVersion.operation_type || "Initial State",
            timestamp: formatRelativeTime(activeVersion.created_at),
            versionNumber: activeVersion.version_number,
            isActive: true,
          },
        ];
      }
      return [];
    }

    return backendHistory.map((ver) => ({
      id: ver.id,
      action:
        ver.operation_type === "initial_upload"
          ? "Initial Document"
          : ver.operation_type || "Operation",
      timestamp: formatRelativeTime(ver.created_at),
      versionNumber: ver.version_number,
      isActive: ver.id === activeVersion?.id,
    }));
  }, [backendHistory, activeVersion]);

  // Zoom Handlers
  const handleZoomIn = useCallback(() => {
    setZoomScale((prev) => Math.min(prev + 0.1, 2.5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale((prev) => Math.max(prev - 0.1, 0.4));
  }, []);

  const handleFitToScreen = useCallback(() => {
    setZoomScale(0.9);
  }, []);

  const handleTogglePan = useCallback(() => {
    setIsPanning((prev) => !prev);
  }, []);

  // Tool Selection Handler
  const handleSelectTool = useCallback((tool: ToolCategory) => {
    setActiveTool(tool);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSheetOpen(true);
    }
  }, []);

  // Global Keyboard Shortcuts (Cmd+K, 0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (
        e.key === "0" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        handleFitToScreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFitToScreen]);

  if (lifecycle === "entry" || lifecycle === "creating") {
    return (
      <StudioV2Entry
        isCreating={lifecycle === "creating"}
        error={error}
        onUpload={createSessionFromUpload}
      />
    );
  }

  // Loading State for an explicit session only.
  if (isLoading && !session) {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#d2bbff]" />
        <span className="font-mono text-xs text-[#9AA1AD]">
          Loading Studio session...
        </span>
      </div>
    );
  }

  // Invalid IDs get their own recovery state and never create a replacement.
  if (lifecycle === "not_found") {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-900/30 border border-amber-700/60 flex items-center justify-center text-amber-300 mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-white mb-1">Studio session not found</h2>
        <p className="text-xs text-[#9AA1AD] max-w-sm mb-6 font-mono">{error || "This Studio session does not exist or is no longer available."}</p>
        <div className="flex gap-2">
          <button onClick={enterStudio} className="flex items-center gap-2 bg-[#7c3aed] text-white text-xs font-medium px-4 py-2 rounded hover:bg-[#6d28d9] transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Open another PDF</span>
          </button>
          <button onClick={enterStudio} className="text-xs text-[#D8DCE3] border border-white/15 px-4 py-2 rounded hover:bg-white/5 transition-colors">Return to Studio</button>
        </div>
      </div>
    );
  }

  // Error State (with retry)
  if (lifecycle === "error" && !session) {
    return (
      <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-800 flex items-center justify-center text-red-400 mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-white mb-1">
          Unable to Load Studio Session
        </h2>
        <p className="text-xs text-[#9AA1AD] max-w-sm mb-6 font-mono">{error}</p>
        <button
          onClick={refetch}
          className="flex items-center gap-2 bg-[#7c3aed] text-white text-xs font-medium px-4 py-2 rounded hover:bg-[#6d28d9] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Session</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] font-sans antialiased overflow-hidden flex flex-col select-none">
      {/* Top Fixed Header */}
      <StudioV2Header
        document={docInfo}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onExport={handleExport}
        onCompress={() => void handleMaterialize("compress")}
        compressionLevel={compressionLevel}
        onCompressionLevelChange={setCompressionLevel}
        onGrayscale={() => void handleMaterialize("grayscale")}
        onRepair={() => void handleMaterialize("repair")}
        onRedact={(keywords) => void handleMaterialize("redact", { redactKeywords: keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean) })}
        onUploadMergeAsset={async (file) => {
          if (!session) throw new Error("Studio session is not ready");
          const response = await studioV2Api.uploadAsset(session.id, file);
          return response.asset;
        }}
        onMerge={(assetId) => void handleMaterialize("merge", { sourceAssetIds: [assetId] })}
        onSplit={handleSplit}
        isMaterializing={isMaterializing}
        materializeDisabled={!session || !activeVersion || isSaving}
        isExporting={isExporting}
        exportDisabled={!session || !activeVersion || isSaving || isMaterializing}
      />

      {(error || exportError || materializationError) && (
        <div role="alert" className="fixed left-1/2 top-[56px] z-50 -translate-x-1/2 rounded border border-red-800/80 bg-red-950/90 px-4 py-2 text-xs text-red-100 shadow-lg">
          {materializationError || exportError || error}
        </div>
      )}

      {/* Main Workspace (Sidebar + Canvas + Inspector) */}
      <StudioV2Workspace
        document={docInfo}
        sessionId={session?.id}
        versionId={activeVersion?.id}
        vdm={vdm}
        selectedPageId={selectedPageId}
        activeTool={activeTool}
        inspectorTab={inspectorTab}
        history={historyItems}
        zoomScale={zoomScale}
        isPanning={isPanning}
        onSelectTool={handleSelectTool}
        onSelectInspectorTab={setInspectorTab}
        onSelectPage={setSelectedPageId}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onTogglePan={handleTogglePan}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onCheckoutVersion={checkout}
        metadata={vdm?.metadata}
        onUpdateMetadata={handleUpdateMetadata}
        onAddNewPage={handleAddBlankPage}
        onRotateClockwise={() => handleRotate(90)}
        onRotateCounterClockwise={() => handleRotate(-90)}
        onDeletePage={handleDeletePage}
        onMovePageEarlier={() => handleReorderPage(-1)}
        onMovePageLater={() => handleReorderPage(1)}
        onDuplicatePage={handleDuplicatePage}
        onCropPage={handleCropPage}
        canMovePageEarlier={selectedPageIndex > 0}
        canMovePageLater={selectedPageIndex >= 0 && selectedPageIndex < (vdm?.pages.length ?? 0) - 1}
        isCommandLoading={isSaving}
      />

      {/* Mobile Bottom Docked Navigation */}
      <StudioV2MobileNav
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
      />

      {/* Mobile Contextual Bottom Sheet */}
      <StudioV2BottomSheet
        isOpen={mobileSheetOpen}
        activeTool={activeTool}
        onClose={() => setMobileSheetOpen(false)}
      />

      {/* Command Palette Modal (Cmd+K) */}
      <StudioV2CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onFitToScreen={handleFitToScreen}
        onRotatePage={() => handleRotate(90)}
        canRotatePage={Boolean(selectedPage) && !isSaving}
        onExport={handleExport}
      />
    </div>
  );
};
