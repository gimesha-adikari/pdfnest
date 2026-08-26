"use client";

import React from "react";
import { StudioV2Sidebar } from "./StudioV2Sidebar";
import { StudioV2Canvas } from "./StudioV2Canvas";
import { StudioV2Inspector } from "./StudioV2Inspector";
import { DocumentInfo, HistoryItem, InspectorTab, ToolCategory } from "./types";
import { StudioMetadataParameters, StudioTextOverlayParameters, StudioUpdateTextOverlayParameters, StudioVDMDTO } from "@/lib/studio-v2/api";

interface StudioV2WorkspaceProps {
  document: DocumentInfo;
  sessionId?: string | null;
  versionId?: string | null;
  vdm?: StudioVDMDTO | null;
  selectedPageId?: string | null;
  activeTool: ToolCategory;
  inspectorTab: InspectorTab;
  history: HistoryItem[];
  zoomScale: number;
  isPanning: boolean;
  onSelectTool: (tool: ToolCategory) => void;
  onSelectInspectorTab: (tab: InspectorTab) => void;
  onSelectPage?: (pageId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onTogglePan: () => void;
  onOpenCommandPalette: () => void;
  onCheckoutVersion?: (versionId: string) => void;
  metadata?: Record<string, string> | null;
  onUpdateMetadata?: (metadata: StudioMetadataParameters) => void | Promise<void>;
  onAddNewPage?: () => void;
  onRotateClockwise?: () => void;
  onRotateCounterClockwise?: () => void;
  onDeletePage?: () => void;
  onMovePageEarlier?: () => void;
  onMovePageLater?: () => void;
  onDuplicatePage?: () => void;
  onCropPage?: (cropBox: number[]) => void | Promise<void>;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onAddText?: (parameters: StudioTextOverlayParameters) => void | Promise<void>;
  onUpdateText?: (parameters: StudioUpdateTextOverlayParameters) => void | Promise<void>;
  onRemoveText?: (target: { page_id: string; overlay_id: string }) => void | Promise<void>;
  canMovePageEarlier?: boolean;
  canMovePageLater?: boolean;
  isCommandLoading?: boolean;
}

export const StudioV2Workspace: React.FC<StudioV2WorkspaceProps> = ({
  document,
  sessionId,
  versionId,
  vdm,
  selectedPageId,
  activeTool,
  inspectorTab,
  history,
  zoomScale,
  isPanning,
  onSelectTool,
  onSelectInspectorTab,
  onSelectPage,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onTogglePan,
  onOpenCommandPalette,
  onCheckoutVersion,
  metadata,
  onUpdateMetadata,
  onAddNewPage,
  onRotateClockwise,
  onRotateCounterClockwise,
  onDeletePage,
  onMovePageEarlier,
  onMovePageLater,
  onDuplicatePage,
  onCropPage,
  selectedOverlayId,
  onSelectOverlay,
  onAddText,
  onUpdateText,
  onRemoveText,
  canMovePageEarlier,
  canMovePageLater,
  isCommandLoading,
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
          sessionId={sessionId}
          versionId={versionId}
          vdm={vdm}
          selectedPageId={selectedPageId}
          zoomScale={zoomScale}
          isPanning={isPanning}
          onSelectPage={onSelectPage}
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
          metadata={metadata}
          onUpdateMetadata={onUpdateMetadata}
          selectedPage={vdm?.pages.find((page) => page.page_id === selectedPageId) ?? null}
          onRotateClockwise={onRotateClockwise}
          onRotateCounterClockwise={onRotateCounterClockwise}
          onDeletePage={onDeletePage}
          onMovePageEarlier={onMovePageEarlier}
          onMovePageLater={onMovePageLater}
          onDuplicatePage={onDuplicatePage}
          onCropPage={onCropPage}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={onSelectOverlay}
          onAddText={onAddText}
          onUpdateText={onUpdateText}
          onRemoveText={onRemoveText}
          canMovePageEarlier={canMovePageEarlier}
          canMovePageLater={canMovePageLater}
          isCommandLoading={isCommandLoading}
        />
      </div>
    </div>
  );
};
