"use client";

import React from "react";
import {
  X,
  RotateCw,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ToolCategory } from "./types";

interface StudioV2BottomSheetProps {
  isOpen: boolean;
  activeTool: ToolCategory;
  onClose: () => void;
  onRotatePage?: () => void;
  onDeletePage?: () => void;
  onMovePageEarlier?: () => void;
  onMovePageLater?: () => void;
  onDuplicatePage?: () => void;
}

export const StudioV2BottomSheet: React.FC<StudioV2BottomSheetProps> = ({
  isOpen,
  activeTool,
  onClose,
  onRotatePage,
  onDeletePage,
  onMovePageEarlier,
  onMovePageLater,
  onDuplicatePage,
}) => {
  if (!isOpen) return null;

  return (
    <div className="md:hidden fixed bottom-[56px] left-0 right-0 max-h-[42vh] bg-[#14171C] border-t border-[#292D35] rounded-t-xl shadow-2xl z-30 flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Draggable Handle Pill */}
      <div className="flex justify-center pt-2.5 pb-1">
        <div className="w-8 h-1 bg-[#3b3742] rounded-full" />
      </div>

      {/* Sheet Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#292D35]">
        <h3 className="font-mono text-xs font-semibold text-[#F5F7FA] uppercase tracking-wider">
          {activeTool} Tools & Properties
        </h3>
        <button
          onClick={onClose}
          className="text-[#9AA1AD] hover:text-white p-1 rounded"
          aria-label="Close bottom sheet"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category-scoped mobile content. Full editors remain in the desktop inspector. */}
      <div className="p-4 overflow-y-auto space-y-4 text-xs" data-testid="studio-mobile-category-panel">
        {activeTool === "pages" && <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onRotatePage} className="flex flex-col items-center justify-center rounded border border-[#292D35] bg-[#101216] p-3 text-[#F5F7FA] hover:border-[var(--studio-border-active)]"><RotateCw className="mb-1.5 h-5 w-5 text-[var(--studio-accent)]" /><span>Rotate</span></button>
          <button type="button" onClick={onDuplicatePage} className="flex flex-col items-center justify-center rounded border border-[#292D35] bg-[#101216] p-3 text-[#F5F7FA] hover:border-[var(--studio-border-active)]"><Copy className="mb-1.5 h-5 w-5 text-[var(--studio-accent)]" /><span>Duplicate</span></button>
          <button type="button" onClick={onDeletePage} className="flex flex-col items-center justify-center rounded border border-red-900/70 bg-[#101216] p-3 text-red-300 hover:border-red-500"><Trash2 className="mb-1.5 h-5 w-5" /><span>Delete</span></button>
        </div>}
        {activeTool === "organize" && <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onMovePageEarlier} className="flex flex-col items-center justify-center rounded border border-[#292D35] bg-[#101216] p-3 text-[#F5F7FA] hover:border-[var(--studio-border-active)]"><ArrowUp className="mb-1.5 h-5 w-5 text-[var(--studio-accent)]" /><span>Earlier</span></button>
          <button type="button" onClick={onMovePageLater} className="flex flex-col items-center justify-center rounded border border-[#292D35] bg-[#101216] p-3 text-[#F5F7FA] hover:border-[var(--studio-border-active)]"><ArrowDown className="mb-1.5 h-5 w-5 text-[var(--studio-accent)]" /><span>Later</span></button>
          <button type="button" onClick={onDuplicatePage} className="flex flex-col items-center justify-center rounded border border-[#292D35] bg-[#101216] p-3 text-[#F5F7FA] hover:border-[var(--studio-border-active)]"><Copy className="mb-1.5 h-5 w-5 text-[var(--studio-accent)]" /><span>Duplicate</span></button>
        </div>}
        {activeTool === "edit" && <p className="rounded border border-[#292D35] bg-[#101216] p-3 leading-5 text-[#B7BDC8]">Edit tools: Add Text, Sign, Metadata, and Crop. Open the desktop inspector for their full controls.</p>}
        {activeTool === "annotate" && <p className="rounded border border-[#292D35] bg-[#101216] p-3 leading-5 text-[#B7BDC8]">Annotate tools: Smart, Manual, OCR, Highlight, Underline, and Strikeout with shared color controls.</p>}
        {activeTool === "layers" && <p className="rounded border border-[#292D35] bg-[#101216] p-3 leading-5 text-[#B7BDC8]">Layers shows the text, signature, and watermark overlays for the selected page.</p>}
      </div>
    </div>
  );
};
