"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { StudioV2Sidebar } from "./StudioV2Sidebar";
import { StudioV2Canvas } from "./StudioV2Canvas";
import { StudioV2Inspector } from "./StudioV2Inspector";
import { StudioV2BottomSheet } from "./StudioV2BottomSheet";
import { SlidersHorizontal } from "lucide-react";
import { StudioV2PageNavigator } from "./StudioV2PageNavigator";
import { StudioV2ContextToolbar } from "./StudioV2ContextToolbar";
import { shouldDismissStudioMobileSheet } from "./studioV2PresentationState";
import { DocumentInfo, HistoryItem, InspectorTab, StudioV2OverlayDraft, StudioV2RedactionDraftBox, ToolCategory } from "./types";
import { StudioJobDTO, StudioMarkupAction, StudioMarkupAnalysis, StudioMarkupBox, StudioMarkupMode, StudioMetadataParameters, StudioSignatureOverlayParameters, StudioTextOverlayParameters, StudioUpdateSignatureOverlayParameters, StudioUpdateTextOverlayParameters, StudioVDMDTO } from "@/lib/studio-v2/api";

interface StudioV2WorkspaceProps {
  document: DocumentInfo;
  sessionId?: string | null;
  versionId?: string | null;
  previewVersionByPageId?: Record<string, string>;
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
  mobileSheetOpen?: boolean;
  onCloseMobileSheet?: () => void;
  onOpenMobileSheet?: () => void;
  contextRequest?: number;
  surfaceDismissRequest?: number;
}

