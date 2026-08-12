"use client";

import { useStudioDocument } from "./useStudioDocument";
import { usePreview } from "@/lib/preview/usePreview";
import { useStudioZoom } from "./useStudioZoom";
import { useStudioSidebar } from "./useStudioSidebar";
import { useStudioTools } from "./useStudioTools";
import { saveStudioSession } from "@/lib/studio/autosave";
import { saveProject } from "@/lib/studio/saveProject";

export function useStudio() {
    const document = useStudioDocument();

    // Studio main-canvas preview. Uses the server renderer at scale 2.0 (144 DPI equivalent),
    // identical to the behaviour of the retired useStudioPreview hook. PreviewManager owns
    // the full resource lifecycle (session, caching, Object URL revocation).
    const _preview = usePreview({
        file: document.activeFile,
        page: document.currentPageIndex + 1,
        scale: 2.0,
        renderer: "server",
        onError: (err) => document.setErrorMessage(err.message),
    });

    // Re-expose the preview API surface that app/studio/page.tsx and useStudio callers expect,
    // preserving the same field names so the page component needs no changes.
    const preview = {
        previewSrc: _preview.src,
        isRendering: _preview.isLoading,
        // Both clearPreviewCache and resetPreview mapped to reset():
        // PreviewManager releases cached resources and revokes Object URLs when the
        // refcount reaches zero; the next file/page change re-requests automatically.
        clearPreviewCache: _preview.reset,
        resetPreview: _preview.reset,
    };

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