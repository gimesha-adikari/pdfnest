"use client";

import React from "react";
import {
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCw,
  Crop,
  Trash2,
} from "lucide-react";
import { ToolCategory } from "./types";

interface StudioV2BottomSheetProps {
  isOpen: boolean;
  activeTool: ToolCategory;
  onClose: () => void;
  onRotatePage?: () => void;
  onCropPage?: () => void;
  onDeletePage?: () => void;
}

export const StudioV2BottomSheet: React.FC<StudioV2BottomSheetProps> = ({
  isOpen,
  activeTool,
  onClose,
  onRotatePage,
  onCropPage,
  onDeletePage,
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

      {/* Sheet Content Body */}
      <div className="p-4 overflow-y-auto space-y-4 text-xs">
        {activeTool === "edit" ? (
          <>
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-[#9AA1AD] uppercase tracking-wider block">
                Text Size
              </label>
              <div className="flex bg-[#101216] border border-[#292D35] rounded overflow-hidden">
                <button className="flex-1 py-2 text-center text-[#F5F7FA] hover:bg-[#181B21] border-r border-[#292D35]">
                  S
                </button>
                <button className="flex-1 py-2 text-center bg-[#181B21] text-[#d2bbff] font-semibold border-r border-[#292D35]">
                  M
                </button>
                <button className="flex-1 py-2 text-center text-[#F5F7FA] hover:bg-[#181B21]">
                  L
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-[#9AA1AD] uppercase tracking-wider block">
                Alignment
              </label>
              <div className="flex bg-[#101216] border border-[#292D35] rounded overflow-hidden">
                <button className="flex-1 py-2 flex items-center justify-center text-[#d2bbff] bg-[#181B21] border-r border-[#292D35]">
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button className="flex-1 py-2 flex items-center justify-center text-[#9AA1AD] hover:bg-[#181B21] border-r border-[#292D35]">
                  <AlignCenter className="w-4 h-4" />
                </button>
                <button className="flex-1 py-2 flex items-center justify-center text-[#9AA1AD] hover:bg-[#181B21]">
                  <AlignRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onRotatePage}
              className="flex flex-col items-center justify-center p-3 rounded bg-[#101216] border border-[#292D35] text-[#F5F7FA] hover:border-[#7c3aed]"
            >
              <RotateCw className="w-5 h-5 text-[#d2bbff] mb-1.5" />
              <span className="font-mono text-[10px]">Rotate</span>
            </button>
            <button
              onClick={onCropPage}
              className="flex flex-col items-center justify-center p-3 rounded bg-[#101216] border border-[#292D35] text-[#F5F7FA] hover:border-[#7c3aed]"
            >
              <Crop className="w-5 h-5 text-[#d2bbff] mb-1.5" />
              <span className="font-mono text-[10px]">Crop</span>
            </button>
            <button
              onClick={onDeletePage}
              className="flex flex-col items-center justify-center p-3 rounded bg-[#101216] border border-[#292D35] text-red-400 hover:border-red-500"
            >
              <Trash2 className="w-5 h-5 mb-1.5" />
              <span className="font-mono text-[10px]">Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
