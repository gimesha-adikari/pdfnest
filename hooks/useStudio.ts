"use client";

import { useStudioDocument } from "./useStudioDocument";
import { useStudioPreview } from "./useStudioPreview";
import { useStudioZoom } from "./useStudioZoom";
import { useStudioSidebar } from "./useStudioSidebar";
import { useStudioTools } from "./useStudioTools";

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
        const committed = await document.replaceCurrentDocument(file);

        if (!committed) {
            throw new Error("Document could not be loaded into Studio.");
        }
    };

    const resetStudio = () => {
        document.resetDocument();
        preview.resetPreview();
        zoom.zoomReset();
        tools.setActiveTool("select");
    };

    return {
        document,
        preview,
        zoom,
        sidebar,
        tools,
        commitDocument,
        resetStudio,
    };
}