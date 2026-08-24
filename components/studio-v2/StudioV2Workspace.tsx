"use client";

import React from "react";
import { StudioV2Sidebar } from "./StudioV2Sidebar";
import { StudioV2Canvas } from "./StudioV2Canvas";
import { StudioV2Inspector } from "./StudioV2Inspector";
import { DocumentInfo, HistoryItem, InspectorTab, ToolCategory } from "./types";

interface StudioV2WorkspaceProps {
  document: DocumentInfo;
  activeTool: ToolCategory;
  inspectorTab: InspectorTab;
  history: HistoryItem[];
  zoomScale: number;
  isPanning: boolean;
  onSelectTool: (tool: ToolCategory) => void;
  onSelectInspectorTab: (tab: InspectorTab) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onTogglePan: () => void;
  onOpenCommandPalette: () => void;
  onCheckoutVersion?: (versionId: string) => void;
  onAddNewPage?: () => void;
}

export const StudioV2Workspace: React.FC<StudioV2WorkspaceProps> = ({
  document,
  activeTool,
  inspectorTab,
  history,
  zoomScale,
  isPanning,
  onSelectTool,
  onSelectInspectorTab,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onTogglePan,
  onOpenCommandPalette,
  onCheckoutVersion,
  onAddNewPage,
}) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0C0F]">
      {/* Desktop Left Sidebar */}
      <div className="hidden md:block">
        <StudioV2Sidebar
          document={document}
          activeTool={activeTool}
          onSelectTool={onSelectTool}
          onAddNewPage={onAddNewPage}
        />
      </div>

      {/* Central Fluid Canvas Workspace */}
      <main className="flex-1 md:ml-[260px] md:mr-[300px] mt-[48px] mb-[56px] md:mb-0 h-[calc(100vh-48px-56px)] md:h-[calc(100vh-48px)] relative flex bg-[#0B0C0F] overflow-hidden">
        <StudioV2Canvas
          document={document}
          zoomScale={zoomScale}
          isPanning={isPanning}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onFitToScreen={onFitToScreen}
          onTogglePan={onTogglePan}
          onOpenCommandPalette={onOpenCommandPalette}
        />
      </main>

      {/* Desktop Right Inspector */}
      <div className="hidden md:block">
        <StudioV2Inspector
          document={document}
          activeTab={inspectorTab}
          history={history}
          onSelectTab={onSelectInspectorTab}
          onCheckoutVersion={onCheckoutVersion}
        />
      </div>
    </div>
  );
};
