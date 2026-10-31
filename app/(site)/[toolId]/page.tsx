"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { useSharedTool } from "@/app/(site)/[toolId]/ClientToolLayout";
import { useBackendOnlyToolAvailability } from "@/components/pdf/BackendOnlyToolGuard";
import BackendUnavailableNotice from "@/components/pdf/BackendUnavailableNotice";
import { useWorkflow } from "@/context/WorkflowContext";
import PdfToolLayout from "@/components/pdf/PdfToolLayout";
import PdfToolHero from "@/components/pdf/PdfToolHero";
import PdfUploader from "@/components/pdf/PdfUploader";
import PdfFeatures from "@/components/pdf/PdfFeatures";
import RepositoryAnalyzerSourceSelector from "@/components/tools/RepositoryAnalyzerSourceSelector";
import {
    createTransferredPdfPreparation,
    getPdfInputPreparation,
    markPdfInputPreparation,
} from "@/lib/security/pdfInputPreparation";
import { getProtectedPdfRoutePolicy } from "@/lib/security/protectedPdfRoutePolicy";

interface ExtendedFile extends File {
    initialBatch?: File[];
    targetUrl?: string;
}

export default function SharedUploadPage() {
    const {
        toolId,
        toolConfig,
        setFile,
        file,
        isLoadingConfig,
    } = useSharedTool();
    const { isExecutable } = useBackendOnlyToolAvailability();

    const { pendingTransfer, consumeTransfer } = useWorkflow();
    const router = useRouter();
    const [urlInput, setUrlInput] = useState("");
    const [transferredFiles, setTransferredFiles] = useState<File[] | undefined>(undefined);
    const handledTransferRef = useRef(false);

    const currentToolHref = `/${toolId}`;
    const shouldRestoreTransfer = pendingTransfer?.targetToolHref === currentToolHref;

    useEffect(() => {
        if (isLoadingConfig) return;
        if (handledTransferRef.current) return;

        if (shouldRestoreTransfer) {
            handledTransferRef.current = true;

            const transfer = consumeTransfer();

            if (!transfer) return;

            const restoredFile = new File([transfer.blob], transfer.fileName, {
                type: transfer.mimeType || transfer.blob.type || "application/pdf",
                lastModified: Date.now(),
            }) as ExtendedFile;

            markPdfInputPreparation(restoredFile, createTransferredPdfPreparation(transfer.provenance));

            queueMicrotask(() => setTransferredFiles([restoredFile]));
            return;
        }

        if (file) {
            router.replace(`/${toolId}/workspace`);
        }
    }, [
        consumeTransfer,
        currentToolHref,
        file,
        isLoadingConfig,
        pendingTransfer,
        router,
        setFile,
        shouldRestoreTransfer,
        toolId,
    ]);

    const handleFilesAccepted = (
        files: File[],
        acceptance?: { processingMode: "auto" | "device" | "cloud" }
    ) => {
        if (files && files.length > 0) {
            const processingMode = acceptance?.processingMode ?? "auto";
            files.forEach((acceptedFile) => {
                const existing = getPdfInputPreparation(acceptedFile);
                if (existing) {
                    markPdfInputPreparation(acceptedFile, { ...existing, processingMode });
                }
            });
            const baselineFile = files[0] as ExtendedFile;
            setTransferredFiles(undefined);

            if (toolConfig.multiple) {
                baselineFile.initialBatch = files;
            }

            handledTransferRef.current = true;
            setFile(baselineFile);
            router.push(`/${toolId}/workspace`);
        }
    };

    const protectedPolicy = getProtectedPdfRoutePolicy(toolId);
    const protectedFileHandling = protectedPolicy === "execution-manager"
        ? "choose-mode"
        : protectedPolicy === "cloud-only"
            ? "cloud-only"
            : protectedPolicy === "cloud-consent"
                ? "cloud-consent"
            : protectedPolicy === "explicit-unlock"
                ? "explicit-unlock"
                : protectedPolicy === "studio-session-consent"
                    ? "cloud-session-consent"
                    : "fail-closed";

    const handleUrlSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!urlInput.trim()) return;

        const virtualFile = new File([], "url-capture.pdf", {
            type: "application/pdf",
        }) as ExtendedFile;

        virtualFile.targetUrl = urlInput.trim();
        markPdfInputPreparation(virtualFile, {
            sourceProtected: false,
            bytesState: "plain",
            preparedOn: "device",
            processingMode: "cloud",
            cloudSubmissionInitiated: false,
            derivedFromProtectedInput: false,
            transferredFromTool: false,
        });

        handledTransferRef.current = true;
        setFile(virtualFile);
        router.push(`/${toolId}/workspace`);
    };

    // The static fallback config is available on the first render. Keep the
    // public hero in the initial HTML so crawlers receive the existing,
    // tool-specific H1 before client config hydration completes.
    if (shouldRestoreTransfer) {
        return (
            <PdfToolLayout>
                <div className="flex min-h-[60vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
                </div>
            </PdfToolLayout>
        );
    }

    return (
        <PdfToolLayout>
            <PdfToolHero
                title={toolConfig.name}
                description={toolConfig.description}
                icon={toolConfig.icon}
            />

            <div className="mx-auto max-w-5xl px-4 py-8">
                {!isExecutable ? (
                    <BackendUnavailableNotice toolName={toolConfig.name} />
                ) : toolId === "repository-analyzer" ? (
                    <RepositoryAnalyzerSourceSelector />
                ) : toolId === "url-to-pdf" ? (
                    <form
                        onSubmit={handleUrlSubmit}
                        className="mx-auto max-w-2xl space-y-4 rounded-3xl border border-[color:var(--border)] bg-[var(--card)] p-8 shadow-lg"
                    >
                        <div className="mb-4 space-y-2 text-center">
                            <h3 className="text-md font-bold text-[color:var(--foreground)]">
                                Convert Remote Link Coordinates
                            </h3>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                                Provide an address endpoint below to parse content trees straight into a document layout canvas
                            </p>
                        </div>

                        <div className="relative flex items-center">
                            <Globe className="absolute left-4 text-[color:var(--muted-foreground)]" size={18} />
                            <input
                                type="url"
                                required
                                placeholder="https://example.com"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] py-3.5 pl-12 pr-4 text-sm font-medium text-[color:var(--foreground)] transition-colors focus:border-[var(--primary)] focus:outline-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!urlInput.trim()}
                            className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-xs font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50"
                        >
                            Open Webpage Capture Workspace
                        </button>
                    </form>
                ) : (
                    <PdfUploader
                        onFilesAccepted={handleFilesAccepted}
                        accept={toolConfig.accept || ".pdf"}
                        multiple={toolConfig.multiple}
                        initialFiles={transferredFiles}
                        bypassEncryptionCheck={toolId === "unlock-pdf"}
                        protectedFileHandling={protectedFileHandling}
                        inputPolicy={toolId === "repair-pdf" ? "repair" : "strict"}
                    />
                )}
            </div>

            <PdfFeatures />
        </PdfToolLayout>
    );
}
