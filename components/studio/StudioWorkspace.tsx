"use client";

import React from "react";
import StudioSidebar, { StudioPage } from "./StudioSidebar";
import StudioToolBar, { StudioToolId } from "./ToolBar";
import { StudioCanvasPreview } from "./Preview";
import MergeTool from "./tools/MergeTool";
import SplitTool from "@/components/studio/tools/SplitTool";
import DeletePagesTool from "@/components/studio/tools/DeletePagesTool";
import RotateTool from "@/components/studio/tools/RotateTool";
import ReorderPagesTool from "@/components/studio/tools/ReorderPagesTool";
import CropTool from "@/components/studio/tools/CropTool";
import DuplicatePagesTool from "@/components/studio/tools/DuplicatePagesTool";
import InsertBlankTool from "@/components/studio/tools/InsertBlankTool";
import WatermarkStudioTool from "@/components/studio/tools/WatermarkTool";
import PageNumbersStudioTool from "@/components/studio/tools/PageNumbersStudioTool";
import EditMetadataTool from "@/components/studio/tools/EditMetadataTool";
import EditPdfTool from "@/components/studio/tools/EditPdfTool";
import SignPdfTool from "@/components/studio/tools/SignPdfTool";

interface StudioWorkspaceProps {
    activeFile: File;
    pages: StudioPage[];
    totalPages: number;
    currentPageIndex: number;
    previewSrc: string;
    isScanning: boolean;
    isRendering: boolean;
    zoom: number;
    isSidebarOpen: boolean;
    activeTool: StudioToolId;
    canUndo: boolean;
    canRedo: boolean;
    uploadInputRef: React.RefObject<HTMLInputElement | null>;
    onToggleSidebar: () => void;
    onUploadClick: () => void;
    onFilesAccepted: (files: File[]) => Promise<void>;
    onPageSelect: (page: number) => void;
    onToolSelect: (tool: StudioToolId) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onPrevPage: () => void;
    onNextPage: () => void;
    onUndo: () => void;
    onRedo: () => void;
    commitDocument: (file: File) => Promise<void>;
}

export default function StudioWorkspace({
                                            activeFile,
                                            pages,
                                            totalPages,
                                            currentPageIndex,
                                            previewSrc,
                                            isScanning,
                                            isRendering,
                                            zoom,
                                            isSidebarOpen,
                                            activeTool,
                                            canUndo,
                                            canRedo,
                                            uploadInputRef,
                                            onToggleSidebar,
                                            onUploadClick,
                                            onFilesAccepted,
                                            onPageSelect,
                                            onToolSelect,
                                            onZoomIn,
                                            onZoomOut,
                                            onZoomReset,
                                            onPrevPage,
                                            onNextPage,
                                            onUndo,
                                            onRedo,
                                            commitDocument,
                                        }: StudioWorkspaceProps) {
    return (
        <div className="flex flex-1 min-h-0 w-full flex-col gap-4 overflow-hidden">
            <StudioToolBar
                activeTool={activeTool}
                onToolSelect={onToolSelect}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
            />

            <div className="flex flex-1 min-h-0 w-full gap-4 overflow-hidden">
                <StudioSidebar
                    activeFile={activeFile}
                    pages={pages}
                    totalPages={totalPages}
                    currentPageIndex={currentPageIndex}
                    isSidebarOpen={isSidebarOpen}
                    uploadInputRef={uploadInputRef}
                    onToggleSidebar={onToggleSidebar}
                    onUploadClick={onUploadClick}
                    onFilesAccepted={onFilesAccepted}
                    onPageSelect={onPageSelect}
                />

                {activeTool === "crop" ||
                activeTool === "watermark" ||
                activeTool === "edit-pdf" ||
                activeTool === "sign" ||
                activeTool === "page-number" ? (
                    <div className="min-w-0 flex-1 overflow-hidden">
                        {activeTool === "crop" ? (
                            <CropTool
                                baseFile={activeFile}
                                onCroppedFile={commitDocument}
                            />
                        ) : activeTool === "watermark" ? (
                            <WatermarkStudioTool
                                baseFile={activeFile}
                                currentPageIndex={currentPageIndex}
                                totalPages={totalPages}
                                onWatermarkedFile={commitDocument}
                            />
                        ) : activeTool === "edit-pdf" ? (
                            <EditPdfTool
                                baseFile={activeFile}
                                onEditedFile={commitDocument}
                            />
                        ) : activeTool === "sign" ? (
                            <SignPdfTool
                                baseFile={activeFile}
                                onSignedFile={commitDocument}
                            />
                        ) : (
                            <PageNumbersStudioTool
                                baseFile={activeFile}
                                currentPageIndex={currentPageIndex}
                                totalPages={totalPages}
                                onPageNumberedFile={commitDocument}
                            />
                        )}
                    </div>
                ) : (
                    <>
                        <div className="min-w-0 flex-1 overflow-hidden">
                            <StudioCanvasPreview
                                activeFile={activeFile}
                                pageNumber={currentPageIndex + 1}
                                totalPages={totalPages}
                                previewSrc={previewSrc}
                                isScanning={isScanning}
                                isRendering={isRendering}
                                zoom={zoom}
                                onZoomIn={onZoomIn}
                                onZoomOut={onZoomOut}
                                onZoomReset={onZoomReset}
                                onPrevPage={onPrevPage}
                                onNextPage={onNextPage}
                            />
                        </div>

                        {/* keep the right-side tool panel for other tools only */}
                        {activeTool === "merge" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <MergeTool baseFile={activeFile} onMergedFile={commitDocument} />
                            </aside>
                        )}

                        {activeTool === "reorder" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <ReorderPagesTool baseFile={activeFile} onReorderedFile={commitDocument} />
                            </aside>
                        )}

                        {activeTool === "split" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <SplitTool baseFile={activeFile} onSplitFile={commitDocument} />
                            </aside>
                        )}

                        {activeTool === "delete" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <DeletePagesTool baseFile={activeFile} onDeletedFile={commitDocument} />
                            </aside>
                        )}

                        {activeTool === "rotate" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <RotateTool baseFile={activeFile} onRotatedFile={commitDocument} />
                            </aside>
                        )}

                        {activeTool === "duplicate" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <DuplicatePagesTool
                                    baseFile={activeFile}
                                    currentPageIndex={currentPageIndex}
                                    totalPages={totalPages}
                                    onDuplicatedFile={commitDocument}
                                />
                            </aside>
                        )}

                        {activeTool === "add-blank" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <InsertBlankTool
                                    baseFile={activeFile}
                                    onInsertedFile={commitDocument}
                                    currentPageIndex={currentPageIndex}
                                    totalPages={totalPages}
                                />
                            </aside>
                        )}

                        {activeTool === "metadata" && (
                            <aside className="hidden h-full w-[440px] shrink-0 overflow-y-auto xl:block">
                                <EditMetadataTool
                                    baseFile={activeFile}
                                    onMetadataUpdated={commitDocument}
                                />
                            </aside>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}