"use client";

import React from "react";
import {
  Menu,
  LayoutGrid,
  Layers,
  Edit3,
  PenTool,
  Copy,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { ToolCategory } from "./types";

interface StudioV2SidebarProps {
  activeTool: ToolCategory;
  onSelectTool: (tool: ToolCategory) => void;
  onEnterEdit?: () => void;
  onTrash?: () => void;
  onHelp?: () => void;
  isSessionActionDisabled?: boolean;
}

export const StudioV2Sidebar: React.FC<StudioV2SidebarProps> = ({
  activeTool,
  onSelectTool,
  onEnterEdit,
  onTrash,
  onHelp,
  isSessionActionDisabled = false,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const navItems: { id: ToolCategory; label: string; icon: React.ElementType }[] = [
    { id: "pages", label: "Pages", icon: LayoutGrid },
    { id: "organize", label: "Organize", icon: Layers },
    { id: "edit", label: "Edit", icon: Edit3 },
    { id: "annotate", label: "Annotate", icon: PenTool },
    { id: "layers", label: "Layers", icon: Copy },
  ];

  return (
    <aside className={`studio-v2-rail ${expanded ? "expanded" : ""}`} aria-label="Studio workspaces">
      <div className="studio-v2-rail-head">
        {expanded && <span>Workspace</span>}
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Collapse workspace navigation" : "Expand workspace navigation"}><Menu size={17} /></button>
      </div>

      {/* Main Tool Categories */}
      <nav className="studio-v2-rail-items">
        <div className="sr-only">Workspace tools</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTool(item.id)}
              aria-current={isActive ? "page" : undefined}
              data-testid={`studio-category-${item.id}`}
              title={item.label}
              aria-label={item.label}
              className={`studio-v2-rail-item ${isActive ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="studio-v2-rail-edit">
        <button type="button" onClick={onEnterEdit} aria-label="Edit PDF" title="Edit PDF" data-testid="studio-enter-edit-pdf"
          className="studio-v2-rail-item">
          <Edit3 size={18} /><span>Edit PDF</span>
        </button>
      </div>

      {/* Footer Navigation */}
      <div className="studio-v2-rail-footer">
        <button type="button" onClick={onTrash} disabled={isSessionActionDisabled} data-testid="studio-trash" title={isSessionActionDisabled ? "Finish the active Studio operation before discarding this session" : "Discard this Studio session"} className="studio-v2-rail-item">
          <Trash2 className="w-4 h-4" />
          <span>Trash</span>
        </button>
        <button type="button" onClick={onHelp} data-testid="studio-help" title="Help" className="studio-v2-rail-item">
          <HelpCircle className="w-4 h-4" />
          <span>Help</span>
        </button>
      </div>
    </aside>
  );
};
