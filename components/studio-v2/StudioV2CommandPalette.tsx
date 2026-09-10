"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  RotateCw,
  Download,
  Maximize2,
  X,
} from "lucide-react";
import type { ToolCategory } from "./types";
import { normalizeStudioCommandQuery } from "./studioV2PresentationState";

interface CommandItem {
  id: string;
  label: string;
  searchTerms?: string;
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
  canRotatePage?: boolean;
  onCropPage?: () => void;
  onAddWatermark?: () => void;
  onExport?: () => void;
  onNewPage?: () => void;
  onSelectWorkspace?: (tool: ToolCategory) => void;
  onOpenHistory?: () => void;
  onEnterEdit?: () => void;
}

export const StudioV2CommandPalette: React.FC<StudioV2CommandPaletteProps> = ({
  isOpen,
  onClose,
  onFitToScreen,
  onRotatePage,
  canRotatePage = false,
  onCropPage,
  onAddWatermark,
  onExport,
  onNewPage,
  onSelectWorkspace,
  onOpenHistory,
  onEnterEdit,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const commands: CommandItem[] = [
    ...(["pages", "organize", "annotate", "layers"] as const).map((tool) => ({
      id: `workspace_${tool}`,
      label: `Open ${tool[0].toUpperCase()}${tool.slice(1)} Workspace`,
      category: "WORKSPACES",
      icon: tool === "annotate" ? RotateCw : Maximize2,
      disabled: !onSelectWorkspace,
      action: () => { onSelectWorkspace?.(tool); onClose(); },
    })),
    {
      id: "workspace_edit",
      label: "Open Edit PDF Workspace",
      category: "WORKSPACES",
      icon: Maximize2,
      disabled: !onEnterEdit,
      action: () => { onEnterEdit?.(); onClose(); },
    },
    {
      id: "history",
      label: "Open Version History",
      category: "WORKSPACES",
      icon: RotateCw,
      disabled: !onOpenHistory,
      action: () => { onOpenHistory?.(); onClose(); },
    },
    {
      id: "fit_screen",
      label: "Fit Canvas to Screen",
      searchTerms: "Fit Width",
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
      badge: "Batch 2A",
      category: "PAGE MUTATIONS",
      icon: RotateCw,
      shortcut: "R",
      disabled: !canRotatePage,
      action: () => {
        onRotatePage?.();
        onClose();
      },
    },
    {
      id: "export",
      label: "Export Final PDF",
      category: "FILE ACTIONS",
      icon: Download,
      shortcut: "⇧⌘E",
      disabled: !onExport,
      action: () => {
        onExport?.();
        onClose();
      },
    },
  ];

  const normalizedQuery = normalizeStudioCommandQuery(query);
  const filteredCommands = commands.filter((cmd) =>
    normalizeStudioCommandQuery(`${cmd.label} ${cmd.searchTerms ?? ""} ${cmd.category}`).includes(normalizedQuery)
  );

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const openTimer = window.setTimeout(() => {
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 0);

      return () => {
        window.clearTimeout(openTimer);
        previousFocusRef.current?.focus();
        previousFocusRef.current = null;
      };
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
      className="studio-v2-command-backdrop"
      onClick={onClose}
    >
      <div
        className="studio-v2-command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="studio-v2-command-search">
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
        <div className="studio-v2-command-list">
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
                  disabled={cmd.disabled}
                  className={isSelected ? "selected" : ""}
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
        <div className="studio-v2-command-footer">
          <span>Use ↑↓ to navigate • ↵ to select</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};