export const StudioV2Workspace: React.FC<StudioV2WorkspaceProps> = ({
  document,
  sessionId,
  versionId,
  previewVersionByPageId,
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
  mobileSheetOpen = false,
  onCloseMobileSheet,
  onOpenMobileSheet,
  contextRequest = 0,
  surfaceDismissRequest = 0,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [pageNavigatorOpen, setPageNavigatorOpen] = useState(false);
  const [scrollToPageId, setScrollToPageId] = useState<string | null>(() => selectedPageId ?? null);
  const pendingScrollTargetRef = useRef<string | null>(selectedPageId ?? null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(min-width: 768px) and (max-width: 1199.99px)").matches) return;
    const timer = window.setTimeout(() => setDrawerOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (contextRequest <= 0) return;
    const timer = window.setTimeout(() => setDrawerOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [contextRequest]);
  useEffect(() => {
    const timer = window.setTimeout(() => setPageNavigatorOpen(activeTool === "pages"), 0);
    return () => window.clearTimeout(timer);
  }, [activeTool]);
  useEffect(() => {
    if (surfaceDismissRequest <= 0) return;
    const timer = window.setTimeout(() => setPageNavigatorOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [surfaceDismissRequest]);
  useEffect(() => {
    if (pendingScrollTargetRef.current && vdm?.pages.every((page) => page.page_id !== pendingScrollTargetRef.current)) {
      pendingScrollTargetRef.current = null;
      setScrollToPageId(null);
    }
  }, [vdm]);
  const handleVisiblePageChange = useCallback((pageId: string) => {
    const pendingTarget = pendingScrollTargetRef.current;
    if (pendingTarget && pendingTarget !== pageId) return;
    onSelectPage?.(pageId);
  }, [onSelectPage]);
  const handlePageScrollComplete = useCallback(() => {
    pendingScrollTargetRef.current = null;
    setScrollToPageId(null);
  }, []);
  const selectedPageIndex = vdm?.pages.findIndex((page) => page.page_id === selectedPageId) ?? -1;
  const pageLabel = selectedPageIndex >= 0 ? `Page ${selectedPageIndex + 1}` : "No page";
  const renderInspector = (presentation: "desktop" | "drawer" | "sheet", onRequestClose?: () => void) => (
    <StudioV2Inspector
      presentation={presentation}
      onRequestClose={onRequestClose}
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
  );

  const navigateToPage = (pageId: string) => {
    pendingScrollTargetRef.current = pageId;
    onSelectPage?.(pageId);
    setScrollToPageId(pageId);
    setPageNavigatorOpen(false);
  };

  return (
    <div className="studio-v2-theme studio-v2-presentation">
      {/* Desktop Left Sidebar */}
      <div className="studio-v2-desktop-rail">
        <StudioV2Sidebar
          activeTool={activeTool}
          onSelectTool={onSelectTool}
          onEnterEdit={onEnterEdit}
          onTrash={onTrash}
          onHelp={onHelp}
          isSessionActionDisabled={isSessionActionDisabled}
        />
      </div>

      {/* Central Fluid Canvas Workspace */}
      <main className="studio-v2-main-workspace">
        <StudioV2ContextToolbar
          activeTool={activeTool}
          pageLabel={pageLabel}
          pageCount={vdm?.pages.length ?? 0}
          action={markupAction ?? "highlight"}
          mode={markupMode ?? "smart"}
          pendingCount={markupBoxes?.length ?? 0}
          onActionChange={onMarkupActionChange ?? (() => undefined)}
          onModeChange={onMarkupModeChange}
          onOpenContext={() => { if (typeof window !== "undefined" && window.innerWidth < 768) onOpenMobileSheet?.(); else setDrawerOpen(true); }}
          onOpenPages={() => { setPageNavigatorOpen(true); if (shouldDismissStudioMobileSheet("page-navigator")) onCloseMobileSheet?.(); }}
          onAddNewPage={onAddNewPage}
          onMoveEarlier={onMovePageEarlier}
          onMoveLater={onMovePageLater}
          onRotate={onRotateClockwise}
          onDuplicate={onDuplicatePage}
          onEnterEdit={onEnterEdit}
        />
        <div className="studio-v2-canvas-stage">
        <StudioV2Canvas
          sessionId={sessionId}
          versionId={versionId}
          previewVersionByPageId={previewVersionByPageId}
          vdm={vdm}
          selectedPageId={selectedPageId}
          scrollToPageId={scrollToPageId}
          onPageScrollComplete={handlePageScrollComplete}
          onVisiblePageChange={handleVisiblePageChange}
          zoomScale={zoomScale}
          isPanning={isPanning}
          onSelectPage={navigateToPage}
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
        <button type="button" onClick={() => { setPageNavigatorOpen(true); if (shouldDismissStudioMobileSheet("page-navigator")) onCloseMobileSheet?.(); }} className="studio-v2-page-chip" aria-label="Open page navigator">
          <StudioV2PageNavigator pages={vdm?.pages ?? []} selectedPageId={selectedPageId} compact />
        </button>
        {!drawerOpen && <button type="button" onClick={() => setDrawerOpen(true)} className="studio-v2-context-chip" aria-label="Open context inspector">
          <SlidersHorizontal className="h-4 w-4" /> Context
        </button>}
        </div>
      </main>

      {/* A wide inspector is reserved for genuinely wide desktops. */}
      <div className={`studio-v2-wide-inspector ${drawerOpen ? "" : "collapsed"}`}>{drawerOpen && renderInspector("desktop", () => setDrawerOpen(false))}</div>
      {drawerOpen && <div className="studio-v2-tablet-inspector"><button type="button" className="studio-v2-tablet-backdrop" onClick={() => setDrawerOpen(false)} aria-label="Close context inspector" />{renderInspector("drawer", () => setDrawerOpen(false))}</div>}
      <div className="studio-v2-page-navigator-surface">
        {pageNavigatorOpen && <StudioV2PageNavigator pages={vdm?.pages ?? []} selectedPageId={selectedPageId} onSelectPage={navigateToPage} onClose={() => setPageNavigatorOpen(false)} onAddNewPage={onAddNewPage} sessionId={sessionId} versionId={versionId} previewVersionByPageId={previewVersionByPageId} />}
      </div>
      <StudioV2BottomSheet isOpen={mobileSheetOpen && !pageNavigatorOpen} title={`${activeTool} tools & properties`} onClose={onCloseMobileSheet ?? (() => undefined)}>
        {renderInspector("sheet", onCloseMobileSheet)}
      </StudioV2BottomSheet>
      <StudioV2BottomSheet isOpen={pageNavigatorOpen} title="Pages" onClose={() => setPageNavigatorOpen(false)}>
        <StudioV2PageNavigator pages={vdm?.pages ?? []} selectedPageId={selectedPageId} onSelectPage={navigateToPage} sessionId={sessionId} versionId={versionId} previewVersionByPageId={previewVersionByPageId} />
      </StudioV2BottomSheet>
    </div>
  );
};
