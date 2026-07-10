"use client";

import React from "react";
import {
    ChevronRight,
    FileText,
    Upload,
    X,
} from "lucide-react";
import PdfUploader from "@/components/pdf/PdfUploader";

export interface StudioPage {
    id: string;
    pageNumber: number;
}

interface StudioSidebarProps {
    activeFile: File;
    pages: StudioPage[];
    totalPages: number;
    currentPageIndex: number;

    isSidebarOpen: boolean;

    uploadInputRef: React.RefObject<HTMLInputElement | null>;
    onToggleSidebar: () => void;
    onUploadClick: () => void;
    onFilesAccepted: (files: File[]) => Promise<void>;
    onPageSelect: (page: number) => void;
}

export default function StudioSidebar({
                                          activeFile,
                                          pages,
                                          totalPages,
                                          currentPageIndex,
                                          isSidebarOpen,
                                          uploadInputRef,
                                          onToggleSidebar,
                                          onUploadClick,
                                          onFilesAccepted,
                                          onPageSelect,
                                      }: StudioSidebarProps) {
    return (
        <aside
            className={`shrink-0 transition-all duration-200 ease-out ${
                isSidebarOpen ? "w-[360px]" : "w-[72px]"
            }`}
        >
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-4 shadow-sm">

                {/* Header */}

                <div className="flex items-center justify-between border-b border-[color:var(--border)] pb-3">

                    {isSidebarOpen ? (
                        <div className="min-w-0">
                            <h2 className="text-sm font-bold text-[color:var(--foreground)]">
                                Document
                            </h2>

                            <p className="truncate text-xs text-[color:var(--muted)]">
                                {activeFile.name}
                            </p>
                        </div>
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[var(--background)]">
                            <FileText size={16} />
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="rounded-xl p-2 text-[color:var(--muted)] transition hover:bg-[var(--background)] hover:text-[color:var(--foreground)]"
                    >
                        {isSidebarOpen ? (
                            <X size={16} />
                        ) : (
                            <ChevronRight size={16} />
                        )}
                    </button>

                </div>

                {/* Hidden upload */}

                <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".pdf,.pns"
                    className="hidden"
                    onChange={(e) => {
                        const files = Array.from(
                            e.target.files || []
                        );

                        e.target.value = "";

                        void onFilesAccepted(files);
                    }}
                />

                {/* Upload Button */}

                <button
                    type="button"
                    onClick={onUploadClick}
                    className={`mt-4 flex w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[var(--background)]/50 p-3 text-left transition hover:bg-[var(--card)] ${
                        isSidebarOpen
                            ? ""
                            : "justify-center"
                    }`}
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                        <Upload size={16} />
                    </div>

                    {isSidebarOpen && (
                        <div className="min-w-0">
                            <p className="text-sm font-semibold">
                                Upload PDF
                            </p>

                            <p className="text-xs text-[color:var(--muted)]">
                                Replace current document
                            </p>
                        </div>
                    )}
                </button>

                {isSidebarOpen && (
                    <div className="mt-4">
                        <PdfUploader
                            onFilesAccepted={onFilesAccepted}
                            title="Drop PDF here"
                            description="Or use upload button"
                            accept=".pdf,.pns"
                            multiple={false}
                        />
                    </div>
                )}

                {isSidebarOpen && (
                    <div className="mt-6 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--muted)]">
                            Pages
                        </h3>

                        <span className="text-xs font-mono text-[color:var(--muted)]">
                            {totalPages}
                        </span>
                    </div>
                )}

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">

                    {pages.map((page, index) => {
                        const active = currentPageIndex === index;

                        return (
                            <button
                                key={page.id}
                                type="button"
                                onClick={() => onPageSelect(index)}
                                title={`Page ${index + 1}`}
                                className={`mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                                    active
                                        ? "border-indigo-500 bg-indigo-500/5"
                                        : "border-[color:var(--border)] bg-[var(--background)]/40 hover:bg-[var(--card)]"
                                } ${
                                    isSidebarOpen
                                        ? ""
                                        : "justify-center"
                                }`}
                            >
                                <div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--card)] text-[10px] font-bold text-[color:var(--muted)]">
                                    {page.pageNumber}
                                </div>

                                {isSidebarOpen && (
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-[color:var(--foreground)]">
                                            Page {index + 1}
                                        </p>

                                        <p className="truncate text-xs text-[color:var(--muted)]">
                                            Preview page {page.pageNumber}
                                        </p>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
}