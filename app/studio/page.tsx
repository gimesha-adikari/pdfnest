"use client";

import StudioHeader from "@/components/studio/StudioHeader";
import StudioBanner from "@/components/studio/StudioBanner";
import StudioWelcome from "@/components/studio/StudioWelcome";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import { useStudio } from "@/hooks/useStudio";
import { useEffect, useRef, useState } from "react";
import ExportDialog from "@/components/studio/export/ExportDialog";
import { deleteStudioSession, loadStudioSession } from "@/lib/studio/autosave";
import RecoveryDialog from "@/components/studio/recovery/RecoveryDialog";
import { openProject } from "@/lib/studio/openProject";
import RestoreCloudPreviewDialog from "@/components/studio/recovery/RestoreCloudPreviewDialog";
import type { PreparedStudioRestore } from "@/hooks/useStudioDocument";

type RestoreSource = "project" | "recovery";
type RestoreFlow =
    | { stage: "inspecting"; source: RestoreSource; operationId: number }
    | { stage: "consent"; source: RestoreSource; prepared: PreparedStudioRestore };

if (typeof window !== "undefined") {
    import("pdfjs-dist")
        .then((pdfjs) => {
            pdfjs.GlobalWorkerOptions.workerSrc =
                window.location.origin + "/pdf.worker.mjs";
        })
        .catch((err) => {
            console.error("Failed to initialise the PDF.js worker:", err);
        });
}

export default function StudioPageBase() {
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [recovery, setRecovery] = useState<any>(null);
    const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
    const [restoreFlow, setRestoreFlow] = useState<RestoreFlow | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const selectedOperationByFile = useRef(new WeakMap<File, number>());

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

    const { beginRestoreOperation, isOperationCurrent } = document;

    useEffect(() => {
        const operationId = beginRestoreOperation();
        let active = true;
        (async () => {
            try {
                const save = await loadStudioSession();
                if (!active || !isOperationCurrent(operationId)) return;
                if (!save) return;

                setRecovery(save);
                setRecoveryFeedback(null);
                setRecoveryOpen(true);
            } catch (err) {
                if (!active || !isOperationCurrent(operationId)) return;
                console.error("Failed to read the autosaved Studio session:", err);
            }
        })();
        return () => {
            active = false;
        };
    }, [beginRestoreOperation, isOperationCurrent]);

    const handleFilesSelected = (files: File[]) => {
        const operationId = document.beginRestoreOperation();
        for (const file of files) selectedOperationByFile.current.set(file, operationId);

        setRestoreFlow(null);
        setRecoveryOpen(false);
        setRecoveryFeedback(null);
    };

    const resumeRecovery = async () => {
        if (!recovery) return;

        const operationId = document.beginRestoreOperation();
        setRecoveryOpen(false);
        setRecoveryFeedback(null);
        setRestoreFlow({ stage: "inspecting", source: "recovery", operationId });
        try {
            const prepared = await document.prepareProjectRestore(recovery, operationId);
            if (!prepared || !document.isOperationCurrent(operationId)) return;
            setRestoreFlow({ stage: "consent", source: "recovery", prepared });
        } catch (err) {
            if (!document.isOperationCurrent(operationId)) return;
            setRestoreFlow(null);
            document.setErrorMessage(
                err instanceof Error ? err.message : "This Studio recovery could not be opened."
            );
            setRecoveryFeedback("The saved recovery was left unchanged. You can try again or discard it.");
            setRecoveryOpen(true);
        }
    };

    const discardRecovery = async () => {
        document.beginRestoreOperation();
        setRestoreFlow(null);
        try {
            await deleteStudioSession();
        } catch (err) {
            console.error("Failed to discard the autosaved Studio session:", err);
        }

        setRecovery(null);
        setRecoveryFeedback(null);
        setRecoveryOpen(false);
    };

    const cancelRestore = () => {
        if (!restoreFlow) return;
        if (restoreFlow.stage === "consent") {
            document.cancelPreparedRestore(restoreFlow.prepared);
        } else {
            document.beginRestoreOperation();
        }

        setRestoreFlow(null);
        if (restoreFlow.source === "recovery") {
            setRecoveryFeedback("Cloud preview was not authorized. The current document is unchanged and the saved recovery remains available.");
            setRecoveryOpen(true);
        } else {
            document.setErrorMessage("The project was not opened because Cloud preview was not authorized. The current document is unchanged.");
        }
    };

    const authorizeRestorePreview = () => {
        if (!restoreFlow || restoreFlow.stage !== "consent") return;

        const { prepared } = restoreFlow;
        try {
            if (!document.activatePreparedRestore(prepared)) {
                setRestoreFlow(null);
                return;
            }

            preview.clearPreviewCache();
            zoom.setZoom(prepared.project.zoom);
            tools.setActiveTool(prepared.project.activeTool);
            setRestoreFlow(null);
            setRecoveryOpen(false);
            setRecoveryFeedback(null);
        } catch (err) {
            document.cancelPreparedRestore(prepared);
            setRestoreFlow(null);
            document.setErrorMessage(
                err instanceof Error ? err.message : "This Studio project could not be authorized for preview."
            );
        }
    };

    const handleFilesAccepted = async (files: File[]) => {
        if (!files.length) return;

        const file = files[0];
        const lower = file.name.toLowerCase();

        if (lower.endsWith(".pns")) {
            const operationId = selectedOperationByFile.current.get(file) ?? document.beginRestoreOperation();
            setRecoveryOpen(false);
            setRestoreFlow({ stage: "inspecting", source: "project", operationId });

            try {
                const project = await openProject(file);
                if (!document.isOperationCurrent(operationId)) return;
                const prepared = await document.prepareProjectRestore(project, operationId);
                if (!prepared || !document.isOperationCurrent(operationId)) return;
                setRestoreFlow({ stage: "consent", source: "project", prepared });
            } catch (err) {
                if (!document.isOperationCurrent(operationId)) return;
                setRestoreFlow(null);
                document.setErrorMessage(
                    err instanceof Error ? err.message : "This Studio project could not be opened."
                );
            }

            return;
        }

        await document.handleFilesAccepted([file]);
    };

    const handleReset = () => {
        document.beginRestoreOperation();
        setRestoreFlow(null);
        setRecoveryOpen(false);
        setRecoveryFeedback(null);
        resetStudio();
    };

    const handleSaveProject = async () => {
        try {
            await saveCurrentProject();
        } catch (err) {
            console.error(err);
            document.setErrorMessage(
                err instanceof Error ? err.message : "This Studio project could not be saved."
            );
        }
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
                onSave={handleSaveProject}
            />

            <div className="h-4" />

            <StudioBanner
                activeFile={document.activeFile}
                totalPages={document.totalPages}
                isSidebarOpen={sidebar.isSidebarOpen}
                onToggleSidebar={sidebar.toggleSidebar}
                onReset={handleReset}
            />

            {!document.activeFile ? (
                <StudioWelcome
                    onFilesAccepted={handleFilesAccepted}
                    onFilesSelected={handleFilesSelected}
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
                    onFilesSelected={handleFilesSelected}
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
                message={recoveryFeedback}
            />
            {restoreFlow && (
                <RestoreCloudPreviewDialog
                    stage={restoreFlow.stage}
                    onAuthorize={restoreFlow.stage === "consent" ? authorizeRestorePreview : undefined}
                    onCancel={cancelRestore}
                />
            )}
        </div>
    );
}
