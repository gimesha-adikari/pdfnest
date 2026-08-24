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
