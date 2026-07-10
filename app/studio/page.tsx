"use client";

import StudioHeader from "@/components/studio/StudioHeader";
import StudioBanner from "@/components/studio/StudioBanner";
import StudioWelcome from "@/components/studio/StudioWelcome";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import { useStudio } from "@/hooks/useStudio";
import { useEffect, useState } from "react";
import ExportDialog from "@/components/studio/export/ExportDialog";
import { deleteStudioSession, loadStudioSession } from "@/lib/studio/autosave";
import RecoveryDialog from "@/components/studio/recovery/RecoveryDialog";
import { openProject } from "@/lib/studio/openProject";

if (typeof window !== "undefined") {
    import("pdfjs-dist").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc =
            window.location.origin + "/pdf.worker.mjs";
    });
}

export default function StudioPageBase() {
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [recovery, setRecovery] = useState<any>(null);
    const [exportOpen, setExportOpen] = useState(false);

    const {
        document,
        preview,
        zoom,
        sidebar,
        tools,
        commitDocument,
        resetStudio,
        saveCurrentProject,
    } = useStudio();

    useEffect(() => {
        (async () => {
            const save = await loadStudioSession();
            if (!save) return;

            setRecovery(save);
            setRecoveryOpen(true);
        })();
    }, []);

    const resumeRecovery = async () => {
        if (!recovery) return;

        document.restoreProject(recovery);
        zoom.setZoom(recovery.zoom);
        tools.setActiveTool(recovery.activeTool);

        setRecoveryOpen(false);
    };

    const discardRecovery = async () => {
        await deleteStudioSession();
        setRecovery(null);
        setRecoveryOpen(false);
    };

    const handleFilesAccepted = async (files: File[]) => {
        if (!files.length) return;

        const file = files[0];
        const lower = file.name.toLowerCase();

        if (lower.endsWith(".pns")) {
            const project = await openProject(file);

            document.restoreProject(project);
            zoom.setZoom(project.zoom);
            tools.setActiveTool(project.activeTool);

            return;
        }

        await document.handleFilesAccepted([file]);
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden p-4 sm:p-4 lg:p-6">
            <StudioHeader
                documentName={document.activeFile?.name}
                onOpenPdf={sidebar.openUpload}
                onUndo={document.undo}
                onRedo={document.redo}
                onZoomIn={zoom.zoomIn}
                onZoomOut={zoom.zoomOut}
                onToggleSidebar={sidebar.toggleSidebar}
                sidebarOpen={sidebar.isSidebarOpen}
                onExport={() => setExportOpen(true)}
                onSave={saveCurrentProject}
            />

            <div className="h-4" />

            <StudioBanner
                activeFile={document.activeFile}
                totalPages={document.totalPages}
                isSidebarOpen={sidebar.isSidebarOpen}
                onToggleSidebar={sidebar.toggleSidebar}
                onReset={resetStudio}
            />

            {!document.activeFile ? (
                <StudioWelcome
                    onFilesAccepted={handleFilesAccepted}
                    errorMessage={document.errorMessage}
                />
            ) : (
                <StudioWorkspace
                    activeFile={document.activeFile}
                    pages={document.pages}
                    totalPages={document.totalPages}
                    currentPageIndex={document.currentPageIndex}
                    previewSrc={preview.previewSrc}
                    isScanning={document.isScanning}
                    isRendering={preview.isRendering}
                    zoom={zoom.zoom}
                    isSidebarOpen={sidebar.isSidebarOpen}
                    activeTool={tools.activeTool}
                    canUndo={document.canUndo}
                    canRedo={document.canRedo}
                    uploadInputRef={sidebar.uploadInputRef}
                    onToggleSidebar={sidebar.toggleSidebar}
                    onUploadClick={sidebar.openUpload}
                    onFilesAccepted={handleFilesAccepted}
                    onPageSelect={document.setCurrentPageIndex}
                    onToolSelect={tools.setActiveTool}
                    onZoomIn={zoom.zoomIn}
                    onZoomOut={zoom.zoomOut}
                    onZoomReset={zoom.zoomReset}
                    onPrevPage={() => document.movePage(-1)}
                    onNextPage={() => document.movePage(1)}
                    onUndo={document.undo}
                    onRedo={document.redo}
                    commitDocument={commitDocument}
                />
            )}

            {document.errorMessage && document.activeFile && (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
                    {document.errorMessage}
                </div>
            )}

            <ExportDialog
                open={exportOpen}
                file={document.activeFile}
                onClose={() => setExportOpen(false)}
            />

            <RecoveryDialog
                open={recoveryOpen}
                onResume={resumeRecovery}
                onDiscard={discardRecovery}
            />
        </div>
    );
}