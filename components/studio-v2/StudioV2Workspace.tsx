"use client";

import React from "react";
import { StudioV2Sidebar } from "./StudioV2Sidebar";
import { StudioV2Canvas } from "./StudioV2Canvas";
import { StudioV2Inspector } from "./StudioV2Inspector";
import { DocumentInfo, HistoryItem, InspectorTab, StudioV2OverlayDraft, StudioV2RedactionDraftBox, ToolCategory } from "./types";
import { StudioJobDTO, StudioMarkupAction, StudioMarkupAnalysis, StudioMarkupBox, StudioMarkupMode, StudioMetadataParameters, StudioSignatureOverlayParameters, StudioTextOverlayParameters, StudioUpdateSignatureOverlayParameters, StudioUpdateTextOverlayParameters, StudioVDMDTO } from "@/lib/studio-v2/api";

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
  onCheckoutVersion?: (versionId: string) => void;
  metadata?: Record<string, string> | null;
  onUpdateMetadata?: (metadata: StudioMetadataParameters) => void | Promise<void>;
  onAddNewPage?: () => void;
  onEnterEdit?: () => void;
  onRotateClockwise?: () => void;
  onRotateCounterClockwise?: () => void;
  onDeletePage?: () => void;
  onMovePageEarlier?: () => void;
  onMovePageLater?: () => void;
  onDuplicatePage?: () => void;
  onCropPage?: (cropBox: number[], pageIds?: string[]) => void | Promise<void>;
  cropDraft?: number[] | null;
  onCropDraftChange?: (cropBox: number[]) => void;
  cropTargetMode?: "current" | "all" | "custom";
  cropCustomPages?: string;
  onCropTargetModeChange?: (mode: "current" | "all" | "custom") => void;
  onCropCustomPagesChange?: (value: string) => void;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onAddText?: (parameters: StudioTextOverlayParameters) => void | Promise<void>;
  onUpdateText?: (parameters: StudioUpdateTextOverlayParameters) => void | Promise<void>;
  onRemoveText?: (target: { page_id: string; overlay_id: string }) => void | Promise<void>;
  onAddSignature?: (blob: Blob, parameters: StudioSignatureOverlayParameters) => void | Promise<void>;
  onUpdateSignature?: (parameters: StudioUpdateSignatureOverlayParameters) => void | Promise<void>;
  onRemoveSignature?: (target: { page_id: string; overlay_id: string }) => void | Promise<void>;
  overlayDraft?: StudioV2OverlayDraft | null;
  onOverlayDraftChange?: (draft: StudioV2OverlayDraft) => void;
  onOverlayCommit?: (draft: StudioV2OverlayDraft) => void | Promise<void>;
  canMovePageEarlier?: boolean;
  canMovePageLater?: boolean;
  isCommandLoading?: boolean;
  markupAction?: StudioMarkupAction;
  markupMode?: StudioMarkupMode;
  markupAnalysis?: StudioMarkupAnalysis | null;
  markupAnalysisLoading?: boolean;
  markupAnalysisError?: string | null;
  markupColor?: string;
  markupBoxes?: StudioMarkupBox[];
  markupJob?: StudioJobDTO | null;
  markupError?: string | null;
  onMarkupActionChange?: (action: StudioMarkupAction) => void;
  onMarkupModeChange?: (mode: StudioMarkupMode) => void;
  onMarkupColorChange?: (color: string) => void;
  onMarkupBoxChange?: (box: StudioMarkupBox) => void;
  onMarkupInteractionStart?: () => void;
  onMarkupInteractionEnd?: () => void;
  redactActive?: boolean;
  redactionBoxes?: StudioV2RedactionDraftBox[];
  onRedactionBoxAdd?: (box: StudioV2RedactionDraftBox) => void;
  onRemoveMarkupBox?: (boxId: string) => void;
  onClearMarkup?: () => void;
  onApplyMarkup?: () => void;
  onCancelMarkup?: () => void;
  onCancelMarkupJob?: () => void;
  markupCanUndo?: boolean;
  markupCanRedo?: boolean;
  onMarkupUndo?: () => void;
  onMarkupRedo?: () => void;
  onTrash?: () => void;
  onHelp?: () => void;
  isSessionActionDisabled?: boolean;
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
  onCheckoutVersion,
  metadata,
  onUpdateMetadata,
  onAddNewPage,
  onEnterEdit,
  onRotateClockwise,
  onRotateCounterClockwise,
  onDeletePage,
  onMovePageEarlier,
  onMovePageLater,
  onDuplicatePage,
  onCropPage,
  cropDraft,
  onCropDraftChange,
  cropTargetMode,
  cropCustomPages,
  onCropTargetModeChange,
  onCropCustomPagesChange,
  selectedOverlayId,
  onSelectOverlay,
  onAddText,
  onUpdateText,
  onRemoveText,
  onAddSignature,
  onUpdateSignature,
  onRemoveSignature,
  overlayDraft,
  onOverlayDraftChange,
  onOverlayCommit,
  canMovePageEarlier,
  canMovePageLater,
  isCommandLoading,
  markupAction,
  markupMode,
  markupAnalysis,
  markupAnalysisLoading,
  markupAnalysisError,
  markupColor,
  markupBoxes,
  markupJob,
  markupError,
  onMarkupActionChange,
  onMarkupModeChange,
  onMarkupColorChange,
  onMarkupBoxChange,
  onMarkupInteractionStart,
  onMarkupInteractionEnd,
  redactActive,
  redactionBoxes,
  onRedactionBoxAdd,
  onRemoveMarkupBox,
  onClearMarkup,
  onApplyMarkup,
  onCancelMarkup,
  onCancelMarkupJob,
  markupCanUndo,
  markupCanRedo,
  onMarkupUndo,
  onMarkupRedo,
  onTrash,
  onHelp,
  isSessionActionDisabled,
}) => {
  return (
    <div className="studio-v2-theme flex h-screen w-screen overflow-hidden bg-[#0B0C0F]">
      {/* Desktop Left Sidebar */}
      <div className="hidden md:block">
        <StudioV2Sidebar
          document={document}
          activeTool={activeTool}
          onSelectTool={onSelectTool}
          onAddNewPage={onAddNewPage}
          onEnterEdit={onEnterEdit}
          onTrash={onTrash}
          onHelp={onHelp}
          isSessionActionDisabled={isSessionActionDisabled}
        />
      </div>

      {/* Central Fluid Canvas Workspace */}
      <main className="flex-1 md:ml-[260px] md:mr-[300px] mt-[48px] mb-[56px] md:mb-0 h-[calc(100vh-48px-56px)] md:h-[calc(100vh-48px)] relative flex bg-[#0B0C0F] overflow-hidden">
        <StudioV2Canvas
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
          markupAction={activeTool === "annotate" ? markupAction : null}
          markupColor={activeTool === "annotate" ? markupColor : undefined}
          markupBoxes={markupBoxes}
          onMarkupBoxChange={onMarkupBoxChange}
          onMarkupInteractionStart={onMarkupInteractionStart}
          onMarkupInteractionEnd={onMarkupInteractionEnd}
          redactActive={redactActive}
          redactionBoxes={redactionBoxes}
          onRedactionBoxAdd={onRedactionBoxAdd}
          cropActive={activeTool === "edit" && !selectedOverlayId}
          cropDraft={cropDraft}
          onCropDraftChange={onCropDraftChange}
          selectedOverlayId={selectedOverlayId}
          overlayDraft={activeTool === "edit" || activeTool === "layers" ? overlayDraft : null}
          onSelectOverlay={activeTool === "edit" || activeTool === "layers" ? onSelectOverlay : undefined}
          onOverlayDraftChange={activeTool === "edit" || activeTool === "layers" ? onOverlayDraftChange : undefined}
          onOverlayCommit={activeTool === "edit" || activeTool === "layers" ? onOverlayCommit : undefined}
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
          pages={vdm?.pages ?? []}
          cropDraft={cropDraft}
          onCropDraftChange={onCropDraftChange}
          cropTargetMode={cropTargetMode}
          cropCustomPages={cropCustomPages}
          onCropTargetModeChange={onCropTargetModeChange}
          onCropCustomPagesChange={onCropCustomPagesChange}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={onSelectOverlay}
          onAddText={onAddText}
          onUpdateText={onUpdateText}
          onRemoveText={onRemoveText}
          onAddSignature={onAddSignature}
          onUpdateSignature={onUpdateSignature}
          onRemoveSignature={onRemoveSignature}
          overlayDraft={overlayDraft}
          onOverlayDraftChange={onOverlayDraftChange}
          canMovePageEarlier={canMovePageEarlier}
          canMovePageLater={canMovePageLater}
          isCommandLoading={isCommandLoading}
          activeTool={activeTool}
          markupAction={markupAction}
          markupMode={markupMode}
          markupAnalysis={markupAnalysis}
          markupAnalysisLoading={markupAnalysisLoading}
          markupAnalysisError={markupAnalysisError}
          markupColor={markupColor}
          markupBoxes={markupBoxes}
          markupJob={markupJob}
          markupError={markupError}
          onMarkupActionChange={onMarkupActionChange}
          onMarkupModeChange={onMarkupModeChange}
          onMarkupColorChange={onMarkupColorChange}
          onRemoveMarkupBox={onRemoveMarkupBox}
          onClearMarkup={onClearMarkup}
          onApplyMarkup={onApplyMarkup}
          onCancelMarkup={onCancelMarkup}
          onCancelMarkupJob={onCancelMarkupJob}
          markupCanUndo={markupCanUndo}
          markupCanRedo={markupCanRedo}
          onMarkupUndo={onMarkupUndo}
          onMarkupRedo={onMarkupRedo}
        />
      </div>
    </div>
  );
};
