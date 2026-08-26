"use client";

import React, { useEffect, useState } from "react";
import {
  Undo2,
  Redo2,
  Search,
  Settings,
  HelpCircle,
  User,
  CheckCircle2,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { DocumentInfo } from "./types";
import { StudioAssetDTO, StudioCompressionLevel, StudioPageNumberingParameters, StudioWatermarkParameters, VDMPageNumberingDTO } from "@/lib/studio-v2/api";

interface StudioV2HeaderProps {
  document: DocumentInfo;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenCommandPalette?: () => void;
  onExport?: () => void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  onCompress?: () => void;
  compressionLevel?: StudioCompressionLevel;
  onCompressionLevelChange?: (level: StudioCompressionLevel) => void;
  onGrayscale?: () => void;
  onRepair?: () => void;
  onRedact?: (keywords: string) => void;
  onUploadMergeAsset?: (file: File) => Promise<StudioAssetDTO>;
  onMerge?: (assetId: string) => void;
  onSplit?: (pageSelection: string) => Promise<void> | void;
  onUploadWatermarkAsset?: (file: File) => Promise<StudioAssetDTO>;
  onWatermark?: (parameters: StudioWatermarkParameters) => Promise<void> | void;
  watermarkTargets?: Array<{ page_id: string; overlay_id: string }>;
  onRemoveWatermark?: (targets: Array<{ page_id: string; overlay_id: string }>) => Promise<void> | void;
  pageNumbering?: VDMPageNumberingDTO | null;
  onPageNumbering?: (parameters: StudioPageNumberingParameters) => Promise<void> | void;
  isMaterializing?: boolean;
  materializeDisabled?: boolean;
}

export const StudioV2Header: React.FC<StudioV2HeaderProps> = ({
  document,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenCommandPalette,
  onExport,
  isExporting = false,
  exportDisabled = false,
  onCompress,
  compressionLevel = "medium",
  onCompressionLevelChange,
  onGrayscale,
  onRepair,
  onRedact,
  onUploadMergeAsset,
  onMerge,
  onSplit,
  onUploadWatermarkAsset,
  onWatermark,
  watermarkTargets = [],
  onRemoveWatermark,
  pageNumbering,
  onPageNumbering,
  isMaterializing = false,
  materializeDisabled = false,
}) => {
  const [redactOpen, setRedactOpen] = useState(false);
  const [redactKeywords, setRedactKeywords] = useState("");
  const [redactError, setRedactError] = useState<string | null>(null);
  const [mergeSplitOpen, setMergeSplitOpen] = useState(false);
  const [mergeAsset, setMergeAsset] = useState<StudioAssetDTO | null>(null);
  const [mergeFilename, setMergeFilename] = useState("");
  const [mergeUploadError, setMergeUploadError] = useState<string | null>(null);
  const [isUploadingMergeAsset, setIsUploadingMergeAsset] = useState(false);
  const [splitPages, setSplitPages] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  const [watermarkKind, setWatermarkKind] = useState<"text" | "image">("text");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkFont, setWatermarkFont] = useState<"Helvetica" | "Times-Roman" | "Courier">("Helvetica");
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkPosition, setWatermarkPosition] = useState<StudioWatermarkParameters["position"]>("cc");
  const [watermarkAsset, setWatermarkAsset] = useState<StudioAssetDTO | null>(null);
  const [watermarkFilename, setWatermarkFilename] = useState("");
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [isUploadingWatermark, setIsUploadingWatermark] = useState(false);
  const [pageNumbersOpen, setPageNumbersOpen] = useState(false);
  const [pageNumbersEnabled, setPageNumbersEnabled] = useState(false);
  const [pageNumbersFont, setPageNumbersFont] = useState<StudioPageNumberingParameters["font_family"]>("Helvetica");
  const [pageNumbersSize, setPageNumbersSize] = useState(12);
  const [pageNumbersPosition, setPageNumbersPosition] = useState<StudioPageNumberingParameters["position"]>("bc");
  const [pageNumbersError, setPageNumbersError] = useState<string | null>(null);

  useEffect(() => {
    if (!pageNumbering) {
      setPageNumbersEnabled(false);
      return;
    }
    setPageNumbersEnabled(pageNumbering.enabled);
    if (pageNumbering.font_family === "Helvetica" || pageNumbering.font_family === "Times-Roman" || pageNumbering.font_family === "Courier") {
      setPageNumbersFont(pageNumbering.font_family);
    }
    if (pageNumbering.font_size > 0) setPageNumbersSize(pageNumbering.font_size);
    if (["bl", "bc", "br", "tl", "tc", "tr"].includes(pageNumbering.position)) {
      setPageNumbersPosition(pageNumbering.position as StudioPageNumberingParameters["position"]);
    }
  }, [pageNumbering?.enabled, pageNumbering?.font_family, pageNumbering?.font_size, pageNumbering?.position]);

  const submitRedaction = () => {
    const keywords = redactKeywords.trim();
    if (!keywords) {
      setRedactError("Enter at least one keyword to redact.");
      return;
    }
    setRedactError(null);
    setRedactOpen(false);
    setRedactKeywords("");
    onRedact?.(keywords);
  };

  const handleMergeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadMergeAsset) return;
    setMergeFilename(file.name);
    setMergeAsset(null);
    setMergeUploadError(null);
    setIsUploadingMergeAsset(true);
    try {
      setMergeAsset(await onUploadMergeAsset(file));
    } catch (err) {
      setMergeUploadError(err instanceof Error ? err.message : "Secondary PDF upload failed");
    } finally {
      setIsUploadingMergeAsset(false);
    }
  };

  const submitSplit = async () => {
    const selection = splitPages.trim();
    if (!selection) {
      setSplitError("Enter at least one page or range to keep.");
      return;
    }
    setSplitError(null);
    try {
      await onSplit?.(selection);
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "Invalid page selection");
    }
  };

  const handleWatermarkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadWatermarkAsset) return;
    setWatermarkFilename(file.name);
    setWatermarkAsset(null);
    setWatermarkError(null);
    setIsUploadingWatermark(true);
    try {
      setWatermarkAsset(await onUploadWatermarkAsset(file));
    } catch (err) {
      setWatermarkError(err instanceof Error ? err.message : "Watermark image upload failed");
    } finally {
      setIsUploadingWatermark(false);
    }
  };

  const submitWatermark = async () => {
    if (watermarkKind === "text" && !watermarkText.trim()) {
      setWatermarkError("Enter watermark text.");
      return;
    }
    if (watermarkKind === "image" && !watermarkAsset) {
      setWatermarkError("Choose a PNG or JPEG watermark image.");
      return;
    }
    setWatermarkError(null);
    await onWatermark?.({
      page_ids: [],
      kind: watermarkKind,
      text: watermarkKind === "text" ? watermarkText : undefined,
      font: watermarkFont,
      font_size: watermarkSize,
      rotation: watermarkRotation,
      opacity: watermarkOpacity,
      position: watermarkPosition,
      asset_id: watermarkKind === "image" ? watermarkAsset?.id : undefined,
    });
    setWatermarkOpen(false);
  };

  const submitPageNumbers = async (enabled: boolean) => {
    setPageNumbersError(null);
    try {
      await onPageNumbering?.({
        enabled,
        font_family: pageNumbersFont,
        font_size: pageNumbersSize,
        position: pageNumbersPosition,
      });
      setPageNumbersEnabled(enabled);
      setPageNumbersOpen(false);
    } catch (err) {
      setPageNumbersError(err instanceof Error ? err.message : "Page numbering update failed");
    }
  };

  const renderStatusBadge = () => {
    switch (document.syncStatus) {
      case "saving":
        return (
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-[#d2bbff] text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d2bbff]" />
            <span>Syncing...</span>
          </div>
        );
      case "error":
        return (
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            <span>Sync Error</span>
          </div>
        );
      case "loading":
        return (
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9AA1AD]" />
            <span>Loading...</span>
          </div>
        );
      case "saved":
      default:
        return (
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Status: Saved</span>
          </div>
        );
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-[48px] bg-[#101216] border-b border-[#292D35] flex items-center justify-between px-4 z-50 transition-colors duration-200">
      {/* Brand & Left Navigation */}
      <div className="flex items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-[16px] text-white tracking-wide">
            PLATEN
          </span>
          <span className="text-[11px] font-mono text-[#9AA1AD] tracking-wider uppercase">
            PDF Studio
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center h-[48px] space-x-1">
          <div className="h-[48px] flex items-center px-3 text-[#d2bbff] font-medium border-b-2 border-[#7c3aed] text-sm">
            Document
          </div>
          {renderStatusBadge()}
          <button
            onClick={onUndo}
            disabled={!canUndo || isMaterializing}
            className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] transition-colors text-sm disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Undo"
            title={canUndo ? "Undo" : "Undo (no parent revision)"}
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden lg:inline">Undo</span>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo || isMaterializing}
            className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] transition-colors text-sm disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Redo"
            title={canRedo ? "Redo" : "Redo (no child branch)"}
          >
            <Redo2 className="w-4 h-4" />
            <span className="hidden lg:inline">Redo</span>
          </button>
        </nav>
      </div>

      {/* Right Action Group */}
      <div className="flex items-center space-x-1.5">
        {/* Search / Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden 2xl:flex items-center gap-2 bg-[#181B21] border border-[#292D35] text-[#9AA1AD] hover:text-white px-3 py-1 rounded text-xs transition-colors cursor-pointer"
          aria-label="Search commands"
        >
          <Search className="w-3.5 h-3.5 text-[#9AA1AD]" />
          <span>Search...</span>
          <kbd className="font-mono text-[10px] border border-[#292D35] rounded px-1 text-[#717784] ml-2">
            ⌘K
          </kbd>
        </button>

        {/* Action Icons */}
        <button
          className="hidden 2xl:block p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          className="hidden 2xl:block p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-[#292D35] mx-1" />

        {/* Auth / Export Button */}
        <button className="hidden 2xl:inline text-xs text-[#9AA1AD] hover:text-white transition-colors">
          Sign In
        </button>
        <div className="hidden lg:flex items-center gap-1.5">
          <label htmlFor="studio-compression-level" className="sr-only">
            Compression level
          </label>
          <select
            id="studio-compression-level"
            aria-label="Compression level"
            value={compressionLevel}
            onChange={(event) => onCompressionLevelChange?.(event.target.value as StudioCompressionLevel)}
            disabled={materializeDisabled || isMaterializing}
            className="bg-[#181B21] border border-[#4c1d95] rounded px-2 py-1.5 text-xs text-[#D8DCE3] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="studio-compression-level"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            onClick={onCompress}
            disabled={materializeDisabled || isMaterializing}
            className="flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Compress PDF"
            title="Create a compressed Studio version"
          >
            {isMaterializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Compress</span>
          </button>
        </div>
        <button
          onClick={onGrayscale}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Convert to Grayscale"
          title="Convert the current Studio version to grayscale"
        >
          {isMaterializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          <span>Grayscale</span>
        </button>
        <button
          onClick={onRepair}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Repair PDF"
          title="Create a repaired Studio version"
        >
          <span>Repair</span>
        </button>
        <button
          onClick={() => {
            setRedactError(null);
            setRedactOpen((open) => !open);
          }}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#fca5a5] hover:text-white border border-[#7f1d1d] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Redact PDF"
          title="Permanently remove matching text in a new Studio version"
        >
          <span>Redact</span>
        </button>
        <button
          onClick={() => {
            setMergeUploadError(null);
            setSplitError(null);
            setMergeSplitOpen((open) => !open);
          }}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Merge and Split PDF"
          title="Merge a secondary PDF or trim the current pages"
        >
          <span>Merge / Split</span>
        </button>
        <button
          onClick={() => {
            setWatermarkError(null);
            setWatermarkOpen((open) => !open);
          }}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Watermark PDF"
          title="Add a text or image watermark to all current pages"
        >
          <span>Watermark</span>
        </button>
        <button
          onClick={() => {
            setPageNumbersError(null);
            setPageNumbersOpen((open) => !open);
          }}
          disabled={materializeDisabled || isMaterializing}
          className="hidden lg:flex items-center gap-1.5 text-xs text-[#c4b5fd] hover:text-white border border-[#4c1d95] px-2.5 py-1.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Page Numbers"
          title="Add or remove sequential page numbers"
          data-testid="studio-page-numbers-button"
        >
          <span>Page Numbers</span>
        </button>
        <button
          onClick={onExport}
          disabled={exportDisabled || isExporting}
          className="bg-[#7c3aed] text-white text-xs font-medium px-3.5 py-1.5 rounded hover:bg-[#6d28d9] transition-colors flex items-center gap-1.5 shadow-sm opacity-90 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Export PDF"
          title={isExporting ? "Preparing final PDF" : "Export final PDF"}
        >
          {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>{isExporting ? "Exporting..." : "Export"}</span>
        </button>

        <div className="w-7 h-7 rounded-full bg-[#181B21] border border-[#292D35] flex items-center justify-center text-[#9AA1AD]">
          <User className="w-4 h-4" />
        </div>
      </div>
      {redactOpen && (
        <div
          role="dialog"
          aria-label="Redact PDF"
          className="absolute right-16 top-[52px] w-80 rounded-lg border border-[#7f1d1d] bg-[#14171C] p-3 shadow-2xl"
        >
          <div className="mb-2 text-xs font-semibold text-white">Apply permanent redaction?</div>
          <p className="mb-3 text-[11px] leading-4 text-[#9AA1AD]">
            Matching text is removed from the new immutable PDF version. Separate multiple keywords with commas.
          </p>
          <label htmlFor="studio-redaction-keywords" className="sr-only">
            Redaction keywords
          </label>
          <input
            id="studio-redaction-keywords"
            aria-label="Redaction keywords"
            value={redactKeywords}
            onChange={(event) => setRedactKeywords(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitRedaction();
            }}
            placeholder="e.g. Page 1 of 5, confidential"
            disabled={isMaterializing}
            className="w-full rounded border border-[#292D35] bg-[#101216] px-2.5 py-2 text-xs text-white outline-none focus:border-[#ef4444] disabled:opacity-50"
            data-testid="studio-redaction-keywords"
          />
          {redactError && <p className="mt-2 text-[11px] text-red-300">{redactError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setRedactOpen(false);
                setRedactError(null);
              }}
              className="rounded border border-[#292D35] px-2.5 py-1.5 text-xs text-[#9AA1AD] hover:text-white"
              aria-label="Cancel redaction"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitRedaction}
              disabled={isMaterializing}
              className="rounded bg-[#991b1b] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Apply permanent redaction"
            >
              Apply Redaction
            </button>
          </div>
        </div>
      )}
      {mergeSplitOpen && (
        <div
          role="dialog"
          aria-label="Merge and Split PDF"
          className="absolute right-16 top-[52px] w-96 rounded-lg border border-[#4c1d95] bg-[#14171C] p-3 shadow-2xl"
        >
          <div className="mb-3 text-xs font-semibold text-white">Document pages</div>
          <div className="rounded border border-[#292D35] bg-[#101216] p-3">
            <div className="mb-1 text-xs font-semibold text-[#D8DCE3]">Merge PDF</div>
            <p className="mb-2 text-[11px] leading-4 text-[#9AA1AD]">
              The current document stays first; the uploaded PDF is appended.
            </p>
            <label htmlFor="studio-secondary-pdf" className="sr-only">
              Secondary PDF
            </label>
            <input
              id="studio-secondary-pdf"
              aria-label="Secondary PDF"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => void handleMergeFileChange(event)}
              disabled={isUploadingMergeAsset || isMaterializing}
              className="block w-full text-[11px] text-[#9AA1AD] file:mr-2 file:rounded file:border-0 file:bg-[#4c1d95] file:px-2 file:py-1 file:text-[11px] file:text-white"
            />
            {mergeFilename && (
              <div className="mt-2 truncate text-[11px] text-[#D8DCE3]" data-testid="studio-merge-filename">
                {isUploadingMergeAsset ? "Uploading…" : mergeFilename}
              </div>
            )}
            {mergeUploadError && <p className="mt-2 text-[11px] text-red-300">{mergeUploadError}</p>}
            <button
              type="button"
              onClick={() => mergeAsset && onMerge?.(mergeAsset.id)}
              disabled={!mergeAsset || isUploadingMergeAsset || isMaterializing}
              className="mt-3 rounded bg-[#4c1d95] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Merge PDF"
            >
              Merge
            </button>
          </div>
          <div className="mt-3 rounded border border-[#292D35] bg-[#101216] p-3">
            <div className="mb-1 text-xs font-semibold text-[#D8DCE3]">Split current PDF</div>
            <p className="mb-2 text-[11px] leading-4 text-[#9AA1AD]">
              Keep pages by visible number, for example 1,3,5-7.
            </p>
            <label htmlFor="studio-split-pages" className="sr-only">
              Pages to keep
            </label>
            <input
              id="studio-split-pages"
              aria-label="Pages to keep"
              value={splitPages}
              onChange={(event) => {
                setSplitPages(event.target.value);
                setSplitError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitSplit();
              }}
              placeholder="1,3,5-7"
              disabled={isMaterializing}
              className="w-full rounded border border-[#292D35] bg-[#0B0C0F] px-2.5 py-2 text-xs text-white outline-none focus:border-[#7c3aed] disabled:opacity-50"
            />
            {splitError && <p className="mt-2 text-[11px] text-red-300">{splitError}</p>}
            <button
              type="button"
              onClick={() => void submitSplit()}
              disabled={!splitPages.trim() || isMaterializing}
              className="mt-3 rounded border border-[#4c1d95] px-2.5 py-1.5 text-xs font-medium text-[#c4b5fd] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Apply Split"
            >
              Apply Split
            </button>
          </div>
        </div>
      )}
      {watermarkOpen && (
        <div role="dialog" aria-label="Watermark PDF" className="absolute right-16 top-[52px] w-80 rounded-lg border border-[#4c1d95] bg-[#14171C] p-3 shadow-2xl">
          <div className="mb-1 text-xs font-semibold text-white">Watermark all current pages</div>
          <p className="mb-3 text-[11px] leading-4 text-[#9AA1AD]">Placement is derived from authoritative PDF page dimensions. This follows V1's global-page behavior.</p>
          <div className="mb-3 flex gap-1">
            {(["text", "image"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => { setWatermarkKind(kind); setWatermarkError(null); }} className={`flex-1 rounded border px-2 py-1.5 text-xs ${watermarkKind === kind ? "border-[#7c3aed] bg-[#4c1d95] text-white" : "border-[#292D35] text-[#9AA1AD]"}`} aria-label={`${kind === "text" ? "Text" : "Image"} watermark`}>
                {kind === "text" ? "Text" : "Image"}
              </button>
            ))}
          </div>
          {watermarkKind === "text" ? (
            <>
              <label htmlFor="studio-watermark-text" className="sr-only">Watermark text</label>
              <input key="studio-watermark-text-control" id="studio-watermark-text" aria-label="Watermark text" value={watermarkText} onChange={(event) => setWatermarkText(event.target.value)} className="mb-2 w-full rounded border border-[#292D35] bg-[#101216] px-2.5 py-2 text-xs text-white" />
              <label htmlFor="studio-watermark-font" className="sr-only">Watermark font</label>
              <select id="studio-watermark-font" aria-label="Watermark font" value={watermarkFont} onChange={(event) => setWatermarkFont(event.target.value as typeof watermarkFont)} className="mb-2 w-full rounded border border-[#292D35] bg-[#101216] px-2 py-2 text-xs text-white">
                <option>Helvetica</option><option>Times-Roman</option><option>Courier</option>
              </select>
            </>
          ) : (
            <>
              <label htmlFor="studio-watermark-image" className="sr-only">Watermark image</label>
              <input key="studio-watermark-image-control" id="studio-watermark-image" aria-label="Watermark image" type="file" accept="image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg" onChange={(event) => void handleWatermarkFileChange(event)} disabled={isUploadingWatermark || isMaterializing} className="mb-2 block w-full text-[11px] text-[#9AA1AD] file:mr-2 file:rounded file:border-0 file:bg-[#4c1d95] file:px-2 file:py-1 file:text-[11px] file:text-white" />
              {watermarkFilename && <div className="mb-2 truncate text-[11px] text-[#D8DCE3]">{isUploadingWatermark ? "Uploading…" : watermarkFilename}</div>}
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[#9AA1AD]">Scale {watermarkSize}<input aria-label="Watermark scale" type="range" min="10" max="300" value={watermarkSize} onChange={(event) => setWatermarkSize(Number(event.target.value))} className="w-full" /></label>
            <label className="text-[11px] text-[#9AA1AD]">Rotation {watermarkRotation}°<input aria-label="Watermark rotation" type="range" min="-180" max="180" value={watermarkRotation} onChange={(event) => setWatermarkRotation(Number(event.target.value))} className="w-full" /></label>
            <label className="text-[11px] text-[#9AA1AD]">Opacity {watermarkOpacity.toFixed(2)}<input aria-label="Watermark opacity" type="range" min="0.05" max="1" step="0.05" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} className="w-full" /></label>
            <label className="text-[11px] text-[#9AA1AD]">Position<select aria-label="Watermark position" value={watermarkPosition} onChange={(event) => setWatermarkPosition(event.target.value as typeof watermarkPosition)} className="mt-1 w-full rounded border border-[#292D35] bg-[#101216] px-2 py-1 text-xs text-white"><option value="tl">Top left</option><option value="tc">Top center</option><option value="tr">Top right</option><option value="cl">Center left</option><option value="cc">Center</option><option value="cr">Center right</option><option value="bl">Bottom left</option><option value="bc">Bottom center</option><option value="br">Bottom right</option></select></label>
          </div>
          {watermarkError && <p className="mt-2 text-[11px] text-red-300">{watermarkError}</p>}
          <div className="mt-3 flex justify-between gap-2">
            <button type="button" onClick={() => void onRemoveWatermark?.(watermarkTargets)} disabled={!watermarkTargets.length || isMaterializing} className="rounded border border-red-900 px-2.5 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Remove Watermark">Remove</button>
            <div className="flex gap-2"><button type="button" onClick={() => setWatermarkOpen(false)} className="rounded border border-[#292D35] px-2.5 py-1.5 text-xs text-[#9AA1AD]">Cancel</button><button type="button" onClick={() => void submitWatermark()} disabled={isUploadingWatermark || isMaterializing} className="rounded bg-[#4c1d95] px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Apply Watermark">Apply Watermark</button></div>
          </div>
        </div>
      )}
      {pageNumbersOpen && (
        <div role="dialog" aria-label="Page Numbers" className="absolute right-16 top-[52px] w-80 rounded-lg border border-[#4c1d95] bg-[#14171C] p-3 shadow-2xl">
          <div className="mb-1 text-xs font-semibold text-white">Page Numbers</div>
          <p className="mb-3 text-[11px] leading-4 text-[#9AA1AD]">Numbers follow the current visible page order and update after page operations.</p>
          <label htmlFor="studio-page-numbers-font" className="sr-only">Page number font</label>
          <select id="studio-page-numbers-font" aria-label="Page number font" value={pageNumbersFont} onChange={(event) => setPageNumbersFont(event.target.value as typeof pageNumbersFont)} className="mb-2 w-full rounded border border-[#292D35] bg-[#101216] px-2 py-2 text-xs text-white" data-testid="studio-page-numbers-font">
            <option>Helvetica</option><option>Times-Roman</option><option>Courier</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-[#9AA1AD]">Font size {pageNumbersSize}
              <input aria-label="Page number font size" type="number" min="6" max="72" value={pageNumbersSize} onChange={(event) => setPageNumbersSize(Number(event.target.value))} className="mt-1 w-full rounded border border-[#292D35] bg-[#101216] px-2 py-1 text-xs text-white" data-testid="studio-page-numbers-size" />
            </label>
            <label className="text-[11px] text-[#9AA1AD]">Position
              <select aria-label="Page number position" value={pageNumbersPosition} onChange={(event) => setPageNumbersPosition(event.target.value as typeof pageNumbersPosition)} className="mt-1 w-full rounded border border-[#292D35] bg-[#101216] px-2 py-1 text-xs text-white" data-testid="studio-page-numbers-position">
                <option value="bl">Bottom left</option><option value="bc">Bottom center</option><option value="br">Bottom right</option><option value="tl">Top left</option><option value="tc">Top center</option><option value="tr">Top right</option>
              </select>
            </label>
          </div>
          {pageNumbersError && <p className="mt-2 text-[11px] text-red-300">{pageNumbersError}</p>}
          <div className="mt-3 flex justify-between gap-2">
            <button type="button" onClick={() => void submitPageNumbers(false)} disabled={!pageNumbersEnabled || isMaterializing} className="rounded border border-red-900 px-2.5 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Remove Page Numbers" data-testid="studio-remove-page-numbers">Remove</button>
            <div className="flex gap-2"><button type="button" onClick={() => setPageNumbersOpen(false)} className="rounded border border-[#292D35] px-2.5 py-1.5 text-xs text-[#9AA1AD]">Cancel</button><button type="button" onClick={() => void submitPageNumbers(true)} disabled={isMaterializing || !Number.isFinite(pageNumbersSize)} className="rounded bg-[#4c1d95] px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Apply Page Numbers" data-testid="studio-apply-page-numbers">Apply</button></div>
          </div>
        </div>
      )}
    </header>
  );
};
