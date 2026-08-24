"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  RotateCw,
  Crop,
  Droplets,
  Download,
  Maximize2,
  FilePlus,
  X,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  badge?: string;
  category: string;
  icon: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

interface StudioV2CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onFitToScreen?: () => void;
  onRotatePage?: () => void;
  onCropPage?: () => void;
  onAddWatermark?: () => void;
  onExport?: () => void;
  onNewPage?: () => void;
}

export const StudioV2CommandPalette: React.FC<StudioV2CommandPaletteProps> = ({
  isOpen,
  onClose,
  onFitToScreen,
  onRotatePage,
  onCropPage,
  onAddWatermark,
  onExport,
  onNewPage,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: "fit_screen",
      label: "Fit Canvas to Screen",
      category: "VIEWPORT ACTIONS",
      icon: Maximize2,
      shortcut: "0",
      action: () => {
        onFitToScreen?.();
        onClose();
      },
    },
    {
      id: "rotate",
      label: "Rotate Page Clockwise (90°)",
      badge: "Phase 3F",
      category: "PAGE MUTATIONS",
      icon: RotateCw,
      shortcut: "R",
      disabled: true,
      action: () => {
        onRotatePage?.();
        onClose();
      },
    },
    {
      id: "crop",
      label: "Crop Selected Page Area",
      badge: "Phase 3F",
      category: "PAGE MUTATIONS",
      icon: Crop,
      disabled: true,
      action: () => {
        onCropPage?.();
        onClose();
      },
    },
    {
      id: "watermark",
      label: "Add Confidential Watermark",
      badge: "Phase 3F",
      category: "DOCUMENT TOOLS",
      icon: Droplets,
      disabled: true,
      action: () => {
        onAddWatermark?.();
        onClose();
      },
    },
    {
      id: "new_page",
      label: "Insert Blank Page",
      badge: "Phase 3F",
      category: "DOCUMENT TOOLS",
      icon: FilePlus,
      disabled: true,
      action: () => {
        onNewPage?.();
        onClose();
      },
    },
    {
      id: "export",
      label: "Export Final PDF",
      badge: "Phase 3H",
      category: "FILE ACTIONS",
      icon: Download,
      shortcut: "⇧⌘E",
      disabled: true,
      action: () => {
        onExport?.();
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? (filteredCommands.length || 1) - 1 : prev - 1
        );
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] bg-[#14171C] border border-[#292D35] rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-[#292D35] bg-[#101216]">
          <Search className="w-4 h-4 text-[#9AA1AD] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search action..."
            className="w-full bg-transparent text-sm text-[#F5F7FA] placeholder-[#717784] focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-[#717784] hover:text-[#F5F7FA] p-1 rounded transition-colors ml-2"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-[320px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#717784]">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-xs transition-colors ${
                    isSelected
                      ? "bg-[#181B21] text-white border border-[#7c3aed]"
                      : "text-[#9AA1AD] hover:bg-[#181B21] hover:text-white border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-[#d2bbff]" />
                    <span className="font-medium">{cmd.label}</span>
                    {cmd.badge && (
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#101216] border border-[#292D35] text-[#9AA1AD]">
                        {cmd.badge}
                      </span>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="font-mono text-[10px] bg-[#101216] border border-[#292D35] rounded px-1.5 py-0.5 text-[#9AA1AD]">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#292D35] bg-[#101216] flex items-center justify-between text-[10px] font-mono text-[#717784]">
          <span>Use ↑↓ to navigate • ↵ to select</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
