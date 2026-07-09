"use client";

import StudioHeader from "@/components/studio/StudioHeader";
import StudioBanner from "@/components/studio/StudioBanner";
import StudioWelcome from "@/components/studio/StudioWelcome";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import { useStudio } from "@/hooks/useStudio";

if (typeof window !== "undefined") {
    import("pdfjs-dist").then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc =
            window.location.origin + "/pdf.worker.mjs";
    });
}

export default function StudioPageBase() {
    const {
        document,
        preview,
        zoom,
        sidebar,
        tools,
        commitDocument,
        resetStudio,
    } = useStudio();

    const handleFilesAccepted = async (files: File[]) => {
        await document.handleFilesAccepted(files);
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
        </div>
    );
}