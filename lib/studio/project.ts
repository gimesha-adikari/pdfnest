import type { DocumentSnapshot } from "@/hooks/useStudioDocument";
import {StudioToolId} from "@/components/studio/ToolBar";

export type ProjectSnapshot = DocumentSnapshot;

export interface StudioProject {
    version: 1;
    savedAt: number;
    activeTool: StudioToolId;
    zoom: number;
    current: ProjectSnapshot;
    past: ProjectSnapshot[];
    future: ProjectSnapshot[];
}