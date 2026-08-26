"use client";

import React from "react";
import {
  FileText,
  Plus,
  LayoutGrid,
  Layers,
  Edit3,
  PenTool,
  Copy,
  Trash2,
  HelpCircle,
} from "lucide-react";
import { DocumentInfo, ToolCategory } from "./types";

interface StudioV2SidebarProps {
  document: DocumentInfo;
  activeTool: ToolCategory;
  onSelectTool: (tool: ToolCategory) => void;
  onAddNewPage?: () => void;
}

export const StudioV2Sidebar: React.FC<StudioV2SidebarProps> = ({
  document,
  activeTool,
  onSelectTool,
  onAddNewPage,
}) => {
  const navItems: { id: ToolCategory; label: string; icon: React.ElementType }[] = [
    { id: "pages", label: "Pages", icon: LayoutGrid },
    { id: "organize", label: "Organize", icon: Layers },
    { id: "edit", label: "Edit", icon: Edit3 },
    { id: "annotate", label: "Annotate", icon: PenTool },
    { id: "layers", label: "Layers", icon: Copy },
  ];

  return (
    <aside className="fixed left-0 top-[48px] bottom-0 w-[260px] bg-[#101216] border-r border-[#292D35] flex flex-col z-40 transition-all duration-150">
      {/* Document Info Card */}
      <div className="p-4 border-b border-[#292D35] flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#181B21] rounded flex items-center justify-center text-[#9AA1AD] border border-[#292D35]">
            <FileText className="w-5 h-5 text-[#d2bbff]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[#F5F7FA] truncate leading-tight">
              {document.name}
            </h2>
            <span className="text-[11px] font-mono text-[#9AA1AD] block mt-0.5">
              {document.version}
            </span>
          </div>
        </div>

        <button
          onClick={onAddNewPage}
          className="w-full flex items-center justify-center gap-2 bg-[#181B21] border border-[#292D35] text-white text-xs font-medium py-1.5 rounded hover:bg-[#20242B] transition-colors"
          aria-label="Add blank page"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Blank Page</span>
        </button>
      </div>

      {/* Main Tool Categories */}
      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 pb-2 text-[10px] font-mono text-[#717784] tracking-wider uppercase">
          WORKSPACE TOOLS
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTool === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTool(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono tracking-wider transition-colors ${
                isActive
                  ? "border-l-2 border-[#7c3aed] bg-[#181B21] text-[#d2bbff] font-semibold"
                  : "text-[#9AA1AD] hover:bg-[#181B21] hover:text-[#F5F7FA] border-l-2 border-transparent"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-[#d2bbff]" : "text-[#9AA1AD]"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Navigation */}
      <div className="mt-auto border-t border-[#292D35] py-2">
        <button className="w-full flex items-center gap-3 px-4 py-2 text-xs font-mono text-[#9AA1AD] hover:bg-[#181B21] hover:text-white transition-colors">
          <Trash2 className="w-4 h-4" />
          <span>Trash</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-2 text-xs font-mono text-[#9AA1AD] hover:bg-[#181B21] hover:text-white transition-colors">
          <HelpCircle className="w-4 h-4" />
          <span>Help</span>
        </button>
      </div>
    </aside>
  );
};
