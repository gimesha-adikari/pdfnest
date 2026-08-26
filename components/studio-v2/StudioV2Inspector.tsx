"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileText, Clock, RotateCcw, RotateCw, Trash2, Info, Loader2, ArrowUp, ArrowDown, Copy, Crop, Type, Plus, PenTool } from "lucide-react";
import SignaturePad from "@/components/pdf/SignaturePad";
import { StudioV2MarkupPanel } from "./StudioV2MarkupPanel";
import { DocumentInfo, HistoryItem, InspectorTab } from "./types";
import { StudioJobDTO, StudioMarkupAction, StudioMarkupBox, StudioMetadataParameters, StudioSignatureOverlayParameters, StudioTextOverlayParameters, StudioUpdateSignatureOverlayParameters, StudioUpdateTextOverlayParameters, VDMPageDescriptorDTO } from "@/lib/studio-v2/api";

interface StudioV2InspectorProps {
  document: DocumentInfo;
  activeTab: InspectorTab;
  history: HistoryItem[];
  onSelectTab: (tab: InspectorTab) => void;
  onCheckoutVersion?: (versionId: string) => void;
  metadata?: Record<string, string> | null;
  onUpdateMetadata?: (metadata: StudioMetadataParameters) => void | Promise<void>;
  selectedPage?: VDMPageDescriptorDTO | null;
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
  onAddSignature?: (blob: Blob, parameters: StudioSignatureOverlayParameters) => void | Promise<void>;
  onUpdateSignature?: (parameters: StudioUpdateSignatureOverlayParameters) => void | Promise<void>;
  onRemoveSignature?: (target: { page_id: string; overlay_id: string }) => void | Promise<void>;
  canMovePageEarlier?: boolean;
  canMovePageLater?: boolean;
  isCommandLoading?: boolean;
  activeTool?: string;
  markupAction?: StudioMarkupAction;
  markupBoxes?: StudioMarkupBox[];
  markupJob?: StudioJobDTO | null;
  markupError?: string | null;
  onMarkupActionChange?: (action: StudioMarkupAction) => void;
  onRemoveMarkupBox?: (boxId: string) => void;
  onClearMarkup?: () => void;
  onApplyMarkup?: () => void;
  onCancelMarkup?: () => void;
  onCancelMarkupJob?: () => void;
}

