"use client";

import React from "react";
import {
  LayoutGrid,
  Layers,
  Edit3,
  PenTool,
  Copy,
  MoreHorizontal,
} from "lucide-react";
import { ToolCategory } from "./types";

interface StudioV2MobileNavProps {
  activeTool: ToolCategory;
  onSelectTool: (tool: ToolCategory) => void;
  onOpenMore: () => void;
}

export const StudioV2MobileNav: React.FC<StudioV2MobileNavProps> = ({
  activeTool,
  onSelectTool,
  onOpenMore,
}) => {
  const items: { id: ToolCategory; label: string; icon: React.ElementType }[] = [
    { id: "pages", label: "Pages", icon: LayoutGrid },
    { id: "organize", label: "Organize", icon: Layers },
    { id: "edit", label: "Edit", icon: Edit3 },
    { id: "annotate", label: "Annotate", icon: PenTool },
    { id: "layers", label: "Layers", icon: Copy },
  ];

  return (
    <nav className="studio-v2-mobile-nav" aria-label="Mobile workspace navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTool === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTool(item.id)}
            className={isActive ? "active" : ""}
            aria-label={item.label}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span>
              {item.label}
            </span>
          </button>
        );
      })}
      <button type="button" onClick={onOpenMore} className="more" aria-label="More document tools">
        <MoreHorizontal className="mb-0.5 h-5 w-5" />
        <span>More</span>
      </button>
    </nav>
  );
};
