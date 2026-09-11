"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  RotateCw,
  Download,
  Maximize2,
  X,
  LayoutGrid,
  Layers3,
  PenTool,
  Type,
  Clock3,
  CircleHelp,
} from "lucide-react";
import type { ToolCategory } from "./types";
import { normalizeStudioCommandQuery } from "./studioV2PresentationState";

interface CommandItem {
  id: string;
  label: string;
  searchTerms?: string;
  badge?: string;
  category: string;
  hint: string;
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
  onOpenHelp?: () => void;
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
  onOpenHelp,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const commands: CommandItem[] = [
    ...(["pages", "organize", "annotate", "layers"] as const).map((tool) => ({
      id: `workspace_${tool}`,
      label: `Open ${tool[0].toUpperCase()}${tool.slice(1)} Workspace`,
      category: "Go to workspace",
      hint: tool === "pages" ? "Navigate the document" : tool === "organize" ? "Arrange the current page" : tool === "annotate" ? "Mark up the current page" : "Inspect page objects",
      icon: tool === "pages" ? LayoutGrid : tool === "layers" ? Layers3 : tool === "annotate" ? PenTool : Maximize2,
      disabled: !onSelectWorkspace,
      action: () => { onSelectWorkspace?.(tool); onClose(); },
    })),
    {
      id: "workspace_edit",
      label: "Open Edit PDF Workspace",
      category: "Go to workspace",
      hint: "Open the real Editor V2 workspace",
      icon: Type,
      disabled: !onEnterEdit,
      action: () => { onEnterEdit?.(); onClose(); },
    },
    {
      id: "history",
      label: "Open Version History",
      category: "View",
      hint: "Review and restore Studio versions",
      icon: Clock3,
      disabled: !onOpenHistory,
      action: () => { onOpenHistory?.(); onClose(); },
    },
    {
      id: "fit_screen",
      label: "Fit Canvas to Screen",
      searchTerms: "Fit Width",
      category: "View",
      hint: "Fit the page to the available canvas",
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
      category: "Page mutations",
      hint: "Rotate the selected page",
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
      category: "Document",
      hint: "Prepare the final PDF download",
      icon: Download,
      shortcut: "⇧⌘E",
      disabled: !onExport,
      action: () => {
        onExport?.();
        onClose();
      },
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      category: "Help",
      hint: "Open Studio keyboard shortcuts",
      icon: CircleHelp,
      disabled: !onOpenHelp,
      action: () => { onOpenHelp?.(); onClose(); },
    },
  ];

  const normalizedQuery = normalizeStudioCommandQuery(query);
  const filteredCommands = commands.filter((cmd) =>
    normalizeStudioCommandQuery(`${cmd.label} ${cmd.searchTerms ?? ""} ${cmd.category} ${cmd.hint}`).includes(normalizedQuery)
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
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(":is(button, input):not(:disabled)")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus();
        }
        return;
      }
      // Focused buttons retain their own Enter behavior. Search navigation
      // must not dispatch a different highlighted command behind that focus.
      if (e.target !== inputRef.current) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === 0 ? (filteredCommands.length || 1) - 1 : prev - 1
        );
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        if (!filteredCommands[selectedIndex].disabled) filteredCommands[selectedIndex].action();
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search Studio commands"
        className="studio-v2-command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="studio-v2-command-heading">
          <div><span className="studio-v2-command-kicker">Command center</span><strong>Search Studio</strong></div>
          <button onClick={onClose} aria-label="Close command palette"><X className="w-4 h-4" /></button>
        </div>
        <div className="studio-v2-command-search">
          <Search className="w-4 h-4 text-[#9AA1AD] mr-3 shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search Studio commands"
            aria-expanded="true"
            aria-controls="studio-command-list"
            aria-activedescendant={filteredCommands[selectedIndex] ? `studio-command-${filteredCommands[selectedIndex].id}` : undefined}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search action..."
            className="w-full bg-transparent text-sm text-[#F5F7FA] placeholder-[#717784] focus:outline-none"
          />
        </div>

        {/* Command List */}
        <div id="studio-command-list" role="listbox" aria-label="Studio commands" className="studio-v2-command-list">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#717784]">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon;
              const isSelected = index === selectedIndex;
              const showGroup = index === 0 || cmd.category !== filteredCommands[index - 1].category;
              return <React.Fragment key={cmd.id}>
                {showGroup && <div className="studio-v2-command-group-label">{cmd.category}</div>}
                <button id={`studio-command-${cmd.id}`} role="option" aria-selected={isSelected} aria-disabled={cmd.disabled || undefined} onClick={cmd.action} onMouseEnter={() => setSelectedIndex(index)} disabled={cmd.disabled} className={isSelected ? "selected" : ""}>
                  <div className="studio-v2-command-row-copy"><Icon className="w-4 h-4" /><span><strong>{cmd.label}</strong><small>{cmd.hint}</small></span>{cmd.badge && <em>{cmd.badge}</em>}</div>
                  <div className="studio-v2-command-row-end">{cmd.shortcut && <kbd>{cmd.shortcut}</kbd>}{isSelected && <span aria-hidden="true">›</span>}</div>
                </button>
              </React.Fragment>;
            })
          )}
        </div>

        {/* Footer */}
        <div className="studio-v2-command-footer">
          <span>↑↓ Navigate</span><span>Enter Run</span><span>Esc Close</span>
        </div>
      </div>
    </div>
  );
};
