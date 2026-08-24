"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { StudioV2Header } from "./StudioV2Header";
import { StudioV2Workspace } from "./StudioV2Workspace";
import { StudioV2CommandPalette } from "./StudioV2CommandPalette";
import { StudioV2MobileNav } from "./StudioV2MobileNav";
import { StudioV2BottomSheet } from "./StudioV2BottomSheet";
import { useStudioSession } from "@/hooks/studio-v2/useStudioSession";
import {
  DocumentInfo,
  HistoryItem,
  InspectorTab,
  ToolCategory,
} from "./types";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

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
    isLoading,
    isSaving,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
    checkout,
    refetch,
  } = useStudioSession(sessionIdParam);

  // Local Ephemeral UI State
  const [activeTool, setActiveTool] = useState<ToolCategory>("edit");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);

  // Transform Authoritative State for UI Components
  const docInfo: DocumentInfo = useMemo(() => {
    return {
      id: document?.id || session?.document_id || "doc_init",
      name: document?.original_file_name || "untitled.pdf",
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

  // Loading State
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

  // Error State (with retry)
  if (error && !session) {
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
        onExport={() => {}}
      />

      {/* Main Workspace (Sidebar + Canvas + Inspector) */}
      <StudioV2Workspace
        document={docInfo}
        activeTool={activeTool}
        inspectorTab={inspectorTab}
        history={historyItems}
        zoomScale={zoomScale}
        isPanning={isPanning}
        onSelectTool={handleSelectTool}
        onSelectInspectorTab={setInspectorTab}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onTogglePan={handleTogglePan}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onCheckoutVersion={checkout}
        onAddNewPage={() => {}}
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
        onExport={() => {}}
      />
    </div>
  );
};
