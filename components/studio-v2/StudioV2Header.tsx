"use client";

import React, { useState } from "react";
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
import { StudioAssetDTO, StudioCompressionLevel } from "@/lib/studio-v2/api";

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
    </header>
  );
};
