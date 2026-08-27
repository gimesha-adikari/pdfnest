"use client";

import React from "react";
import {
  LayoutGrid,
  Layers,
  Edit3,
  PenTool,
  Copy,
} from "lucide-react";
import { ToolCategory } from "./types";

interface StudioV2MobileNavProps {
  activeTool: ToolCategory;
  onSelectTool: (tool: ToolCategory) => void;
}

export const StudioV2MobileNav: React.FC<StudioV2MobileNavProps> = ({
  activeTool,
  onSelectTool,
}) => {
  const items: { id: ToolCategory; label: string; icon: React.ElementType }[] = [
    { id: "pages", label: "Pages", icon: LayoutGrid },
    { id: "organize", label: "Organize", icon: Layers },
    { id: "edit", label: "Edit", icon: Edit3 },
    { id: "annotate", label: "Annotate", icon: PenTool },
    { id: "layers", label: "Layers", icon: Copy },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[56px] bg-[#101216] border-t border-[#292D35] flex items-center justify-around z-40 px-2 select-none">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTool === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTool(item.id)}
            className={`flex-1 min-h-[44px] flex flex-col items-center justify-center relative py-1 rounded transition-colors ${
              isActive ? "text-[var(--studio-accent)]" : "text-[var(--studio-muted)] hover:text-[var(--studio-text)]"
            }`}
            aria-label={item.label}
          >
            {isActive && (
              <div className="absolute top-0 w-8 h-[2px] bg-[var(--studio-border-active)] rounded-b" />
            )}
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="font-mono text-[9px] tracking-wider uppercase font-medium">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
