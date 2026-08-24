"use client";

import React from "react";
import {
  Search,
  Hand,
  Minus,
  Plus,
  Maximize2,
  FileText,
} from "lucide-react";
import { DocumentInfo } from "./types";

interface StudioV2CanvasProps {
  document: DocumentInfo;
  zoomScale: number;
  isPanning: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onTogglePan: () => void;
  onOpenCommandPalette: () => void;
}

export const StudioV2Canvas: React.FC<StudioV2CanvasProps> = ({
  document,
  zoomScale,
  isPanning,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onTogglePan,
  onOpenCommandPalette,
}) => {
  return (
    <div className="flex-1 h-full relative flex flex-col bg-[#0B0C0F] overflow-hidden select-none">
      {/* Floating Command Palette Trigger Pill (Top Center) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[380px] max-w-[90%] bg-[#14171C] rounded-md border border-[#292D35] z-30 shadow-lg flex items-center px-3 py-1.5 transition-all hover:border-[#7c3aed]">
        <Search className="w-4 h-4 text-[#9AA1AD] mr-2 shrink-0" />
        <button
          onClick={onOpenCommandPalette}
          className="bg-transparent border-none w-full text-left text-[#9AA1AD] hover:text-white text-xs truncate focus:outline-none p-0"
        >
          Type a command or search...
        </button>
        <div className="flex items-center gap-1 ml-2 opacity-60 shrink-0">
          <kbd className="font-mono text-[10px] border border-[#292D35] rounded px-1 text-[#9AA1AD]">
            ⌘
          </kbd>
          <kbd className="font-mono text-[10px] border border-[#292D35] rounded px-1 text-[#9AA1AD]">
            K
          </kbd>
        </div>
      </div>

      {/* Center Canvas Viewport */}
      <div
        className={`flex-1 flex items-center justify-center overflow-auto p-8 relative z-10 ${
          isPanning ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        }`}
      >
        {/* Document Page Container */}
        <div
          style={{ transform: `scale(${zoomScale})` }}
          className="relative w-[595px] h-[842px] bg-white border border-[#292D35] shadow-2xl flex flex-col origin-center transition-transform duration-100 ease-out text-gray-900 rounded-[2px]"
        >
          {/* Mock Document Surface Preview */}
          <div className="p-10 flex flex-col h-full relative">
            <header className="flex justify-between items-end border-b border-gray-200 pb-4 mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                  Q3 Financial Report
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Global Operations Summary
                </p>
              </div>
              <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center text-purple-600">
                <FileText className="w-4 h-4" />
              </div>
            </header>

            <div className="grid grid-cols-2 gap-6 flex-1 text-xs">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">
                    Revenue Streams
                  </h3>
                  <p className="text-gray-600 leading-relaxed text-justify">
                    In Q3, enterprise solutions saw a significant uptick,
                    driving core metrics above the projected baseline. The
                    integration of the new Platen Studio engine resulted in a 40%
                    decrease in processing overhead.
                  </p>
                </div>

                {/* Selection Highlight with Corner Handles */}
                <div className="relative border-2 border-[#7c3aed] p-3 rounded bg-purple-50/30 cursor-move group">
                  <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#7c3aed] rounded-sm" />
                  <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#7c3aed] rounded-sm" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-[#7c3aed] rounded-sm" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-[#7c3aed] rounded-sm" />
                  <div className="h-28 bg-[#101216] rounded border border-[#292D35] flex items-center justify-center text-white text-[11px] font-mono">
                    [ Performance Chart Object ]
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Key Performance Metrics
                  </h3>
                  <ul className="space-y-2.5">
                    <li className="flex justify-between border-b border-gray-100 pb-1.5">
                      <span className="text-gray-500">Active Users</span>
                      <span className="font-semibold text-gray-900">1.2M</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-100 pb-1.5">
                      <span className="text-gray-500">Retention Rate</span>
                      <span className="font-semibold text-gray-900">94.2%</span>
                    </li>
                    <li className="flex justify-between border-b border-gray-100 pb-1.5">
                      <span className="text-gray-500">Avg Response Time</span>
                      <span className="font-semibold text-gray-900">42ms</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <footer className="mt-auto pt-4 border-t border-gray-100 text-[10px] text-gray-400 flex justify-between">
              <span>{document.name}</span>
              <span>Page 1 of {document.pageCount}</span>
            </footer>
          </div>
        </div>
      </div>

      {/* Floating Bottom Zoom/Pan Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center bg-[#14171C] rounded-md border border-[#292D35] z-20 shadow-xl overflow-hidden">
        <button
          onClick={onTogglePan}
          className={`p-2 text-[#9AA1AD] hover:text-white hover:bg-[#20242B] transition-colors flex items-center justify-center ${
            isPanning ? "bg-[#20242B] text-[#d2bbff]" : ""
          }`}
          aria-label="Toggle pan tool"
        >
          <Hand className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-[#292D35]" />
        <button
          onClick={onZoomOut}
          className="p-2 text-[#9AA1AD] hover:text-white hover:bg-[#20242B] transition-colors flex items-center justify-center"
          aria-label="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-mono text-[11px] text-[#F5F7FA] px-3 min-w-[56px] text-center">
          {Math.round(zoomScale * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-2 text-[#9AA1AD] hover:text-white hover:bg-[#20242B] transition-colors flex items-center justify-center"
          aria-label="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-[#292D35]" />
        <button
          onClick={onFitToScreen}
          className="p-2 text-[#9AA1AD] hover:text-white hover:bg-[#20242B] transition-colors flex items-center justify-center"
          aria-label="Fit to screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
