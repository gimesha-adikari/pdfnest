"use client";

import React from "react";
import {
  Undo2,
  Redo2,
  Search,
  Settings,
  HelpCircle,
  User,
  CheckCircle2,
  Download,
} from "lucide-react";
import { DocumentInfo } from "./types";

interface StudioV2HeaderProps {
  document: DocumentInfo;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenCommandPalette?: () => void;
  onExport?: () => void;
}

export const StudioV2Header: React.FC<StudioV2HeaderProps> = ({
  document,
  canUndo = true,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenCommandPalette,
  onExport,
}) => {
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
          <div className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{document.saved ? "Status: Saved" : "Syncing..."}</span>
          </div>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] transition-colors text-sm disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
            <span className="hidden lg:inline">Undo</span>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="h-[48px] flex items-center gap-1.5 px-3 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] transition-colors text-sm disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Redo"
          >
            <Redo2 className="w-4 h-4" />
            <span className="hidden lg:inline">Redo</span>
          </button>
        </nav>
      </div>

      {/* Right Action Group */}
      <div className="flex items-center space-x-3">
        {/* Search / Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden sm:flex items-center gap-2 bg-[#181B21] border border-[#292D35] text-[#9AA1AD] hover:text-white px-3 py-1 rounded text-xs transition-colors"
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
          className="p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 text-[#9AA1AD] hover:text-white hover:bg-[#181B21] rounded transition-colors"
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-[#292D35] mx-1" />

        {/* Auth / Export */}
        <button className="hidden sm:inline text-xs text-[#9AA1AD] hover:text-white transition-colors">
          Sign In
        </button>
        <button
          onClick={onExport}
          className="bg-[#7c3aed] text-white text-xs font-medium px-3.5 py-1.5 rounded hover:bg-[#6d28d9] transition-colors flex items-center gap-1.5 shadow-sm"
          aria-label="Export PDF"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <div className="w-7 h-7 rounded-full bg-[#181B21] border border-[#292D35] flex items-center justify-center text-[#9AA1AD]">
          <User className="w-4 h-4" />
        </div>
      </div>
    </header>
  );
};
