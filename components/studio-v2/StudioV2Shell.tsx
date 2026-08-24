"use client";

import React, { useState, useEffect, useCallback } from "react";
import { StudioV2Header } from "./StudioV2Header";
import { StudioV2Workspace } from "./StudioV2Workspace";
import { StudioV2CommandPalette } from "./StudioV2CommandPalette";
import { StudioV2MobileNav } from "./StudioV2MobileNav";
import { StudioV2BottomSheet } from "./StudioV2BottomSheet";
import {
  DocumentInfo,
  HistoryItem,
  InspectorTab,
  ToolCategory,
} from "./types";

export const StudioV2Shell: React.FC = () => {
  // Initial Document Info
  const [docInfo, setDocInfo] = useState<DocumentInfo>({
    id: "doc_demo_annual_report",
    name: "annual-report.pdf",
    version: "Version 2.4",
    pageCount: 12,
    fileSize: "1.2 MB",
    saved: true,
  });

  // UI States
  const [activeTool, setActiveTool] = useState<ToolCategory>("edit");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [zoomScale, setZoomScale] = useState<number>(0.9);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);

  // History Timeline State
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "ver_3",
      action: "Crop Page 4",
      timestamp: "Just now",
      versionNumber: 3,
      isActive: true,
    },
    {
      id: "ver_2",
      action: "Add Watermark",
      timestamp: "2 mins ago",
      versionNumber: 2,
      isActive: false,
    },
    {
      id: "ver_1",
      action: "Rotate Page 1",
      timestamp: "5 mins ago",
      versionNumber: 1,
      isActive: false,
    },
    {
      id: "ver_0",
      action: "Initial Upload",
      timestamp: "10 mins ago",
      versionNumber: 0,
      isActive: false,
    },
  ]);

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
    // On mobile, selecting a tool opens the contextual bottom sheet
    if (window.innerWidth < 768) {
      setMobileSheetOpen(true);
    }
  }, []);

  // History Version Checkout
  const handleCheckoutVersion = useCallback((versionId: string) => {
    setHistory((prev) =>
      prev.map((item) => ({
        ...item,
        isActive: item.id === versionId,
      }))
    );
  }, []);

  // Global Keyboard Shortcuts (Cmd+K, Cmd+Z, Cmd+Shift+Z, 0, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      // Fit to screen '0' when not in input
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

  return (
    <div className="h-screen w-screen bg-[#0B0C0F] text-[#F5F7FA] font-sans antialiased overflow-hidden flex flex-col select-none">
      {/* Top Fixed Header */}
      <StudioV2Header
        document={docInfo}
        canUndo={true}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onExport={() => alert("Export Dialog (Phase 3H)")}
      />

      {/* Main Workspace (Sidebar + Canvas + Inspector) */}
      <StudioV2Workspace
        document={docInfo}
        activeTool={activeTool}
        inspectorTab={inspectorTab}
        history={history}
        zoomScale={zoomScale}
        isPanning={isPanning}
        onSelectTool={handleSelectTool}
        onSelectInspectorTab={setInspectorTab}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onTogglePan={handleTogglePan}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onCheckoutVersion={handleCheckoutVersion}
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
        onExport={() => alert("Export PDF (Phase 3H)")}
      />
    </div>
  );
};