export const StudioV2Inspector: React.FC<StudioV2InspectorProps> = ({
  document,
  activeTab,
  history,
  onSelectTab,
  onCheckoutVersion,
  metadata,
  onUpdateMetadata,
  selectedPage,
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
  onAddSignature,
  onUpdateSignature,
  onRemoveSignature,
  canMovePageEarlier = false,
  canMovePageLater = false,
  isCommandLoading = false,
  activeTool = "edit",
  markupAction = "highlight",
  markupBoxes = [],
  markupJob = null,
  markupError = null,
  onMarkupActionChange,
  onRemoveMarkupBox,
  onClearMarkup,
  onApplyMarkup,
  onCancelMarkup,
  onCancelMarkupJob,
}) => {
  const cropDefaults = useMemo(() => {
    const existing = selectedPage?.crop_box;
    if (existing?.length === 4) return existing;
    const width = selectedPage?.dimensions?.width ?? 0;
    const height = selectedPage?.dimensions?.height ?? 0;
    return [0, 0, width, height];
  }, [selectedPage?.crop_box, selectedPage?.dimensions?.width, selectedPage?.dimensions?.height]);
  const cropKey = cropDefaults.join(",");
  const [cropValues, setCropValues] = useState<string[]>(cropDefaults.map((value) => String(value)));
  const [cropError, setCropError] = useState<string | null>(null);

  const metadataDefaults = useMemo<StudioMetadataParameters>(() => ({
    title: metadata?.Title ?? metadata?.title ?? "",
    author: metadata?.Author ?? metadata?.author ?? "",
    subject: metadata?.Subject ?? metadata?.subject ?? "",
    keywords: metadata?.Keywords ?? metadata?.keywords ?? "",
  }), [metadata]);
  const metadataKey = Object.values(metadataDefaults).join("\u0001");
  const [metadataDraft, setMetadataDraft] = useState<StudioMetadataParameters>(metadataDefaults);

  const textOverlays = useMemo(
    () => selectedPage?.overlays.filter((overlay) => overlay.type === "text") ?? [],
    [selectedPage?.overlays]
  );
  const selectedTextOverlay = textOverlays.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const [textDraft, setTextDraft] = useState("Studio V2 Add Text");
  const [textX, setTextX] = useState("72");
  const [textY, setTextY] = useState("72");
  const [textFontSize, setTextFontSize] = useState("24");
  const [textColor, setTextColor] = useState("#000000");
  const [textError, setTextError] = useState<string | null>(null);
  const signatureOverlays = useMemo(
    () => selectedPage?.overlays.filter((overlay) => overlay.type === "signature") ?? [],
    [selectedPage?.overlays]
  );
  const selectedSignatureOverlay = signatureOverlays.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureX, setSignatureX] = useState("72");
  const [signatureY, setSignatureY] = useState("72");
  const [signatureWidth, setSignatureWidth] = useState("180");
  const [signatureHeight, setSignatureHeight] = useState("60");
  const [signatureError, setSignatureError] = useState<string | null>(null);

  useEffect(() => {
    setMetadataDraft(metadataDefaults);
  }, [metadataKey]);

  useEffect(() => {
    setCropValues(cropDefaults.map((value) => String(value)));
    setCropError(null);
  }, [cropKey]);

  useEffect(() => {
    if (selectedTextOverlay) {
      setTextDraft(selectedTextOverlay.text ?? "");
      setTextX(String(selectedTextOverlay.rect?.[0] ?? 72));
      setTextY(String(selectedTextOverlay.rect?.[1] ?? 72));
      setTextFontSize(String(selectedTextOverlay.font_size ?? 24));
      setTextColor(selectedTextOverlay.color ?? "#000000");
    } else {
      setTextDraft("Studio V2 Add Text");
      setTextX("72");
      setTextY("72");
      setTextFontSize("24");
      setTextColor("#000000");
    }
    setTextError(null);
  }, [selectedTextOverlay?.id, selectedPage?.page_id]);

  useEffect(() => {
    if (selectedSignatureOverlay) {
      setSignatureX(String(selectedSignatureOverlay.rect?.[0] ?? 72));
      setSignatureY(String(selectedSignatureOverlay.rect?.[1] ?? 72));
      setSignatureWidth(String(selectedSignatureOverlay.rect?.[2] ?? 180));
      setSignatureHeight(String(selectedSignatureOverlay.rect?.[3] ?? 60));
    } else {
      setSignatureX("72");
      setSignatureY("72");
      setSignatureWidth("180");
      setSignatureHeight("60");
    }
    setSignatureError(null);
  }, [selectedSignatureOverlay?.id, selectedPage?.page_id]);

  const parsedCrop = cropValues.map((value) => Number(value));
  const pageWidth = selectedPage?.dimensions?.width ?? 0;
  const pageHeight = selectedPage?.dimensions?.height ?? 0;
  const cropIsValid =
    parsedCrop.length === 4 &&
    parsedCrop.every((value) => Number.isFinite(value)) &&
    pageWidth > 0 &&
    pageHeight > 0 &&
    parsedCrop[0] >= 0 &&
    parsedCrop[1] >= 0 &&
    parsedCrop[2] > parsedCrop[0] &&
    parsedCrop[3] > parsedCrop[1] &&
    parsedCrop[2] <= pageWidth &&
    parsedCrop[3] <= pageHeight;

  const handleCropSubmit = () => {
    if (!cropIsValid || !onCropPage) {
      setCropError("Enter a positive crop box inside the page bounds.");
      return;
    }
    setCropError(null);
    void onCropPage(parsedCrop);
  };

  const handleMetadataSubmit = () => {
    if (!onUpdateMetadata) return;
    void onUpdateMetadata(metadataDraft);
  };

  const handleTextSubmit = () => {
    if (!selectedPage) return;
    const x = Number(textX);
    const y = Number(textY);
    const fontSize = Number(textFontSize);
    const width = selectedPage.dimensions?.width ?? 0;
    const height = selectedPage.dimensions?.height ?? 0;
    if (!textDraft.trim() || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fontSize) || fontSize < 8 || fontSize > 144 || x < 0 || y < 0 || x + fontSize > width || y + fontSize > height || !/^#[0-9a-fA-F]{6}$/.test(textColor)) {
      setTextError("Enter text and a valid position, size, and hex color inside the page bounds.");
      return;
    }
    setTextError(null);
    const base = { page_id: selectedPage.page_id, text: textDraft, x, y, font_size: fontSize, color: textColor };
    if (selectedTextOverlay && onUpdateText) {
      void onUpdateText({ ...base, overlay_id: selectedTextOverlay.id });
    } else if (onAddText) {
      void onAddText(base);
    }
  };

  const handleSignatureSubmit = () => {
    if (!selectedPage) return;
    const x = Number(signatureX);
    const y = Number(signatureY);
    const width = Number(signatureWidth);
    const height = Number(signatureHeight);
    const pageWidth = selectedPage.dimensions?.width ?? 0;
    const pageHeight = selectedPage.dimensions?.height ?? 0;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > pageWidth || y + height > pageHeight) {
      setSignatureError("Enter a positive signature rectangle inside the page bounds.");
      return;
    }
    setSignatureError(null);
    const base = { page_id: selectedPage.page_id, asset_id: selectedSignatureOverlay?.asset_id ?? "", x, y, width, height };
    if (selectedSignatureOverlay && onUpdateSignature) {
      void onUpdateSignature({ ...base, overlay_id: selectedSignatureOverlay.id });
    } else if (signatureBlob && onAddSignature) {
      void onAddSignature(signatureBlob, base);
    } else {
      setSignatureError("Create or upload a signature first.");
    }
  };

  return (
    <aside className="fixed right-0 top-[48px] bottom-0 w-[300px] bg-[#101216] border-l border-[#292D35] flex flex-col z-40">
      {/* Inspector Tabs */}
      <div className="flex border-b border-[#292D35] bg-[#101216]">
        <button
          onClick={() => onSelectTab("properties")}
          className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-colors ${
            activeTab === "properties"
              ? "border-b-2 border-[#7c3aed] text-[#d2bbff] bg-[#14171C] font-semibold"
              : "text-[#9AA1AD] hover:text-white border-b-2 border-transparent"
          }`}
        >
          Properties
        </button>
        <button
          onClick={() => onSelectTab("history")}
          className={`flex-1 py-2.5 text-xs font-mono tracking-wider transition-colors ${
            activeTab === "history"
              ? "border-b-2 border-[#7c3aed] text-[#d2bbff] bg-[#14171C] font-semibold"
              : "text-[#9AA1AD] hover:text-white border-b-2 border-transparent"
          }`}
        >
          History
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "properties" ? (
          <div className="p-4 space-y-6">
            {activeTool === "annotate" && onMarkupActionChange && onRemoveMarkupBox && onClearMarkup && onApplyMarkup && onCancelMarkup && onCancelMarkupJob && (
              <StudioV2MarkupPanel
                action={markupAction}
                boxes={markupBoxes}
                job={markupJob}
                error={markupError}
                disabled={isCommandLoading}
                onActionChange={onMarkupActionChange}
                onClear={onClearMarkup}
                onRemoveBox={onRemoveMarkupBox}
                onApply={onApplyMarkup}
                onCancel={onCancelMarkup}
                onCancelJob={onCancelMarkupJob}
              />
            )}
            {/* Document Properties */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">
                  Document Properties
                </h3>
              </div>

              <div className="space-y-2.5 bg-[#14171C] p-3 rounded border border-[#292D35]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">PAGES</span>
                  <span className="font-medium text-[#F5F7FA]">
                    <span data-testid="studio-page-count">{document.pageCount}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">SIZE</span>
                  <span className="font-medium text-[#F5F7FA]">
                    {document.fileSize}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">VERSION</span>
                  <span className="font-medium text-[#F5F7FA]">
                    <span data-testid="studio-version">{document.version}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Selected page controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <RotateCw className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">Selected Page</h3>
              </div>
              {!selectedPage ? (
                <p className="text-xs text-[#9AA1AD] bg-[#14171C] p-3 rounded border border-[#292D35]">
                  Select a page in the canvas to edit or organize it.
                </p>
              ) : (
                <div className="space-y-3 bg-[#14171C] p-3 rounded border border-[#292D35]">
                  <div className="text-xs text-[#D8DCE3]">Page {selectedPage.source_page_number}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onRotateCounterClockwise}
                      disabled={isCommandLoading}
                      aria-label="Rotate counter-clockwise 90°"
                      data-testid="studio-rotate-counter-clockwise"
                      title="Rotate counter-clockwise 90°"
                      className="flex items-center justify-center gap-1.5 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      CCW 90°
                    </button>
                    <button
                      type="button"
                      onClick={onRotateClockwise}
                      disabled={isCommandLoading}
                      aria-label="Rotate clockwise 90°"
                      data-testid="studio-rotate-clockwise"
                      title="Rotate clockwise 90°"
                      className="flex items-center justify-center gap-1.5 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                      CW 90°
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onDeletePage}
                    disabled={isCommandLoading}
                    aria-label="Delete selected page"
                    title="Delete selected page"
                    className="w-full flex items-center justify-center gap-2 rounded border border-red-900/70 px-2 py-2 text-[11px] text-red-300 hover:border-red-500 hover:bg-red-950/30 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete page
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onMovePageEarlier}
                      disabled={isCommandLoading || !canMovePageEarlier}
                      aria-label="Move page earlier"
                      title="Move page earlier"
                      className="flex items-center justify-center gap-1.5 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      Earlier
                    </button>
                    <button
                      type="button"
                      onClick={onMovePageLater}
                      disabled={isCommandLoading || !canMovePageLater}
                      aria-label="Move page later"
                      title="Move page later"
                      className="flex items-center justify-center gap-1.5 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      Later
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onDuplicatePage}
                    disabled={isCommandLoading}
                    aria-label="Duplicate page"
                    title="Duplicate page"
                    className="w-full flex items-center justify-center gap-2 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    Duplicate page
                  </button>
                </div>
              )}
            </div>

            {/* Add Text controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Type className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">Add Text</h3>
              </div>
              {!selectedPage ? (
                <p className="text-xs text-[#9AA1AD] bg-[#14171C] p-3 rounded border border-[#292D35]">Select a page to place text.</p>
              ) : (
                <div className="space-y-3 bg-[#14171C] p-3 rounded border border-[#292D35]">
                  <p className="text-[10px] leading-4 text-[#9AA1AD]">Native PDF points, lower-left origin. V1 uses Helvetica, color, and 8–144 pt text.</p>
                  <label className="block space-y-1 text-[10px] text-[#9AA1AD]"><span>Text</span><textarea aria-label="Add Text content" data-testid="studio-add-text-content" value={textDraft} onChange={(event) => setTextDraft(event.target.value)} rows={2} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA] outline-none focus:border-[#7c3aed]" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>X (left)</span><input aria-label="Add Text X" data-testid="studio-add-text-x" type="number" step="1" value={textX} onChange={(event) => setTextX(event.target.value)} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Y (bottom)</span><input aria-label="Add Text Y" data-testid="studio-add-text-y" type="number" step="1" value={textY} onChange={(event) => setTextY(event.target.value)} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Size (pt)</span><input aria-label="Add Text font size" data-testid="studio-add-text-size" type="number" min="8" max="144" value={textFontSize} onChange={(event) => setTextFontSize(event.target.value)} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Color</span><input aria-label="Add Text color" data-testid="studio-add-text-color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} className="h-7 w-full rounded border border-[#3b3742] bg-[#101216]" /></label>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { onSelectOverlay?.(null); setTextError(null); }} disabled={isCommandLoading} aria-label="New text" data-testid="studio-new-text" className="flex flex-1 items-center justify-center gap-1 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> New</button>
                    <button type="button" onClick={handleTextSubmit} disabled={isCommandLoading || !onAddText || (Boolean(selectedTextOverlay) && !onUpdateText)} aria-label={selectedTextOverlay ? "Update text" : "Apply text"} data-testid="studio-apply-text" className="flex flex-[2] items-center justify-center gap-2 rounded border border-[#7c3aed]/70 px-2 py-2 text-[11px] text-[#d2bbff] hover:bg-[#7c3aed]/15 hover:text-white disabled:opacity-40">{isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Type className="w-3.5 h-3.5" />}{selectedTextOverlay ? "Update text" : "Apply text"}</button>
                  </div>
                  {selectedTextOverlay && onRemoveText && <button type="button" onClick={() => void onRemoveText({ page_id: selectedPage.page_id, overlay_id: selectedTextOverlay.id })} disabled={isCommandLoading} aria-label="Remove selected text" data-testid="studio-remove-text" className="w-full rounded border border-red-900/70 px-2 py-2 text-[11px] text-red-300 hover:border-red-500 disabled:opacity-40">Remove selected text</button>}
                  {textError && <p role="alert" className="text-[10px] text-red-300">{textError}</p>}
                  {textOverlays.length > 0 && <div className="space-y-1 border-t border-[#292D35] pt-2"><span className="text-[10px] text-[#9AA1AD]">Text elements on this page</span>{textOverlays.map((overlay) => <button type="button" key={overlay.id} onClick={() => onSelectOverlay?.(overlay.id)} aria-label={`Select text ${overlay.text ?? ""}`} data-testid={`studio-text-overlay-${overlay.id}`} className={`block w-full truncate rounded border px-2 py-1.5 text-left text-[11px] ${selectedOverlayId === overlay.id ? "border-[#7c3aed] text-white" : "border-[#3b3742] text-[#D8DCE3]"}`}>{overlay.text}</button>)}</div>}
                </div>
              )}
            </div>

            {/* Sign controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <PenTool className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">Sign</h3>
              </div>
              {!selectedPage ? (
                <p className="text-xs text-[#9AA1AD] bg-[#14171C] p-3 rounded border border-[#292D35]">Select a page to place a signature.</p>
              ) : (
                <div className="space-y-3 bg-[#14171C] p-3 rounded border border-[#292D35]">
                  <p className="text-[10px] leading-4 text-[#9AA1AD]">Draw or upload a PNG/JPEG signature, then place it in native PDF points from the lower-left origin. Width and height are editable.</p>
                  {!selectedSignatureOverlay && <SignaturePad onSignatureChange={setSignatureBlob} undoButtonLabel="Revert signature stroke" />}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>X (left)</span><input aria-label="Signature X" data-testid="studio-signature-x" type="number" step="1" value={signatureX} onChange={(event) => setSignatureX(event.target.value)} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Y (bottom)</span><input aria-label="Signature Y" data-testid="studio-signature-y" type="number" step="1" value={signatureY} onChange={(event) => setSignatureY(event.target.value)} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Width</span><input aria-label="Signature width" data-testid="studio-signature-width" type="number" min="1" value={signatureWidth} onChange={(event) => { const width = Number(event.target.value); setSignatureWidth(event.target.value); if (Number.isFinite(width) && width > 0) setSignatureHeight(String(Math.max(1, Math.round(width / 3)))); }} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                    <label className="space-y-1 text-[10px] text-[#9AA1AD]"><span>Height</span><input aria-label="Signature height" data-testid="studio-signature-height" type="number" min="1" value={signatureHeight} onChange={(event) => { const height = Number(event.target.value); setSignatureHeight(event.target.value); if (Number.isFinite(height) && height > 0) setSignatureWidth(String(Math.max(1, Math.round(height * 3)))); }} className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA]" /></label>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { onSelectOverlay?.(null); setSignatureBlob(null); setSignatureError(null); }} disabled={isCommandLoading} aria-label="New signature" data-testid="studio-new-signature" className="flex-1 rounded border border-[#3b3742] px-2 py-2 text-[11px] text-[#D8DCE3] hover:border-[#7c3aed] disabled:opacity-40">New</button>
                    <button type="button" onClick={handleSignatureSubmit} disabled={isCommandLoading || (!selectedSignatureOverlay && !signatureBlob) || (Boolean(selectedSignatureOverlay) && !onUpdateSignature)} aria-label={selectedSignatureOverlay ? "Update signature" : "Apply signature"} data-testid="studio-apply-signature" className="flex-[2] rounded border border-[#7c3aed]/70 px-2 py-2 text-[11px] text-[#d2bbff] hover:bg-[#7c3aed]/15 disabled:opacity-40">{isCommandLoading ? "Applying…" : selectedSignatureOverlay ? "Update signature" : "Apply signature"}</button>
                  </div>
                  {selectedSignatureOverlay && onRemoveSignature && <button type="button" onClick={() => void onRemoveSignature({ page_id: selectedPage.page_id, overlay_id: selectedSignatureOverlay.id })} disabled={isCommandLoading} aria-label="Remove selected signature" data-testid="studio-remove-signature" className="w-full rounded border border-red-900/70 px-2 py-2 text-[11px] text-red-300 hover:border-red-500 disabled:opacity-40">Remove selected signature</button>}
                  {signatureError && <p role="alert" className="text-[10px] text-red-300">{signatureError}</p>}
                  {signatureOverlays.length > 0 && <div className="space-y-1 border-t border-[#292D35] pt-2"><span className="text-[10px] text-[#9AA1AD]">Signatures on this page</span>{signatureOverlays.map((overlay) => <button type="button" key={overlay.id} onClick={() => onSelectOverlay?.(overlay.id)} aria-label="Select signature" data-testid={`studio-signature-overlay-${overlay.id}`} className={`block w-full truncate rounded border px-2 py-1.5 text-left text-[11px] ${selectedOverlayId === overlay.id ? "border-[#7c3aed] text-white" : "border-[#3b3742] text-[#D8DCE3]"}`}>Signature</button>)}</div>}
                </div>
              )}
            </div>

            {/* Document metadata controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">Metadata</h3>
              </div>
              <div className="space-y-3 bg-[#14171C] p-3 rounded border border-[#292D35]">
                <p className="text-[10px] leading-4 text-[#9AA1AD]">
                  Saved as Studio state. PDF metadata is written during finalization.
                </p>
                {([
                  ["title", "Title"],
                  ["author", "Author"],
                  ["subject", "Subject"],
                  ["keywords", "Keywords"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block space-y-1 text-[10px] text-[#9AA1AD]">
                    <span>{label}</span>
                    <input
                      aria-label={`Metadata ${label}`}
                      data-testid={`studio-metadata-${key}`}
                      type="text"
                      value={metadataDraft[key] ?? ""}
                      onChange={(event) => {
                        setMetadataDraft((current) => ({ ...current, [key]: event.target.value }));
                      }}
                      className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA] outline-none focus:border-[#7c3aed]"
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={handleMetadataSubmit}
                  disabled={isCommandLoading || !onUpdateMetadata}
                  aria-label="Apply metadata"
                  data-testid="studio-apply-metadata"
                  className="w-full flex items-center justify-center gap-2 rounded border border-[#7c3aed]/70 px-2 py-2 text-[11px] text-[#d2bbff] hover:bg-[#7c3aed]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  Apply metadata
                </button>
              </div>
            </div>

            {/* Page Geometry */}
            <div>
              <h3 className="text-xs font-semibold text-[#F5F7FA] mb-3">
                Page Dimensions
              </h3>
              <div className="space-y-2.5 bg-[#14171C] p-3 rounded border border-[#292D35]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">WIDTH</span>
                  <span className="font-medium text-[#F5F7FA]">{selectedPage?.dimensions?.width?.toFixed(2) ?? "—"} pt</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">HEIGHT</span>
                  <span className="font-medium text-[#F5F7FA]">{selectedPage?.dimensions?.height?.toFixed(2) ?? "—"} pt</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#9AA1AD] text-[11px]">ROTATION</span>
                  <span className="font-medium text-[#F5F7FA]">{selectedPage ? `${selectedPage.rotation}°` : "—"}</span>
                </div>
              </div>
            </div>

            {/* Crop controls */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Crop className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">Crop Page</h3>
              </div>
              {!selectedPage ? (
                <p className="text-xs text-[#9AA1AD] bg-[#14171C] p-3 rounded border border-[#292D35]">
                  Select a page to set its crop box.
                </p>
              ) : (
                <div className="space-y-3 bg-[#14171C] p-3 rounded border border-[#292D35]">
                  <p className="text-[10px] leading-4 text-[#9AA1AD]">
                    PDF points, lower-left origin: [llx, lly, urx, ury].
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["llx", "Left"],
                      ["lly", "Bottom"],
                      ["urx", "Right"],
                      ["ury", "Top"],
                    ].map(([key, label], index) => (
                      <label key={key} className="space-y-1 text-[10px] text-[#9AA1AD]">
                        <span>{label} ({key})</span>
                        <input
                          aria-label={`Crop ${label.toLowerCase()}`}
                          data-testid={`studio-crop-${key}`}
                          type="number"
                          step="0.01"
                          value={cropValues[index] ?? ""}
                          onChange={(event) => {
                            const next = [...cropValues];
                            next[index] = event.target.value;
                            setCropValues(next);
                            setCropError(null);
                          }}
                          aria-invalid={cropError ? "true" : "false"}
                          className="w-full rounded border border-[#3b3742] bg-[#101216] px-2 py-1.5 text-xs text-[#F5F7FA] outline-none focus:border-[#7c3aed]"
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCropSubmit}
                    disabled={isCommandLoading || !cropIsValid || !onCropPage}
                    aria-label="Apply crop"
                    data-testid="studio-apply-crop"
                    className="w-full flex items-center justify-center gap-2 rounded border border-[#7c3aed]/70 px-2 py-2 text-[11px] text-[#d2bbff] hover:bg-[#7c3aed]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isCommandLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crop className="w-3.5 h-3.5" />}
                    Apply crop
                  </button>
                  {cropError && <p role="alert" className="text-[10px] text-red-300">{cropError}</p>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#d2bbff]" />
                <h3 className="text-xs font-semibold text-[#F5F7FA]">
                  Editing History
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#9AA1AD]">
                DAG LINEAGE
              </span>
            </div>

            {/* Explicit Notice of Shell Placeholder */}
            <div className="mb-4 p-2 bg-[#14171C] rounded border border-[#292D35] flex items-start gap-2 text-[10px] text-[#9AA1AD]">
              <Info className="w-3.5 h-3.5 text-[#d2bbff] shrink-0 mt-0.5" />
              <span>
                Visual shell timeline. Live backend lineage & checkout connect in Phase 3B.
              </span>
            </div>

            {/* Timeline */}
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-[#292D35]">
              {history.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Timeline Bullet Node */}
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border flex items-center justify-center bg-[#101216] transition-colors ${
                      item.isActive
                        ? "border-[#7c3aed]"
                        : "border-[#292D35] group-hover:border-[#9AA1AD]"
                    }`}
                  >
                    {item.isActive && (
                      <div className="w-2 h-2 rounded-full bg-[#7c3aed]" />
                    )}
                  </div>

                  <div
                    className={`p-2.5 rounded text-xs transition-colors border ${
                      item.isActive
                        ? "bg-[#181B21] border-[#7c3aed] text-white"
                        : "bg-[#14171C] border-[#292D35] text-[#9AA1AD] hover:text-[#F5F7FA] hover:border-[#3b3742]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.action}</span>
                      {onCheckoutVersion && !item.isActive && (
                        <button
                          onClick={() => onCheckoutVersion(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-[#d2bbff] transition-opacity"
                          title="Restore this version (Phase 3B)"
                          aria-label={`Restore version ${item.versionNumber}`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[#717784] block mt-1">
                      v{item.versionNumber} • {item.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
