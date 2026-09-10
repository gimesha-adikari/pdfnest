"use client";

import React from "react";
import { Crop, Edit3, FilePlus2, Highlighter, Layers3, LayoutGrid, Minus, MoveDown, MoveUp, PenTool, RotateCw, SlidersHorizontal, Sparkles, Strikethrough, Type, ScanText, MousePointer2 } from "lucide-react";
import type { StudioMarkupAction, StudioMarkupMode } from "@/lib/studio-v2/api";
import type { ToolCategory } from "./types";

interface StudioV2ContextToolbarProps {
  activeTool: ToolCategory; pageLabel: string; pageCount: number; action: StudioMarkupAction; mode: StudioMarkupMode; pendingCount: number;
  onActionChange: (action: StudioMarkupAction) => void; onModeChange?: (mode: StudioMarkupMode) => void; onOpenContext: () => void; onOpenPages: () => void;
  onAddNewPage?: () => void; onMoveEarlier?: () => void; onMoveLater?: () => void; onRotate?: () => void; onDuplicate?: () => void; onEnterEdit?: () => void;
}

const workspaceMeta: Record<ToolCategory, { label: string; description: string; icon: React.ElementType }> = {
  pages: { label: "Pages", description: "Navigate the document", icon: LayoutGrid },
  organize: { label: "Organize", description: "Arrange the current page", icon: Layers3 },
  edit: { label: "Edit", description: "Edit the current page", icon: Edit3 },
  annotate: { label: "Annotate", description: "Mark up the current page", icon: PenTool },
  layers: { label: "Layers", description: "Inspect page objects", icon: Layers3 },
};

function ActionButton({ active = false, onClick, icon: Icon, children, className = "" }: { active?: boolean; onClick?: () => void; icon: React.ElementType; children: React.ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} className={`studio-v2-context-action ${active ? "active" : ""} ${className}`}><Icon size={15} /><span>{children}</span></button>;
}

/** Approved-prototype presentation backed exclusively by production callbacks. */
export function StudioV2ContextToolbar(props: StudioV2ContextToolbarProps) {
  const meta = workspaceMeta[props.activeTool];
  const WorkspaceIcon = meta.icon;
  return <div className="studio-v2-context-bar" role="toolbar" aria-label={`${meta.label} tools`}>
    <div className="studio-v2-context-title"><WorkspaceIcon size={17} /><strong>{meta.label}</strong><span>{meta.description}</span></div>
    <div className="studio-v2-context-actions">
      {props.activeTool === "pages" && <><ActionButton active onClick={props.onOpenPages} icon={LayoutGrid}>Open navigator</ActionButton><ActionButton onClick={props.onAddNewPage} icon={FilePlus2}>Add blank page</ActionButton></>}
      {props.activeTool === "organize" && <><ActionButton onClick={props.onMoveEarlier} icon={MoveUp}>Move earlier</ActionButton><ActionButton onClick={props.onMoveLater} icon={MoveDown}>Move later</ActionButton><ActionButton onClick={props.onRotate} icon={RotateCw}>Rotate</ActionButton><ActionButton onClick={props.onDuplicate} icon={FilePlus2}>Duplicate</ActionButton><ActionButton onClick={props.onOpenContext} icon={SlidersHorizontal} className="details">Page actions</ActionButton></>}
      {props.activeTool === "edit" && <><ActionButton active onClick={props.onEnterEdit} icon={Type}>Edit PDF</ActionButton><ActionButton onClick={props.onOpenContext} icon={Crop}>Crop</ActionButton><ActionButton onClick={props.onOpenContext} icon={SlidersHorizontal} className="details">More tools</ActionButton></>}
      {props.activeTool === "annotate" && <><ActionButton active={props.action === "highlight"} onClick={() => props.onActionChange("highlight")} icon={Highlighter}>Highlight</ActionButton><ActionButton active={props.action === "underline"} onClick={() => props.onActionChange("underline")} icon={Minus}>Underline</ActionButton><ActionButton active={props.action === "strikeout"} onClick={() => props.onActionChange("strikeout")} icon={Strikethrough}>Strikeout</ActionButton><ActionButton onClick={props.onOpenContext} icon={SlidersHorizontal} className="details">More tools</ActionButton></>}
      {props.activeTool === "layers" && <ActionButton active onClick={props.onOpenContext} icon={Layers3}>Properties</ActionButton>}
    </div>
    {props.activeTool === "annotate" && <div className="studio-v2-context-modes" role="radiogroup" aria-label="Detection mode">{(["smart", "manual", "ocr"] as StudioMarkupMode[]).map((item) => { const Icon = item === "smart" ? Sparkles : item === "ocr" ? ScanText : MousePointer2; return <button key={item} type="button" role="radio" aria-checked={props.mode === item} className={`studio-v2-context-action ${props.mode === item ? "active" : ""}`} onClick={() => props.onModeChange?.(item)}><Icon size={14}/><span>{item[0].toUpperCase() + item.slice(1)}</span></button>; })}</div>}
    <span className="studio-v2-context-page"><strong>{props.pageLabel}</strong><span>· {props.pageCount} pages</span>{props.pendingCount > 0 && <span>· {props.pendingCount} pending</span>}</span>
  </div>;
}
