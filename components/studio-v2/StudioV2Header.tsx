"use client";

import React, { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { DocumentInfo, StudioV2RedactionDraftBox } from "./types";
import { StudioAssetDTO, StudioCompressionLevel, StudioMergeParameters, StudioPageNumberingParameters, StudioWatermarkParameters, VDMPageNumberingDTO, VDMPageDescriptorDTO } from "@/lib/studio-v2/api";
import { StudioV2Popover } from "./StudioV2Popover";
import { useStudioV2SubmissionGuard } from "./studioV2SubmissionGuard";
import { toggleToolbarPopover } from "./studioV2ToolbarState";
import type { ActiveToolbarPopover } from "./studioV2ToolbarState";
import { createMergeQueue, moveMergeQueueItem, removeMergeQueueItem, serializeMergeQueue, StudioMergeQueueItem } from "./studioV2MergeQueue";
import { StudioV2SplitSelector } from "./StudioV2SplitSelector";
import { StudioV2CompressPanel } from "./StudioV2CompressPanel";
import type { StudioCompressMetrics, StudioCompressStatus } from "./studioV2Compress";
import { pageIdsForSelection, parseStudioPageSelection, pruneStudioPageSelection, serializeStudioPageSelection, toggleStudioPageSelection } from "./studioV2PageSelection";

interface StudioV2HeaderProps {
  document: DocumentInfo;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  onNavigateHome?: () => void;
  onExport?: () => Promise<void> | void;
  isExporting?: boolean;
  exportDisabled?: boolean;
  onCompress?: () => Promise<boolean> | boolean | void;
  compressionLevel?: StudioCompressionLevel;
  onCompressionLevelChange?: (level: StudioCompressionLevel) => void;
  compressStatus?: StudioCompressStatus;
  compressStatusMessage?: string | null;
  compressMetrics?: StudioCompressMetrics | null;
  compressError?: string | null;
  onGrayscale?: () => Promise<boolean> | boolean | void;
  onRepair?: () => Promise<boolean> | boolean | void;
  onRedact?: (keywords: string) => void;
  onApplyRedaction?: (keywords: string) => Promise<boolean> | boolean;
  redactionMode?: "text" | "area";
  onRedactionModeChange?: (mode: "text" | "area") => void;
  redactionBoxes?: StudioV2RedactionDraftBox[];
  onRemoveRedactionBox?: (boxId: string) => void;
  onClearRedactions?: () => void;
  onUploadMergeAsset?: (file: File) => Promise<StudioAssetDTO>;
  onMerge?: (parameters: StudioMergeParameters) => Promise<boolean> | boolean;
  sessionId?: string | null;
  versionId?: string | null;
  pages?: VDMPageDescriptorDTO[];
  onSplit?: (pageIds: string[]) => Promise<boolean> | boolean;
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
  onOpenSettings,
  onOpenHelp,
  onNavigateHome,
  onExport,
  isExporting = false,
  exportDisabled = false,
  onCompress,
  compressionLevel = "medium",
  onCompressionLevelChange,
  compressStatus = "idle",
  compressStatusMessage = null,
  compressMetrics = null,
  compressError = null,
  onGrayscale,
  onRepair,
  onRedact,
  onApplyRedaction,
  redactionMode = "text",
  onRedactionModeChange,
  redactionBoxes = [],
  onRemoveRedactionBox,
  onClearRedactions,
  onUploadMergeAsset,
  onMerge,
  sessionId,
  versionId,
  pages = [],
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
  const [activeToolbarPopover, setActiveToolbarPopover] = useState<ActiveToolbarPopover>(null);
  const [popoverTriggerSource, setPopoverTriggerSource] = useState<"toolbar" | "more">("toolbar");
  const submissionGuard = useStudioV2SubmissionGuard();
  const compressTriggerRef = useRef<HTMLButtonElement>(null);
  const redactTriggerRef = useRef<HTMLButtonElement>(null);
  const mergeSplitTriggerRef = useRef<HTMLButtonElement>(null);
  const watermarkTriggerRef = useRef<HTMLButtonElement>(null);
  const pageNumbersTriggerRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const [redactKeywords, setRedactKeywords] = useState("");
  const [redactError, setRedactError] = useState<string | null>(null);
  const [mergeQueue, setMergeQueue] = useState<StudioMergeQueueItem[]>(createMergeQueue);
  const [mergeUploadError, setMergeUploadError] = useState<string | null>(null);
  const [isUploadingMergeAsset, setIsUploadingMergeAsset] = useState(false);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const [splitPages, setSplitPages] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [splitSelectedPageIds, setSplitSelectedPageIds] = useState<Set<string>>(new Set());
  const [splitAnchorId, setSplitAnchorId] = useState<string | null>(null);
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
  const [pageNumbersEnabled, setPageNumbersEnabled] = useState(false);
  const [pageNumbersFont, setPageNumbersFont] = useState<StudioPageNumberingParameters["font_family"]>("Helvetica");
  const [pageNumbersSize, setPageNumbersSize] = useState(12);
  const [pageNumbersPosition, setPageNumbersPosition] = useState<StudioPageNumberingParameters["position"]>("bc");
  const [pageNumbersError, setPageNumbersError] = useState<string | null>(null);

  useEffect(() => {
    setSplitSelectedPageIds((current) => {
      const pruned = pruneStudioPageSelection(current, pages);
      setSplitPages(serializeStudioPageSelection(pruned, pages));
      return pruned;
    });
    setSplitAnchorId((current) => current && pages.some((page) => page.page_id === current) ? current : null);
  }, [pages]);

  const togglePopover = (popover: Exclude<ActiveToolbarPopover, null>) => {
    setPopoverTriggerSource("toolbar");
    setActiveToolbarPopover((current) => toggleToolbarPopover(current, popover));
  };

  const openPopoverFromMore = (popover: Exclude<ActiveToolbarPopover, null>) => {
    setPopoverTriggerSource("more");
    setActiveToolbarPopover(popover);
  };

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

  const submitRedaction = async () => {
    const keywords = redactKeywords.trim();
    if (!keywords && redactionBoxes.length === 0) {
      setRedactError("Enter a keyword or draw at least one area to redact.");
      return;
    }
    setRedactError(null);
    const succeeded = await submissionGuard.run("materialize:redact", async () => onApplyRedaction
      ? onApplyRedaction(keywords)
      : (onRedact?.(keywords), true));
    if (succeeded === undefined) return;
    if (succeeded === false) return;
    setActiveToolbarPopover(null);
    setRedactKeywords("");
    onRedactionModeChange?.("text");
  };

  const handleMergeFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !onUploadMergeAsset) return;
    await submissionGuard.run("upload:merge", async () => {
      setMergeUploadError(null);
      setIsUploadingMergeAsset(true);
      try {
        for (const file of files) {
          const localID = `pending-${crypto.randomUUID()}`;
          setMergeQueue((current) => [...current, { id: localID, kind: "uploaded_asset", name: file.name, status: "uploading" }]);
          try {
            const asset = await onUploadMergeAsset(file);
            setMergeQueue((current) => current.map((item) => item.id === localID ? { ...item, id: asset.id, asset, status: "ready" } : item));
          } catch (err) {
            const message = err instanceof Error ? err.message : "Secondary PDF upload failed";
            setMergeQueue((current) => current.map((item) => item.id === localID ? { ...item, status: "error", error: message } : item));
            setMergeUploadError(message);
          }
        }
      } finally {
        setIsUploadingMergeAsset(false);
      }
    });
  };

  const submitMerge = async () => {
    const parameters = serializeMergeQueue(mergeQueue);
    if (!parameters) {
      setMergeUploadError("Upload at least one PDF and resolve any failed upload before merging.");
      return;
    }
    const succeeded = await submissionGuard.run("materialize:merge", async () => Boolean(await onMerge?.(parameters)));
    if (succeeded === undefined) return;
    if (succeeded) {
      setMergeQueue(createMergeQueue());
      setMergeUploadError(null);
      if (mergeInputRef.current) mergeInputRef.current.value = "";
      setActiveToolbarPopover(null);
    }
  };

  const submitSplit = async () => {
    let selected = splitSelectedPageIds;
    if (splitPages.trim()) {
      try {
        selected = pageIdsForSelection(parseStudioPageSelection(splitPages, pages.length), pages);
        setSplitSelectedPageIds(selected);
      } catch (err) {
        setSplitError(err instanceof Error ? err.message : "Invalid page selection");
        return;
      }
    }
    if (!selected.size) {
      setSplitError("Enter at least one page or range to keep.");
      return;
    }
    setSplitError(null);
    try {
      const succeeded = await submissionGuard.run("materialize:split", async () => Boolean(await onSplit?.([...selected])));
      if (succeeded === undefined) return;
      if (succeeded) {
        setSplitSelectedPageIds(new Set());
        setSplitAnchorId(null);
        setSplitPages("");
        setActiveToolbarPopover(null);
      }
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : "Invalid page selection");
    }
  };

  const toggleSplitPage = (pageId: string, shift: boolean) => {
    const result = toggleStudioPageSelection(pages, splitSelectedPageIds, pageId, shift, splitAnchorId);
    setSplitSelectedPageIds(result.selected);
    setSplitAnchorId(result.anchorId);
    setSplitPages(serializeStudioPageSelection(result.selected, pages));
    setSplitError(null);
  };

  const handleWatermarkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadWatermarkAsset) return;
    await submissionGuard.run("upload:watermark", async () => {
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
    });
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
    const submitted = await submissionGuard.run("command:add_watermark", async () => {
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
      return true;
    });
    if (!submitted) return;
    setActiveToolbarPopover(null);
  };

  const submitPageNumbers = async (enabled: boolean) => {
    setPageNumbersError(null);
    try {
      const submitted = await submissionGuard.run("command:update_page_numbering", async () => {
        await onPageNumbering?.({
          enabled,
          font_family: pageNumbersFont,
          font_size: pageNumbersSize,
          position: pageNumbersPosition,
        });
        return true;
      });
      if (!submitted) return;
      setPageNumbersEnabled(enabled);
      setActiveToolbarPopover(null);
    } catch (err) {
      setPageNumbersError(err instanceof Error ? err.message : "Page numbering update failed");
    }
  };

  const getPopoverTriggerRef = (popover: Exclude<ActiveToolbarPopover, null>) => {
    if (popoverTriggerSource === "more" && popover !== "more") return moreTriggerRef;
    switch (popover) {
      case "compress": return compressTriggerRef;
      case "redact": return redactTriggerRef;
      case "mergeSplit": return mergeSplitTriggerRef;
      case "watermark": return watermarkTriggerRef;
      case "pageNumbers": return pageNumbersTriggerRef;
      case "more": return moreTriggerRef;
    }
  };

  const renderStatusBadge = () => {
    switch (document.syncStatus) {
      case "saving":
        return (
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-[var(--studio-accent)] text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--studio-accent)]" />
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
    <header className="fixed top-0 left-0 right-0 h-[48px] bg-[#101216] border-b border-[var(--studio-border)] flex items-center justify-between gap-3 px-4 z-50 transition-colors duration-200">
      {/* Brand & Left Navigation */}
      <div className="flex items-center gap-6">
        <button type="button" onClick={onNavigateHome} aria-label="Go to Platen home" className="flex items-baseline gap-2 rounded px-1 text-left hover:bg-[var(--studio-surface-raised)]">
          <span className="font-bold text-[16px] text-white tracking-wide">
            PLATEN
          </span>
          <span className="text-[11px] font-mono text-[#9AA1AD] tracking-wider uppercase">
            PDF Studio
          </span>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center h-[48px] space-x-1">
          <div className="h-[48px] flex items-center px-3 text-[var(--studio-accent)] font-medium border-b-2 border-[var(--studio-border-active)] text-sm">
            Document
          </div>
          {renderStatusBadge()}
          <button
            onClick={() => void submissionGuard.run("history:undo", async () => { await onUndo?.(); })}
            disabled={!canUndo || isMaterializing || submissionGuard.isPending("history:undo")}
            className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] transition-colors text-sm disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Undo"
            title={canUndo ? "Undo" : "Undo (no parent revision)"}
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden lg:inline">Undo</span>
          </button>
          <button
            onClick={() => void submissionGuard.run("history:redo", async () => { await onRedo?.(); })}
            disabled={!canRedo || isMaterializing || submissionGuard.isPending("history:redo")}
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
      <div className="flex min-w-0 items-center gap-2">
        {/* Search / Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          type="button"
          data-testid="studio-header-search"
          className="studio-v2-focus flex items-center gap-2 bg-[var(--studio-surface-raised)] border border-[var(--studio-border)] text-[var(--studio-muted)] hover:text-[var(--studio-text)] px-3 py-1 rounded text-xs transition-colors cursor-pointer"
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
          type="button"
          onClick={onOpenSettings}
          data-testid="studio-settings"
          className="studio-v2-focus p-1.5 text-[var(--studio-muted)] hover:text-[var(--studio-text)] hover:bg-[var(--studio-surface-raised)] rounded transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          data-testid="studio-header-help"
          className="studio-v2-focus p-1.5 text-[var(--studio-muted)] hover:text-[var(--studio-text)] hover:bg-[var(--studio-surface-raised)] rounded transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-[var(--studio-border)] mx-1" />

        {/* Authenticated Studio has no sign-in affordance. */}
        <div className="hidden lg:flex items-center gap-1 rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)] p-1" aria-label="Optimization actions">
          <button
            ref={compressTriggerRef}
            type="button"
            onClick={() => togglePopover("compress")}
            disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:compress")}
            className="studio-v2-focus studio-v2-toolbar-control flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Compress PDF"
            aria-expanded={activeToolbarPopover === "compress"}
            aria-haspopup="dialog"
            title="Create a compressed Studio version"
          >
            {isMaterializing || submissionGuard.isPending("materialize:compress") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>{submissionGuard.isPending("materialize:compress") ? "Compressing…" : "Compress"}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => void submissionGuard.run("materialize:grayscale", async () => { await onGrayscale?.(); })} disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:grayscale")} className="studio-v2-focus studio-v2-toolbar-control rounded px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" aria-label="Convert to Grayscale" title="Convert the current Studio version to grayscale">{submissionGuard.isPending("materialize:grayscale") ? "Applying…" : "Grayscale"}</button>
          <button type="button" onClick={() => void submissionGuard.run("materialize:repair", async () => { await onRepair?.(); })} disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:repair")} className="studio-v2-focus studio-v2-toolbar-control rounded px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" aria-label="Repair PDF" title="Create a repaired Studio version">{submissionGuard.isPending("materialize:repair") ? "Repairing…" : "Repair"}</button>
        </div>
        <div className="hidden lg:flex items-center gap-1 rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface)] p-1" aria-label="Document tools">
          <button ref={redactTriggerRef} type="button" onClick={() => { setRedactError(null); togglePopover("redact"); }} disabled={materializeDisabled || isMaterializing} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-1.5 text-xs text-red-300/90 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Redact PDF" aria-expanded={activeToolbarPopover === "redact"} aria-haspopup="dialog" title="Permanently remove matching text in a new Studio version">Redact</button>
          <button ref={mergeSplitTriggerRef} type="button" onClick={() => { setMergeUploadError(null); setSplitError(null); togglePopover("mergeSplit"); }} disabled={materializeDisabled || isMaterializing} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" aria-label="Merge and Split PDF" aria-expanded={activeToolbarPopover === "mergeSplit"} aria-haspopup="dialog" title="Merge a secondary PDF or trim the current pages">Merge / Split</button>
          <button ref={watermarkTriggerRef} type="button" onClick={() => { setWatermarkError(null); togglePopover("watermark"); }} disabled={materializeDisabled || isMaterializing} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" aria-label="Watermark PDF" aria-expanded={activeToolbarPopover === "watermark"} aria-haspopup="dialog" title="Add a text or image watermark to all current pages">Watermark</button>
          <button ref={pageNumbersTriggerRef} type="button" onClick={() => { setPageNumbersError(null); togglePopover("pageNumbers"); }} disabled={materializeDisabled || isMaterializing} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50" aria-label="Page Numbers" aria-expanded={activeToolbarPopover === "pageNumbers"} aria-haspopup="dialog" title="Add or remove sequential page numbers" data-testid="studio-page-numbers-button">Page Numbers</button>
        </div>
        <button ref={moreTriggerRef} type="button" onClick={() => togglePopover("more")} className="studio-v2-focus studio-v2-toolbar-control flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs lg:hidden" aria-label="More document tools" aria-expanded={activeToolbarPopover === "more"} aria-haspopup="dialog"><MoreHorizontal className="w-3.5 h-3.5" /> More</button>
        <button
          onClick={() => void submissionGuard.run("export", async () => { await onExport?.(); })}
          disabled={exportDisabled || isExporting || submissionGuard.isPending("export")}
          className="studio-v2-focus studio-v2-primary text-white text-xs font-medium px-3.5 py-1.5 rounded transition-colors flex items-center gap-1.5 shadow-sm opacity-95 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Export PDF"
          title={isExporting ? "Preparing final PDF" : "Export final PDF"}
        >
          {isExporting || submissionGuard.isPending("export") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>{isExporting || submissionGuard.isPending("export") ? "Exporting..." : "Export"}</span>
        </button>

        <div className="w-7 h-7 rounded-full bg-[var(--studio-surface-raised)] border border-[var(--studio-border)] flex items-center justify-center text-[var(--studio-muted)]">
          <User className="w-4 h-4" />
        </div>
      </div>
      <StudioV2Popover open={activeToolbarPopover === "compress"} onClose={() => setActiveToolbarPopover(null)} triggerRef={getPopoverTriggerRef("compress")} label="Compress PDF" width={300}>
        <StudioV2CompressPanel
          level={compressionLevel}
          onLevelChange={onCompressionLevelChange}
          status={compressStatus}
          statusMessage={compressStatusMessage}
          metrics={compressMetrics}
          error={compressError}
          disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:compress")}
          onCompress={() => void submissionGuard.run("materialize:compress", async () => await onCompress?.())}
          onClose={() => setActiveToolbarPopover(null)}
        />
      </StudioV2Popover>
      <StudioV2Popover open={activeToolbarPopover === "more"} onClose={() => setActiveToolbarPopover(null)} triggerRef={moreTriggerRef} label="More document tools" width={240}>
        <div className="mb-2 text-xs font-semibold">Document tools</div>
        <div className="grid gap-1">
          <button type="button" onClick={() => { openPopoverFromMore("redact"); setRedactError(null); }} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs">Redact</button>
          <button type="button" onClick={() => { openPopoverFromMore("mergeSplit"); setMergeUploadError(null); setSplitError(null); }} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs">Merge / Split</button>
          <button type="button" onClick={() => { openPopoverFromMore("watermark"); setWatermarkError(null); }} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs">Watermark</button>
          <button type="button" onClick={() => { openPopoverFromMore("pageNumbers"); setPageNumbersError(null); }} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs">Page Numbers</button>
          <button type="button" onClick={() => { void submissionGuard.run("materialize:grayscale", async () => { await onGrayscale?.(); }); setActiveToolbarPopover(null); }} disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:grayscale")} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs disabled:opacity-50">{submissionGuard.isPending("materialize:grayscale") ? "Applying…" : "Grayscale"}</button>
          <button type="button" onClick={() => { void submissionGuard.run("materialize:repair", async () => { await onRepair?.(); }); setActiveToolbarPopover(null); }} disabled={materializeDisabled || isMaterializing || submissionGuard.isPending("materialize:repair")} className="studio-v2-focus studio-v2-toolbar-control rounded px-2.5 py-2 text-left text-xs disabled:opacity-50">{submissionGuard.isPending("materialize:repair") ? "Repairing…" : "Repair"}</button>
        </div>
      </StudioV2Popover>
      <StudioV2Popover open={activeToolbarPopover === "redact"} onClose={() => setActiveToolbarPopover(null)} triggerRef={getPopoverTriggerRef("redact")} label="Redact PDF" width={320} className="border-red-900/70" closeOnOutsidePointerDown={redactionMode !== "area"}>
        <div>
          <div className="mb-2 text-xs font-semibold text-white">Apply permanent redaction?</div>
          <p className="mb-3 text-[11px] leading-4 text-[#9AA1AD]">
            Selected content is removed from the new immutable PDF version. Pending regions are not permanent until Apply.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded border border-[#292D35] bg-[#101216] p-1" role="tablist" aria-label="Redaction mode">
            <button type="button" role="tab" aria-selected={redactionMode === "text"} data-testid="studio-redaction-text-mode" onClick={() => onRedactionModeChange?.("text")} className={`rounded px-2 py-1.5 text-xs ${redactionMode === "text" ? "bg-red-900/70 text-white" : "text-[#9AA1AD] hover:text-white"}`}>Text</button>
            <button type="button" role="tab" aria-selected={redactionMode === "area"} data-testid="studio-redaction-area-mode" onClick={() => onRedactionModeChange?.("area")} className={`rounded px-2 py-1.5 text-xs ${redactionMode === "area" ? "bg-red-900/70 text-white" : "text-[#9AA1AD] hover:text-white"}`}>Area</button>
          </div>
          {redactionMode === "area" && (
            <div className="mb-3 rounded border border-red-900/60 bg-red-950/25 p-2 text-[11px] leading-4 text-red-100" data-testid="studio-redaction-area-guidance">
              Drag over visible page content to add a pending permanent region. You can draw on multiple pages before applying.
            </div>
          )}
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
            placeholder="Optional keywords, separated by commas"
            disabled={isMaterializing || submissionGuard.isPending("materialize:redact")}
            className="w-full rounded border border-[#292D35] bg-[#101216] px-2.5 py-2 text-xs text-white outline-none focus:border-[#ef4444] disabled:opacity-50"
            data-testid="studio-redaction-keywords"
          />
          {redactionBoxes.length > 0 && (
            <div className="mt-3 rounded border border-[#292D35] bg-[#101216] p-2" data-testid="studio-redaction-region-list">
              <div className="mb-1 flex items-center justify-between text-[11px] text-[#D8DCE3]">
                <span>{redactionBoxes.length} pending area{redactionBoxes.length === 1 ? "" : "s"}</span>
                <button type="button" onClick={onClearRedactions} className="text-red-300 hover:text-white" aria-label="Clear all pending redaction areas">Clear all</button>
              </div>
              <ul className="space-y-1 text-[10px] text-[#9AA1AD]">
                {redactionBoxes.map((box, index) => (
                  <li key={box.id} className="flex items-center justify-between gap-2">
                    <span>Page {box.page} · Area {index + 1}</span>
                    <button type="button" onClick={() => onRemoveRedactionBox?.(box.id)} className="text-red-300 hover:text-white" aria-label={`Remove pending redaction area ${index + 1}`}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {redactError && <p className="mt-2 text-[11px] text-red-300">{redactError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveToolbarPopover(null);
                setRedactError(null);
              }}
              className="rounded border border-[#292D35] px-2.5 py-1.5 text-xs text-[#9AA1AD] hover:text-white"
              aria-label="Cancel redaction"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitRedaction()}
              disabled={isMaterializing || submissionGuard.isPending("materialize:redact")}
              className="rounded bg-[#991b1b] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Apply permanent redaction"
            >
              Apply Redaction
            </button>
          </div>
        </div>
      </StudioV2Popover>
      <StudioV2Popover open={activeToolbarPopover === "mergeSplit"} onClose={() => setActiveToolbarPopover(null)} triggerRef={getPopoverTriggerRef("mergeSplit")} label="Merge and Split PDF" width={384}>
        <div>
          <div className="mb-3 text-xs font-semibold text-white">Document pages</div>
          <div className="rounded border border-[#292D35] bg-[#101216] p-3">
            <div className="mb-1 text-xs font-semibold text-[#D8DCE3]">Merge PDF</div>
            <p className="mb-2 text-[11px] leading-4 text-[#9AA1AD]">
              Queue whole PDF blocks, including the current document, then apply the ordered merge.
            </p>
            <label htmlFor="studio-secondary-pdf" className="sr-only">
              Secondary PDF
            </label>
            <input
              ref={mergeInputRef}
              id="studio-secondary-pdf"
              aria-label="Secondary PDF"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              onChange={(event) => void handleMergeFileChange(event)}
              disabled={isUploadingMergeAsset || isMaterializing || submissionGuard.isPending("upload:merge")}
              className="block w-full text-[11px] text-[var(--studio-muted)] file:mr-2 file:rounded file:border-0 file:bg-[var(--studio-cta)] file:px-2 file:py-1 file:text-[11px] file:text-white"
            />
            <ol className="mt-3 max-h-48 space-y-1 overflow-y-auto" aria-label="Merge document order" data-testid="studio-merge-queue">
              {mergeQueue.map((item, index) => (
                <li key={item.id} className="flex items-center gap-1 rounded border border-[#292D35] px-2 py-1.5 text-[11px] text-[#D8DCE3]" data-testid={`studio-merge-queue-item-${item.id}`}>
                  <span className="min-w-0 flex-1 truncate">{index + 1}. {item.name}{item.kind === "current_document" ? ` — ${document.pageCount} pages` : ""}</span>
                  {item.status === "uploading" && <Loader2 className="animate-spin" size={12} aria-label={`Uploading ${item.name}`} />}
                  {item.status === "error" && <span className="text-red-300">Upload failed</span>}
                  <button type="button" onClick={() => setMergeQueue((current) => moveMergeQueueItem(current, item.id, -1))} disabled={index === 0 || isUploadingMergeAsset || isMaterializing} aria-label={`Move ${item.name} up`} className="px-1 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => setMergeQueue((current) => moveMergeQueueItem(current, item.id, 1))} disabled={index === mergeQueue.length - 1 || isUploadingMergeAsset || isMaterializing} aria-label={`Move ${item.name} down`} className="px-1 disabled:opacity-40">↓</button>
                  {item.kind === "uploaded_asset" && <button type="button" onClick={() => setMergeQueue((current) => removeMergeQueueItem(current, item.id))} disabled={isUploadingMergeAsset || isMaterializing} aria-label={`Remove ${item.name}`} className="px-1 text-red-300 disabled:opacity-40">Remove</button>}
                </li>
              ))}
            </ol>
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={() => { setMergeQueue(createMergeQueue()); setMergeUploadError(null); if (mergeInputRef.current) mergeInputRef.current.value = ""; }} disabled={mergeQueue.length === 1 || isUploadingMergeAsset || isMaterializing} className="text-[11px] text-[#9AA1AD] disabled:opacity-40">Clear uploads</button>
            </div>
            {mergeUploadError && <p className="mt-2 text-[11px] text-red-300">{mergeUploadError}</p>}
            <button
              type="button"
              onClick={() => void submitMerge()}
              disabled={!serializeMergeQueue(mergeQueue) || isUploadingMergeAsset || isMaterializing || submissionGuard.isPending("materialize:merge")}
              className="studio-v2-focus studio-v2-primary mt-3 rounded px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Merge PDF"
            >
              {submissionGuard.isPending("materialize:merge") ? "Merging…" : "Apply Merge"}
            </button>
          </div>
          <div className="mt-3 rounded border border-[#292D35] bg-[#101216] p-3">
            <div className="mb-1 text-xs font-semibold text-[#D8DCE3]">Split current PDF</div>
            <p className="mb-2 text-[11px] leading-4 text-[#9AA1AD]">
              Select pages visually or enter a range such as 1,3,5-7.
            </p>
            <div className="mb-2 flex items-center justify-between text-[11px] text-[#D8DCE3]">
              <span data-testid="studio-split-selected-count">{splitSelectedPageIds.size} pages selected</span>
              <span className="flex gap-2"><button type="button" onClick={() => { const all = new Set(pages.map((page) => page.page_id)); setSplitSelectedPageIds(all); setSplitPages(serializeStudioPageSelection(all, pages)); }} disabled={!pages.length || isMaterializing} className="text-[var(--studio-accent)] disabled:opacity-40">Select All</button><button type="button" onClick={() => { setSplitSelectedPageIds(new Set()); setSplitAnchorId(null); setSplitPages(""); }} disabled={!splitSelectedPageIds.size || isMaterializing} className="text-[var(--studio-muted)] disabled:opacity-40">Clear All</button></span>
            </div>
            <StudioV2SplitSelector sessionId={sessionId} versionId={versionId} pages={pages} selectedPageIds={splitSelectedPageIds} onToggle={toggleSplitPage} />
            <label htmlFor="studio-split-pages" className="sr-only">
              Pages to keep
            </label>
            <input
              id="studio-split-pages"
              aria-label="Pages to keep"
              value={splitPages}
              onChange={(event) => {
                const value = event.target.value;
                setSplitPages(value);
                setSplitError(null);
                if (!value.trim()) {
                  setSplitSelectedPageIds(new Set());
                  setSplitAnchorId(null);
                  return;
                }
                try {
                  const next = pageIdsForSelection(parseStudioPageSelection(value, pages.length), pages);
                  setSplitSelectedPageIds(next);
                  setSplitAnchorId(null);
                } catch {
                  // Keep the last valid visual selection while the user types.
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitSplit();
              }}
              placeholder="1,3,5-7"
              disabled={isMaterializing}
              className="studio-v2-focus w-full rounded border border-[var(--studio-border)] bg-[#0B0C0F] px-2.5 py-2 text-xs text-white outline-none focus:border-[var(--studio-focus)] disabled:opacity-50"
            />
            {splitError && <p className="mt-2 text-[11px] text-red-300">{splitError}</p>}
            <button
              type="button"
              onClick={() => void submitSplit()}
              disabled={(!splitPages.trim() && !splitSelectedPageIds.size) || isMaterializing || submissionGuard.isPending("materialize:split")}
              className="studio-v2-focus mt-3 rounded border border-[var(--studio-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--studio-accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Apply Split"
            >
              {submissionGuard.isPending("materialize:split") ? "Splitting…" : "Apply Split"}
            </button>
          </div>
        </div>
      </StudioV2Popover>
      <StudioV2Popover open={activeToolbarPopover === "watermark"} onClose={() => setActiveToolbarPopover(null)} triggerRef={getPopoverTriggerRef("watermark")} label="Watermark PDF" width={320}>
        <div>
          <div className="mb-1 text-xs font-semibold text-white">Watermark all current pages</div>
          <p className="mb-3 text-[11px] leading-4 text-[#9AA1AD]">Placement is derived from authoritative PDF page dimensions. This follows V1&apos;s global-page behavior.</p>
          <div className="mb-3 flex gap-1">
            {(["text", "image"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => { setWatermarkKind(kind); setWatermarkError(null); }} className={`studio-v2-focus flex-1 rounded border px-2 py-1.5 text-xs ${watermarkKind === kind ? "border-[var(--studio-border-active)] bg-[var(--studio-cta)] text-white" : "border-[var(--studio-border)] text-[var(--studio-muted)]"}`} aria-label={`${kind === "text" ? "Text" : "Image"} watermark`}>
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
              <input key="studio-watermark-image-control" id="studio-watermark-image" aria-label="Watermark image" type="file" accept="image/png,image/jpeg,image/jpg,.png,.jpg,.jpeg" onChange={(event) => void handleWatermarkFileChange(event)} disabled={isUploadingWatermark || isMaterializing || submissionGuard.isPending("upload:watermark")} className="mb-2 block w-full text-[11px] text-[var(--studio-muted)] file:mr-2 file:rounded file:border-0 file:bg-[var(--studio-cta)] file:px-2 file:py-1 file:text-[11px] file:text-white" />
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
            <button type="button" onClick={() => void submissionGuard.run("command:delete_watermark", async () => { await onRemoveWatermark?.(watermarkTargets); })} disabled={!watermarkTargets.length || isMaterializing || submissionGuard.isPending("command:delete_watermark")} className="rounded border border-red-900 px-2.5 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Remove Watermark">Remove</button>
            <div className="flex gap-2"><button type="button" onClick={() => setActiveToolbarPopover(null)} className="studio-v2-focus rounded border border-[var(--studio-border)] px-2.5 py-1.5 text-xs text-[var(--studio-muted)]">Cancel</button><button type="button" onClick={() => void submitWatermark()} disabled={isUploadingWatermark || isMaterializing || submissionGuard.isPending("command:add_watermark")} className="studio-v2-focus studio-v2-primary rounded px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Apply Watermark">{submissionGuard.isPending("command:add_watermark") ? "Applying…" : "Apply Watermark"}</button></div>
          </div>
        </div>
      </StudioV2Popover>
      <StudioV2Popover open={activeToolbarPopover === "pageNumbers"} onClose={() => setActiveToolbarPopover(null)} triggerRef={getPopoverTriggerRef("pageNumbers")} label="Page Numbers" width={320}>
        <div>
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
            <button type="button" onClick={() => void submitPageNumbers(false)} disabled={!pageNumbersEnabled || isMaterializing || submissionGuard.isPending("command:update_page_numbering")} className="rounded border border-red-900 px-2.5 py-1.5 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Remove Page Numbers" data-testid="studio-remove-page-numbers">Remove</button>
            <div className="flex gap-2"><button type="button" onClick={() => setActiveToolbarPopover(null)} className="studio-v2-focus rounded border border-[var(--studio-border)] px-2.5 py-1.5 text-xs text-[var(--studio-muted)]">Cancel</button><button type="button" onClick={() => void submitPageNumbers(true)} disabled={isMaterializing || !Number.isFinite(pageNumbersSize) || submissionGuard.isPending("command:update_page_numbering")} className="studio-v2-focus studio-v2-primary rounded px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Apply Page Numbers" data-testid="studio-apply-page-numbers">{submissionGuard.isPending("command:update_page_numbering") ? "Applying…" : "Apply"}</button></div>
          </div>
        </div>
      </StudioV2Popover>
    </header>
  );
};
