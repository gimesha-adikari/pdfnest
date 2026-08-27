export type ToolCategory = "pages" | "organize" | "edit" | "annotate" | "layers";

export type InspectorTab = "properties" | "history";

export interface DocumentInfo {
  id: string;
  name: string;
  version: string;
  pageCount: number;
  fileSize: string;
  saved: boolean;
  syncStatus: "loading" | "saved" | "saving" | "error";
}

export interface HistoryItem {
  id: string;
  action: string;
  timestamp: string;
  versionNumber: number;
  isActive: boolean;
}

export interface StudioV2OverlayDraft {
  pageId: string;
  overlayId: string;
  type: "signature" | "text";
  rect: { x: number; y: number; width: number; height: number };
  text?: string;
  fontSize?: number;
  color?: string;
  assetId?: string;
}

/** Temporary visible-page PDF-point selection; never persisted into the VDM. */
export interface StudioV2RedactionDraftBox {
  id: string;
  pageId: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
}

export interface StudioShellState {
  document: DocumentInfo;
  activeTool: ToolCategory;
  inspectorTab: InspectorTab;
  selectedPageId: string | null;
  selectedOverlayId: string | null;
  zoomScale: number;
  panOffset: { x: number; y: number };
  isPanning: boolean;
  commandPaletteOpen: boolean;
  mobileSheetOpen: boolean;
  history: HistoryItem[];
}
