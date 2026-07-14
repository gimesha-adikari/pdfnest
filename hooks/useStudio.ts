"use client";

import { useStudioDocument } from "./useStudioDocument";
import { useStudioPreview } from "./useStudioPreview";
import { useStudioZoom } from "./useStudioZoom";
import { useStudioSidebar } from "./useStudioSidebar";
import { useStudioTools } from "./useStudioTools";
import { saveStudioSession } from "@/lib/studio/autosave";
import { saveProject } from "@/lib/studio/saveProject";

export function useStudio() {
    const document = useStudioDocument();
    const preview = useStudioPreview({
        activeFile: document.activeFile,
        pageNumber: document.currentPageIndex + 1,
        onError: document.setErrorMessage,
    });
    const zoom = useStudioZoom();
    const sidebar = useStudioSidebar();
    const tools = useStudioTools();

    const commitDocument = async (file: File) => {
        preview.clearPreviewCache();

        const result = await document.replaceCurrentDocument(file);

        if (!result) {
            throw new Error("Document could not be loaded into Studio.");
        }

        await saveStudioSession({
            version: 1,
            savedAt: Date.now(),
            activeTool: tools.activeTool,
            zoom: zoom.zoom,
            current: result.snapshot,
            past: result.past,
            future: result.future,
        });
    };

    const resetStudio = () => {
        document.resetDocument();
        preview.resetPreview();
        zoom.zoomReset();
        tools.setActiveTool("select");
    };

    const saveCurrentProject = async () => {
        const snapshot = document.captureSnapshot();

        if (!snapshot) return;

        await saveProject({
            version: 1,
            savedAt: Date.now(),
            activeTool: tools.activeTool,
            zoom: zoom.zoom,
            current: snapshot,
            past: document.past,
            future: document.future,
        });
    };

    return {
        document,
        preview,
        zoom,
        sidebar,
        tools,
        commitDocument,
        resetStudio,
        saveCurrentProject,
    };
}